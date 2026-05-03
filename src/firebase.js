import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDcNU9lxKG_Gy88qkpojmgXnwR9IblFvsc",
  authDomain: "crypto-eb92d.firebaseapp.com",
  projectId: "crypto-eb92d",
  storageBucket: "crypto-eb92d.firebasestorage.app",
  messagingSenderId: "283789737754",
  appId: "1:283789737754:web:0fd8053a875615e1ae76a3",
  measurementId: "G-22LGG0CGQ2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };
