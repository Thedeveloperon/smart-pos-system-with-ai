import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginScreen from "@/components/auth/LoginScreen";
import { AuthProvider, useAuth } from "@/components/auth/AuthContext";
import { LicensingProvider, useLicensing } from "@/components/licensing/LicensingContext";
import { LicenseActivationScreen, LicenseBlockedScreen } from "@/components/licensing/LicenseScreens";
import SplashScreen from "@/components/ui/SplashScreen";
import { isSuperAdminBackendRole } from "@/lib/auth";
import AdminConsole from "./pages/AdminConsole";
import Index from "./pages/Index.tsx";
import InventoryManagerDashboard from "./pages/InventoryManagerDashboard.tsx";
import LicenseAccessSuccess from "./pages/LicenseAccessSuccess.tsx";
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
  const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  const showSplash = useMinimumVisible(isLoading);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen mode={isAdminPath ? "admin" : "pos"} />;
  }

  if (hasSuperAdminAccess) {
    return <AdminConsole />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/inventory-manager/*" element={<InventoryManagerDashboard />} />
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
    ) : (
      <LicensingProvider>
        <LicenseGate />
      </LicensingProvider>
    )}
  </TooltipProvider>
);

export default App;
