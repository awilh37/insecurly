const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * FrameEncoder: Real-time H.264 encoding using FFmpeg
 * Converts Playwright screenshots to H.264 video stream with configurable bitrate
 * Supports frame buffering and RTP payload generation
 */
class FrameEncoder {
  constructor(options = {}) {
    this.width = options.width || 1280;
    this.height = options.height || 720;
    this.fps = options.fps || 30;
    this.bitrate = options.bitrate || '2000k';
    this.preset = options.preset || 'ultrafast';
    this.tune = options.tune || 'zerolatency';
    
    this.ffmpegProcess = null;
    this.isEncoding = false;
    this.frameBuffer = [];
    this.frameCount = 0;
    this.keyframeInterval = 30; // Insert keyframe every 30 frames
    this.firstKeyframeGenerated = false; // Track if initial keyframe sent
    this.onEncodedFrame = null;
    this.stats = {
      framesEncoded: 0,
      bytesEmitted: 0,
      avgFrameSize: 0,
      encodingLatency: 0,
      startTime: null
    };
  }

  /**
   * Start the FFmpeg encoding process
   * FFmpeg reads raw frames from stdin and outputs H.264 packets
   */
  startEncoding() {
    if (this.isEncoding) {
      console.log('[H264] Encoding already active');
      return;
    }

    try {
      this.stats.startTime = Date.now();
      this.firstKeyframeGenerated = false; // Reset for new encoding session
      const args = [
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-r', String(this.fps),
        '-i', 'pipe:0',
        '-vcodec', 'libx264',
        '-preset', this.preset,
        '-tune', this.tune,
        '-bitrate', this.bitrate,
        '-g', String(this.keyframeInterval), // Keyframe interval (every 30 frames)
        '-keyint_min', String(this.keyframeInterval), // Minimum keyframe interval
        '-force_key_frames', `expr:gte(t,n_forced*${1/this.fps})`, // Force keyframe at start
        '-f', 'h264',
        '-',
      ];

      this.ffmpegProcess = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        shell: false,
      });

      this.ffmpegProcess.stdout.on('data', (chunk) => {
        this._handleEncodedData(chunk);
      });

      this.ffmpegProcess.stderr.on('data', (chunk) => {
        const log = chunk.toString();
        if (log.includes('error') || log.includes('Error')) {
          console.error('[H264 ERROR]', log);
        }
      });

      this.ffmpegProcess.on('error', (err) => {
        console.error('[H264 ERROR] FFmpeg process error:', err);
        this.isEncoding = false;
      });

      this.ffmpegProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          console.error('[H264] FFmpeg exited with code:', code);
        }
        this.isEncoding = false;
      });

      this.isEncoding = true;
      console.log('[H264] Encoding started - Resolution: ' + this.width + 'x' + this.height + ' FPS: ' + this.fps);
    } catch (error) {
      console.error('[H264 ERROR] Failed to start encoding:', error.message);
      this.isEncoding = false;
    }
  }

  /**
   * Stop the FFmpeg encoding process
   */
  stopEncoding() {
    if (!this.isEncoding || !this.ffmpegProcess) {
      return;
    }

    try {
      this.ffmpegProcess.stdin.end();
      this.ffmpegProcess.kill('SIGTERM');
      this.isEncoding = false;
      console.log('[H264] Encoding stopped');
    } catch (error) {
      console.error('[H264 ERROR] Failed to stop encoding:', error.message);
    }
  }

  /**
   * Push a frame (base64 PNG) into the encoder
   * @param {string} pngBase64 - Base64-encoded PNG frame
   */
  encodeFrame(pngBase64) {
    if (!this.isEncoding || !this.ffmpegProcess) {
      return;
    }

    try {
      const buffer = Buffer.from(pngBase64, 'base64');
      const encodingStart = Date.now();

      // Check if we should request a keyframe (periodic)
      const forceKeyframe = (this.frameCount % this.keyframeInterval) === 0;
      
      // Write frame to FFmpeg stdin
      this.ffmpegProcess.stdin.write(buffer, (err) => {
        if (err) {
          console.error('[H264 ERROR] Failed to write frame:', err.message);
        }
      });

      this.frameCount++;
      this.stats.encodingLatency = Date.now() - encodingStart;
    } catch (error) {
      console.error('[H264 ERROR] Failed to encode frame:', error.message);
    }
  }

  /**
   * Handle encoded H.264 data from FFmpeg
   * Parse NAL units and emit as RTP packets
   * @private
   */
  _handleEncodedData(chunk) {
    if (!this.onEncodedFrame) {
      return;
    }

    try {
      // H.264 stream consists of NAL units
      // Each NAL unit can be transmitted as RTP payload
      this.stats.bytesEmitted += chunk.length;
      this.stats.framesEncoded += 1;
      this.stats.avgFrameSize = this.stats.bytesEmitted / Math.max(this.stats.framesEncoded, 1);

      // Emit raw H.264 data with timestamp
      this.onEncodedFrame({
        timestamp: Date.now(),
        data: chunk,
        size: chunk.length,
        isKeyframe: this._isKeyframe(chunk)
      });
    } catch (error) {
      console.error('[H264 ERROR] Failed to handle encoded data:', error.message);
    }
  }

  /**
   * Detect if this H.264 NAL unit is a keyframe (IDR)
   * IDR (Instantaneous Decoder Refresh) NAL type = 5
   * H.264 streams can have start codes: 0x000001 or 0x00000001
   * @private
   */
  _isKeyframe(data) {
    if (data.length < 1) return false;
    
    let offset = 0;
    
    // Skip start code (0x00 0x00 0x01 or 0x00 0x00 0x00 0x01)
    if (data.length >= 3 && data[0] === 0x00 && data[1] === 0x00) {
      if (data[2] === 0x01) {
        offset = 3;
      } else if (data[2] === 0x00 && data.length >= 4 && data[3] === 0x01) {
        offset = 4;
      }
    }
    
    if (offset >= data.length) return false;
    
    // NAL type is in the lower 5 bits of the NAL header byte
    const nalHeader = data[offset];
    const nalType = nalHeader & 0x1f;
    
    console.log(`[H264] NAL type: ${nalType} (keyframe: ${nalType === 5})`);
    return nalType === 5; // IDR frame
  }

  /**
   * Get current encoding statistics
   */
  getStats() {
    const now = Date.now();
    const elapsed = this.stats.startTime ? (now - this.stats.startTime) / 1000 : 0;
    
    return {
      isEncoding: this.isEncoding,
      framesEncoded: this.stats.framesEncoded,
      bytesEmitted: this.stats.bytesEmitted,
      avgFrameSize: Math.round(this.stats.avgFrameSize),
      encodingLatency: this.stats.encodingLatency,
      elapsedSeconds: elapsed,
      effectiveBitrate: elapsed > 0 ? Math.round((this.stats.bytesEmitted * 8) / elapsed / 1000) + ' kbps' : '0 kbps'
    };
  }

  /**
   * Reset frame counter (useful for stats reset)
   */
  resetStats() {
    this.stats = {
      framesEncoded: 0,
      bytesEmitted: 0,
      avgFrameSize: 0,
      encodingLatency: 0,
      startTime: Date.now()
    };
  }
}

module.exports = FrameEncoder;
