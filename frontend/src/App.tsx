import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginScreen from "@/components/auth/LoginScreen";
import { AuthProvider, useAuth } from "@/components/auth/AuthContext";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-sm">
      Checking session...
    </div>
  </div>
);

const AuthGate = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
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

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </TooltipProvider>
);

export default App;

