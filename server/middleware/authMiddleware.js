const jwt = require('jsonwebtoken');
const { admin } = require('../services/firebaseAdmin');

const verifyToken = async (token) => {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new Error('No authentication token provided');
  }

  const cleanToken = token.trim();
  let decodedToken;

  if (admin.apps && admin.apps.length > 0) {
    // Verify cryptographic signature via Firebase Admin SDK
    try {
      decodedToken = await admin.auth().verifyIdToken(cleanToken);
    } catch (err) {
      throw new Error(`Token verification failed: ${err.message}`);
    }
  } else {
    // Cryptographic JWT verification using configured environment secret
    const secret = process.env.JWT_SECRET;
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      throw new Error('Authentication configuration is unavailable: JWT_SECRET is not configured and Firebase Admin is not initialized');
    }

    const verifyOptions = {};
    if (process.env.JWT_AUDIENCE) {
      verifyOptions.audience = process.env.JWT_AUDIENCE;
    }
    if (process.env.JWT_ISSUER) {
      verifyOptions.issuer = process.env.JWT_ISSUER;
    }

    try {
      decodedToken = jwt.verify(cleanToken, secret.trim(), verifyOptions);
    } catch (err) {
      throw new Error(`Token verification failed: ${err.message}`);
    }
  }

  const uid = decodedToken.uid || decodedToken.user_id || decodedToken.sub || decodedToken.id;
  if (!uid) {
    throw new Error('Token payload is missing valid user identity claims');
  }

  return {
    id: String(uid),
    email: decodedToken.email || '',
    name: decodedToken.name || decodedToken.displayName || decodedToken.email || 'User',
    company_name: decodedToken.company_name || decodedToken.name || decodedToken.displayName || 'Company',
    companyId: String(decodedToken.companyId || uid)
  };
};

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const user = await verifyToken(token);

      req.user = user;
      req.company = user;
      req.companyId = user.companyId;

      return next();
    } catch (error) {
      console.error('Auth Middleware Error:', error.message);
      return res.status(401).json({ message: 'Not authorized: ' + error.message });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token provided' });
};

module.exports = { protect, verifyToken };
