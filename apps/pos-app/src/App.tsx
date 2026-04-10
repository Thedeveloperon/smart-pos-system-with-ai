import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginScreen from "@/components/auth/LoginScreen";
import { AuthProvider, useAuth } from "@/components/auth/AuthContext";
import { LicensingProvider, useLicensing } from "@/components/licensing/LicensingContext";
import { LicenseActivationScreen, LicenseBlockedScreen } from "@/components/licensing/LicenseScreens";
import { Button } from "@/components/ui/button";
import SplashScreen from "@/components/ui/SplashScreen";
import { getDeviceCode } from "@/lib/api";
import { isSuperAdminBackendRole } from "@/lib/auth";
import Index from "./pages/Index.tsx";
import LicenseAccessSuccess from "./pages/LicenseAccessSuccess.tsx";
import NotFound from "./pages/NotFound.tsx";

const SPLASH_MIN_DURATION_MS = 1000;
const MARKETING_WEBSITE_BASE_URL = (import.meta.env.VITE_MARKETING_WEBSITE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const MARKETING_ADMIN_LOGIN_URL = `${MARKETING_WEBSITE_BASE_URL}/admin/login`;

const useMinimumVisible = (isVisible: boolean, minimumDurationMs = SPLASH_MIN_DURATION_MS) => {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const visibleSinceRef = useRef<number | null>(isVisible ? Date.now() : null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isVisible) {
      visibleSinceRef.current ??= Date.now();
      setShouldRender(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const visibleSince = visibleSinceRef.current;
    if (visibleSince === null) {
      setShouldRender(false);
      return;
    }

    const elapsed = Date.now() - visibleSince;
    const remaining = Math.max(0, minimumDurationMs - elapsed);

    if (remaining === 0) {
      visibleSinceRef.current = null;
      setShouldRender(false);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      visibleSinceRef.current = null;
      setShouldRender(false);
      timeoutRef.current = null;
    }, remaining);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isVisible, minimumDurationMs]);

  return shouldRender;
};

const AdminPortalHandoffScreen = ({
  username,
  onSignOut,
  autoRedirect = false,
}: {
  username?: string;
  onSignOut?: () => void;
  autoRedirect?: boolean;
}) => {
  useEffect(() => {
    if (!autoRedirect || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      window.location.replace(MARKETING_ADMIN_LOGIN_URL);
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoRedirect]);

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Admin Portal Moved</h1>
        <p className="text-sm text-muted-foreground">
          Super-admin operations now run on the marketing website admin portal.
          {username ? ` Signed in as ${username}.` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = MARKETING_ADMIN_LOGIN_URL;
              }
            }}
          >
            <ExternalLink className="h-4 w-4" />
            Open Website Admin
          </Button>
          {onSignOut && (
            <Button variant="outline" onClick={onSignOut}>
              Sign Out
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          URL: <span className="font-mono">{MARKETING_ADMIN_LOGIN_URL}</span>
        </p>
      </div>
    </div>
  );
};

const AuthGate = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const hasSuperAdminAccess = isSuperAdminBackendRole(user?.backendRole);
  const showSplash = useMinimumVisible(isLoading);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen mode="pos" />;
  }

  if (hasSuperAdminAccess) {
    return (
      <AdminPortalHandoffScreen
        username={user?.username}
        onSignOut={() => {
          void logout();
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const LicenseGate = () => {
  const { status, isLoading, isRefreshing, error, isLicensed, isBlocked, refresh, activate } = useLicensing();
  const [isActivating, setIsActivating] = useState(false);
  const [activationEntitlementKey, setActivationEntitlementKey] = useState("");
  const showSplash = useMinimumVisible(isLoading);

  const handleActivate = async (rawActivationEntitlementKey?: string) => {
    setIsActivating(true);
    try {
      const resolvedKey = (rawActivationEntitlementKey ?? activationEntitlementKey).trim();
      const activationError = await activate({
        activationEntitlementKey: resolvedKey || undefined,
      });
      if (!activationError) {
        setActivationEntitlementKey("");
      }
    } finally {
      setIsActivating(false);
    }
  };

  if (showSplash) {
    return <SplashScreen />;
  }

  if (!status || status.state === "unprovisioned") {
    return (
        <LicenseActivationScreen
          deviceCode={status?.deviceCode || getDeviceCode()}
          error={error}
          isBusy={isActivating || isRefreshing}
          activationEntitlementKey={activationEntitlementKey}
          onActivationEntitlementKeyChange={setActivationEntitlementKey}
          onActivate={(key) => {
            void handleActivate(key);
          }}
          onRefresh={() => {
            void refresh();
          }}
        />
      );
  }

  if (isBlocked || status.state === "suspended" || status.state === "revoked") {
    return (
      <LicenseBlockedScreen
        status={status}
        error={error}
        isBusy={isActivating || isRefreshing}
        activationEntitlementKey={activationEntitlementKey}
        onActivationEntitlementKeyChange={setActivationEntitlementKey}
        onRefresh={() => {
          void refresh();
        }}
        onActivate={(key) => {
          void handleActivate(key);
        }}
      />
    );
  }

  if (!isLicensed) {
    return <SplashScreen />;
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
};

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    {(typeof window !== "undefined" && window.location.pathname.startsWith("/license/success")) ? (
      <LicenseAccessSuccess />
    ) : (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) ? (
      <AdminPortalHandoffScreen autoRedirect />
    ) : (
      <LicensingProvider>
        <LicenseGate />
      </LicensingProvider>
    )}
  </TooltipProvider>
);

export default App;
