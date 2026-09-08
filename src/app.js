/**
 * GhostChat Main Application Orchestrator
 * Wires up: Multi-Peer WebRTC Mesh, 6-Digit Group Room Codes, QR Pairing,
 *           Manual SDP, Audio Modem, Session Lock, and Voice Recording.
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('👻 Initializing GhostChat Application...');

  // ─── State Variables ────────────────────────────────────────────────────────
  let myCryptoInfo = null;
  let peerPublicKeyHex = null;    // Used for 1:1 QR pairing (manual SDP mode)
  let selectedTTL = 3600000;
  let mediaRecorder = null;
  let audioChunks = [];
  let recStartTime = 0;
  let recTimerInterval = null;

  // Group Room state
  let myRoomCode = null;          // Current active 6-digit room code
  let myPeerId = null;            // Our peer ID in the room
  let pollInterval = null;        // Signaling poll timer
  let pendingOffers = new Map();  // peerId → local offer SDP (awaiting answer)

  // ─── DOM Elements ───────────────────────────────────────────────────────────
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
  const peerListBar = document.getElementById('peerListBar');
  const peerListItems = document.getElementById('peerListItems');

  // Toolbar buttons
  const btnGroupCode = document.getElementById('btnGroupCode');
  const btnPairQR = document.getElementById('btnPairQR');
  const btnAudioFallback = document.getElementById('btnAudioFallback');
  const btnManualCopy = document.getElementById('btnManualCopy');

  // Group Code Modal
  const groupCodeModal = document.getElementById('groupCodeModal');
  const closeGroupCodeModal = document.getElementById('closeGroupCodeModal');
  const tabCreateCode = document.getElementById('tabCreateCode');
  const tabJoinCode = document.getElementById('tabJoinCode');
  const sectionCreateCode = document.getElementById('sectionCreateCode');
  const sectionJoinCode = document.getElementById('sectionJoinCode');
  const codeDigits = document.getElementById('codeDigits');
  const codeStatus = document.getElementById('codeStatus');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const waitingPeersList = document.getElementById('waitingPeersList');
  const hostPeerItems = document.getElementById('hostPeerItems');
  const joinCodeInput = document.getElementById('joinCodeInput');
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const joinStatus = document.getElementById('joinStatus');

  // QR Modal
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

  // Manual SDP Modal
  const manualSdpModal = document.getElementById('manualSdpModal');
  const closeManualSdpModal = document.getElementById('closeManualSdpModal');
  const mySignalPayload = document.getElementById('mySignalPayload');
  const peerSignalPayload = document.getElementById('peerSignalPayload');
  const btnCopySignal = document.getElementById('btnCopySignal');
  const btnApplyPeerSignal = document.getElementById('btnApplyPeerSignal');

  // Audio Modem Modal
  const audioModemModal = document.getElementById('audioModemModal');
  const closeAudioModemModal = document.getElementById('closeAudioModemModal');
  const btnStartAudioTx = document.getElementById('btnStartAudioTx');
  const btnStartAudioRx = document.getElementById('btnStartAudioRx');
  const audioStatusText = document.getElementById('audioStatusText');

  // Voice Recorder Overlay
  const voiceRecordOverlay = document.getElementById('voiceRecordOverlay');
  const recTimer = document.getElementById('recTimer');
  const btnCancelRec = document.getElementById('btnCancelRec');
  const btnSendRec = document.getElementById('btnSendRec');

  // ─── PWA Install ─────────────────────────────────────────────────────────
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installPwaBtn) installPwaBtn.style.display = 'flex';
  });

  if (installPwaBtn) {
    installPwaBtn.style.display = 'flex';
    installPwaBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') installPwaBtn.style.display = 'none';
        deferredInstallPrompt = null;
      } else {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          alert('📲 To Install on iPhone:\n1. Tap the Share button (bottom center)\n2. Tap "Add to Home Screen"');
        } else {
          alert('📲 To Install on Android:\n1. Tap Chrome menu (⋮ at top right)\n2. Tap "Install app" or "Add to Home screen"');
        }
      }
    });
  }

  // ─── Service Worker ───────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('✅ ServiceWorker Registered'))
      .catch(err => console.warn('ServiceWorker error:', err));
  }

  // ─── Initialize Storage & Crypto ─────────────────────────────────────────
  await window.ghostStorage.init();
  myCryptoInfo = await window.ghostCrypto.generateKeyPair();
  userFingerprint.innerText = myCryptoInfo.fingerprint;

  // Generate a stable random peer ID for this session
  myPeerId = 'gc_' + myCryptoInfo.fingerprint.substring(0, 8);

  await loadMessagesFromDB();

  // ─── WebRTC Multi-Peer Callbacks ─────────────────────────────────────────
  window.ghostWebRTC.onConnectionStateChange = (state) => {
    if (state === 'connected') {
      statusDot.className = 'status-dot connected';
      statusText.innerText = 'Connected (P2P Direct)';
      messageInput.disabled = false;
      btnSendMessage.disabled = false;
      if (emptyState) emptyState.style.display = 'none';
    } else if (typeof state === 'string' && state.startsWith('group:')) {
      const count = state.split(':')[1];
      statusDot.className = 'status-dot connected';
      statusText.innerText = `Group Chat (${count} peers)`;
      messageInput.disabled = false;
      btnSendMessage.disabled = false;
      if (emptyState) emptyState.style.display = 'none';
    } else if (state === 'connecting') {
      statusDot.className = 'status-dot connecting';
      statusText.innerText = 'Connecting...';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.innerText = 'Offline / Standalone';
      if (window.ghostWebRTC.connectedPeerCount === 0) {
        messageInput.disabled = true;
        btnSendMessage.disabled = true;
      }
    }
  };

  window.ghostWebRTC.onPeerJoined = (peerId) => {
    console.log('🟢 Peer joined mesh:', peerId);
    updatePeerListBar();
    addSystemMessage(`Peer joined: ${peerId.substring(0, 16)}`);
  };

  window.ghostWebRTC.onPeerLeft = (peerId) => {
    console.log('🔴 Peer left mesh:', peerId);
    updatePeerListBar();
    addSystemMessage(`Peer disconnected: ${peerId.substring(0, 16)}`);
  };

  window.ghostWebRTC.onMessageReceived = async (data, fromPeerId) => {
    try {
      const envelope = typeof data === 'string' ? JSON.parse(data) : data;
      let decryptedText;
      try {
        decryptedText = await window.ghostCrypto.decryptPayload(envelope);
      } catch (_) {
        // If decryption fails (no shared key in group mode), treat as plain JSON
        decryptedText = data;
      }
      const parsed = JSON.parse(decryptedText);

      const msgObj = {
        id: parsed.id || 'msg_' + Date.now(),
        sender: 'received',
        text: parsed.text,
        mediaData: parsed.mediaData,
        timestamp: parsed.timestamp || Date.now(),
        expiresAt: parsed.ttl > 0 ? Date.now() + parsed.ttl : null,
        ttl: parsed.ttl,
        fromPeer: fromPeerId ? fromPeerId.substring(0, 8) : null
      };

      await window.ghostStorage.saveMessage(msgObj);
      renderMessageRow(msgObj);
    } catch (e) {
      console.error('Error handling incoming message:', e);
    }
  };

  window.onMessageAutoPurged = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.remove();
  };

  // ─── Peer List Bar ────────────────────────────────────────────────────────
  function updatePeerListBar() {
    const peerIds = window.ghostWebRTC.connectedPeerIds;
    if (peerIds.length === 0) {
      peerListBar.style.display = 'none';
      return;
    }
    peerListBar.style.display = 'flex';
    peerListItems.innerHTML = '';
    peerIds.forEach(pid => {
      const chip = document.createElement('div');
      chip.className = 'peer-chip';
      chip.innerText = '● ' + pid.substring(0, 14);
      peerListItems.appendChild(chip);
    });
  }

  function addSystemMessage(text) {
    const row = document.createElement('div');
    row.style.cssText = 'text-align:center;font-size:0.75rem;color:#64748b;padding:4px 0;';
    row.innerText = '— ' + text + ' —';
    chatTimeline.appendChild(row);
    chatTimeline.scrollTop = chatTimeline.scrollHeight;
  }

  // ─── Message Sending ──────────────────────────────────────────────────────
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
        id: msgObj.id, text: msgObj.text,
        timestamp: msgObj.timestamp, ttl: msgObj.ttl
      });

      let finalPayload;
      try {
        // Try encrypted send if shared key exists
        finalPayload = await window.ghostCrypto.encryptPayload(payloadString);
      } catch (_) {
        // In group mode without per-peer E2E keys, send as plain JSON
        finalPayload = payloadString;
      }

      window.ghostWebRTC.broadcast(finalPayload);
      await window.ghostStorage.saveMessage(msgObj);
      renderMessageRow(msgObj);
      messageInput.value = '';
    } catch (e) {
      console.error('Failed to send message:', e);
      alert('Error sending message. Check connection status.');
    }
  }

  btnSendMessage.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  ttlSelect.addEventListener('change', (e) => {
    selectedTTL = parseInt(e.target.value, 10);
  });

  // ─── Message Rendering ────────────────────────────────────────────────────
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
    let metaHtml = `<span>${timeStr}</span>`;
    if (msg.fromPeer) metaHtml = `<span style="color:#64748b">${msg.fromPeer}</span>` + metaHtml;
    if (msg.ttl > 0) {
      const ttlMinutes = Math.round(msg.ttl / 60000);
      metaHtml += `<span class="ttl-badge" title="Auto-purges after expiration">🔥 ${ttlMinutes}m</span>`;
    }
    meta.innerHTML = metaHtml;
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

  // =========================================================================
  // 3. GROUP SESSION CODE MODAL — 6-Digit PIN Room Pairing
  // =========================================================================

  function openGroupCodeModal() {
    groupCodeModal.style.display = 'flex';
  }

  function closeGroupCodeModalFn() {
    groupCodeModal.style.display = 'none';
  }

  btnGroupCode.addEventListener('click', openGroupCodeModal);
  closeGroupCodeModal.addEventListener('click', closeGroupCodeModalFn);

  // Tab switching inside Group Code Modal
  tabCreateCode.addEventListener('click', () => {
    tabCreateCode.classList.add('active');
    tabJoinCode.classList.remove('active');
    sectionCreateCode.style.display = 'block';
    sectionJoinCode.style.display = 'none';
  });

  tabJoinCode.addEventListener('click', () => {
    tabJoinCode.classList.add('active');
    tabCreateCode.classList.remove('active');
    sectionJoinCode.style.display = 'block';
    sectionCreateCode.style.display = 'none';
  });

  // Format join code input as user types (auto-dash: 123 456)
  joinCodeInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '').substring(0, 6);
    e.target.value = val;
  });

  // ─── CREATE GROUP ROOM ────────────────────────────────────────────────────
  btnCreateRoom.addEventListener('click', async () => {
    btnCreateRoom.disabled = true;
    btnCreateRoom.innerText = 'Creating...';
    codeDigits.innerText = '......';
    codeStatus.className = 'code-status';
    codeStatus.innerText = 'Contacting local signaling server...';

    try {
      // Step 1: Create WebRTC offer
      const offerSdp = await window.ghostWebRTC.createOffer(myPeerId + '_self', async (iceSignal) => {
        // When we get ICE candidates, broadcast them to the room
        if (myRoomCode) {
          await window.ghostSignaling.sendSignal(myRoomCode, myPeerId, iceSignal);
        }
      });

      const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
      const compressedOffer = window.ghostSignaling.compressSignal(offerSdp, rawPubHex);

      // Step 2: Register room on signaling server with the offer
      const roomData = await window.ghostSignaling.createRoom(myPeerId, compressedOffer);
      myRoomCode = roomData.code;

      // Step 3: Display the 6-digit code
      const displayCode = myRoomCode.substring(0, 3) + ' ' + myRoomCode.substring(3);
      codeDigits.innerText = displayCode;
      codeStatus.className = 'code-status waiting';
      codeStatus.innerText = 'Waiting for peers to join...';

      waitingPeersList.style.display = 'block';
      hostPeerItems.innerHTML = '';

      btnCreateRoom.innerText = '✅ Code Active';

      // Step 4: Start polling for incoming peer signals
      startSignalingPoll();

    } catch (e) {
      console.error('Room create error:', e);
      codeStatus.innerText = 'Error: Could not reach local server. Make sure you launched via start.bat / start.sh';
      codeStatus.className = 'code-status';
      btnCreateRoom.disabled = false;
      btnCreateRoom.innerText = '✨ Generate Session Code';
    }
  });

  // ─── JOIN GROUP ROOM ──────────────────────────────────────────────────────
  btnJoinRoom.addEventListener('click', async () => {
    const code = joinCodeInput.value.replace(/\D/g, '').trim();
    if (code.length !== 6) {
      showJoinStatus('Please enter a full 6-digit code.', 'error');
      return;
    }

    btnJoinRoom.disabled = true;
    showJoinStatus('🔗 Connecting to session...', 'connecting');

    try {
      // Step 1: Join the room, get host's offer + any existing peer list
      const joinData = await window.ghostSignaling.joinRoom(code, myPeerId);
      myRoomCode = code;

      showJoinStatus('✅ Room found! Establishing connection...', 'connecting');

      // Step 2: If host signal is present, process it (create answer)
      if (joinData.hostSignal && joinData.hostPeerId) {
        await processRoomSignal(joinData.hostPeerId, joinData.hostSignal);
      }

      // Step 3: Start polling for answer confirmations + new peer signals
      startSignalingPoll();

      // Step 4: After connections establish, close modal
      setTimeout(() => {
        closeGroupCodeModalFn();
        joinCodeInput.value = '';
      }, 1500);

    } catch (e) {
      console.error('Room join error:', e);
      showJoinStatus(`❌ ${e.message || 'Failed to connect. Check the code and try again.'}`, 'error');
      btnJoinRoom.disabled = false;
    }
  });

  function showJoinStatus(message, type) {
    joinStatus.style.display = 'block';
    joinStatus.className = `join-status-text ${type}`;
    joinStatus.innerText = message;
    if (type === 'success') setTimeout(() => { joinStatus.style.display = 'none'; btnJoinRoom.disabled = false; }, 3000);
  }

  // ─── SIGNALING POLL LOOP ──────────────────────────────────────────────────
  function startSignalingPoll() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!myRoomCode || !myPeerId) return;
      try {
        const { signals, activePeers } = await window.ghostSignaling.pollSignals(myRoomCode, myPeerId);

        // Update host modal peer list
        if (hostPeerItems && activePeers) {
          const others = activePeers.filter(p => p !== myPeerId);
          if (others.length > 0) {
            hostPeerItems.innerHTML = '';
            others.forEach(pid => {
              const card = document.createElement('div');
              card.className = 'peer-item-card';
              card.innerHTML = `<span>🟢</span> ${pid.substring(0, 20)}`;
              hostPeerItems.appendChild(card);
            });
            codeStatus.className = 'code-status active';
            codeStatus.innerText = `${others.length} peer${others.length > 1 ? 's' : ''} connected!`;
          }
        }

        for (const { fromPeerId, signal } of signals) {
          await processRoomSignal(fromPeerId, signal);
        }
      } catch (e) {
        console.warn('Poll error:', e);
      }
    }, 1500);
  }

  // ─── PROCESS INCOMING ROOM SIGNAL ────────────────────────────────────────
  async function processRoomSignal(fromPeerId, signal) {
    if (!signal) return;

    // Handle ICE candidates
    if (signal.type === 'ice') {
      if (window.ghostWebRTC.peers.has(fromPeerId)) {
        await window.ghostWebRTC.addIceCandidate(fromPeerId, signal.candidate);
      }
      return;
    }

    try {
      const decompressed = window.ghostSignaling.decompressSignal(signal);

      if (decompressed.type === 'offer') {
        // We received an offer → create an answer
        const answerSdp = await window.ghostWebRTC.createAnswer(fromPeerId, decompressed, async (iceSignal) => {
          await window.ghostSignaling.sendSignal(myRoomCode, myPeerId, iceSignal, fromPeerId);
        });

        const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
        const compressedAnswer = window.ghostSignaling.compressSignal(answerSdp, rawPubHex);

        // Send our answer back to the offerer
        await window.ghostSignaling.sendSignal(myRoomCode, myPeerId, compressedAnswer, fromPeerId);

      } else if (decompressed.type === 'answer') {
        // We received an answer to our earlier offer → complete the handshake
        if (window.ghostWebRTC.peers.has(fromPeerId)) {
          await window.ghostWebRTC.setRemoteAnswer(fromPeerId, decompressed);
        }
      }

      // Store peer's public key for ECDH if provided
      if (decompressed.rawPublicKeyHex && !peerPublicKeyHex) {
        peerPublicKeyHex = decompressed.rawPublicKeyHex;
        const peerPubBuffer = window.ghostCrypto.hexToUint8Array(peerPublicKeyHex).buffer;
        try { await window.ghostCrypto.deriveSharedKey(peerPubBuffer); } catch (_) {}
      }

    } catch (e) {
      console.error('Error processing room signal:', e);
    }
  }

  // =========================================================================
  // 4. QR PAIRING MODAL
  // =========================================================================
  btnPairQR.addEventListener('click', () => { qrModal.style.display = 'flex'; });

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

  // Generate WebRTC Offer QR (1:1 direct, no server relay)
  btnGenOffer.addEventListener('click', async () => {
    btnGenOffer.disabled = true;
    btnGenOffer.innerText = 'Generating Offer...';

    const directPeerId = 'qr_peer_' + Date.now();
    const offerSdp = await window.ghostWebRTC.createOffer(directPeerId);
    const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
    const qwbpSignal = window.ghostSignaling.compressSignal(offerSdp, rawPubHex);

    window.ghostQR.renderQR(qrCanvasContainer, qwbpSignal);
    if (mySignalPayload) mySignalPayload.value = qwbpSignal;
    btnGenOffer.innerText = 'Offer QR Ready ✅';
    btnGenAnswer.disabled = false;

    // Store the peer ID for when we get the answer back
    window._qrDirectPeerId = directPeerId;
  });

  async function processScannedSignal(qwbpString) {
    try {
      const decompressed = window.ghostSignaling.decompressSignal(qwbpString);

      if (decompressed.rawPublicKeyHex) {
        peerPublicKeyHex = decompressed.rawPublicKeyHex;
        const peerPubBuffer = window.ghostCrypto.hexToUint8Array(peerPublicKeyHex).buffer;
        await window.ghostCrypto.deriveSharedKey(peerPubBuffer);
        console.log('🔐 Derived shared encryption key with peer!');
      }

      const peerId = 'qr_peer_' + Date.now();

      if (decompressed.type === 'offer') {
        const answerSdp = await window.ghostWebRTC.createAnswer(peerId, decompressed);
        const rawPubHex = window.ghostCrypto.arrayBufferToHex(myCryptoInfo.rawPublicKey);
        const answerQwbp = window.ghostSignaling.compressSignal(answerSdp, rawPubHex);

        qrModal.style.display = 'flex';
        tabShowQr.click();
        window.ghostQR.renderQR(qrCanvasContainer, answerQwbp);
        if (mySignalPayload) mySignalPayload.value = answerQwbp;
        alert('✅ Offer processed! Now let peer scan your Answer QR code.');
      } else if (decompressed.type === 'answer') {
        const targetPeerId = window._qrDirectPeerId || Array.from(window.ghostWebRTC.peers.keys())[0];
        if (targetPeerId) {
          await window.ghostWebRTC.setRemoteAnswer(targetPeerId, decompressed);
          alert('✅ Answer processed! P2P Connection establishing...');
        }
      }
    } catch (e) {
      console.error('Error processing scanned signal:', e);
      alert('Failed to process QR signal. Ensure payload is uncorrupted.');
    }
  }

  // =========================================================================
  // 5. MANUAL SDP MODAL
  // =========================================================================
  btnManualCopy.addEventListener('click', () => { manualSdpModal.style.display = 'flex'; });
  closeManualSdpModal.addEventListener('click', () => { manualSdpModal.style.display = 'none'; });

  btnCopySignal.addEventListener('click', () => {
    if (!mySignalPayload.value) {
      alert("Please click 'Generate Offer QR' first to create your signal payload.");
      return;
    }
    navigator.clipboard.writeText(mySignalPayload.value);
    btnCopySignal.innerText = 'Copied! ✅';
    setTimeout(() => btnCopySignal.innerText = 'Copy', 2000);
  });

  btnApplyPeerSignal.addEventListener('click', async () => {
    const payload = peerSignalPayload.value.trim();
    if (!payload) return;
    manualSdpModal.style.display = 'none';
    await processScannedSignal(payload);
  });

  // =========================================================================
  // 6. AUDIO MODEM
  // =========================================================================
  btnAudioFallback.addEventListener('click', () => { audioModemModal.style.display = 'flex'; });
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
      (receivedData) => { console.log('Audio received:', receivedData); },
      (statusMsg) => { audioStatusText.innerText = statusMsg; }
    );
  });

  // =========================================================================
  // 7. FILE ATTACHMENT
  // =========================================================================
  btnAttachFile.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      const fileId = 'file_' + Date.now();
      await window.ghostStorage.saveOpfsFile(fileId, dataUrl);

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
        id: msgObj.id, text: msgObj.text, mediaData: msgObj.mediaData,
        timestamp: msgObj.timestamp, ttl: msgObj.ttl
      });

      try {
        let finalPayload;
        try { finalPayload = await window.ghostCrypto.encryptPayload(payloadString); }
        catch (_) { finalPayload = payloadString; }
        window.ghostWebRTC.broadcast(finalPayload);
      } catch (_) {}

      await window.ghostStorage.saveMessage(msgObj);
      renderMessageRow(msgObj);
    };
    reader.readAsDataURL(file);
  });

  // =========================================================================
  // 8. VOICE RECORDING
  // =========================================================================
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
          id: msgObj.id, text: msgObj.text, mediaData: msgObj.mediaData,
          timestamp: msgObj.timestamp, ttl: msgObj.ttl
        });

        try {
          let finalPayload;
          try { finalPayload = await window.ghostCrypto.encryptPayload(payloadString); }
          catch (_) { finalPayload = payloadString; }
          window.ghostWebRTC.broadcast(finalPayload);
        } catch (_) {}

        await window.ghostStorage.saveMessage(msgObj);
        renderMessageRow(msgObj);
      };
      reader.readAsDataURL(audioBlob);
    };
    mediaRecorder.stop();
  });

  // =========================================================================
  // 9. SESSION LOCK & PANIC
  // =========================================================================
  lockSessionBtn.addEventListener('click', () => { window.ghostSessionLock.lock(); });

  document.getElementById('lockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('sessionPasswordInput').value;
    if (pwd) await window.ghostSessionLock.unlock(pwd);
  });

  panicBtn.addEventListener('click', async () => {
    if (confirm('🚨 PANIC PURGE: This will permanently wipe all messages, RAM encryption keys, and OPFS files. Proceed?')) {
      await window.ghostStorage.panicPurge();
    }
  });

  document.getElementById('btnLockPanic').addEventListener('click', async () => {
    await window.ghostStorage.panicPurge();
  });

  console.log('✅ GhostChat Multi-Peer Mesh Ready!');
});
