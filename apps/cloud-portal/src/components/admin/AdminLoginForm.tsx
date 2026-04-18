"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bootstrapAdminSession, isSuperAdminRole, loginAdmin, logoutAdmin } from "./auth";

export default function AdminLoginForm() {
  const router = useRouter();
  const [isHydrating, setIsHydrating] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    setLoading(true);

    try {
      const session = await loginAdmin(username.trim(), password);
      if (!isSuperAdminRole(session.role)) {
        await logoutAdmin();
        return;
      }

      router.replace("/admin");
    } catch {
      await logoutAdmin();
    } finally {
      setLoading(false);
    }
  };

  if (isHydrating) {
    return <main className="min-h-screen bg-[#f5f7fa]" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] p-4 text-slate-900">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Input
          value={username}
          onChange={(inputEvent) => setUsername(inputEvent.target.value)}
          placeholder="Username"
          className="h-12 rounded-2xl border-slate-200 bg-white"
          autoFocus
          aria-label="Username"
        />

        <Input
          type="password"
          value={password}
          onChange={(inputEvent) => setPassword(inputEvent.target.value)}
          placeholder="Password"
          className="h-12 rounded-2xl border-slate-200 bg-white"
          aria-label="Password"
        />

        <Button
          type="submit"
          className="h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-300 text-slate-950 shadow-none hover:from-emerald-600 hover:to-emerald-400"
          disabled={!username.trim() || !password.trim() || loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
