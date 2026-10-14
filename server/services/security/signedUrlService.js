const crypto = require('crypto');

/**
 * Resolves the signing secret from environment configuration.
 */
const getSigningSecret = () => {
  return (
    process.env.PDF_SIGNING_SECRET ||
    process.env.JWT_SECRET ||
    process.env.ENCRYPTION_KEY ||
    'fallback-insecure-dev-signing-key-32ch'
  );
};

/**
 * Generates an HMAC-SHA256 signed token for secure, short-lived PDF download.
 * Payload is strictly bound to: pdfId, companyId, expiresAt, purpose
 *
 * @param {string|number} pdfId - Database ID of the PDF record
 * @param {string} companyId - Tenant company ID
 * @param {number} expiresInSeconds - Token validity window (default: 15 minutes)
 * @returns {{ token: string, expires: number, pdfId: string|number }}
 */
const createSignedPdfToken = (pdfId, companyId, expiresInSeconds = 900) => {
  if (!pdfId || !companyId) {
    throw new Error('createSignedPdfToken requires valid pdfId and companyId');
  }

  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const purpose = 'gupshup-pdf-download';
  const data = `${pdfId}:${companyId}:${expires}:${purpose}`;
  const secret = getSigningSecret();

  const token = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  return {
    token,
    expires,
    pdfId
  };
};

/**
 * Validates an HMAC-SHA256 token against the database PDF record and company ownership.
 *
 * @param {string|number} pdfId - Database ID of the PDF
 * @param {string} companyId - Tenant company ID from DB record
 * @param {string|number} expires - Expiration UNIX timestamp
 * @param {string} token - HMAC hex signature from query
 * @returns {{ valid: boolean, reason?: string }}
 */
const verifySignedPdfToken = (pdfId, companyId, expires, token) => {
  if (!token || !expires || !pdfId || !companyId) {
    return { valid: false, reason: 'Missing signature token, expiration, or document identity' };
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresNum = parseInt(expires, 10);

  if (isNaN(expiresNum) || now > expiresNum) {
    return { valid: false, reason: 'Signed link has expired' };
  }

  const purpose = 'gupshup-pdf-download';
  const data = `${pdfId}:${companyId}:${expiresNum}:${purpose}`;
  const secret = getSigningSecret();
  const expectedToken = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  const tokenBuf = Buffer.from(String(token), 'hex');
  const expectedBuf = Buffer.from(expectedToken, 'hex');

  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid or tampered signature' };
  }

  return { valid: true };
};

module.exports = {
  createSignedPdfToken,
  verifySignedPdfToken,
  getSigningSecret
};
