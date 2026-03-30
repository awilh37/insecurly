const { spawn } = require('child_process');
const path = require('path');

class VideoStreamer {
  constructor() {
    this.streamers = new Map();
    this.ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  }

  async startStream(browserId, page, outputCallback) {
    try {
      console.log(`[VIDEO] Starting video stream for browser ${browserId}`);

      // Get page dimensions
      const viewport = page.viewportSize();
      const width = viewport?.width || 1280;
      const height = viewport?.height || 720;
      const fps = 30;

      // Start screenshot capturing loop
      const streamer = {
        browserId,
        page,
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

          // Emit frame data via callback
          if (outputCallback) {
            outputCallback({
              type: 'frame',
              data: screenshot.toString('base64'),
              frameNumber: streamer.frameCount,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          console.error(`[VIDEO] Screenshot error: ${error.message}`);
        }
      }, 1000 / fps);

      streamer.interval = interval;
      console.log(`[VIDEO] Stream started: ${width}x${height} @ ${fps}fps`);

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

    return {
      browserId,
      isStreaming: streamer.isStreaming,
      frameCount: streamer.frameCount,
      actualFps: fps,
      uptime
    };
  }
}

module.exports = VideoStreamer;
