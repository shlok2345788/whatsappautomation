import axios from 'axios';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

let authStatePromise;

const getCurrentUser = () => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  if (!authStatePromise) {
    authStatePromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  return authStatePromise;
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
