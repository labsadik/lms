import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, Circle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSEO } from '@/lib/seo';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const emailSchema = z.string().trim().email('Invalid email').max(255);
const passwordSchema = z.string().min(8, 'Min 8 characters').max(72);

const Auth = () => {
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();

  const { user, isAdmin, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState(params.get('ref') || '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Track the intent to redirect correctly after auth state updates
  const actionRef = useRef<'signin' | 'signup' | null>(null);

  useSEO({
    title: 'Sign in — LearnHub LMS',
    description: 'Access your courses, progress, and rewards on LearnHub.',
  });

  // Password strength criteria
  const passwordChecks = useMemo(() => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const isPasswordStrong = Object.values(passwordChecks).every(Boolean);

  // Redirect logic
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // Admin redirect
      if (isAdmin) {
        nav('/admin', { replace: true });
        return;
      }

      // Redirect based on action (Sign up -> Profile, Sign in -> Study)
      if (actionRef.current === 'signup') {
        nav('/profile', { replace: true });
        return;
      }

      // Default fallback for sign in or page refresh
      const from = (loc.state as any)?.from || '/study';
      nav(from, { replace: true });
    }
  }, [user, isAdmin, authLoading, nav, loc]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || 'Invalid input');
      return;
    }

    setLoading(true);
    actionRef.current = 'signin'; // Set intent to signin

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      actionRef.current = null; // Reset on error
      toast.error(error.message);
    } else {
      toast.success('Welcome back!');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordStrong) {
      toast.error('Please meet all password requirements');
      return;
    }

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || 'Invalid input');
      return;
    }

    setLoading(true);
    actionRef.current = 'signup'; // Set intent to signup

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: name || email.split('@')[0],
          referral_code:
            referralCode.trim().toUpperCase() || undefined,
        },
      },
    });

    setLoading(false);

    if (error) {
      actionRef.current = null; // Reset on error
      toast.error(error.message);
    } else {
      toast.success('Account created! Welcome.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="w-full max-w-md">
        <Card className="p-6 sm:p-8 bg-card border-border shadow-xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Welcome</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Continue your learning journey
            </p>
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'signin' | 'signup')}
          >
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            {/* SIGN IN */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent text-muted-foreground/60 hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* SIGN UP */}
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="John Doe"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input
                    id="email2"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password2">Password</Label>
                  <div className="relative">
                    <Input
                      id="password2"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      className={cn(
                        "pr-10",
                        password.length > 0 && !isPasswordStrong && "focus-visible:ring-destructive"
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent text-muted-foreground/60 hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  
                  {/* Password Strength Checklist */}
                  {password.length > 0 && (
                    <div className="mt-3 space-y-1.5 p-3 rounded-lg bg-muted/50 border border-border/50">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Password must contain:
                      </p>
                      <CheckItem text="At least 8 characters" met={passwordChecks.length} />
                      <CheckItem text="One uppercase letter (A-Z)" met={passwordChecks.uppercase} />
                      <CheckItem text="One lowercase letter (a-z)" met={passwordChecks.lowercase} />
                      <CheckItem text="One number (0-9)" met={passwordChecks.number} />
                      <CheckItem text="One special character (!@#$...)" met={passwordChecks.special} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ref">Referral code (optional)</Label>
                  <Input
                    id="ref"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    maxLength={16}
                    placeholder="FRIEND123"
                    disabled={loading}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !isPasswordStrong}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Create account'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

// Sub-component for clean password requirement checks
function CheckItem({ text, met }: { text: string; met: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs transition-colors">
      {met ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
      )}
      <span className={met ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
        {text}
      </span>
    </div>
  );
}

export default Auth;