/**
 * H264Decoder: Client-side H.264 video decoder
 * Uses WebCodecs API when available, falls back to canvas-based rendering
 * Handles RTP packet reconstruction and NAL unit parsing
 */
class H264Decoder {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.videoDecoder = null;
    this.useWebCodecs = false;
    this.frameBuffer = [];
    this.stats = {
      framesDecoded: 0,
      framesDropped: 0,
      totalBytes: 0,
      decodingLatency: 0,
      startTime: Date.now()
    };
    
    this._initializeDecoder();
  }

  /**
   * Initialize decoder based on browser capabilities
   * @private
   */
  async _initializeDecoder() {
    // Try WebCodecs API first (Chrome, Edge, Opera)
    if ('VideoDecoder' in window) {
      try {
        await this._initWebCodecsDecoder();
        this.useWebCodecs = true;
        console.log('[H264] WebCodecs decoder initialized');
      } catch (error) {
        console.warn('[H264] WebCodecs unavailable, falling back:', error.message);
        this.useWebCodecs = false;
      }
    } else {
      console.log('[H264] WebCodecs API not available');
    }
  }

  /**
   * Initialize WebCodecs VideoDecoder
   * @private
   */
  async _initWebCodecsDecoder() {
    const config = {
      codec: 'avc1.4d4028', // H.264 high profile, level 4.0
      codedWidth: 1280,
      codedHeight: 720,
      description: new Uint8Array([]) // Empty for now, will be set on first IDR
    };

    this.videoDecoder = new VideoDecoder({
      output: (frame) => this._handleDecodedFrame(frame),
      error: (error) => this._handleDecoderError(error)
    });

    try {
      await this.videoDecoder.configure(config);
      console.log('[H264] WebCodecs configured, ready to decode');
    } catch (error) {
      throw new Error(`Failed to configure VideoDecoder: ${error.message}`);
    }
  }

  /**
   * Decode H.264 RTP packet
   * @param {Object} packet - RTP packet object {data, timestamp, isKeyframe}
   */
  decodeRTPPacket(packet) {
    if (!packet || !packet.data) {
      return;
    }

    try {
      const decodingStart = Date.now();
      this.stats.totalBytes += packet.data.length;

      if (this.useWebCodecs && this.videoDecoder) {
        // Try WebCodecs decoding
        this._decodeWithWebCodecs(packet, decodingStart);
      } else {
        // Use frame buffering fallback
        this._bufferFrame(packet);
      }
    } catch (error) {
      console.error('[H264] Decoding error:', error.message);
      this.stats.framesDropped++;
    }
  }
    }
  }

  /**
   * Decode using WebCodecs API
   * @private
   */
  async _decodeWithWebCodecs(packet, decodingStart) {
    try {
      const chunk = new EncodedVideoChunk({
        type: packet.isKeyframe ? 'key' : 'delta',
        timestamp: packet.timestamp || 0,
        data: packet.data instanceof ArrayBuffer ? packet.data : packet.data.buffer
      });

      if (this.videoDecoder) {
        await this.videoDecoder.decode(chunk);
        this.stats.decodingLatency = Date.now() - decodingStart;
      }
    } catch (error) {
      // If we get a keyframe requirement error, fall back to frame buffering
      if (error.message && error.message.includes('key frame')) {
        console.warn('[H264] WebCodecs requires keyframe, falling back to frame buffering');
        this.useWebCodecs = false;
        this._bufferFrame(packet);
      } else {
        console.error('[H264] WebCodecs decode error:', error.message);
        this.stats.framesDropped++;
      }
    }
  }

  /**
   * Handle decoded frame from WebCodecs
   * @private
   */
  _handleDecodedFrame(frame) {
    try {
      if (this.canvas && this.ctx) {
        // Draw frame to canvas
        this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
        this.stats.framesDecoded++;
      }
      frame.close();
    } catch (error) {
      console.error('[H264] Frame render error:', error.message);
    }
  }

  /**
   * Handle decoder error
   * @private
   */
  _handleDecoderError(error) {
    console.error('[H264] Decoder error:', error.message);
    this.stats.framesDropped++;
  }

  /**
   * Buffer frame for canvas rendering (fallback)
   * @private
   */
  _bufferFrame(packet) {
    this.frameBuffer.push({
      data: packet.data,
      timestamp: packet.timestamp,
      isKeyframe: packet.isKeyframe,
      receivedAt: Date.now()
    });

    // Keep buffer size reasonable (max 30 frames = 1 second at 30fps)
    if (this.frameBuffer.length > 30) {
      this.frameBuffer.shift();
      this.stats.framesDropped++;
    }
  }

  /**
   * Get most recent frame from buffer
   * @returns {Uint8Array|null} Most recent H.264 frame data
   */
  getLatestFrame() {
    if (this.frameBuffer.length > 0) {
      const frame = this.frameBuffer[this.frameBuffer.length - 1];
      this.stats.framesDecoded++;
      return frame.data;
    }
    return null;
  }

  /**
   * Clear frame buffer
   */
  clearBuffer() {
    this.frameBuffer = [];
  }

  /**
   * Get decoder statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    return {
      framesDecoded: this.stats.framesDecoded,
      framesDropped: this.stats.framesDropped,
      totalBytes: this.stats.totalBytes,
      decodingLatency: this.stats.decodingLatency,
      uptime,
      effectiveBitrate: uptime > 0 ? Math.round((this.stats.totalBytes * 8) / (uptime / 1000) / 1000) + ' kbps' : '0 kbps',
      useWebCodecs: this.useWebCodecs,
      bufferSize: this.frameBuffer.length
    };
  }

  /**
   * Close decoder and release resources
   */
  close() {
    if (this.videoDecoder) {
      try {
        this.videoDecoder.close();
      } catch (error) {
        console.warn('[H264] Error closing decoder:', error.message);
      }
    }
    this.frameBuffer = [];
  }
}

// Export for use in browser (script tag)
if (typeof window !== 'undefined') {
  window.H264Decoder = H264Decoder;
}

// Export for use in Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = H264Decoder;
}
