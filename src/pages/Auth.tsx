import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSEO } from '@/lib/seo';
import { z } from 'zod';

const emailSchema = z.string().trim().email('Invalid email').max(255);
const passwordSchema = z.string().min(6, 'Min 6 characters').max(72);

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

  useSEO({
    title: 'Sign in — LearnHub LMS',
    description: 'Access your courses, progress, and rewards on LearnHub.',
  });

  // Redirect logic
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // Admin redirect
      if (isAdmin) {
        nav('/admin', { replace: true });
        return;
      }

      // Student/User redirect
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Welcome back!');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || 'Invalid input');
      return;
    }

    setLoading(true);

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
      toast.error(error.message);
    } else {
      toast.success('Account created! Welcome.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="w-full max-w-md">
        <Card className="p-6 bg-card border-border">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'signin' | 'signup')}
          >
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="signin">
                Sign in
              </TabsTrigger>

              <TabsTrigger value="signup">
                Sign up
              </TabsTrigger>
            </TabsList>

            {/* SIGN IN */}
            <TabsContent value="signin">
              <form
                onSubmit={handleSignIn}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="email">
                    Email
                  </Label>

                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="password">
                    Password
                  </Label>

                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
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
              <form
                onSubmit={handleSignUp}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="name">
                    Name
                  </Label>

                  <Input
                    id="name"
                    value={name}
                    onChange={(e) =>
                      setName(e.target.value)
                    }
                    maxLength={100}
                  />
                </div>

                <div>
                  <Label htmlFor="email2">
                    Email
                  </Label>

                  <Input
                    id="email2"
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="password2">
                    Password
                  </Label>

                  <Input
                    id="password2"
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <Label htmlFor="ref">
                    Referral code (optional)
                  </Label>

                  <Input
                    id="ref"
                    value={referralCode}
                    onChange={(e) =>
                      setReferralCode(
                        e.target.value.toUpperCase()
                      )
                    }
                    maxLength={16}
                    placeholder="FRIEND123"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
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

export default Auth;