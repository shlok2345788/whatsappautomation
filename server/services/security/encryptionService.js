const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const PREFIX = 'enc:v1:';

/**
 * Resolves the 256-bit (32-byte) master encryption key.
 */
const getMasterKey = () => {
  const envKey = process.env.ENCRYPTION_KEY || process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Credential encryption key is missing. Set ENCRYPTION_KEY in the environment.');
    }
    return crypto.createHash('sha256').update('whatsapp_pdf_sender_dev_master_key_2026').digest();
  }

  // If already 64 hex characters (32 bytes), parse buffer
  if (typeof envKey === 'string' && /^[0-9a-fA-F]{64}$/.test(envKey.trim())) {
    return Buffer.from(envKey.trim(), 'hex');
  }

  // Derive fixed 32-byte key using SHA-256
  return crypto.createHash('sha256').update(String(envKey)).digest();
};

/**
 * Encrypts sensitive plaintext credentials using AES-256-GCM.
 * Output format: enc:v1:<ivHex>:<authTagHex>:<cipherHex>
 */
const encrypt = (plaintext, customKey = null) => {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return '';
  }

  // Do not re-encrypt already encrypted ciphertext
  if (typeof plaintext === 'string' && plaintext.startsWith(PREFIX)) {
    return plaintext;
  }

  const key = customKey || getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts authenticated AES-256-GCM ciphertext.
 * Throws explicit error on tampered ciphertext or invalid key.
 */
const decrypt = (ciphertext, customKey = null) => {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return '';
  }

  if (!ciphertext.startsWith(PREFIX)) {
    // Legacy unencrypted plaintext fallback for backward compatibility
    return ciphertext;
  }

  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = customKey || getMasterKey();

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error(`Failed to decrypt credential: ${err.message}`);
  }
};

/**
 * Masks an API key for safe display in UI/API responses.
 * Never leaks more than the last 4 characters.
 */
const maskKey = (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') return '';
  const clean = rawKey.trim();
  if (clean.length <= 4) return '••••••••';
  return '••••••••' + clean.slice(-4);
};

module.exports = {
  encrypt,
  decrypt,
  maskKey,
  getMasterKey
};
