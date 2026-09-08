/**
 * GhostChat Multi-Peer Full Mesh WebRTC Manager
 * Manages multiple simultaneous RTCPeerConnection + DataChannel instances.
 * Every peer connects to every other peer directly (no relay, no server for data).
 * 
 * Configured with empty iceServers for pure LAN / Hotspot Direct P2P.
 */

class GhostWebRTC {
  constructor() {
    // Map<peerId, { peerConnection: RTCPeerConnection, dataChannel: RTCDataChannel, state: string }>
    this.peers = new Map();

    // Callbacks
    this.onMessageReceived = null;        // fn(data, fromPeerId)
    this.onConnectionStateChange = null;  // fn(state_summary_string)
    this.onPeerJoined = null;             // fn(peerId)
    this.onPeerLeft = null;               // fn(peerId)

    // ICE candidate buffer: outgoing candidates queued while signaling in-flight
    this._iceCandidateCallbacks = new Map(); // peerId -> fn(candidate)
  }

  /**
   * Creates a new RTCPeerConnection for a peer, wires state/channel listeners.
   */
  _createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({ iceServers: [] });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const cb = this._iceCandidateCallbacks.get(peerId);
        if (cb) cb({ type: 'ice', candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC][${peerId}] Connection state: ${state}`);
      if (state === 'connected') {
        if (this.peers.has(peerId)) this.peers.get(peerId).state = 'connected';
        this._broadcastStatusUpdate();
        if (this.onPeerJoined) this.onPeerJoined(peerId);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this._removePeer(peerId);
        this._broadcastStatusUpdate();
        if (this.onPeerLeft) this.onPeerLeft(peerId);
      }
    };

    pc.ondatachannel = (event) => {
      console.log(`[WebRTC][${peerId}] Incoming DataChannel`);
      this._setupDataChannel(peerId, event.channel);
    };

    return pc;
  }

  /**
   * Set up DataChannel event listeners for a given peer
   */
  _setupDataChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log(`✅ [WebRTC][${peerId}] DataChannel OPEN`);
      if (this.peers.has(peerId)) {
        this.peers.get(peerId).dataChannel = channel;
        this.peers.get(peerId).state = 'connected';
      }
      this._broadcastStatusUpdate();
      if (this.onPeerJoined) this.onPeerJoined(peerId);
    };

    channel.onclose = () => {
      console.log(`❌ [WebRTC][${peerId}] DataChannel CLOSED`);
      this._removePeer(peerId);
      this._broadcastStatusUpdate();
      if (this.onPeerLeft) this.onPeerLeft(peerId);
    };

    channel.onmessage = (event) => {
      if (this.onMessageReceived) {
        this.onMessageReceived(event.data, peerId);
      }
    };

    if (this.peers.has(peerId)) {
      this.peers.get(peerId).dataChannel = channel;
    }
  }

  /**
   * Creates a WebRTC Offer for a specific peer (we are the offerer).
   * Returns { sdpOffer: RTCSessionDescription, onIceCandidate: Function }
   */
  async createOffer(peerId, onIceCandidateReady) {
    const pc = this._createPeerConnection(peerId);

    const channel = pc.createDataChannel('ghost-channel', { ordered: true });
    this._setupDataChannel(peerId, channel);

    this.peers.set(peerId, { peerConnection: pc, dataChannel: channel, state: 'connecting' });
    if (onIceCandidateReady) this._iceCandidateCallbacks.set(peerId, onIceCandidateReady);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to settle
    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const check = () => { if (pc.iceGatheringState === 'complete') { resolve(); } };
      pc.onicegatheringstatechange = check;
      setTimeout(resolve, 1500); // fallback timeout
    });

    return pc.localDescription;
  }

  /**
   * Processes a peer's Offer and creates an Answer (we are the answerer).
   */
  async createAnswer(peerId, offerSdpObject, onIceCandidateReady) {
    const pc = this._createPeerConnection(peerId);
    this.peers.set(peerId, { peerConnection: pc, dataChannel: null, state: 'connecting' });
    if (onIceCandidateReady) this._iceCandidateCallbacks.set(peerId, onIceCandidateReady);

    await pc.setRemoteDescription(new RTCSessionDescription(offerSdpObject));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const check = () => { if (pc.iceGatheringState === 'complete') { resolve(); } };
      pc.onicegatheringstatechange = check;
      setTimeout(resolve, 1500);
    });

    return pc.localDescription;
  }

  /**
   * Sets the remote Answer SDP on our side (completing the offerer's handshake)
   */
  async setRemoteAnswer(peerId, answerSdpObject) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`[WebRTC] No peer found for id: ${peerId}`);
    await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdpObject));
  }

  /**
   * Adds a remote ICE candidate for a specific peer
   */
  async addIceCandidate(peerId, candidateInit) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    try {
      await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (e) {
      console.warn(`[WebRTC][${peerId}] Failed to add ICE candidate:`, e);
    }
  }

  /**
   * Broadcasts encrypted message to ALL connected peers
   */
  broadcast(payload) {
    const messageString = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    let sent = 0;
    this.peers.forEach((peer, peerId) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(messageString);
        sent++;
      }
    });
    if (sent === 0) throw new Error('No connected peers to send to.');
    return sent;
  }

  /**
   * Sends a message to a single specific peer
   */
  sendToPeer(peerId, payload) {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.dataChannel || peer.dataChannel.readyState !== 'open') {
      throw new Error(`Peer ${peerId} is not connected`);
    }
    const messageString = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    peer.dataChannel.send(messageString);
  }

  /**
   * Legacy single-peer send compatibility (uses broadcast)
   */
  send(payload) {
    return this.broadcast(payload);
  }

  /**
   * Returns number of currently connected peers
   */
  get connectedPeerCount() {
    let count = 0;
    this.peers.forEach(p => { if (p.state === 'connected') count++; });
    return count;
  }

  /**
   * Returns array of all connected peer IDs
   */
  get connectedPeerIds() {
    return Array.from(this.peers.keys()).filter(id => this.peers.get(id).state === 'connected');
  }

  /**
   * Broadcasts current connection state to app
   */
  _broadcastStatusUpdate() {
    if (!this.onConnectionStateChange) return;
    const count = this.connectedPeerCount;
    if (count === 0) {
      this.onConnectionStateChange('disconnected');
    } else if (count === 1) {
      this.onConnectionStateChange('connected');
    } else {
      this.onConnectionStateChange(`group:${count}`);
    }
  }

  /**
   * Removes a peer from the mesh
   */
  _removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      try { peer.dataChannel && peer.dataChannel.close(); } catch (_) {}
      try { peer.peerConnection && peer.peerConnection.close(); } catch (_) {}
      this.peers.delete(peerId);
      this._iceCandidateCallbacks.delete(peerId);
    }
  }

  /**
   * Closes all peer connections
   */
  closeAll() {
    this.peers.forEach((_, peerId) => this._removePeer(peerId));
    this.peers.clear();
    this._iceCandidateCallbacks.clear();
    if (this.onConnectionStateChange) this.onConnectionStateChange('disconnected');
  }
}

window.ghostWebRTC = new GhostWebRTC();
