import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBHgskFkDK0gkusdld2jKeAsWe_pag2QPs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "what-823df.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "what-823df",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "what-823df.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "395472861155",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:395472861155:web:e2f10eafb72db2af7292d6",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-5S79P4S9GV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
