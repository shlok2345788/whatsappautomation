const { admin } = require('../services/firebaseAdmin');

/**
 * Auth is handled by Firebase Auth on the frontend.
 * These server endpoints are kept for compatibility and profile fetching.
 * Registration and login are done client-side via the Firebase JS SDK.
 * The server only verifies Firebase ID tokens via authMiddleware.
 */

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide company name, email and password' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Create user via Firebase Admin (server-side registration)
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: name.trim(),
      emailVerified: false,
    });

    res.status(201).json({
      id: userRecord.uid,
      _id: userRecord.uid,
      name: name.trim(),
      company_name: name.trim(),
      email: userRecord.email,
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Company account with this email already exists' });
    }
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  // Login is handled client-side by the Firebase JS SDK.
  // This endpoint is kept for compatibility only.
  return res.status(200).json({ message: 'Login is handled client-side via Firebase.' });
};

const getMe = async (req, res, next) => {
  try {
    const uid = req.companyId;
    const userRecord = await admin.auth().getUser(uid);

    res.json({
      id: userRecord.uid,
      _id: userRecord.uid,
      name: userRecord.displayName || 'User',
      company_name: userRecord.displayName || 'Company',
      email: userRecord.email,
      created_at: userRecord.metadata.creationTime,
    });
  } catch (error) {
    console.error('getMe error:', error.message);
    return res.status(404).json({ message: 'User not found' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe
};
