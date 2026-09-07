/**
 * GhostChat Crypto Module
 * Zero-Knowledge Ephemeral Cryptography using WebCrypto API
 * - ECDH Key Agreement (X25519 / P-256)
 * - AES-256-GCM End-to-End Encryption
 * - PBKDF2 Password Hashing for Session Locks
 */

class GhostCrypto {
  constructor() {
    this.keyPair = null;
    this.sharedKey = null;
    this.fingerprint = null;
  }

  /**
   * Generates an ephemeral ECDH key pair in RAM
   */
  async generateKeyPair() {
    try {
      // Try X25519 first, fallback to P-256
      try {
        this.keyPair = await window.crypto.subtle.generateKey(
          { name: 'X25519' },
          true,
          ['deriveKey', 'deriveBits']
        );
      } catch (err) {
        // Fallback to ECDH P-256 if X25519 is unsupported in current browser
        this.keyPair = await window.crypto.subtle.generateKey(
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          ['deriveKey', 'deriveBits']
        );
      }

      const rawPub = await window.crypto.subtle.exportKey('raw', this.keyPair.publicKey);
      this.fingerprint = await this.computeFingerprint(rawPub);
      return { keyPair: this.keyPair, rawPublicKey: rawPub, fingerprint: this.fingerprint };
    } catch (error) {
      console.error('Error generating crypto key pair:', error);
      throw error;
    }
  }

  /**
   * Computes a 12-character hex fingerprint for session identity display
   */
  async computeFingerprint(rawPublicKey) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', rawPublicKey);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.substring(0, 12).toUpperCase();
  }

  /**
   * Derives a 256-bit AES-GCM shared key from peer's raw public key
   */
  async deriveSharedKey(peerRawPublicKeyBuffer) {
    try {
      let peerKeyAlgorithm = { name: 'ECDH', namedCurve: 'P-256' };
      if (this.keyPair.publicKey.algorithm.name === 'X25519') {
        peerKeyAlgorithm = { name: 'X25519' };
      }

      const peerPublicKey = await window.crypto.subtle.importKey(
        'raw',
        peerRawPublicKeyBuffer,
        peerKeyAlgorithm,
        true,
        []
      );

      let deriveParams = { name: 'ECDH', public: peerPublicKey };
      if (this.keyPair.publicKey.algorithm.name === 'X25519') {
        deriveParams = { name: 'X25519', public: peerPublicKey };
      }

      this.sharedKey = await window.crypto.subtle.deriveKey(
        deriveParams,
        this.keyPair.privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      return this.sharedKey;
    } catch (error) {
      console.error('Error deriving shared key:', error);
      throw error;
    }
  }

  /**
   * Encrypts plain text or binary buffer with AES-256-GCM
   */
  async encryptPayload(data, customSharedKey = null) {
    const key = customSharedKey || this.sharedKey;
    if (!key) throw new Error('No shared encryption key derived yet');

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    let encodedData;

    if (typeof data === 'string') {
      encodedData = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
      encodedData = new Uint8Array(data);
    } else {
      encodedData = data;
    }

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedData
    );

    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    };
  }

  /**
   * Decrypts ciphertext envelope with AES-256-GCM
   */
  async decryptPayload(envelope, customSharedKey = null) {
    const key = customSharedKey || this.sharedKey;
    if (!key) throw new Error('No shared key available for decryption');

    const iv = new Uint8Array(envelope.iv);
    const ciphertext = new Uint8Array(envelope.ciphertext);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * PBKDF2 Password Key Derivation for Session Lock Password
   */
  async derivePasswordHash(password, saltHex = 'GhostChatSalt2026') {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const salt = enc.encode(saltHex);
    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Utility: Convert ArrayBuffer to Hex string
   */
  arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Utility: Convert Hex string to Uint8Array
   */
  hexToUint8Array(hexString) {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Purges RAM keys
   */
  wipeKeys() {
    this.keyPair = null;
    this.sharedKey = null;
    this.fingerprint = null;
  }
}

window.ghostCrypto = new GhostCrypto();
