import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Minimal client-side auth gate so the internal tool isn't left open. Credentials
 * are validated against build-time env vars; on success a flag is persisted to
 * localStorage. This is a usability gate, not a security boundary — protect the
 * upload endpoint itself with UPLOAD_API_TOKEN on the backend for real control.
 */
interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const STORAGE_KEY = 'lp_auth_user';
const AuthContext = createContext<AuthState | undefined>(undefined);

const VALID_USER = import.meta.env.VITE_AUTH_USERNAME ?? 'admin';
const VALID_PASS = import.meta.env.VITE_AUTH_PASSWORD ?? 'changeme';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated: Boolean(username),
      username,
      login: (u, p) => {
        if (u === VALID_USER && p === VALID_PASS) {
          localStorage.setItem(STORAGE_KEY, u);
          setUsername(u);
          return true;
        }
        return false;
      },
      logout: () => {
        localStorage.removeItem(STORAGE_KEY);
        setUsername(null);
      },
    }),
    [username],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
