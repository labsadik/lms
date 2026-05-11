import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

import {
  Loader2,
  Camera,
  Check,
  Shield,
  X,
  AlertTriangle,
  CreditCard,
  FileText,
  UserX,
  ChevronRight,
  Sparkles,
  User,
  Phone,
  PenLine,
  ImageIcon,
} from 'lucide-react';

import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════
   DiceBear Default Avatar
   ════════════════════════════════════════════════════════ */
function getDiceBearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/lorelei/${encodeURIComponent(seed)}.svg`;
}

/* ════════════════════════════════════════════════════════
   Info Dialog (! menu)
   ════════════════════════════════════════════════════════ */
function InfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const sections = [
    {
      icon: Shield,
      title: 'Profile Security',
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      points: [
        'Your email cannot be changed without verification — a confirmation link is sent to the new address.',
        'Password resets require access to your registered email.',
        'Avatar, name, bio, and phone are visible to other users on leaderboards.',
        'Never share your password or session tokens with anyone.',
      ],
    },
    {
      icon: CreditCard,
      title: 'Payment Security',
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      points: [
        'All payments are processed through secure Stripe sessions — we never store card details.',
        'Promocode redemptions are tracked and one-time use per user unless specified.',
        'Coin redemptions for rewards are final and non-refundable.',
        'If you notice unauthorized charges, contact support immediately.',
      ],
    },
    {
      icon: FileText,
      title: 'User Policy',
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      points: [
        'Each user is allowed one account. Duplicate accounts may be suspended.',
        'Your XP, coins, streaks, and badges are tied to your account and non-transferable.',
        'Course access is linked to your enrollment — sharing accounts is prohibited.',
        'Respect other users in comments and discussions. Be constructive and kind.',
      ],
    },
    {
      icon: UserX,
      title: 'Ban & Suspension Policy',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      points: [
        'Violent threats, hate speech, harassment, or bullying in comments will result in immediate ban.',
        'Sharing explicit, offensive, or illegal content is strictly prohibited.',
        'Spamming comments, fake reviews, or exploiting platform bugs leads to suspension.',
        'Attempting to manipulate XP, coins, or leaderboards through exploits = permanent ban.',
        'First offense may receive a warning. Repeated or severe violations result in permanent account termination.',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full sm:max-w-lg max-h-[85vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold">Safety & Policies</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-5" style={{ maxHeight: 'calc(85vh - 64px)' }}>
          {sections.map((s) => (
            <div key={s.title}>
              <div className="flex items-center gap-2.5 mb-2">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', s.bg)}>
                  <s.icon className={cn('w-4 h-4', s.color)} />
                </div>
                <h4 className="text-sm font-bold">{s.title}</h4>
              </div>
              <ul className="ml-10 space-y-1.5">
                {s.points.map((p, i) => (
                  <li key={i} className="text-[12px] text-muted-foreground leading-relaxed flex gap-2">
                    <span className="text-border mt-1 shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Setup Guide for New Users
   ════════════════════════════════════════════════════════ */
function SetupGuide({ onDismiss }: { onDismiss: () => void }) {
  const steps = [
    { icon: User, label: 'Add your display name', field: 'name' as const },
    { icon: Phone, label: 'Add your phone number', field: 'phone' as const },
    { icon: PenLine, label: 'Write a short bio', field: 'bio' as const },
    { icon: ImageIcon, label: 'Upload a profile photo', field: 'avatar' as const },
  ];

  return (
    <Card className="p-4 border-primary/30 bg-primary/5 dark:bg-primary/10">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground">Complete your profile</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">
            A complete profile helps you stand out on leaderboards and builds trust with other learners.
          </p>
          <div className="space-y-1.5">
            {steps.map((s) => (
              <div key={s.field} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <s.icon className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onDismiss}
            className="mt-3 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════
   Verified Badge
   ════════════════════════════════════════════════════════ */
function VerifiedBadge({ type }: { type: 'admin' | 'user' }) {
  if (type === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">
        <Shield className="w-3 h-3" /> Admin Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
      <Check className="w-3 h-3" /> Verified
    </span>
  );
}

/* ════════════════════════════════════════════════════════
   Main Profile
   ════════════════════════════════════════════════════════ */
const Profile = () => {
  const { user, isAdmin } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarPath, setAvatarPath] = useState('');

  const [uploading, setUploading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showGuide, setShowGuide] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSEO({ title: 'My Profile — LearnHub' });

  useEffect(() => {
    if (!user) return;

    (async () => {
      const [pRes, eRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('enrollments').select('id').eq('user_id', user.id),
      ]);

      let data = pRes.data;
      if (pRes.error) { toast.error(pRes.error.message); return; }

      if (!data) {
        const { data: created } = await supabase
          .from('profiles')
          .insert({ user_id: user.id, display_name: user.email?.split('@')[0] })
          .select('*')
          .single();
        data = created;
      }

      setProfile(data);
      setName(data?.display_name || '');
      setBio(data?.bio || '');
      setPhone(data?.phone || '');
      setAvatarPath(data?.avatar_url || '');
      setEmail(user.email || '');
      setIsEnrolled((eRes.data || []).length > 0);

      // Show guide if profile looks new (no custom name, no bio, no phone, no avatar)
      const isNew =
        !data?.display_name ||
        data.display_name === user.email?.split('@')[0] ||
        (!data?.bio && !data?.phone && !data?.avatar_url);
      if (isNew) setShowGuide(true);
    })();
  }, [user]);

  /* ── Profile completion (frontend only) ── */
  const completionFields = [
    { filled: name.trim() !== '' && name !== user?.email?.split('@')[0] },
    { filled: phone.trim() !== '' },
    { filled: bio.trim() !== '' },
    { filled: avatarPath.trim() !== '' },
  ];
  const completionPct = Math.round((completionFields.filter((f) => f.filled).length / 4) * 100);
  const isComplete = completionPct === 100;

  const completionColor = completionPct < 40 ? '#FACC15' : completionPct < 80 ? '#F97316' : '#22C55E';

  /* ── Auto-save ── */
  const autoSave = useCallback(
    (fields: { display_name?: string; bio?: string; phone?: string }) => {
      if (!user || !profile) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSaveStatus('saving');

      saveTimeoutRef.current = setTimeout(async () => {
        const { error } = await supabase.from('profiles').update(fields).eq('user_id', user.id);
        if (error) { toast.error(error.message); setSaveStatus('idle'); }
        else { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 1500); }
      }, 800);
    },
    [user, profile]
  );

  useEffect(() => {
    if (!profile) return;
    if (name !== profile.display_name || bio !== profile.bio || phone !== profile.phone) {
      autoSave({ display_name: name, bio, phone });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, bio, phone]);

  /* ── Upload avatar (no crop) ── */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    setUploading(true);

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type,
      });

      if (error) { toast.error(error.message); setUploading(false); return; }

      setAvatarPath(path);
      await supabase.from('profiles').update({ avatar_url: path }).eq('user_id', user.id);
      toast.success('Profile image updated');
    } catch {
      toast.error('Failed to upload image');
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── Change email ── */
  const changeEmail = async () => {
    if (!user || !email.trim()) return;
    if (email === user.email) { toast.error('Enter a different email'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Enter a valid email address'); return; }

    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) toast.error(error.message);
      else { toast.success('Verification email sent to ' + email); setEmail(user.email || ''); }
    } catch { toast.error('Failed to update email'); }
    setEmailLoading(false);
  };

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const verifiedType = isAdmin ? 'admin' : isEnrolled ? 'user' : null;

  // Resolve avatar URL
  const avatarDisplayUrl = avatarPath
    ? avatarPath.startsWith('http')
      ? avatarPath
      : supabase.storage.from('avatars').getPublicUrl(avatarPath).data?.publicUrl
    : null;

  const diceBearUrl = getDiceBearUrl(user?.email || 'user');

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-2xl w-full mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">My Profile</h1>
          {verifiedType && <VerifiedBadge type={verifiedType} />}
        </div>

        {/* ! button */}
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="relative h-9 w-9 rounded-xl bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-colors shrink-0"
          aria-label="Safety & Policies"
        >
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </button>
      </div>

      {/* New user setup guide */}
      {showGuide && !isComplete && <SetupGuide onDismiss={() => setShowGuide(false)} />}

      {/* Profile completion bar */}
      {!isComplete && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Profile Completion</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: completionColor }}>
              {completionPct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${completionPct}%`,
                background: completionColor,
                boxShadow: `0 0 10px ${completionColor}40`,
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {completionPct === 0
              ? 'Get started by filling in your profile details below.'
              : completionPct < 100
              ? 'Almost there! Complete the remaining fields to finish your profile.'
              : ''}
          </p>
          <div className="flex gap-3 mt-2.5">
            {[
              { label: 'Name', done: completionFields[0].filled },
              { label: 'Phone', done: completionFields[1].filled },
              { label: 'Bio', done: completionFields[2].filled },
              { label: 'Photo', done: completionFields[3].filled },
            ].map((f) => (
              <span
                key={f.label}
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors',
                  f.done
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {f.done ? '✓ ' : ''}{f.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Profile card */}
      <Card className="p-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="w-28 h-28 border-4 border-border">
              {avatarDisplayUrl ? (
                <AvatarImage src={avatarDisplayUrl} alt={name} />
              ) : (
                <AvatarImage src={diceBearUrl} alt={name} />
              )}
              <AvatarFallback className="text-2xl bg-muted">
                {(name || 'U')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 shadow-lg hover:scale-105 transition disabled:opacity-50"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
          <p className="text-xs text-muted-foreground">
            {avatarPath ? 'Tap to change photo' : 'Upload a custom photo (optional)'}
            {' · '}PNG, JPG, WEBP up to 5MB
          </p>
        </div>

        {/* Auto-save indicator */}
        <div className="flex items-center justify-end">
          <span
            className={cn(
              'text-[11px] font-medium transition-all duration-300',
              saveStatus === 'idle' && 'opacity-0',
              saveStatus === 'saving' && 'text-muted-foreground opacity-100',
              saveStatus === 'saved' && 'text-green-500 opacity-100',
            )}
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : ''}
          </span>
        </div>

        {/* Name */}
        <div>
          <Label htmlFor="name" className="flex items-center gap-1.5">
            Display Name
            {!completionFields[0].filled && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            )}
          </Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>

        {/* Phone */}
        <div>
          <Label htmlFor="phone" className="flex items-center gap-1.5">
            Phone Number
            {!completionFields[1].filled && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            )}
          </Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" />
        </div>

        {/* Bio */}
        <div>
          <Label htmlFor="bio" className="flex items-center gap-1.5">
            Bio
            {!completionFields[2].filled && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            )}
          </Label>
          <Textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Write something about yourself..." />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <div className="flex gap-2">
            <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@email.com" className="flex-1" />
            <Button variant="outline" onClick={changeEmail} disabled={emailLoading || !email.trim() || email === user.email} className="shrink-0">
              {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Current: <span className="font-mono">{user?.email}</span> · Verification link sent to new email
          </p>
        </div>

        {/* Signed in as */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
          <span className="font-medium">Signed in as:</span>
          <span className="font-mono text-foreground">{user?.email}</span>
        </div>
      </Card>

      {/* Info Dialog */}
      <InfoDialog open={showInfo} onClose={() => setShowInfo(false)} />
    </div>
  );
};

export default Profile;