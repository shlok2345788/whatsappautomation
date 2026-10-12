const { admin } = require('../services/firebaseAdmin');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      let decodedToken;
      if (admin.apps && admin.apps.length > 0) {
        // Verify the Firebase ID token cryptographically
        decodedToken = await admin.auth().verifyIdToken(token);
      } else {
        // Fallback in dev/local mode when Firebase Admin service account is not yet configured
        const jwt = require('jsonwebtoken');
        decodedToken = jwt.decode(token);
        if (!decodedToken) {
          throw new Error('Unable to decode token');
        }
        decodedToken.uid = decodedToken.user_id || decodedToken.sub || decodedToken.uid;
      }

      req.user = {
        id: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email,
        company_name: decodedToken.name || 'Company',
      };

      req.company = req.user;
      req.companyId = decodedToken.uid;

      return next();
    } catch (error) {
      console.error('Auth Middleware Error:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

module.exports = { protect };
