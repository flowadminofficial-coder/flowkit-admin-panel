"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBlLGy7r5Fo_6gPGD2JY-GDl_QsQZt_q8w",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "veo3-57e3e.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "veo3-57e3e",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:500544412148:web:6b2d9f77dc02eac818c1a1",
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

export const firebaseApp = firebaseReady
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;

export function watchAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signOutAdmin() {
  if (!auth) return;
  localStorage.removeItem("flowkit_admin_token");
  await signOut(auth);
}

export async function getFreshToken(user: User | null) {
  if (!user) return null;
  const token = await user.getIdToken();
  localStorage.setItem("flowkit_admin_token", token);
  return token;
}

export function storedToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("flowkit_admin_token");
}
