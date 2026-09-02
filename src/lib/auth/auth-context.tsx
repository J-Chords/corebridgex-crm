"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { authProvider } from "@/lib/data/providers";
import type { ProfileInput } from "@/lib/data/providers/auth-provider";
import type { User } from "@/lib/data/types";

interface AuthContextValue {
  user: User | null;
  /** True while the initial session lookup is in flight. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<User>;
  changePassword: (newPassword: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProviderRoot({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authProvider.getCurrentUser().then((current) => {
      setUser(current);
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await authProvider.login(email, password);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await authProvider.logout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (input: ProfileInput) => {
      if (!user) throw new Error("Not signed in.");
      const updated = await authProvider.updateProfile(user, input);
      setUser(updated);
      return updated;
    },
    [user]
  );

  const changePassword = useCallback(
    async (newPassword: string) => {
      if (!user) throw new Error("Not signed in.");
      const updated = await authProvider.changePassword(user, newPassword);
      setUser(updated);
      return updated;
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, isLoading, login, logout, updateProfile, changePassword }),
    [user, isLoading, login, logout, updateProfile, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProviderRoot");
  }
  return ctx;
}
