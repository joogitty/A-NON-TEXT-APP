/**
 * GhostChat Anti-Coercion Session Lock Manager
 * - Strict Password-Only Unlock (Biometrics intentionally omitted to prevent forced biometric unlocks)
 * - Anti-Torture / Anti-Coercion Protections:
 *   - Max 3 Failed Password Attempts -> Triggers Immediate Panic Purge
 *   - Duress PIN Entry -> Triggers Immediate Panic Purge
 */

class GhostSessionLock {
  constructor() {
    this.isLocked = false;
    this.passwordHash = null;
    this.duressHash = null;
    this.failedAttempts = 0;
    this.maxAllowedAttempts = 3;
  }

  /**
   * Sets session lock password and optional duress PIN
   */
  async setSessionPassword(password, duressPin = '9999') {
    this.passwordHash = await window.ghostCrypto.derivePasswordHash(password);
    this.duressHash = await window.ghostCrypto.derivePasswordHash(duressPin);
    this.failedAttempts = 0;
  }

  /**
   * Locks the session screen
   */
  lock() {
    this.isLocked = true;
    const overlay = document.getElementById('sessionLockOverlay');
    if (overlay) overlay.style.display = 'flex';
    const input = document.getElementById('sessionPasswordInput');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  /**
   * Unlocks the session or triggers duress panic wipe
   */
  async unlock(inputPassword) {
    if (!this.passwordHash) {
      // Default initial password setup if none set yet
      await this.setSessionPassword(inputPassword);
      this.isLocked = false;
      this.hideOverlay();
      return true;
    }

    const enteredHash = await window.ghostCrypto.derivePasswordHash(inputPassword);

    // 1. Check for Duress PIN Entry
    if (enteredHash === this.duressHash) {
      console.warn('🚨 DURESS PIN ENTERED! EXECUTING IMMEDIATE PANIC WIPE!');
      await window.ghostStorage.panicPurge();
      return false;
    }

    // 2. Check Valid Password
    if (enteredHash === this.passwordHash) {
      this.failedAttempts = 0;
      this.isLocked = false;
      this.hideOverlay();
      return true;
    }

    // 3. Failed Attempt
    this.failedAttempts++;
    const warning = document.getElementById('lockWarningText');
    const remaining = this.maxAllowedAttempts - this.failedAttempts;

    if (warning) {
      warning.innerHTML = `⚠️ Invalid Password! <strong>${remaining}</strong> attempt(s) remaining before automated data destruction.`;
    }

    if (this.failedAttempts >= this.maxAllowedAttempts) {
      console.warn('🚨 MAX FAILED ATTEMPTS EXCEEDED! EXECUTING PANIC PURGE!');
      await window.ghostStorage.panicPurge();
      return false;
    }

    return false;
  }

  hideOverlay() {
    const overlay = document.getElementById('sessionLockOverlay');
    if (overlay) overlay.style.display = 'none';
  }
}

window.ghostSessionLock = new GhostSessionLock();
