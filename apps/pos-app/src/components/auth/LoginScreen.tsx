import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, ShoppingBag, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./AuthContext";

type LoginScreenMode = "pos" | "admin";

type LoginScreenProps = {
  mode?: LoginScreenMode;
};

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
  const showMfaField = isAdminMode;

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/90 p-6 shadow-sm sm:p-8">
            <div className="space-y-4">
              {isAdminMode ? (
                <a
                  href="/"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </a>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                  Open Lanka POS
                </div>
              )}

              <div className="space-y-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  {isAdminMode ? <ShieldCheck className="h-7 w-7" /> : <ShoppingBag className="h-7 w-7" />}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {isAdminMode ? "Cloud Commerce Account" : "POS Access"}
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {isAdminMode ? "My Account" : "Sign In"}
                  </h1>
                  <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                    {isAdminMode
                      ? "Sign in with your cloud owner account to purchase POS plans and AI credits."
                      : "Use your seeded POS credentials to access the cashier, manager, or owner workspace."}
                  </p>
                </div>
              </div>

            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Security</p>
                <p className="mt-2 text-sm font-medium">Protected sign-in flow</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Role aware</p>
                <p className="mt-2 text-sm font-medium">Admin and POS paths split</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cloud linked</p>
                <p className="mt-2 text-sm font-medium">Uses the existing backend session</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border/80 bg-card/95 p-6 shadow-sm sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Username
                  </label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="h-12 rounded-2xl bg-muted/40"
                    autoFocus
                  />
                </div>

                <div className="space-y-2 sm:col-span-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Password
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="h-12 rounded-2xl bg-muted/40"
                  />
                </div>
              </div>

              {showMfaField ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    MFA Code (Optional)
                  </label>
                  <Input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="123456"
                    className="h-12 rounded-2xl bg-muted/40"
                    inputMode="numeric"
                  />
                </div>
              ) : null}

              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="pos-primary"
                size="xl"
                className="w-full rounded-2xl"
                disabled={!username.trim() || !password.trim() || loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <p className="text-xs text-muted-foreground">
                {isAdminMode ? "Signed out." : "Use the POS account associated with this installation."}
              </p>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
