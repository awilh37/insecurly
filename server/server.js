const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const BrowserManager = require('./browserManager');
const SessionManager = require('./sessionManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'https://awilh37.github.io'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;
const browserManager = new BrowserManager();
const sessionManager = new SessionManager();

// Middleware
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://awilh37.github.io');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
      await sendScreenshot(socket, browserId);
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
        await browserManager.closeBrowser(browserId);
        browserId = null;
        socket.emit('browser-closed');
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (browserId) {
      try {
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
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await browserManager.closeAll();
  process.exit(0);
});
