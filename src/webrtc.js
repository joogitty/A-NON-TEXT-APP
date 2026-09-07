/**
 * GhostChat WebRTC PeerConnection Manager
 * Configured with empty ICE servers (`iceServers: []`) for pure LAN / Hotspot Direct Connection
 * Encapsulates DataChannel event handlers and chunked file transfer
 */

class GhostWebRTC {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.onMessageReceived = null;
    this.onConnectionStateChange = null;
    this.pendingCandidates = [];
  }

  /**
   * Initializes RTCPeerConnection for LAN operation
   */
  async createPeerConnection() {
    // Zero STUN/TURN servers - pure host candidate LAN P2P
    this.peerConnection = new RTCPeerConnection({
      iceServers: []
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] Gathered host ICE candidate:', event.candidate.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[WebRTC] Connection State Changed:', state);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      console.log('[WebRTC] DataChannel received from offerer');
      this.setupDataChannel(event.channel);
    };

    return this.peerConnection;
  }

  /**
   * Creates WebRTC SDP Offer (Offerer side)
   */
  async createOffer() {
    await this.createPeerConnection();

    // Create DataChannel
    const channel = this.peerConnection.createDataChannel('ghost-channel', {
      ordered: true
    });
    this.setupDataChannel(channel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Wait 500ms to gather local host candidates
    await new Promise(r => setTimeout(r, 500));

    return this.peerConnection.localDescription;
  }

  /**
   * Processes Peer Offer and creates WebRTC SDP Answer (Answerer side)
   */
  async createAnswer(decompressedOffer) {
    await this.createPeerConnection();

    const offerDescription = new RTCSessionDescription({
      type: decompressedOffer.type,
      sdp: decompressedOffer.sdp
    });

    await this.peerConnection.setRemoteDescription(offerDescription);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Wait 500ms to gather host candidates
    await new Promise(r => setTimeout(r, 500));

    return this.peerConnection.localDescription;
  }

  /**
   * Sets Remote Answer on Offerer side
   */
  async setRemoteAnswer(decompressedAnswer) {
    const answerDescription = new RTCSessionDescription({
      type: decompressedAnswer.type,
      sdp: decompressedAnswer.sdp
    });

    await this.peerConnection.setRemoteDescription(answerDescription);
  }

  /**
   * Configures DataChannel listeners
   */
  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('✅ WebRTC DataChannel OPEN & READY!');
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('connected');
      }
    };

    this.dataChannel.onclose = () => {
      console.log('❌ WebRTC DataChannel CLOSED');
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('disconnected');
      }
    };

    this.dataChannel.onmessage = (event) => {
      if (this.onMessageReceived) {
        this.onMessageReceived(event.data);
      }
    };
  }

  /**
   * Sends encrypted payload over DataChannel
   */
  send(payload) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }
    const messageString = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    this.dataChannel.send(messageString);
  }

  /**
   * Closes connection
   */
  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

window.ghostWebRTC = new GhostWebRTC();
