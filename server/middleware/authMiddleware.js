const jwt = require('jsonwebtoken');
const { admin } = require('../services/firebaseAdmin');

const verifyToken = async (token) => {
  if (!token) {
    throw new Error('No authentication token provided');
  }

  let decodedToken;
  if (admin.apps && admin.apps.length > 0) {
    // Verify cryptographic signature via Firebase Admin SDK
    decodedToken = await admin.auth().verifyIdToken(token);
  } else {
    // Local / development JWT verification
    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_whatsapp_pdf_sender_2026';
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      throw new Error('Production environment requires valid Firebase Admin credentials or JWT_SECRET');
    }

    try {
      decodedToken = jwt.verify(token, secret);
    } catch (err) {
      // In development mode, check if token is a client Firebase token when serviceAccountKey is not set
      if (process.env.NODE_ENV !== 'production') {
        const decoded = jwt.decode(token);
        if (decoded && (decoded.iss?.includes('securetoken.google.com') || decoded.sub || decoded.user_id)) {
          console.warn('[AUTH WARNING] Development mode: Accepting Firebase client token because Firebase Admin service credentials are not configured.');
          decodedToken = decoded;
        } else {
          throw new Error('Token verification failed: Invalid signature or expired token');
        }
      } else {
        throw new Error('Token verification failed: Invalid signature or expired token');
      }
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
    company_name: decodedToken.name || decodedToken.displayName || 'Company',
    companyId: String(uid)
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
