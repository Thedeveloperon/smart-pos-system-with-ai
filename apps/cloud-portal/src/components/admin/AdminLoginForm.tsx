"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, ShieldCheck, Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bootstrapAdminSession, isSuperAdminRole, loginAdmin, logoutAdmin } from "./auth";

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
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] flex items-center justify-center p-4">
        <p className="text-sm text-slate-500">Loading admin session...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-8 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-between bg-slate-950 p-8 text-white md:p-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Super-admin access
            </div>

            <div className="space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-400/15 text-emerald-300">
                <Store className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">SmartPOS Admin</p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight">Operations control plane</h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                  Sign in with a support, billing, or security admin account to manage approvals, shops, users,
                  and live catalog operations.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {["Purchase approvals", "Shop management", "User administration"].map((label) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Module</p>
                <p className="mt-2 text-sm font-medium text-white">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-6 space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                Administrative sign-in
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Sign in</h2>
              <p className="text-sm leading-6 text-slate-500">
                Super-admin access only: <code className="font-medium text-slate-900">support_admin</code>,{" "}
                <code className="font-medium text-slate-900">billing_admin</code>,{" "}
                <code className="font-medium text-slate-900">security_admin</code>.
              </p>
            </div>

            <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Username</label>
                  <Input
                    value={username}
                    onChange={(inputEvent) => setUsername(inputEvent.target.value)}
                    placeholder="Enter username"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                    placeholder="Enter password"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl"
                  variant="hero"
                  disabled={!username.trim() || !password.trim() || loading}
                >
                  {loading ? "Signing in..." : "Sign in"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
