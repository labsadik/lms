import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Gift, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';

const Refer = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [refs, setRefs] = useState<any[]>([]);

  useSEO({ title: 'Refer & Earn — LearnHub', description: 'Invite friends and both get 10% off your next course.' });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('referrals').select('id, created_at, referred_id').eq('referrer_id', user.id),
    ]).then(([p, r]) => { setProfile(p.data); setRefs(r.data || []); });
  }, [user]);

  if (!profile) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const link = `${window.location.origin}/auth?ref=${profile.referral_code}`;
  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast.success('Copied!'); };

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-2xl w-full mx-auto space-y-6">
      <header className="text-center">
        <Gift className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-3xl font-bold">Refer & Earn</h1>
        <p className="text-muted-foreground mt-2">You both get <span className="text-primary font-bold">10% off</span> when a friend joins via your link.</p>
      </header>

      <Card className="p-6 bg-card border-border space-y-4">
        <div>
          <label className="text-sm text-muted-foreground">Your referral code</label>
          <div className="flex gap-2 mt-1">
            <code className="flex-1 px-3 py-2 bg-secondary rounded font-mono text-lg">{profile.referral_code}</code>
            <Button variant="outline" onClick={() => copy(profile.referral_code)}><Copy className="w-4 h-4" /></Button>
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Your referral link</label>
          <div className="flex gap-2 mt-1">
            <input className="flex-1 px-3 py-2 bg-secondary rounded text-sm" readOnly value={link} />
            <Button variant="outline" onClick={() => copy(link)}><Copy className="w-4 h-4" /></Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h2 className="font-bold flex items-center gap-2 mb-3"><Users className="w-5 h-5" /> Friends invited: {refs.length}</h2>
        {refs.length === 0 ? <p className="text-sm text-muted-foreground">Share your code to start earning!</p> : (
          <p className="text-sm text-muted-foreground">Each successful referral grants you a 10% discount code.</p>
        )}
      </Card>
    </div>
  );
};

export default Refer;
