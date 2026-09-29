import axios from 'axios';
import { auth } from './firebase';

const API = axios.create({
  baseURL: 'http://localhost:5000/api'
});

// Helper to get current Firebase user, waiting briefly for auth state initialization on page refresh
const getCurrentUser = () => {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  return new Promise((resolve) => {
    let resolved = false;
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(user);
      }
    });
    // Timeout of 1200ms if user is genuinely logged out
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(auth.currentUser);
      }
    }, 1200);
  });
};

API.interceptors.request.use(async (config) => {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      const token = await currentUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.error('Error attaching auth token:', err);
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      if (url.includes('/auth/me') || url.includes('/auth/login')) {
        await auth.signOut();
        if (window.location.pathname !== '/signin' && window.location.pathname !== '/signup') {
          window.location.href = '/signin';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default API;
