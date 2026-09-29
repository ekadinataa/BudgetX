import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../config/firebase';

const AuthContext = createContext(null);

/**
 * AuthProvider — manages Firebase authentication state and exposes
 * login, register, logout, and resetPassword methods to the app.
 *
 * Listens to onAuthStateChanged to detect session on app load.
 * The Firestore service reads auth.currentUser directly — no token management needed.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(!auth);

  useEffect(() => {
    // Local-only mode: `auth` is null, so there is no session to resolve.
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setAuthResolved(true);
    });

    return () => unsubscribe();
  }, []);

  // Derived rather than stored: in local-only mode we are never "loading".
  const loading = auth ? !authResolved : false;

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setUser(cred.user);
  };

  const register = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    setUser(cred.user);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const resetPassword = async (email) => {
    await sendPasswordResetEmail(auth, email);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth — convenience hook for consuming AuthContext.
 * @returns {{ user, loading, login, register, logout, resetPassword }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
