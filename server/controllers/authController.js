const { admin } = require('../services/firebaseAdmin');
const { supabase } = require('../services/supabaseClient');

/**
 * Auth is handled by Firebase Auth on the frontend.
 * These server endpoints are kept for compatibility and profile management.
 * Registration and login are done client-side via the Firebase JS SDK.
 * The server verifies Firebase ID tokens via authMiddleware.
 */

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    if (admin.apps && admin.apps.length > 0) {
      // Create user via Firebase Admin (server-side registration)
      const userRecord = await admin.auth().createUser({
        email: email.toLowerCase().trim(),
        password,
        displayName: name.trim(),
        emailVerified: false,
      });

      // Save company record to DB
      const now = new Date().toISOString();
      await supabase.from('companies').upsert({
        id: userRecord.uid,
        company_name: name.trim(),
        email: userRecord.email,
        createdAt: now,
        updatedAt: now
      }, { onConflict: 'id' });

      return res.status(201).json({
        id: userRecord.uid,
        _id: userRecord.uid,
        name: name.trim(),
        company_name: name.trim(),
        email: userRecord.email,
      });
    }

    // Dev/fallback mode when Firebase Admin is uninitialized
    const dummyUid = 'user_' + Date.now();
    const now = new Date().toISOString();
    await supabase.from('companies').upsert({
      id: dummyUid,
      company_name: name.trim(),
      email: email.toLowerCase().trim(),
      createdAt: now,
      updatedAt: now
    }, { onConflict: 'id' });

    res.status(201).json({
      id: dummyUid,
      _id: dummyUid,
      name: name.trim(),
      company_name: name.trim(),
      email: email.toLowerCase().trim(),
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
    if (!uid) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const dbCompany = await supabase
      .from('companies')
      .eq('id', uid)
      .maybeSingle();

    if (admin.apps && admin.apps.length > 0) {
      try {
        const userRecord = await admin.auth().getUser(uid);
        return res.json({
          id: userRecord.uid,
          _id: userRecord.uid,
          name: dbCompany.data?.company_name || userRecord.displayName || 'User',
          company_name: dbCompany.data?.company_name || userRecord.displayName || 'Company',
          email: dbCompany.data?.email || userRecord.email,
          created_at: userRecord.metadata?.creationTime || dbCompany.data?.createdAt,
        });
      } catch (fbErr) {
        // Fall back to DB or token claims if Firebase lookup fails
      }
    }

    res.json({
      id: uid,
      _id: uid,
      name: dbCompany.data?.company_name || req.user?.name || 'User',
      company_name: dbCompany.data?.company_name || req.user?.company_name || 'Company',
      email: dbCompany.data?.email || req.user?.email || '',
      created_at: dbCompany.data?.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error('getMe error:', error.message);
    return res.status(404).json({ message: 'User not found' });
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const uid = req.companyId;
    if (!uid) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, email, currentPassword, newPassword } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Name must be a non-empty string' });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({ message: 'Name cannot exceed 100 characters' });
      }
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
        return res.status(400).json({ message: 'Please provide a valid email address' });
      }
    }

    if (newPassword !== undefined && newPassword !== '') {
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters long' });
      }
    }

    const cleanName = name ? name.trim() : undefined;
    const cleanEmail = email ? email.toLowerCase().trim() : undefined;

    // Update Firebase if Firebase Admin is configured
    if (admin.apps && admin.apps.length > 0) {
      const fbUpdates = {};
      if (cleanName) fbUpdates.displayName = cleanName;
      if (cleanEmail) fbUpdates.email = cleanEmail;
      if (newPassword) fbUpdates.password = newPassword;

      if (Object.keys(fbUpdates).length > 0) {
        await admin.auth().updateUser(uid, fbUpdates);
      }
    }

    // Persist company details in database
    const now = new Date().toISOString();
    const existing = await supabase
      .from('companies')
      .eq('id', uid)
      .maybeSingle();

    const companyData = {
      id: uid,
      company_name: cleanName || existing.data?.company_name || req.user?.name || req.user?.company_name || 'Company',
      email: cleanEmail || existing.data?.email || req.user?.email || '',
      updatedAt: now
    };

    if (!existing.data) {
      companyData.createdAt = now;
    }

    await supabase
      .from('companies')
      .upsert(companyData, { onConflict: 'id' });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: uid,
        _id: uid,
        name: companyData.company_name,
        company_name: companyData.company_name,
        email: companyData.email,
        updated_at: now
      }
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Email is already in use by another account' });
    }
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile
};
