/**
 * GhostChat Main Application Orchestrator
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('👻 Initializing GhostChat Application...');

  // State Variables
  let myCryptoInfo = null;
  let peerPublicKeyHex = null;
  let selectedTTL = 3600000; // Default 1 Hour
  let mediaRecorder = null;
  let audioChunks = [];
  let recStartTime = 0;
  let recTimerInterval = null;

  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const userFingerprint = document.getElementById('userFingerprint');
  const chatTimeline = document.getElementById('chatTimeline');
  const emptyState = document.getElementById('emptyState');
  const messageInput = document.getElementById('messageInput');
  const btnSendMessage = document.getElementById('btnSendMessage');
  const btnAttachFile = document.getElementById('btnAttachFile');
  const fileInput = document.getElementById('fileInput');
  const btnVoiceNote = document.getElementById('btnVoiceNote');
  const ttlSelect = document.getElementById('ttlSelect');
  const panicBtn = document.getElementById('panicBtn');
  const lockSessionBtn = document.getElementById('lockSessionBtn');
  const installPwaBtn = document.getElementById('installPwaBtn');

  // PWA 1-Tap Install Prompt for Smartphones
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installPwaBtn) {
      installPwaBtn.style.display = 'flex';
    }
  });

  if (installPwaBtn) {
    installPwaBtn.style.display = 'flex'; // Always visible by default
    installPwaBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          installPwaBtn.style.display = 'none';
        }
        deferredInstallPrompt = null;
      } else {
        // Fallback guide if browser prompt hasn't triggered yet
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          alert('📲 To Install on iPhone:\n1. Tap the Share button (bottom center)\n2. Tap "Add to Home Screen"');
        } else {
          alert('📲 To Install on Android:\n1. Tap Chrome menu (⋮ at top right)\n2. Tap "Install app" or "Add to Home screen"');
        }
      }
    });
  }

  // Modals & Toolbar Buttons
  const btnPairQR = document.getElementById('btnPairQR');
  const btnAudioFallback = document.getElementById('btnAudioFallback');
  const btnManualCopy = document.getElementById('btnManualCopy');
  
  const qrModal = document.getElementById('qrModal');
  const closeQrModal = document.getElementById('closeQrModal');
  const tabShowQr = document.getElementById('tabShowQr');
  const tabScanQr = document.getElementById('tabScanQr');
  const sectionShowQr = document.getElementById('sectionShowQr');
  const sectionScanQr = document.getElementById('sectionScanQr');
  const qrCanvasContainer = document.getElementById('qrCanvasContainer');
  const btnGenOffer = document.getElementById('btnGenOffer');
  const btnGenAnswer = document.getElementById('btnGenAnswer');
  const qrVideoPreview = document.getElementById('qrVideoPreview');
  const btnToggleCamera = document.getElementById('btnToggleCamera');

  const manualSdpModal = document.getElementById('manualSdpModal');
  const closeManualSdpModal = document.getElementById('closeManualSdpModal');
  const mySignalPayload = document.getElementById('mySignalPayload');
  const peerSignalPayload = document.getElementById('peerSignalPayload');
  const btnCopySignal = document.getElementById('btnCopySignal');
  const btnApplyPeerSignal = document.getElementById('btnApplyPeerSignal');

  const audioModemModal = document.getElementById('audioModemModal');
  const closeAudioModemModal = document.getElementById('closeAudioModemModal');
  const btnStartAudioTx = document.getElementById('btnStartAudioTx');
  const btnStartAudioRx = document.getElementById('btnStartAudioRx');
  const audioStatusText = document.getElementById('audioStatusText');

  const voiceRecordOverlay = document.getElementById('voiceRecordOverlay');
  const recTimer = document.getElementById('recTimer');
  const btnCancelRec = document.getElementById('btnCancelRec');
  const btnSendRec = document.getElementById('btnSendRec');

  // Register Service Worker for Offline PWA Support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('✅ ServiceWorker Registered');
    }).catch(err => console.warn('ServiceWorker registration error:', err));
  }

  // 1. Initialize Storage & Crypto Keys
  await window.ghostStorage.init();
  myCryptoInfo = await window.ghostCrypto.generateKeyPair();
  userFingerprint.innerText = myCryptoInfo.fingerprint;

  // Load existing unexpired messages from IndexedDB
  await loadMessagesFromDB();

  // Listen for WebRTC Connection Changes
  window.ghostWebRTC.onConnectionStateChange = (state) => {
    if (state === 'connected') {
      statusDot.className = 'status-dot connected';
      statusText.innerText = 'Connected (P2P Direct)';
      messageInput.disabled = false;
      btnSendMessage.disabled = false;
      if (emptyState) emptyState.style.display = 'none';
    } else if (state === 'connecting') {
      statusDot.className = 'status-dot connecting';
      statusText.innerText = 'Connecting...';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.innerText = 'Offline / Standalone';
      messageInput.disabled = true;
      btnSendMessage.disabled = true;
    }
  };

  // Listen for Incoming Encrypted WebRTC Messages
  window.ghostWebRTC.onMessageReceived = async (data) => {
    try {
      const envelope = typeof data === 'string' ? JSON.parse(data) : data;
      const decryptedText = await window.ghostCrypto.decryptPayload(envelope);
      const parsed = JSON.parse(decryptedText);

      const msgObj = {
        id: parsed.id || 'msg_' + Date.now(),
        sender: 'received',
        text: parsed.text,
        mediaData: parsed.mediaData,
        timestamp: parsed.timestamp || Date.now(),
        expiresAt: parsed.ttl > 0 ? Date.now() + parsed.ttl : null,
        ttl: parsed.ttl
      };

      await window.ghostStorage.saveMessage(msgObj);
      renderMessageRow(msgObj);
    } catch (e) {
      console.error('Error handling incoming encrypted message:', e);
    }
  };

  // TTL Auto-Purge Event Listener
  window.onMessageAutoPurged = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.remove();
  };

  // 2. Message Sending Flow
  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const msgObj = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      sender: 'sent',
      text: text,
      timestamp: Date.now(),
      expiresAt: selectedTTL > 0 ? Date.now() + selectedTTL : null,
      ttl: selectedTTL
    };

    try {
      const payloadString = JSON.stringify({
        id: msgObj.id,
        text: msgObj.text,
        timestamp: msgObj.timestamp,
        ttl: msgObj.ttl
      });

      const encryptedEnvelope = await window.ghostCrypto.encryptPayload(payloadString);
      window.ghostWebRTC.send(encryptedEnvelope);

      await window.ghostStorage.saveMessage(msgObj);
      renderMessageRow(msgObj);

      messageInput.value = '';
    } catch (e) {
      console.error('Failed to send encrypted message:', e);
      alert('Error sending message. Check connection status.');
    }
  }

  btnSendMessage.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // TTL Selection
  ttlSelect.addEventListener('change', (e) => {
    selectedTTL = parseInt(e.target.value, 10);
  });

  // Render Message UI
  function renderMessageRow(msg) {
    if (emptyState) emptyState.style.display = 'none';

    const row = document.createElement('div');
    row.id = `msg-${msg.id}`;
    row.className = `message-row ${msg.sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (msg.text) {
      const p = document.createElement('p');
      p.innerText = msg.text;
      bubble.appendChild(p);
    }

    if (msg.mediaData) {
      if (msg.mediaData.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = msg.mediaData.url;
        img.className = 'media-preview-img';
        bubble.appendChild(img);
      } else if (msg.mediaData.type.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = msg.mediaData.url;
        audio.controls = true;
        audio.className = 'audio-memo-player';
        bubble.appendChild(audio);
      }
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.innerHTML = `<span>${timeStr}</span>`;

    if (msg.ttl > 0) {
      const ttlMinutes = Math.round(msg.ttl / 60000);
      meta.innerHTML += `<span class="ttl-badge" title="Auto-purges after expiration">🔥 ${ttlMinutes}m</span>`;
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    chatTimeline.appendChild(row);
    chatTimeline.scrollTop = chatTimeline.scrollHeight;
  }

  async function loadMessagesFromDB() {
    const messages = await window.ghostStorage.getAllMessages();
    messages.sort((a, b) => a.timestamp - b.timestamp);
    messages.forEach(renderMessageRow);
  }

  // 3. QR Pairing Modal Handlers
  btnPairQR.addEventListener('click', () => {
    qrModal.style.display = 'flex';
  });

  closeQrModal.addEventListener('click', () => {
    qrModal.style.display = 'none';
    window.ghostQR.stopScanner();
  });

  tabShowQr.addEventListener('click', () => {
    tabShowQr.classList.add('active');
    tabScanQr.classList.remove('active');
    sectionShowQr.style.display = 'block';
    sectionScanQr.style.display = 'none';
    window.ghostQR.stopScanner();
  });

  tabScanQr.addEventListener('click', () => {
    tabScanQr.classList.add('active');
    tabShowQr.classList.remove('active');
    sectionScanQr.style.display = 'block';
    sectionShowQr.style.display = 'none';
    
    window.ghostQR.startScanner(qrVideoPreview, async (scannedPayload) => {
      console.log('✅ QR Code Scanned!');
      qrModal.style.display = 'none';
      await processScannedSignal(scannedPayload);
    });
  });

  btnToggleCamera.addEventListener('click', () => {
    window.ghostQR.toggleCamera(async (scannedPayload) => {
      qrModal.style.display = 'none';
      await processScannedSignal(scannedPayload);
    });
  });

  // Generate WebRTC Offer QR
  btnGenOffer.addEventListener('click', async () => {
    btnGenOffer.disabled = true;
    btnGenOffer.innerText = 'Generating Offer...';

    const offerSdp = await window.ghostWebRTC.createOffer();
    const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
    const qwbpSignal = window.ghostSignaling.compressSignal(offerSdp, rawPubHex);

    window.ghostQR.renderQR(qrCanvasContainer, qwbpSignal);
    btnGenOffer.innerText = 'Offer QR Ready';
    btnGenAnswer.disabled = false;
  });

  // Process Received QR Payload (Offer or Answer)
  async function processScannedSignal(qwbpString) {
    try {
      const decompressed = window.ghostSignaling.decompressSignal(qwbpString);
      
      if (decompressed.rawPublicKeyHex) {
        peerPublicKeyHex = decompressed.rawPublicKeyHex;
        const peerPubBuffer = window.ghostCrypto.hexToUint8Array(peerPublicKeyHex).buffer;
        await window.ghostCrypto.deriveSharedKey(peerPubBuffer);
        console.log('🔐 Derived shared encryption key with peer!');
      }

      if (decompressed.type === 'offer') {
        const answerSdp = await window.ghostWebRTC.createAnswer(decompressed);
        const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
        const answerQwbp = window.ghostSignaling.compressSignal(answerSdp, rawPubHex);

        qrModal.style.display = 'flex';
        tabShowQr.click();
        window.ghostQR.renderQR(qrCanvasContainer, answerQwbp);
        alert('Offer processed! Now let peer scan your generated Answer QR code.');
      } else if (decompressed.type === 'answer') {
        await window.ghostWebRTC.setRemoteAnswer(decompressed);
        alert('Answer processed! Direct P2P Connection established.');
      }
    } catch (e) {
      console.error('Error processing scanned signal:', e);
      alert('Failed to process QR signal. Ensure payload is uncorrupted.');
    }
  }

  // 4. Manual SDP Modal Handlers
  btnManualCopy.addEventListener('click', () => {
    manualSdpModal.style.display = 'flex';
  });

  closeManualSdpModal.addEventListener('click', () => {
    manualSdpModal.style.display = 'none';
  });

  btnCopySignal.addEventListener('click', () => {
    if (!mySignalPayload.value) {
      alert('Please click "Generate Offer QR" inside Pair (QR Scan) modal first.');
      return;
    }
    navigator.clipboard.writeText(mySignalPayload.value);
    btnCopySignal.innerText = 'Copied!';
    setTimeout(() => btnCopySignal.innerText = 'Copy', 2000);
  });

  btnApplyPeerSignal.addEventListener('click', async () => {
    const payload = peerSignalPayload.value.trim();
    if (!payload) return;
    manualSdpModal.style.display = 'none';
    await processScannedSignal(payload);
  });

  // 5. Audio Modem Handlers
  btnAudioFallback.addEventListener('click', () => {
    audioModemModal.style.display = 'flex';
  });

  closeAudioModemModal.addEventListener('click', () => {
    audioModemModal.style.display = 'none';
    window.ghostAudioModem.stopListening();
  });

  btnStartAudioTx.addEventListener('click', async () => {
    const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
    const shortSignal = `GHOST:${myCryptoInfo.fingerprint}:${rawPubHex.substring(0, 16)}`;
    
    audioStatusText.innerText = 'Transmitting ultrasonic audio signal...';
    await window.ghostAudioModem.transmitData(shortSignal, () => {
      audioStatusText.innerText = 'Transmission Complete!';
    });
  });

  btnStartAudioRx.addEventListener('click', () => {
    window.ghostAudioModem.startListening(
      (receivedData) => {
        console.log('Audio received:', receivedData);
      },
      (statusText) => {
        audioStatusText.innerText = statusText;
      }
    );
  });

  // 6. File & Media Attachment Handler
  btnAttachFile.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      const fileId = 'file_' + Date.now();
      
      // Store file in OPFS if supported
      await window.ghostStorage.saveOpfsFile(fileId, evt.target.result);

      const msgObj = {
        id: 'msg_' + Date.now(),
        sender: 'sent',
        text: `[Sent File: ${file.name}]`,
        mediaData: { name: file.name, type: file.type, url: dataUrl },
        timestamp: Date.now(),
        expiresAt: selectedTTL > 0 ? Date.now() + selectedTTL : null,
        ttl: selectedTTL
      };

      const payloadString = JSON.stringify({
        id: msgObj.id,
        text: msgObj.text,
        mediaData: msgObj.mediaData,
        timestamp: msgObj.timestamp,
        ttl: msgObj.ttl
      });

      const encryptedEnvelope = await window.ghostCrypto.encryptPayload(payloadString);
      window.ghostWebRTC.send(encryptedEnvelope);

      await window.ghostStorage.saveMessage(msgObj);
      renderMessageRow(msgObj);
    };
    reader.readAsDataURL(file);
  });

  // 7. Voice Recording Note Handler
  btnVoiceNote.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.start();

      recStartTime = Date.now();
      voiceRecordOverlay.style.display = 'flex';

      recTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - recStartTime) / 1000);
        recTimer.innerText = `00:${sec.toString().padStart(2, '0')}`;
      }, 1000);
    } catch (e) {
      alert('Microphone access required for voice memos.');
    }
  });

  btnCancelRec.addEventListener('click', () => {
    if (mediaRecorder) mediaRecorder.stop();
    clearInterval(recTimerInterval);
    voiceRecordOverlay.style.display = 'none';
  });

  btnSendRec.addEventListener('click', () => {
    if (!mediaRecorder) return;
    mediaRecorder.onstop = async () => {
      clearInterval(recTimerInterval);
      voiceRecordOverlay.style.display = 'none';

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target.result;
        const msgObj = {
          id: 'msg_' + Date.now(),
          sender: 'sent',
          text: '🎤 Voice Memo',
          mediaData: { type: 'audio/webm', url: dataUrl },
          timestamp: Date.now(),
          expiresAt: selectedTTL > 0 ? Date.now() + selectedTTL : null,
          ttl: selectedTTL
        };

        const payloadString = JSON.stringify({
          id: msgObj.id,
          text: msgObj.text,
          mediaData: msgObj.mediaData,
          timestamp: msgObj.timestamp,
          ttl: msgObj.ttl
        });

        const encryptedEnvelope = await window.ghostCrypto.encryptPayload(payloadString);
        window.ghostWebRTC.send(encryptedEnvelope);

        await window.ghostStorage.saveMessage(msgObj);
        renderMessageRow(msgObj);
      };
      reader.readAsDataURL(audioBlob);
    };
    mediaRecorder.stop();
  });

  // 8. Session Lock & Panic Handlers
  lockSessionBtn.addEventListener('click', () => {
    window.ghostSessionLock.lock();
  });

  document.getElementById('lockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('sessionPasswordInput').value;
    if (pwd) {
      await window.ghostSessionLock.unlock(pwd);
    }
  });

  panicBtn.addEventListener('click', async () => {
    if (confirm('🚨 PANIC PURGE: This will permanently wipe all messages, RAM encryption keys, and OPFS files. Proceed?')) {
      await window.ghostStorage.panicPurge();
    }
  });

  document.getElementById('btnLockPanic').addEventListener('click', async () => {
    await window.ghostStorage.panicPurge();
  });

  console.log('✅ GhostChat Ready!');
});
