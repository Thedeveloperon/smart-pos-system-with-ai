import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import AdminConsole from "./pages/AdminConsole.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const SPLASH_MIN_DURATION_MS = 1000;

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
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
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

const AdminUnauthorizedScreen = ({ onSignOut }: { onSignOut: () => void }) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <h1 className="text-xl font-bold">Admin Access Required</h1>
      <p className="text-sm text-muted-foreground">
        This URL is reserved for super admin accounts only.
      </p>
      <Button
        variant="outline"
        onClick={onSignOut}
      >
        Sign Out
      </Button>
    </div>
  </div>
);

const AdminAuthGate = () => {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const hasSuperAdminAccess = isSuperAdminBackendRole(user?.backendRole);
  const showSplash = useMinimumVisible(isLoading);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/login"
          element={
            showSplash ? (
              <SplashScreen />
            ) : isAuthenticated ? (
              hasSuperAdminAccess ? (
                <Navigate to="/admin" replace />
              ) : (
                <AdminUnauthorizedScreen
                  onSignOut={() => {
                    void logout();
                  }}
                />
              )
            ) : (
              <LoginScreen mode="admin" />
            )
          }
        />
        <Route
          path="/admin"
          element={
            showSplash ? (
              <SplashScreen />
            ) : !isAuthenticated ? (
              <Navigate to="/admin/login" replace />
            ) : hasSuperAdminAccess ? (
              <AdminConsole />
            ) : (
              <AdminUnauthorizedScreen
                onSignOut={() => {
                  void logout();
                }}
              />
            )
          }
        />
        <Route
          path="/admin/*"
          element={<Navigate to="/admin" replace />}
        />
        <Route
          path="*"
          element={<Navigate to="/admin/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
};

const LicenseGate = () => {
  const { status, isLoading, isRefreshing, error, isLicensed, isBlocked, refresh, activate } = useLicensing();
  const [isActivating, setIsActivating] = useState(false);
  const showSplash = useMinimumVisible(isLoading);

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await activate();
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
        onActivate={() => {
          void handleActivate();
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
        onRefresh={() => {
          void refresh();
        }}
        onActivate={() => {
          void handleActivate();
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
    {(typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) ? (
      <AuthProvider>
        <AdminAuthGate />
      </AuthProvider>
    ) : (
      <LicensingProvider>
        <LicenseGate />
      </LicensingProvider>
    )}
  </TooltipProvider>
);

export default App;
