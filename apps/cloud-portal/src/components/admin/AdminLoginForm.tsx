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
      <main className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4 text-slate-900">
        <p className="text-sm text-slate-500">Loading admin session...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fa] px-4 py-8 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)] md:grid-cols-[1.02fr_0.98fr]">
        <section className="flex flex-col justify-between bg-[#eef2f5] px-8 py-8 md:px-10 md:py-10">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
              Super-admin access
            </div>

            <div className="space-y-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-500 shadow-sm">
                <Store className="h-8 w-8" />
              </div>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">SmartPOS Admin</p>
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-950">Operations control plane</h1>
                <p className="max-w-xl text-sm leading-7 text-slate-600">
                  Sign in with a support, billing, or security admin account to manage approvals, shops, users, and live
                  catalog operations.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Purchase approvals", icon: "✓" },
              { label: "Shop management", icon: "◫" },
              { label: "User administration", icon: "◔" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Module</p>
                <div className="mt-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                    {item.icon}
                  </div>
                  <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center bg-white px-6 py-10 md:px-10">
          <div className="w-full max-w-md">
            <div className="mb-7 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-600">
                <Sparkles className="h-3.5 w-3.5" />
                Administrative sign-in
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Sign in</h2>
              <p className="text-sm leading-6 text-slate-600">
                Super-admin access only: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900">support_admin</code>,{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900">billing_admin</code>,{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900">security_admin</code>.
              </p>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.07)]">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-950">Username</label>
                  <Input
                    value={username}
                    onChange={(inputEvent) => setUsername(inputEvent.target.value)}
                    placeholder="Enter username"
                    className="h-12 rounded-2xl border-slate-200 bg-white"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-950">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                    placeholder="Enter password"
                    className="h-12 rounded-2xl border-slate-200 bg-white"
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
                  className="h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-300 text-slate-950 shadow-none hover:from-emerald-600 hover:to-emerald-400"
                  disabled={!username.trim() || !password.trim() || loading}
                >
                  {loading ? "Signing in..." : "Sign in"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
