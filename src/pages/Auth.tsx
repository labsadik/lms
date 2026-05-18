import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  
  // Policy Popup State
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policyTab, setPolicyTab] = useState<'terms' | 'privacy'>('terms');
  
  const actionRef = useRef<'signin' | 'signup' | null>(null);

  useSEO({
    title: 'Sign in — LearnHub LMS',
    description: 'Access your courses, progress, and rewards on LearnHub.',
  });

  const passwordChecks = useMemo(() => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const isPasswordStrong = Object.values(passwordChecks).every(Boolean);

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      if (isAdmin) {
        nav('/admin', { replace: true });
        return;
      }

      if (actionRef.current === 'signup') {
        nav('/profile', { replace: true });
        return;
      }

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
    actionRef.current = 'signin';

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      actionRef.current = null;
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
    actionRef.current = 'signup';

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
      actionRef.current = null;
      toast.error(error.message);
    } else {
      toast.success('Account created! Welcome.');
    }
  };

  const openPolicy = (type: 'terms' | 'privacy') => {
    setPolicyTab(type);
    setIsPolicyOpen(true);
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

          {/* ─── Highlighted Quick Links ─── */}
          <div className="mt-6 pt-5 border-t border-border/50 flex items-center justify-center gap-3 text-xs">
            <button 
              onClick={() => openPolicy('terms')} 
              className="text-primary font-semibold hover:underline underline-offset-2 transition-all"
            >
              Terms & Conditions
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button 
              onClick={() => openPolicy('privacy')} 
              className="text-primary font-semibold hover:underline underline-offset-2 transition-all"
            >
              Privacy Policy
            </button>
          </div>
        </Card>
      </div>

      {/* ─── Legal Policies Popup ─── */}
      <Dialog open={isPolicyOpen} onOpenChange={setIsPolicyOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 bg-background gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-background z-10 rounded-t-lg">
            <DialogTitle className="text-xl font-bold">Legal Policies</DialogTitle>
            <DialogDescription>Please read our policies carefully before using LearnHub.</DialogDescription>
            <Tabs value={policyTab} onValueChange={(v) => setPolicyTab(v as 'terms' | 'privacy')} className="mt-4">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="terms" className="text-sm">Terms & Conditions</TabsTrigger>
                <TabsTrigger value="privacy" className="text-sm">Privacy Policy</TabsTrigger>
              </TabsList>
            </Tabs>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-6 py-6 custom-scrollbar">
            {policyTab === 'terms' && <TermsContent />}
            {policyTab === 'privacy' && <PrivacyContent />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════ */
// A-to-Z Legal Content Components
/* ════════════════════════════════════════════════════════════════ */

const TermsContent = () => (
  <div className="prose-sm space-y-6 text-muted-foreground leading-relaxed">
    <section>
      <h3 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h3>
      <p>By accessing or using the LearnHub platform ("Service"), you agree to be bound by these Terms & Conditions. If you do not agree to these terms, please do not use our Service. These terms apply to all visitors, users, students, and administrators.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">2. User Accounts</h3>
      <p>When you create an account with us, you must provide accurate, complete, and current information. Failure to do so constitutes a breach of the Terms. You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password. You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of any breach of security.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">3. Course Content & Access</h3>
      <p>Our platform hosts educational video courses, reading materials, quizzes, and tests. Access to premium content requires enrollment, which may be free or paid. Your license to use the content is limited to personal, non-commercial use. You may not download, distribute, or duplicate course materials without explicit written permission from LearnHub.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">4. Payments, Pricing & Refunds</h3>
      <p>Certain courses require payment. All prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. Payments are processed securely via our payment partners (e.g., Stripe). Due to the digital nature of our content, refunds are generally not offered once a course is accessed or a payment is successfully processed, except in cases of technical failures duplicate charges.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">5. Promocodes & Rewards</h3>
      <p>LearnHub may offer promotional codes ("Promocodes") or virtual coins ("Coins"). Promocodes are subject to expiration dates, usage limits, and specific course restrictions. Coins are virtual tokens earned through platform activity and have no real-world monetary value. Rewards redeemed via Coins (such as discount coupons) are non-transferable.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">6. Intellectual Property</h3>
      <p>The Service and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of LearnHub and its licensors. The Service is protected by copyright, trademark, and other laws of both India and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without prior written consent.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">7. User Conduct & Academic Integrity</h3>
      <p>You agree not to exploit, hack, or manipulate the platform&apos;s scoring, XP, streak, or coin systems. Any attempt to artificially inflate scores, share test answers, or bypass paywalls will result in immediate account termination and potential legal action. You agree to respect the academic integrity of tests and quizzes.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">8. Limitation of Liability</h3>
      <p>In no event shall LearnHub, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, or goodwill, resulting from your access to or use of or inability to access or use the Service.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">9. Termination</h3>
      <p>We may terminate or suspend your account immediately, without prior notice or liability, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">10. Governing Law</h3>
      <p>These Terms shall be governed and construed in accordance with the laws of India, without regard to its conflict of law provisions.</p>
    </section>
    <p className="text-xs text-muted-foreground/60 pt-4 border-t border-border">Last updated: May 2024</p>
  </div>
);

const PrivacyContent = () => (
  <div className="prose-sm space-y-6 text-muted-foreground leading-relaxed">
    <section>
      <h3 className="text-lg font-semibold text-foreground">1. Information We Collect</h3>
      <p>We collect information directly from you when you register (e.g., name, email address), when you make a payment (processed securely by third-party gateways), and when you use the platform (e.g., watch time, quiz scores, IP address, browser type).</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h3>
      <ul className="list-disc pl-5 space-y-1">
        <li>To create and manage your user account and profile.</li>
        <li>To process enrollments and payments for courses.</li>
        <li>To track your learning progress, XP, streaks, and test scores.</li>
        <li>To communicate with you regarding account updates, new courses, or support tickets.</li>
        <li>To improve our platform, UI/UX, and course recommendations.</li>
      </ul>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">3. Payment Processing</h3>
      <p>We do not store your credit card numbers or bank details directly. Payments are handled by industry-standard, PCI-compliant third-party processors (like Stripe). We only retain transaction IDs and billing amounts to issue receipts and manage enrollments.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">4. Cookies & Tracking</h3>
      <p>We use essential cookies to maintain your session and authentication state. We may also use analytics cookies to understand how users interact with our platform so we can improve the experience. You can disable non-essential cookies in your browser settings, though some features may not work optimally.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">5. Data Sharing</h3>
      <p>We do not sell your personal data. We may share anonymized, aggregated data for analytical purposes. Your personal information is only shared with third parties necessary to operate the Service (e.g., our database provider, authentication provider, payment gateway) under strict data processing agreements.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">6. Leaderboards & Public Profiles</h3>
      <p>To foster community engagement, features like the Global Leaderboard may display your display name, avatar, level, XP, and course progress publicly. You can control what is visible by adjusting your profile settings.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">7. Data Security</h3>
      <p>We implement industry-standard security measures (including encryption at rest and in transit via HTTPS) to protect your personal information. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">8. Data Retention & Your Rights</h3>
      <p>You have the right to request access to, correction of, or deletion of your personal data. If you delete your account, we will erase your personal data within 30 days, except where we are required to retain it for legal or operational reasons (e.g., financial records).</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">9. Children&apos;s Privacy</h3>
      <p>Our Service is not directed to individuals under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.</p>
    </section>
    <section>
      <h3 className="text-lg font-semibold text-foreground">10. Changes to This Policy</h3>
      <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.</p>
    </section>
    <p className="text-xs text-muted-foreground/60 pt-4 border-t border-border">Last updated: May 2024</p>
  </div>
);

/* ════════════════════════════════════════════════════════════════ */

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