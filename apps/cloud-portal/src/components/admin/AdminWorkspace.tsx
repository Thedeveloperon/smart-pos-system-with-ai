"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import AdminConsole from "./AdminConsole";
import { bootstrapAdminSession, isSuperAdminRole, logoutAdmin, type AdminSession } from "./auth";

function Unauthorized({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <h1 className="text-xl font-bold">Admin Access Required</h1>
        <p className="text-sm text-muted-foreground">
          This URL is reserved for support, billing, security, and super-admin roles.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void onSignOut();
          }}
        >
          Sign Out
        </Button>
      </div>
    </main>
  );
}

export default function AdminWorkspace() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      try {
        const me = await bootstrapAdminSession();
        if (!active) {
          return;
        }

        if (!me) {
          router.replace("/admin/login");
          return;
        }

        setSession(me);
      } catch {
        if (active) {
          router.replace("/admin/login");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [router]);

  const isAllowed = useMemo(() => isSuperAdminRole(session?.role), [session?.role]);

  const handleSignOut = async () => {
    try {
      await logoutAdmin();
    } finally {
      setSession(null);
      router.replace("/admin/login");
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Loading admin workspace...</p>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  if (!isAllowed) {
    return <Unauthorized onSignOut={handleSignOut} />;
  }

  return <AdminConsole user={session} onSignOut={handleSignOut} />;
}
