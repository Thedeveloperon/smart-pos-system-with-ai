import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, bootstrapSession, login as apiLogin, logout as apiLogout } from "@/lib/api";
import { mapBackendRoleToUserRole, type AppUser } from "@/lib/auth";

interface AuthContextValue {
  user: AppUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, mfaCode?: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

function toAppUser(session: { username: string; full_name: string; role: string; session_id?: string; expires_at: string }): AppUser {
  return {
    username: session.username,
    displayName: session.full_name,
    role: mapBackendRoleToUserRole(session.role),
    backendRole: session.role,
    sessionId: session.session_id,
    sessionExpiresAt: session.expires_at,
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const hydrate = async () => {
      try {
        const session = await bootstrapSession();
        if (!alive) {
          return;
        }

        setUser(toAppUser(session));
      } catch (error) {
        if (!alive) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
        } else {
          setUser(null);
        }
      } finally {
        if (alive) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, mfaCode?: string): Promise<string | null> => {
    try {
      const session = await apiLogin(username, password, mfaCode);
      setUser(toAppUser(session));
      return null;
    } catch (error) {
      if (error instanceof ApiError) {
        return error.message;
      }

      return "Unable to sign in.";
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }),
    [isLoading, login, logout, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
