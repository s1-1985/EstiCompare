import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Env vars (VITE_FIREBASE_*) take priority.
// Hardcoded fallback ensures the app works in deployments where env vars are not yet configured.
// Firebase web config is intentionally public — security is enforced by Firestore rules + Auth.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyBjwMQUD9eNcHCauxPBDmyMuMkdTHPmT6w",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "esticompare.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "esticompare",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "esticompare.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "429147694892",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:429147694892:web:bca9935132bcb5bb4b2e89",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || "G-BHB6PMVP6W",
};

const app = initializeApp(firebaseConfig);

// ignoreUndefinedProperties: 見積データには未設定の実態値(actual*)・任意項目が
// undefined のまま含まれる。これを無視しないと setDoc/updateDoc が
// 「Unsupported field value: undefined」で失敗し、シナリオ保存が落ちる。
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google login failed', error);
    throw error;
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout failed', error);
    throw error;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
  };
  // Log full details server-side / in dev console — never expose to user
  console.error('Firestore Error:', JSON.stringify(errInfo));
  // エラーコード（permission-denied / invalid-argument 等）は機密でないため、診断用に提示する
  const code = (error && typeof error === 'object' && 'code' in error) ? String((error as any).code) : '';
  throw new Error(`データの操作に失敗しました${code ? `（${code}）` : ''}。再度お試しください。`);
}
