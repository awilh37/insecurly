const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const BrowserManager = require('./browserManager');
const SessionManager = require('./sessionManager');
const VideoStreamer = require('./videoStreamer');
const RTPEncoder = require('./rtpEncoder');

const app = express();
const server = http.createServer(app);

// Dynamic CORS configuration
const getAllowedOrigins = () => {
  const origins = [
    'https://awilh37.github.io',
    'https://rand0m.tplinkdns.com'
  ];
  
  // Add localhost variants for development
  for (let port = 3000; port <= 3010; port++) {
    origins.push(`http://localhost:${port}`);
    origins.push(`http://127.0.0.1:${port}`);
  }
  
  return origins;
};

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      console.log(`[CORS] Checking origin: ${origin}`);
      if (!origin || allowedOrigins.includes(origin)) {
        console.log(`[CORS] Origin accepted: ${origin}`);
        callback(null, true);
      } else {
        console.log(`[CORS] Origin rejected: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3002;
const browserManager = new BrowserManager();
const sessionManager = new SessionManager();
const videoStreamer = new VideoStreamer();

// RTP encoder pool for each browser stream
const rtpEncoders = new Map();

// Middleware
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  
  console.log(`[HTTP] Request from origin: ${origin}`);
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/auth/register', (req, res) => {
  try {
    const sessionId = sessionManager.createSession();
    const token = sessionManager.generateToken(sessionId);
    res.json({ token, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io connections
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  let sessionId = null;
  let browserId = null;

  socket.on('authenticate', (data) => {
    try {
      const token = data.token || sessionId;
      if (!token) {
        socket.emit('error', { message: 'No token provided' });
        return;
      }

      if (sessionManager.validateToken(token)) {
        sessionId = sessionManager.getSessionIdFromToken(token);
        socket.emit('authenticated', { sessionId });
      } else {
        socket.emit('error', { message: 'Invalid token' });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('launch-browser', async (data) => {
    try {
      if (!sessionId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const url = data.url || 'about:blank';
      browserId = await browserManager.createBrowser(sessionId, url);
      
      socket.emit('browser-launched', { browserId, url });
      
      // Start video stream by default with RTP encoding
      const browserData = browserManager.browsers.get(browserId);
      if (browserData) {
        try {
          // Create RTP encoder for this stream
          const rtpEncoder = new RTPEncoder();
          rtpEncoders.set(browserId, rtpEncoder);

          await videoStreamer.startStream(browserId, browserData.page, (frameData) => {
            // Handle H.264 encoded frames
            if (frameData.type === 'h264_frame') {
              try {
                // Encode H.264 NAL units into RTP packets
                const rtpPackets = rtpEncoder.encodeNALUnit(frameData.data, frameData.timestamp, frameData.isKeyframe);
                
                // Send RTP packets to client
                rtpPackets.forEach(packet => {
                  socket.emit('rtp-packet', {
                    data: packet,
                    timestamp: frameData.timestamp,
                    isKeyframe: frameData.isKeyframe
                  });
                });
              } catch (error) {
                console.error(`[RTP] Error encoding NAL unit: ${error.message}`);
              }
            } else if (frameData.type === 'frame') {
              // Fall back to raw frame if H.264 fails
              socket.emit('video-frame', frameData);
            }
          }, true); // Enable H.264 encoding
          
          socket.emit('video-started', { browserId, codec: 'h264' });
        } catch (error) {
          console.error(`[VIDEO] Failed to start stream: ${error.message}`);
          // Fall back to screenshots
          await sendScreenshot(socket, browserId);
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('navigate', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const url = data.url;
      await browserManager.navigate(browserId, url);
      await sendScreenshot(socket, browserId);
      socket.emit('navigated', { url });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('click', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { x, y } = data;
      await browserManager.click(browserId, x, y);
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendScreenshot(socket, browserId);
      socket.emit('clicked', { x, y });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('type', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { text } = data;
      await browserManager.type(browserId, text);
      await sendScreenshot(socket, browserId);
      socket.emit('typed', { text });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('scroll', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { x, y } = data;
      await browserManager.scroll(browserId, x, y);
      await sendScreenshot(socket, browserId);
      socket.emit('scrolled', { x, y });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('back', async () => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      await browserManager.goBack(browserId);
      await sendScreenshot(socket, browserId);
      socket.emit('navigated-back');
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('forward', async () => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      await browserManager.goForward(browserId);
      await sendScreenshot(socket, browserId);
      socket.emit('navigated-forward');
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('screenshot', async () => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      await sendScreenshot(socket, browserId);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('close-browser', async () => {
    try {
      if (browserId) {
        videoStreamer.stopStream(browserId);
        await browserManager.closeBrowser(browserId);
        browserId = null;
        socket.emit('browser-closed');
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('video-control', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { action } = data;
      const stats = videoStreamer.getStreamStats(browserId);

      switch (action) {
        case 'start':
          const browserData = browserManager.browsers.get(browserId);
          if (browserData) {
            // Create RTP encoder if needed
            if (!rtpEncoders.has(browserId)) {
              const rtpEncoder = new RTPEncoder();
              rtpEncoders.set(browserId, rtpEncoder);
            }

            await videoStreamer.startStream(browserId, browserData.page, (frameData) => {
              if (frameData.type === 'h264_frame') {
                const rtpEncoder = rtpEncoders.get(browserId);
                if (rtpEncoder) {
                  const rtpPackets = rtpEncoder.encodeNALUnit(frameData.data, frameData.timestamp, frameData.isKeyframe);
                  rtpPackets.forEach(packet => {
                    socket.emit('rtp-packet', {
                      data: packet,
                      timestamp: frameData.timestamp,
                      isKeyframe: frameData.isKeyframe
                    });
                  });
                }
              } else {
                socket.emit('video-frame', frameData);
              }
            }, true);
          }
          break;
        case 'stop':
          videoStreamer.stopStream(browserId);
          if (rtpEncoders.has(browserId)) {
            rtpEncoders.delete(browserId);
          }
          break;
        case 'stats':
          // Include RTP stats if available
          const rtpEncoder = rtpEncoders.get(browserId);
          if (rtpEncoder && stats) {
            stats.rtp = rtpEncoder.getStats();
          }
          socket.emit('video-stats', stats);
          break;
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('keyboard', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { type, key, keyCode, ctrlKey, shiftKey, altKey, metaKey } = data;
      await browserManager.keyboard(browserId, type, key, keyCode, ctrlKey, shiftKey, altKey, metaKey);
      // Don't send screenshot on every keystroke - only on keyup
      if (type === 'keyup') {
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendScreenshot(socket, browserId);
      }
    } catch (error) {
      console.error(`Keyboard error: ${error.message}`);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('dblclick', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { x, y } = data;
      await browserManager.doubleClick(browserId, x, y);
      await new Promise(resolve => setTimeout(resolve, 300));
      await sendScreenshot(socket, browserId);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('rightclick', async (data) => {
    try {
      if (!browserId) {
        socket.emit('error', { message: 'No active browser' });
        return;
      }

      const { x, y } = data;
      await browserManager.rightClick(browserId, x, y);
      await new Promise(resolve => setTimeout(resolve, 300));
      await sendScreenshot(socket, browserId);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (browserId) {
      try {
        videoStreamer.stopStream(browserId);
        // Clean up RTP encoder
        if (rtpEncoders.has(browserId)) {
          rtpEncoders.delete(browserId);
        }
        await browserManager.closeBrowser(browserId);
      } catch (error) {
        console.error(`Error closing browser on disconnect: ${error.message}`);
      }
    }
    if (sessionId) {
      sessionManager.closeSession(sessionId);
    }
  });
});

async function sendScreenshot(socket, browserId) {
  try {
    const screenshot = await browserManager.screenshot(browserId);
    socket.emit('screenshot', { image: screenshot });
  } catch (error) {
    console.error(`Screenshot error: ${error.message}`);
    socket.emit('error', { message: 'Failed to capture screenshot' });
  }
}

server.listen(PORT, () => {
  console.log(`Insecurly server running on port ${PORT}`);
  console.log(`Allowed origins: https://awilh37.github.io, https://rand0m.tplinkdns.com, http://localhost:3000-3010`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await browserManager.closeAll();
  process.exit(0);
});
