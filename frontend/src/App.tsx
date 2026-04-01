import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginScreen from "@/components/auth/LoginScreen";
import { AuthProvider, useAuth } from "@/components/auth/AuthContext";
import { LicensingProvider, useLicensing } from "@/components/licensing/LicensingContext";
import { LicenseActivationScreen, LicenseBlockedScreen } from "@/components/licensing/LicenseScreens";
import { Button } from "@/components/ui/button";
import { getDeviceCode } from "@/lib/api";
import { isSuperAdminBackendRole } from "@/lib/auth";
import AdminConsole from "./pages/AdminConsole.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const LoadingScreen = ({ message }: { message: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-sm">
      {message}
    </div>
  </div>
);

const AuthGate = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const hasSuperAdminAccess = isSuperAdminBackendRole(user?.backendRole);

  if (isLoading) {
    return <LoadingScreen message="Checking session..." />;
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

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/login"
          element={
            isLoading ? (
              <LoadingScreen message="Checking admin session..." />
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
            isLoading ? (
              <LoadingScreen message="Checking admin session..." />
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

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await activate();
    } finally {
      setIsActivating(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Validating device license..." />;
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
    return <LoadingScreen message="Checking license state..." />;
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
