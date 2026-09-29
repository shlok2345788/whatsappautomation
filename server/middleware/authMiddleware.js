const { admin } = require('../services/firebaseAdmin');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);

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
