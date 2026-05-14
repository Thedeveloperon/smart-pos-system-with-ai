"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { bootstrapAdminSession, isSuperAdminRole, loginAdmin, logoutAdmin } from "./auth";

export default function AdminLoginForm() {
  const router = useRouter();
  const [isHydrating, setIsHydrating] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    setAuthError(null);
    setLoading(true);

    try {
      const session = await loginAdmin(username.trim(), password);
      if (!isSuperAdminRole(session.role)) {
        await logoutAdmin();
        setAuthError("This account does not have admin portal access.");
        return;
      }

      router.replace("/admin");
    } catch (error) {
      await logoutAdmin();
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="app-shell flex-1 px-4 pt-24 pb-4 md:pt-28 md:pb-6">
        <div className="mx-auto flex w-full max-w-5xl justify-center">
          <div className="w-full max-w-md rounded-[24px] border border-border/70 bg-background/80 p-6 shadow-sm">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="portal-kicker">Cloud Commerce Account</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Super Admin Login</h1>
                <p className="text-sm text-muted-foreground">
                  Sign in to access shop, user, and licensing administration.
                </p>
              </div>

              {isHydrating ? (
                <p className="text-sm text-muted-foreground">Checking your session...</p>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <label className="space-y-1 block">
                    <span className="portal-kicker">Username</span>
                    <input
                      className="field-shell"
                      value={username}
                      onChange={(inputEvent) => setUsername(inputEvent.target.value)}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="portal-kicker">Password</span>
                    <input
                      className="field-shell"
                      type="password"
                      value={password}
                      onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>

                  {authError && (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {authError}
                    </div>
                  )}

                  <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                    {loading ? "Signing In..." : "Sign In"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
