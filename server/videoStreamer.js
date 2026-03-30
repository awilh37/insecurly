const FrameEncoder = require('./frameEncoder');

class VideoStreamer {
  constructor() {
    this.streamers = new Map();
  }

  async startStream(browserId, page, outputCallback, useH264 = true) {
    try {
      console.log(`[VIDEO] Starting video stream for browser ${browserId} (H.264: ${useH264})`);

      // Get page dimensions
      const viewport = page.viewportSize();
      const width = viewport?.width || 1280;
      const height = viewport?.height || 720;
      const fps = 30;

      // Initialize encoder if H.264 is enabled
      let encoder = null;
      if (useH264) {
        encoder = new FrameEncoder({
          width,
          height,
          fps,
          bitrate: '2000k',
          preset: 'ultrafast',
          tune: 'zerolatency'
        });

        // Set up encoder callback
        encoder.onEncodedFrame = (frame) => {
          if (outputCallback) {
            outputCallback({
              type: 'h264_frame',
              data: frame.data,
              timestamp: frame.timestamp,
              isKeyframe: frame.isKeyframe,
              size: frame.size
            });
          }
        };

        encoder.startEncoding();
      }

      // Start screenshot capturing loop
      const streamer = {
        browserId,
        page,
        encoder,
        useH264,
        isStreaming: true,
        lastScreenshot: null,
        frameCount: 0,
        startTime: Date.now()
      };

      this.streamers.set(browserId, streamer);

      // Start the screenshot capture loop at 30 FPS
      const interval = setInterval(async () => {
        if (!streamer.isStreaming) {
          clearInterval(interval);
          return;
        }

        try {
          const screenshot = await page.screenshot({ fullPage: false });
          streamer.lastScreenshot = screenshot;
          streamer.frameCount++;

          if (useH264 && encoder) {
            // Send to H.264 encoder
            encoder.encodeFrame(screenshot.toString('base64'));
          } else {
            // Fall back to raw frame emission
            if (outputCallback) {
              outputCallback({
                type: 'frame',
                data: screenshot.toString('base64'),
                frameNumber: streamer.frameCount,
                timestamp: Date.now()
              });
            }
          }
        } catch (error) {
          console.error(`[VIDEO] Screenshot error: ${error.message}`);
        }
      }, 1000 / fps);

      streamer.interval = interval;
      console.log(`[VIDEO] Stream started: ${width}x${height} @ ${fps}fps${useH264 ? ' (H.264)' : ''}`);

      return streamer;
    } catch (error) {
      throw new Error(`Failed to start video stream: ${error.message}`);
    }
  }

  stopStream(browserId) {
    const streamer = this.streamers.get(browserId);
    if (streamer) {
      streamer.isStreaming = false;
      if (streamer.interval) {
        clearInterval(streamer.interval);
      }
      if (streamer.encoder) {
        streamer.encoder.stopEncoding();
      }
      this.streamers.delete(browserId);
      console.log(`[VIDEO] Stream stopped for browser ${browserId}`);
    }
  }

  stopAllStreams() {
    for (const [browserId, streamer] of this.streamers) {
      this.stopStream(browserId);
    }
  }

  getStreamStats(browserId) {
    const streamer = this.streamers.get(browserId);
    if (!streamer) return null;

    const uptime = Date.now() - streamer.startTime;
    const fps = (streamer.frameCount / (uptime / 1000)).toFixed(2);

    const stats = {
      browserId,
      isStreaming: streamer.isStreaming,
      frameCount: streamer.frameCount,
      actualFps: fps,
      uptime,
      useH264: streamer.useH264
    };

    // Include encoder stats if H.264 is enabled
    if (streamer.encoder) {
      stats.encoder = streamer.encoder.getStats();
    }

    return stats;
  }
}

module.exports = VideoStreamer;
