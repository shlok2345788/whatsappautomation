import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBHgskFkDK0gkusdld2jKeAsWe_pag2QPs",
  authDomain: "what-823df.firebaseapp.com",
  projectId: "what-823df",
  storageBucket: "what-823df.firebasestorage.app",
  messagingSenderId: "395472861155",
  appId: "1:395472861155:web:e2f10eafb72db2af7292d6",
  measurementId: "G-5S79P4S9GV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
