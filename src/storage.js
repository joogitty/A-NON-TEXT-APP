/**
 * GhostChat Storage Engine
 * Tier 1: IndexedDB for encrypted messages
 * Tier 2: OPFS (Origin Private File System) for media attachments
 * Feature: Auto-Destruct TTL Sweeper & Instant Panic Purge
 */

class GhostStorage {
  constructor() {
    this.dbName = 'ghostchat_db';
    this.dbVersion = 1;
    this.db = null;
    this.sweeperInterval = null;
  }

  /**
   * Initializes IndexedDB database
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.startTTLSweeper();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Saves a message to IndexedDB
   */
  async saveMessage(msg) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      const request = store.put(msg);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Gets all unexpired messages
   */
  async getAllMessages() {
    if (!this.db) await this.init();
    const now = Date.now();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result || [];
        // Filter out expired messages
        const valid = all.filter(m => !m.expiresAt || m.expiresAt > now);
        resolve(valid);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Deletes a specific message by ID (and purges any related OPFS media)
   */
  async deleteMessage(messageId) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      
      const getReq = store.get(messageId);
      getReq.onsuccess = async () => {
        const msg = getReq.result;
        if (msg && msg.opfsFileName) {
          await this.deleteOpfsFile(msg.opfsFileName);
        }
        store.delete(messageId);
        resolve(true);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Save attachment to OPFS (Origin Private File System)
   */
  async saveOpfsFile(fileName, arrayBuffer) {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return null;
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(arrayBuffer);
      await writable.close();
      return fileName;
    } catch (e) {
      console.warn('OPFS file save warning:', e);
      return null;
    }
  }

  /**
   * Delete attachment from OPFS
   */
  async deleteOpfsFile(fileName) {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return;
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(fileName);
    } catch (e) {
      // Ignored if file already removed
    }
  }

  /**
   * Background TTL Sweeper: Periodically checks and purges expired messages
   */
  startTTLSweeper() {
    if (this.sweeperInterval) clearInterval(this.sweeperInterval);
    
    const sweep = async () => {
      if (!this.db) return;
      const now = Date.now();
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      const request = store.getAll();

      request.onsuccess = async () => {
        const messages = request.result || [];
        for (const msg of messages) {
          if (msg.expiresAt && msg.expiresAt <= now) {
            console.log(`[TTL Sweeper] Auto-purging expired message: ${msg.id}`);
            if (msg.opfsFileName) {
              await this.deleteOpfsFile(msg.opfsFileName);
            }
            store.delete(msg.id);
            // Trigger UI update if event listener exists
            if (window.onMessageAutoPurged) {
              window.onMessageAutoPurged(msg.id);
            }
          }
        }
      };
    };

    // Run sweep every 5 seconds
    this.sweeperInterval = setInterval(sweep, 5000);
    sweep();
  }

  /**
   * EMERGENCY PANIC PURGE: Wipes all IndexedDB data, OPFS files, Service Worker caches, and reloads
   */
  async panicPurge() {
    console.warn('🚨 EMERGENCY PANIC PURGE TRIGGERED!');
    
    // Stop sweeper
    if (this.sweeperInterval) clearInterval(this.sweeperInterval);

    // 1. Wipe IndexedDB
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    await new Promise((resolve) => {
      const delReq = indexedDB.deleteDatabase(this.dbName);
      delReq.onsuccess = resolve;
      delReq.onerror = resolve;
      delReq.onblocked = resolve;
    });

    // 2. Wipe OPFS
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        for await (const name of root.keys()) {
          await root.removeEntry(name, { recursive: true });
        }
      }
    } catch (e) {
      console.warn('OPFS purge error:', e);
    }

    // 3. Wipe sessionStorage and localStorage
    sessionStorage.clear();
    localStorage.clear();

    // 4. Wipe RAM crypto keys
    if (window.ghostCrypto) {
      window.ghostCrypto.wipeKeys();
    }

    // 5. Reload to clean slate
    window.location.reload();
  }
}

window.ghostStorage = new GhostStorage();
