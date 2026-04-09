import { useState, type FormEvent } from "react";
import { AlertCircle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./AuthContext";

type LoginScreenMode = "pos" | "admin";

type LoginScreenProps = {
  mode?: LoginScreenMode;
};

const STATIC_SUPER_ADMIN_MFA_CODE = "123456";
const MARKETING_WEBSITE_BASE_URL = (import.meta.env.VITE_MARKETING_WEBSITE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const MARKETING_ADMIN_LOGIN_URL = `${MARKETING_WEBSITE_BASE_URL}/admin/login`;

const LoginScreen = ({ mode = "pos" }: LoginScreenProps) => {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const err = await login(username, password, isAdminMode ? mfaCode : undefined);
    if (err) {
      setError(err);
    }

    setLoading(false);
  };

  const isAdminMode = mode === "admin";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <ShoppingBag className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SmartPOS Lanka</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 pos-shadow-md space-y-6">
          <div>
            <h2 className="text-xl font-bold">Sign In</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdminMode ? (
                <>
                  Super admin access only:{" "}
                  <code className="text-primary font-medium">support_admin</code>,{" "}
                  <code className="text-primary font-medium">billing_admin</code>, or{" "}
                  <code className="text-primary font-medium">security_admin</code>.
                </>
              ) : (
                <>
                  Use the seeded backend users:{" "}
                  <code className="text-primary font-medium">owner</code>,{" "}
                  <code className="text-primary font-medium">manager</code>, or{" "}
                  <code className="text-primary font-medium">cashier</code>.
                </>
              )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="h-11 rounded-xl bg-muted/50"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-11 rounded-xl bg-muted/50"
              />
            </div>

            {isAdminMode && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  MFA Code (Super Admin): {STATIC_SUPER_ADMIN_MFA_CODE}
                </label>
                <Input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="6-digit code"
                  className="h-11 rounded-xl bg-muted/50"
                  inputMode="numeric"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="pos-primary"
              size="xl"
              className="w-full rounded-xl"
              disabled={!username.trim() || !password.trim() || loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>

        {isAdminMode ? (
          <p className="text-center text-xs text-muted-foreground">
            Super admin seeded credentials (MFA required):
            <code className="font-medium"> support_admin / support123</code>,
            <code className="font-medium"> billing_admin / billing123</code>,
            <code className="font-medium"> security_admin / security123</code>.
            Static MFA code: <code className="font-medium">{STATIC_SUPER_ADMIN_MFA_CODE}</code>.
            Primary portal: <code className="font-medium"> {MARKETING_ADMIN_LOGIN_URL}</code>.
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Passwords are the seeded values: <code className="font-medium">owner123</code>,{" "}
            <code className="font-medium">manager123</code>, and{" "}
            <code className="font-medium">cashier123</code>. Super admin portal is on the website:{" "}
            <code className="font-medium">{MARKETING_ADMIN_LOGIN_URL}</code>.
          </p>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;
