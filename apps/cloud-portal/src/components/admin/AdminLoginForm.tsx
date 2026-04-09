"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bootstrapAdminSession,
  isSuperAdminRole,
  loginAdmin,
  logoutAdmin
} from "./auth";

export default function AdminLoginForm() {
  const router = useRouter();
  const [isHydrating, setIsHydrating] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      try {
        const session = await bootstrapAdminSession();
        if (!active) {
          return;
        }

        if (session && isSuperAdminRole(session.role)) {
          router.replace("/admin");
          return;
        }
      } catch {
        // Best effort.
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const session = await loginAdmin(username.trim(), password);
      if (!isSuperAdminRole(session.role)) {
        await logoutAdmin();
        setError("This account is not authorized for admin portal access.");
        return;
      }

      router.replace("/admin");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  if (isHydrating) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Loading admin session...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <ShoppingBag className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SmartPOS Admin</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold">Sign In</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Super-admin access only: <code className="text-primary font-medium">support_admin</code>,{" "}
              <code className="text-primary font-medium">billing_admin</code>,{" "}
              <code className="text-primary font-medium">security_admin</code>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Username</label>
              <Input
                value={username}
                onChange={(inputEvent) => setUsername(inputEvent.target.value)}
                placeholder="Enter username"
                className="h-11 rounded-xl bg-muted/50"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                placeholder="Enter password"
                className="h-11 rounded-xl bg-muted/50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full rounded-xl"
              disabled={!username.trim() || !password.trim() || loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
