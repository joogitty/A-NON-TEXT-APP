# 🛡️ GhostChat - End-User Operating & Survival Manual

Welcome to **GhostChat**. This application was created to allow secure, completely private communication between individuals without relying on any central server, phone company, internet provider, or cloud service.

---

## 🎯 How GhostChat Keeps You Safe

1. **Zero Internet Needed**: Communicates directly device-to-device over local Wi-Fi or a Mobile Hotspot.
2. **Zero Central Servers**: No domain names to block, no cloud databases to hack, no phone numbers or email addresses linked to you.
3. **End-to-End Ephemeral Encryption**: All text, voice notes, and images are scrambled using government-grade encryption (AES-256). Keys exist only in your device's memory while the tab is open.
4. **Self-Destruct Timers**: Set messages to automatically burn and erase themselves after 5 minutes, 1 hour, 8 hours, or 24 hours.
5. **Anti-Coercion Session Lock (No Biometrics)**: Uses passwords ONLY. FaceID and fingerprint unlocks are disabled so captors cannot force open your phone using your face or hands.
6. **Instant Panic Purge**: Tap the red **PANIC** button to instantly wipe all messages, encryption keys, and app history in less than a second.

---

## 📱 How to Download & Run GhostChat

### On a Laptop or Desktop PC (Windows / Mac / Linux)
1. Download the code folder or ZIP file from GitHub to your device.
2. Open the folder and double-click **`start.bat`** (on Windows) or run **`./start.sh`** (on Mac/Linux).
3. Your browser will automatically open to `http://localhost:8000`.
4. The terminal will print the **Mobile / LAN URL** (e.g. `http://192.168.1.50:8000`). Any phone or tablet on the same Wi-Fi can open this URL to join.

### On a Smartphone (iPhone / Android)
- When you open GhostChat in Chrome or Safari, a glowing **`📲 Install App`** button will automatically appear at the top right of your screen.
- Tap **`📲 Install App`** to immediately install GhostChat to your smartphone home screen in 1 click!
- The app will now open and run 100% offline anytime from your home screen.

---

## 📶 Step-by-Step Field Operation Guide

### Step 1: Connect Your Devices to the Same Local Network (NO INTERNET NEEDED!)
- **Option A (Mobile Hotspot)**: User 1 turns on their phone's **Personal Hotspot** (you can turn cellular data OFF!). All other users connect their phone/laptop to User 1's Wi-Fi Hotspot.
- **Option B (Local Wi-Fi Router)**: Connect all devices to the same local Wi-Fi router (even if the router has no internet cable attached!).

---

### 📟 Method 1: 6-Digit Session Code (EASIEST — Works for ALL device combinations!)

This is the recommended pairing method. It works for **Laptop-to-Laptop**, **Phone-to-Laptop**, **Phone-to-Phone**, and **Group sessions** with 3+ devices — no camera needed!

**User 1 (Host) — Creates the Session:**
1. Open GhostChat and tap **`6-Digit Code`** in the toolbar.
2. Tap **`✨ Generate Session Code`**.
3. A large code appears, e.g., **`482 910`**. Share this code verbally or by text with your peers.

**User 2, 3, 4... (Joiners) — Join the Session:**
1. Open GhostChat on their device and tap **`6-Digit Code`** in the toolbar.
2. Tap the **`Join Session`** tab.
3. Type in the 6-digit code (e.g., `482910`).
4. Tap **`🔗 Connect to Session`**.
5. Done! The status bar turns **GREEN** and the host sees the peer listed in their modal.

> **Group Sessions:** ANY number of devices can join the same 6-digit code. All devices will automatically form a full direct P2P mesh — every device talks directly to every other device. No server relays any messages.

---

### 📷 Method 2: QR Code Pairing (Phone-to-Phone, requires cameras)

1. Both users open GhostChat and tap **`Pair (QR)`**.
2. User 1 taps **Generate Offer QR**. A scannable QR code appears.
3. User 2 taps **Scan Peer QR Code** and points their camera at User 1's screen.
4. User 2's device shows an **Answer QR Code**.
5. User 1 scans User 2's Answer QR code.
6. **Done!** Status bar turns **GREEN**.

---

### ✂️ Method 3: Manual SDP (No Camera, No Server — Air-Gapped Copy-Paste)

Useful when there is no camera and the Python server is not running (pure air-gap):
1. Tap **`Manual SDP`** on one device. Generate Offer (via **Pair (QR)** first), then copy the payload.
2. Transfer the payload text to the other device (USB, clipboard, etc.).
3. Paste it into the **Paste Peer Signal Payload** box and tap **`Connect with Peer`**.

---

## 🔒 Session Locks & Anti-Torture Protections

### Setting a Password Lock
- Tap the **Lock** icon at the top right of the screen.
- Enter a password that only you know.
- To unlock the session later, you must type your exact password.

### 🛡️ What Happens if You Are Kidnapped or Forced to Unlock?
- **NO Biometrics**: Captors cannot use FaceID or Fingerprints to unlock your session.
- **Max 3 Invalid Attempts**: If anyone types a wrong password 3 times, GhostChat immediately executes a full **Panic Purge**—wiping all messages, encryption keys, and files forever.
- **Duress PIN**: If forced to enter a password, entering the Duress PIN (`9999`) will silently trigger the **Panic Purge** and wipe everything instantly.

---

## 🚨 Instant Panic Purge Button
At any time, tap the red **PANIC** button at the top right of the app bar. A popup will prompt you, or tapping it on the lock screen will immediately delete all records and reload a completely blank app.
