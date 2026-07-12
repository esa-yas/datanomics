import { useState, useEffect } from "react";
import { signIn } from "@/lib/auth";
import { getSupabaseConfigError, isSupabaseConfigured } from "@/lib/config";
import { probeSupabaseConnection } from "@/lib/supabaseHealth";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hexagon, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

  useEffect(() => {
    let cancelled = false;
    probeSupabaseConnection()
      .then((result) => {
        if (!cancelled && !result.ok) setConnectionError(result.error ?? 'Cannot reach Supabase');
      })
      .finally(() => {
        if (!cancelled) setCheckingConnection(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    const configError = getSupabaseConfigError();
    if (configError) {
      toast.error(configError);
      return;
    }
    if (connectionError) {
      toast.error(connectionError);
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      // Don't navigate manually — authStore.onAuthStateChange will update
      // the user state and App.tsx will automatically render the dashboard.
      // Keep the button in its loading state until the redirect happens.
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to sign in";
      toast.error(message);
      setLoading(false);
    }
  };

  const supabaseReady = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-background flex font-body">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex flex-col justify-center flex-1 bg-card relative overflow-hidden p-12">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
           <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hexagons" width="50" height="43.4" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
                <path d="M25 0L50 14.4v28.8L25 57.6 0 43.4V14.4z" fill="none" stroke="currentColor" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hexagons)"/>
          </svg>
        </div>
        
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <Hexagon className="w-12 h-12 text-primary fill-primary/20" />
            <h1 className="text-4xl font-display font-bold text-primary tracking-tight">DATANOMICS</h1>
          </div>
          <h2 className="text-5xl font-display font-bold text-foreground mb-6 leading-tight">
            Powering Data Careers
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            The precision instrument for data career placement.
            Fast, capable, and trusted operations platform.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Welcome Back</h2>
            <p className="text-muted-foreground">Sign in to Job Search OS</p>
          </div>

          {!supabaseReady && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200/90">
              Supabase is not configured. Copy <code className="text-yellow-100">.env.example</code> to{" "}
              <code className="text-yellow-100">.env</code> at the repo root and add your project URL and anon key.
            </div>
          )}

          {connectionError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive/90 leading-relaxed">
              <p className="font-semibold text-destructive mb-1">Cannot connect to Supabase</p>
              <p>{connectionError}</p>
            </div>
          )}

          {checkingConnection && supabaseReady && !connectionError && (
            <p className="text-xs text-muted-foreground">Checking Supabase connection…</p>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@datanomics.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card border-border h-12 text-base"
                required
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-card border-border h-12 text-base pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading || !supabaseReady}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
