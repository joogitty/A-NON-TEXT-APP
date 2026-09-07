/**
 * GhostChat Serverless QWBP (QR-WebRTC Bootstrap Protocol)
 * Compresses WebRTC SDP Offer/Answer into compact JSON strings fit for single QR codes
 */

class GhostSignaling {
  /**
   * Compresses full SDP & ICE candidates into a compact QWBP object string
   */
  compressSignal(sdpObject, rawPublicKeyHex) {
    const sdpText = sdpObject.sdp || sdpObject;
    
    // Extract ice-ufrag
    const ufragMatch = sdpText.match(/a=ice-ufrag:(.+)\r\n/);
    const ufrag = ufragMatch ? ufragMatch[1].trim() : '';

    // Extract ice-pwd
    const pwdMatch = sdpText.match(/a=ice-pwd:(.+)\r\n/);
    const pwd = pwdMatch ? pwdMatch[1].trim() : '';

    // Extract DTLS fingerprint
    const fpMatch = sdpText.match(/a=fingerprint:(.+)\r\n/);
    const fingerprint = fpMatch ? fpMatch[1].trim() : '';

    // Extract host candidates
    const candidateLines = [];
    const candRegex = /a=candidate:(.+)\r\n/g;
    let match;
    while ((match = candRegex.exec(sdpText)) !== null) {
      candidateLines.push(match[1].trim());
    }

    const payload = {
      t: sdpObject.type, // 'offer' or 'answer'
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
}

window.ghostSignaling = new GhostSignaling();
