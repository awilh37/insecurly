/**
 * RTPEncoder: H.264 RTP payload encoding (RFC 6184)
 * Converts H.264 NAL units into RTP packets for streaming
 * 
 * RTP Header (12 bytes):
 * - V(2), P(1), X(1), CC(4): 0x80 for standard RTP
 * - M(1), PT(7): Payload type 96 for dynamic H.264
 * - Sequence number (2 bytes)
 * - Timestamp (4 bytes)
 * - SSRC (4 bytes)
 */
class RTPEncoder {
  constructor(options = {}) {
    this.ssrc = options.ssrc || Math.floor(Math.random() * 0xffffffff);
    this.payloadType = options.payloadType || 96; // H.264
    this.clockRate = 90000; // 90kHz for video
    
    this.sequenceNumber = Math.floor(Math.random() * 65535);
    this.timestamp = Math.floor(Math.random() * 0xffffffff);
    this.packetCount = 0;
    this.mtu = options.mtu || 1400; // Max transmission unit for payload
    this.stats = {
      packetsGenerated: 0,
      bytesGenerated: 0,
      averagePacketSize: 0
    };
  }

  /**
   * Encode H.264 NAL unit into RTP packets
   * @param {Buffer} nalUnit - H.264 NAL unit data
   * @param {number} timestamp - RTP timestamp (90kHz clock)
   * @param {boolean} marker - RTP marker bit (end of frame)
   * @returns {Array<Buffer>} Array of RTP packets
   */
  encodeNALUnit(nalUnit, timestamp, marker = true) {
    const packets = [];
    
    if (!nalUnit || nalUnit.length === 0) {
      return packets;
    }

    // Update timestamp
    this.timestamp = (this.timestamp + (timestamp || 0)) >>> 0;

    // Single NAL unit fits in one RTP packet
    if (nalUnit.length <= this.mtu) {
      const packet = this._createRTPPacket(nalUnit, this.timestamp, marker);
      packets.push(packet);
      this._updateStats(packet);
    } else {
      // NAL unit is larger than MTU, needs fragmentation (FU-A mode)
      const packets_fua = this._fragmentNALUnit(nalUnit, this.timestamp, marker);
      packets_fua.forEach(p => {
        packets.push(p);
        this._updateStats(p);
      });
    }

    return packets;
  }

  /**
   * Create a single RTP packet
   * @private
   */
  _createRTPPacket(payload, timestamp, marker) {
    const packetSize = 12 + payload.length; // RTP header + payload
    const packet = Buffer.alloc(packetSize);

    // RTP Header (12 bytes)
    // V(2)=2, P(1)=0, X(1)=0, CC(4)=0 => 0x80
    packet[0] = 0x80;

    // M(1), PT(7): marker bit and payload type
    packet[1] = (marker ? 0x80 : 0x00) | (this.payloadType & 0x7f);

    // Sequence number (big-endian)
    packet.writeUInt16BE(this.sequenceNumber, 2);
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;

    // Timestamp (big-endian)
    packet.writeUInt32BE(timestamp, 4);

    // SSRC (big-endian)
    packet.writeUInt32BE(this.ssrc, 8);

    // Payload
    payload.copy(packet, 12);

    return packet;
  }

  /**
   * Fragment large NAL unit using Fragmentation Unit (FU-A)
   * @private
   */
  _fragmentNALUnit(nalUnit, timestamp, marker) {
    const packets = [];
    const originalNalByte = nalUnit[0];
    const nalType = originalNalByte & 0x1f;
    const fuPayloadSize = this.mtu - 2; // FU header (2 bytes) + payload
    
    let offset = 1; // Skip original NAL header

    // Fragment loop
    while (offset < nalUnit.length) {
      const isLastFragment = (nalUnit.length - offset) <= fuPayloadSize;
      const fragmentSize = Math.min(fuPayloadSize, nalUnit.length - offset);
      
      // Create FU packet
      const fuPayload = Buffer.alloc(2 + fragmentSize);
      
      // FU Header format (RFC 6184)
      // Byte 0: F(1), NRI(2), Type(5) = FU type (28)
      fuPayload[0] = (originalNalByte & 0xe0) | 28; // FU-A type
      
      // Byte 1: S(1)=1 for first, E(1)=1 for last, R(1)=0, Type(5)=original NAL type
      const isFirstFragment = offset === 1;
      let fuByte = nalType;
      if (isFirstFragment) fuByte |= 0x80; // Start bit
      if (isLastFragment) fuByte |= 0x40;  // End bit
      fuPayload[1] = fuByte;

      // Copy fragment data
      nalUnit.copy(fuPayload, 2, offset, offset + fragmentSize);

      const packet = this._createRTPPacket(
        fuPayload,
        timestamp,
        isLastFragment && marker
      );
      
      packets.push(packet);
      offset += fragmentSize;
    }

    return packets;
  }

  /**
   * Update statistics
   * @private
   */
  _updateStats(packet) {
    this.stats.packetsGenerated++;
    this.stats.bytesGenerated += packet.length;
    this.stats.averagePacketSize = Math.round(this.stats.bytesGenerated / this.stats.packetsGenerated);
    this.packetCount++;
  }

  /**
   * Get RTP encoder statistics
   */
  getStats() {
    return {
      packetsGenerated: this.stats.packetsGenerated,
      bytesGenerated: this.stats.bytesGenerated,
      averagePacketSize: this.stats.averagePacketSize,
      packetCount: this.packetCount,
      ssrc: this.ssrc,
      sequenceNumber: this.sequenceNumber,
      timestamp: this.timestamp
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      packetsGenerated: 0,
      bytesGenerated: 0,
      averagePacketSize: 0
    };
  }
}

module.exports = RTPEncoder;
