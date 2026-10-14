const crypto = require('crypto');
const gupshupService = require('../services/whatsapp/gupshupService');

/**
 * Validates Gupshup webhook authenticity using shared secret or header token.
 * Rejects unsigned or unauthorized webhook requests.
 */
const verifyWebhookSignature = (req) => {
  const secret = process.env.GUPSHUP_WEBHOOK_SECRET;

  // In production, webhook secret is mandatory
  if (process.env.NODE_ENV === 'production' && !secret) {
    return { authorized: false, reason: 'Gupshup webhook secret is not configured in production' };
  }

  // If secret is configured (or in production), verify token/header
  if (secret) {
    const candidate =
      req.headers['x-gupshup-token'] ||
      req.headers['x-webhook-secret'] ||
      (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : '') ||
      req.query?.token ||
      req.query?.secret;

    if (!candidate) {
      return { authorized: false, reason: 'Missing webhook signature or authorization token' };
    }

    const candidateBuf = Buffer.from(String(candidate));
    const secretBuf = Buffer.from(String(secret));

    if (candidateBuf.length !== secretBuf.length || !crypto.timingSafeEqual(candidateBuf, secretBuf)) {
      return { authorized: false, reason: 'Invalid webhook signature or verification token' };
    }
  }

  return { authorized: true };
};

const handleGupshupWebhook = async (req, res, next) => {
  try {
    const authCheck = verifyWebhookSignature(req);
    if (!authCheck.authorized) {
      console.warn(`[Gupshup Webhook] Unauthorized webhook attempt: ${authCheck.reason}`);
      return res.status(401).json({ error: `Unauthorized webhook: ${authCheck.reason}` });
    }

    const io = req.app.get('io');
    const result = await gupshupService.handleWebhookEvent(req.body, io);
    res.json({ status: 'ok', result });
  } catch (error) {
    console.error('[Gupshup Webhook Handler Error]:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  handleGupshupWebhook,
  verifyWebhookSignature
};
