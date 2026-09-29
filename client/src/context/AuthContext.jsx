import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // Start as TRUE — we don't know auth state until Firebase responds
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(buildUser(firebaseUser));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const buildUser = (firebaseUser) => ({
    id: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName || 'User',
    company_name: firebaseUser.displayName || 'Company',
    emailVerified: firebaseUser.emailVerified,
  });

  const login = async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential;
  };

  const register = async (name, email, password, confirmPassword) => {
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    try {
      await sendEmailVerification(userCredential.user);
    } catch (e) {
      console.warn('Could not send verification email:', e.message);
    }
    return userCredential;
  };

  /**
   * Resend the email verification link to the currently signed-in user.
   * Since we sign out after register, we re-sign-in silently just to send.
   */
  const resendVerification = async (email, password) => {
    // Firebase requires a signed-in user to send verification.
    // We store the password temporarily only if provided; otherwise
    // use the current user if still signed in.
    const currentUser = auth.currentUser;
    if (currentUser) {
      await sendEmailVerification(currentUser);
    } else {
      throw new Error('Please try registering again to resend the verification email.');
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const updateUserProfile = (updatedUser) => {
    setUser((prev) => ({ ...prev, ...updatedUser }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUserProfile, resendVerification }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
