/**
 * GhostChat Serverless QWBP (QR-WebRTC Bootstrap Protocol) + Group Room Signaling Client
 *
 * Handles two pairing modes:
 * 1. QWBP (QR/Manual): Compress/decompress SDP into compact strings for QR code or copy-paste.
 * 2. Group Room (6-Digit PIN): REST API relay to the local Python signaling server for
 *    multi-device group mesh sessions. Supports Laptop-to-Laptop, Phone-to-Laptop, n-device groups.
 */

class GhostSignaling {

  // ===========================================================================
  // 1. QWBP — QR Code / Manual SDP Compression
  // ===========================================================================

  /**
   * Compresses full SDP & ICE candidates into a compact QWBP object string
   */
  compressSignal(sdpObject, rawPublicKeyHex) {
    const sdpText = sdpObject.sdp || sdpObject;

    const ufragMatch = sdpText.match(/a=ice-ufrag:(.+)\r\n/);
    const ufrag = ufragMatch ? ufragMatch[1].trim() : '';

    const pwdMatch = sdpText.match(/a=ice-pwd:(.+)\r\n/);
    const pwd = pwdMatch ? pwdMatch[1].trim() : '';

    const fpMatch = sdpText.match(/a=fingerprint:(.+)\r\n/);
    const fingerprint = fpMatch ? fpMatch[1].trim() : '';

    const candidateLines = [];
    const candRegex = /a=candidate:(.+)\r\n/g;
    let match;
    while ((match = candRegex.exec(sdpText)) !== null) {
      candidateLines.push(match[1].trim());
    }

    const payload = {
      t: sdpObject.type,
      u: ufrag,
      p: pwd,
      f: fingerprint,
      c: candidateLines,
      k: rawPublicKeyHex
    };

    return JSON.stringify(payload);
  }

  /**
   * Decompresses QWBP JSON payload back into a full valid SDP object
   */
  decompressSignal(qwbpString) {
    try {
      const data = typeof qwbpString === 'string' ? JSON.parse(qwbpString) : qwbpString;

      let sdpLines = [
        "v=0",
        "o=- " + Math.floor(Math.random() * 1000000000) + " 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0",
        "a=msid-semantic: WMS",
        "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
        "c=IN IP4 0.0.0.0",
        "a=ice-ufrag:" + data.u,
        "a=ice-pwd:" + data.p,
        "a=fingerprint:" + data.f,
        "a=setup:" + (data.t === 'offer' ? 'actpass' : 'active'),
        "a=mid:0",
        "a=sctp-port:5000",
        "a=max-message-size:262144"
      ];

      if (data.c && Array.isArray(data.c)) {
        data.c.forEach(cand => {
          sdpLines.push("a=candidate:" + cand);
        });
      }

      const fullSdpText = sdpLines.join("\r\n") + "\r\n";

      return {
        type: data.t,
        sdp: fullSdpText,
        rawPublicKeyHex: data.k,
        candidates: data.c || []
      };
    } catch (e) {
      console.error('Error decompressing QWBP payload:', e);
      throw new Error('Invalid or corrupted QR signal code');
    }
  }

  // ===========================================================================
  // 2. Group Room (6-Digit PIN) Relay API
  // Communicates with the Python local server signaling relay.
  // The server URL auto-detects: same host as the current page.
  // ===========================================================================

  get _serverBase() {
    return `${window.location.protocol}//${window.location.host}`;
  }

  /**
   * Creates a new group room session.
   * Returns: { code: "482910", peerId: "peer_1234" }
   */
  async createRoom(peerId, initialSignal = null) {
    const resp = await fetch(`${this._serverBase}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerId, signal: initialSignal })
    });
    if (!resp.ok) throw new Error('Failed to create room');
    return resp.json();
  }

  /**
   * Join an existing group room via 6-digit PIN code.
   * Returns: { code, peerId, existingPeers: [], hostSignal, hostPeerId }
   */
  async joinRoom(code, peerId) {
    const resp = await fetch(`${this._serverBase}/api/room/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code).replace(/\D/g, ''), peerId })
    });
    const data = await resp.json();
    if (!resp.ok || data.status === 'error') throw new Error(data.message || 'Failed to join room');
    return data;
  }

  /**
   * Send a WebRTC signal (offer/answer/ICE) to a specific peer or broadcast.
   */
  async sendSignal(code, fromPeerId, signal, toPeerId = null) {
    await fetch(`${this._serverBase}/api/room/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, fromPeerId, toPeerId, signal })
    });
  }

  /**
   * Polls the server for incoming signals directed at this peer.
   * Returns: { signals: [{ fromPeerId, signal }], activePeers: [] }
   */
  async pollSignals(code, peerId) {
    const resp = await fetch(
      `${this._serverBase}/api/room/poll?code=${encodeURIComponent(code)}&peerId=${encodeURIComponent(peerId)}`
    );
    if (!resp.ok) return { signals: [], activePeers: [] };
    return resp.json();
  }
}

window.ghostSignaling = new GhostSignaling();
