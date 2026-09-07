/**
 * GhostChat Audio Modem Fallback
 * Web Audio API Frequency-Shift Keying (FSK) Modem (~18.5 kHz - 19.5 kHz Ultrasonic Spectrum)
 * Air-gapped fallback signaling when local IP network routing is unavailable
 */

class GhostAudioModem {
  constructor() {
    this.audioCtx = null;
    this.micStream = null;
    this.analyser = null;
    this.isListening = false;
    this.freq0 = 18500; // Binary 0 frequency (Hz)
    this.freq1 = 19500; // Binary 1 frequency (Hz)
    this.baudRate = 20; // Bits per second
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
  }

  /**
   * Transmits binary data as ultrasonic audio tones
   */
  async transmitData(dataString, onProgress) {
    this.initAudioContext();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const enc = new TextEncoder();
    const bytes = enc.encode(dataString);
    let bitStream = '';

    // Convert bytes to bit stream with start/stop framing
    for (let b of bytes) {
      bitStream += '0' + b.toString(2).padStart(8, '0') + '1';
    }

    const bitDuration = 1 / this.baudRate;
    let now = this.audioCtx.currentTime + 0.1;

    for (let i = 0; i < bitStream.length; i++) {
      const bit = bitStream[i];
      const freq = bit === '1' ? this.freq1 : this.freq0;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      // Soft envelope to avoid speaker pops
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
      gain.gain.setValueAtTime(0.3, now + bitDuration - 0.005);
      gain.gain.linearRampToValueAtTime(0, now + bitDuration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + bitDuration);

      now += bitDuration;
    }

    if (onProgress) {
      setTimeout(onProgress, (now - this.audioCtx.currentTime) * 1000);
    }
  }

  /**
   * Starts listening for ultrasonic audio tones via microphone
   */
  async startListening(onReceiveCallback, onStatusUpdate) {
    this.initAudioContext();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      this.isListening = true;
      if (onStatusUpdate) onStatusUpdate('Listening for ultrasonic tones...');

      this.listenLoop(onReceiveCallback, onStatusUpdate);
    } catch (e) {
      console.error('Microphone audio input error:', e);
      if (onStatusUpdate) onStatusUpdate('Microphone access denied or unsupported');
    }
  }

  listenLoop(onReceiveCallback, onStatusUpdate) {
    if (!this.isListening) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const sampleRate = this.audioCtx.sampleRate;
    const binSize = sampleRate / this.analyser.fftSize;

    const bin0 = Math.round(this.freq0 / binSize);
    const bin1 = Math.round(this.freq1 / binSize);

    const val0 = dataArray[bin0] || 0;
    const val1 = dataArray[bin1] || 0;

    if (val0 > 100 || val1 > 100) {
      if (onStatusUpdate) onStatusUpdate(`Signal Detected! (0: ${val0}, 1: ${val1})`);
    }

    requestAnimationFrame(() => this.listenLoop(onReceiveCallback, onStatusUpdate));
  }

  stopListening() {
    this.isListening = false;
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }
}

window.ghostAudioModem = new GhostAudioModem();
