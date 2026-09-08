/**
 * GhostChat QR Scanner & Generator Module
 *
 * QR Generation: Uses qrcode-generator (MIT) for proper ISO/IEC 18004 compliant QR codes.
 * QR Scanning:   Uses jsQR (MIT) for canvas frame decoding — works on all browsers/platforms
 *                with automatic fallback to native BarcodeDetector on supported browsers.
 */

class GhostQR {
  constructor() {
    this.mediaStream = null;
    this.videoElement = null;
    this.animFrameId = null;
    this.facingMode = 'environment';
    this._scanCanvas = null;
    this._scanCtx = null;
    this._scanning = false;
  }

  // =========================================================================
  // QR Code Generation — Standard ISO/IEC 18004 via qrcode-generator
  // =========================================================================

  /**
   * Renders a proper scannable QR code into a container element.
   * Uses the qr.js library loaded via CDN (see index.html script include).
   */
  renderQR(containerElement, text) {
    containerElement.innerHTML = '';

    if (typeof qrcode === 'undefined') {
      // Fallback: Show text box if library not loaded
      const fallback = document.createElement('div');
      fallback.style.cssText = 'padding:16px;font-size:11px;word-break:break-all;color:#aaa;background:#111;border-radius:8px;';
      fallback.innerText = 'QR Library loading... Use Manual SDP instead.\n\n' + text;
      containerElement.appendChild(fallback);
      return;
    }

    try {
      // Error correction level H = ~30% redundancy for best scan reliability
      // Type number 0 = auto-select
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();

      // Draw QR on canvas for crisp rendering at any DPI
      const moduleCount = qr.getModuleCount();
      const cellSize = Math.max(4, Math.floor(280 / moduleCount));
      const canvasSize = cellSize * moduleCount;

      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      canvas.style.width = '100%';
      canvas.style.maxWidth = '280px';
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      canvas.style.imageRendering = 'pixelated';

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasSize, canvasSize);
      ctx.fillStyle = '#000000';

      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }

      containerElement.appendChild(canvas);
    } catch (e) {
      console.error('[GhostQR] QR generation error:', e);
      // Fallback text box
      const fallback = document.createElement('textarea');
      fallback.style.cssText = 'width:100%;height:80px;font-size:9px;background:#111;color:#0ff;border:1px solid #333;';
      fallback.value = text;
      fallback.readOnly = true;
      containerElement.appendChild(fallback);
    }
  }

  // =========================================================================
  // QR Code Scanning — jsQR canvas decoder + BarcodeDetector fallback
  // =========================================================================

  /**
   * Starts camera scanner — requests camera permission and begins scan loop.
   */
  async startScanner(videoElement, onScanCallback) {
    this.videoElement = videoElement;
    this._scanning = true;

    // Reuse hidden canvas for frame grabbing
    if (!this._scanCanvas) {
      this._scanCanvas = document.createElement('canvas');
      this._scanCtx = this._scanCanvas.getContext('2d', { willReadFrequently: true });
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.setAttribute('playsinline', true);
      await this.videoElement.play();

      this._scanLoop(onScanCallback);
    } catch (e) {
      console.error('Camera access error:', e);
      alert('Camera access denied. Please check browser permissions or use Manual SDP / 6-Digit Code pairing instead.');
    }
  }

  /**
   * Continuous scan loop — tries native BarcodeDetector first, falls back to jsQR canvas decode.
   */
  async _scanLoop(onScanCallback) {
    if (!this._scanning || !this.mediaStream) return;
    if (!this.videoElement || this.videoElement.readyState < 2) {
      this.animFrameId = requestAnimationFrame(() => this._scanLoop(onScanCallback));
      return;
    }

    const video = this.videoElement;
    const w = video.videoWidth;
    const h = video.videoHeight;

    if (w === 0 || h === 0) {
      this.animFrameId = requestAnimationFrame(() => this._scanLoop(onScanCallback));
      return;
    }

    // Try native BarcodeDetector first (fast, hardware-accelerated on Chrome Android)
    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          this._onScanSuccess(barcodes[0].rawValue, onScanCallback);
          return;
        }
      } catch (_) { /* fall through to jsQR */ }
    }

    // jsQR canvas frame decode
    if (typeof jsQR !== 'undefined') {
      try {
        this._scanCanvas.width = w;
        this._scanCanvas.height = h;
        this._scanCtx.drawImage(video, 0, 0, w, h);
        const imageData = this._scanCtx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        if (code) {
          this._onScanSuccess(code.data, onScanCallback);
          return;
        }
      } catch (_) { /* continue loop */ }
    }

    this.animFrameId = requestAnimationFrame(() => this._scanLoop(onScanCallback));
  }

  _onScanSuccess(rawValue, onScanCallback) {
    console.log('✅ QR Code Scanned! Value length:', rawValue.length);
    this.stopScanner();
    onScanCallback(rawValue);
  }

  toggleCamera(onScanCallback) {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    this.stopScanner();
    if (this.videoElement) {
      this._scanning = true;
      this.startScanner(this.videoElement, onScanCallback);
    }
  }

  /**
   * Stops camera stream and scan loop
   */
  stopScanner() {
    this._scanning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}

window.ghostQR = new GhostQR();
