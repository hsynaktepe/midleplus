import { safeStorage } from 'electron';
import crypto from 'crypto';
import os from 'os';

const LEGACY_FALLBACK_SECRET = 'midleplus_secure_local_vault_2026';
const ALGORITHM = 'aes-256-gcm';

function getMachineSecret(): string {
  try {
    const userInfo = os.userInfo();
    const entropy = `${os.hostname()}|${userInfo.username}|${os.homedir()}|${process.env.USERDOMAIN || ''}|${process.env.COMPUTERNAME || ''}`;
    return crypto.createHash('sha256').update(entropy).digest('hex');
  } catch {
    return crypto.createHash('sha256').update(`idleplus_vault_${os.hostname()}`).digest('hex');
  }
}

export class CryptoService {
  public static encrypt(plainText: string): string {
    if (!plainText) return '';
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(plainText);
        return `dpapi:${buffer.toString('base64')}`;
      }
    } catch (err) {
      console.warn('safeStorage encryption failed, using AES-256-GCM fallback with machine-bound key:', err);
    }

    // Fallback: AES-256-GCM with machine-specific secret and random salt
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(getMachineSecret(), salt, 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `aes2:${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  public static decrypt(cipherText: string): string {
    if (!cipherText) return '';
    try {
      if (cipherText.startsWith('dpapi:') && safeStorage && safeStorage.isEncryptionAvailable()) {
        const rawBase64 = cipherText.replace('dpapi:', '');
        const buffer = Buffer.from(rawBase64, 'base64');
        return safeStorage.decryptString(buffer);
      }
    } catch (err) {
      console.warn('safeStorage decryption failed, attempting fallback:', err);
    }

    // Modern Fallback: aes2 (random salt + machine key)
    if (cipherText.startsWith('aes2:')) {
      try {
        const parts = cipherText.split(':');
        if (parts.length === 5) {
          const salt = Buffer.from(parts[1], 'hex');
          const iv = Buffer.from(parts[2], 'hex');
          const authTag = Buffer.from(parts[3], 'hex');
          const encrypted = parts[4];
          const key = crypto.scryptSync(getMachineSecret(), salt, 32);
          const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
          decipher.setAuthTag(authTag);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        }
      } catch (e) {
        console.error('Modern AES decryption error:', e);
      }
    }

    // Legacy Fallback: aes (static salt + legacy secret) for backwards compatibility
    if (cipherText.startsWith('aes:')) {
      try {
        const parts = cipherText.split(':');
        if (parts.length === 4) {
          const iv = Buffer.from(parts[1], 'hex');
          const authTag = Buffer.from(parts[2], 'hex');
          const encrypted = parts[3];
          const key = crypto.scryptSync(LEGACY_FALLBACK_SECRET, 'salt', 32);
          const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
          decipher.setAuthTag(authTag);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        }
      } catch (e) {
        console.error('Legacy AES decryption error:', e);
      }
    }

    return cipherText;
  }
}
