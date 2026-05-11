import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

import {
  Loader2,
  Upload,
  Camera,
  Shield,
  Mail,
  AlertTriangle,
  Lock,
  CheckCircle2,
} from 'lucide-react';

import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';

const Profile = () => {
  const { user } = useAuth();

  const [profile, setProfile] = useState<any>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');

  const [newEmail, setNewEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useSEO({
    title: 'My Profile — LearnHub',
  });

  // Profile Completion
  const profileCompletion = [name, bio, phone, avatar].filter(Boolean).length * 25;

  // Load profile
  useEffect(() => {
    if (!user) return;

    (async () => {
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        toast.error(error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
        return;
      }

      // Auto create profile
      if (!data) {
        const { data: created } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            display_name: user.email?.split('@')[0],
          })
          .select('*')
          .single();

        data = created;
      }

      setProfile(data);
      setName(data?.display_name || '');
      setBio(data?.bio || '');
      setPhone(data?.phone || '');
      setAvatar(data?.avatar_url || '');
    })();
  }, [user]);

  // Upload avatar
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error('Image must be under 3MB', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      return;
    }

    setUploading(true);

    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });

      if (error) {
        toast.error(error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const imageUrl = data.publicUrl;

      setAvatar(imageUrl);

      await supabase
        .from('profiles')
        .update({ avatar_url: imageUrl })
        .eq('user_id', user.id);

      toast.success('Profile image updated', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
    } catch {
      toast.error('Failed to upload image', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    }

    setUploading(false);
  };

  // Save profile
  const save = async () => {
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name,
        bio,
        phone,
      })
      .eq('user_id', user.id);

    setSaving(false);

    if (error) {
      toast.error(error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } else {
      toast.success('Profile updated successfully', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
    }
  };

  // Change Email
  const updateEmail = async () => {
    if (!newEmail) {
      toast.error('Enter new email address', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      return;
    }

    const { error } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (error) {
      toast.error(error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } else {
      toast.success('Verification email sent. Please check your inbox.', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      setNewEmail('');
    }
  };

  // Reset Password
  const resetPassword = async () => {
    if (!user?.email) return;

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin + '/reset-password',
    });

    if (error) {
      toast.error(error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } else {
      toast.success('Password reset link sent to your email', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
    }
  };

  // Loading
  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-6xl w-full mx-auto bg-muted/30 min-h-screen">
      
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage your account details, security, and preferences.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Avatar & Status */}
        <Card className="lg:col-span-1 p-6 flex flex-col items-center text-center gap-6 shadow-sm hover:shadow-md transition-shadow bg-card">
          
          {/* Avatar Section */}
          <div className="relative group">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/20 to-primary/5 blur-xl group-hover:blur-2xl transition-all" />
            <Avatar className="w-28 h-28 border-4 border-background shadow-lg relative z-10">
              <AvatarImage src={avatar} alt={name} className="object-cover" />
              <AvatarFallback className="text-3xl bg-muted">
                {(name || 'U')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-1 right-1 z-20 bg-primary text-primary-foreground rounded-full p-2 shadow-lg hover:scale-110 transition-transform border-2 border-background"
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
          </div>

          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />

          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full max-w-[200px]"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Change Photo'}
          </Button>
          <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 3MB</p>

          <Separator className="w-full" />

          {/* Completion */}
          <div className="w-full text-left space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Profile Completion</span>
              <span className="text-primary font-bold">{profileCompletion}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                style={{ width: `${profileCompletion}%` }}
              />
            </div>
          </div>

          <Separator className="w-full" />

          {/* Quick Info */}
          <div className="w-full space-y-3 text-left text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium truncate ml-4 max-w-[160px]">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-1.5 text-green-500">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Verified</span>
              <span className={`${user?.email_confirmed_at ? 'text-green-500' : 'text-yellow-500'} flex items-center gap-1.5`}>
                {user?.email_confirmed_at ? 'Yes' : 'Pending'}
              </span>
            </div>
          </div>
        </Card>

        {/* RIGHT COLUMN: Form Details */}
        <Card className="lg:col-span-2 p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow bg-card">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Personal Information</h2>
              <p className="text-sm text-muted-foreground mt-1">Update your personal details here.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="h-11"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="h-11"
                />
              </div>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Write something about yourself..."
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2 border-t">
              <Button onClick={save} disabled={saving} className="px-8 h-11 font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* BOTTOM SECTION: Security & Policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        
        {/* Change Email */}
        <Card className="p-6 shadow-sm hover:shadow-md transition-shadow bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Change Email</h2>
              <p className="text-xs text-muted-foreground">Requires verification.</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="newemail@example.com"
              className="h-11"
            />
            <Button onClick={updateEmail} variant="outline" className="w-full h-11">
              Send Verification Link
            </Button>
          </div>
        </Card>

        {/* Security */}
        <Card className="p-6 shadow-sm hover:shadow-md transition-shadow bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Security</h2>
              <p className="text-xs text-muted-foreground">Manage your password.</p>
            </div>
          </div>
          
          <div className="pt-2">
            <Button onClick={resetPassword} variant="outline" className="w-full h-11">
              Send Password Reset Link
            </Button>
          </div>
        </Card>
      </div>

      {/* Policy Card */}
      <Card className="mt-6 p-6 shadow-sm border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-500 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div className="space-y-4 flex-1">
            <div>
              <h2 className="text-lg font-semibold text-red-500">Account Security & Policy</h2>
              <p className="text-sm text-muted-foreground mt-1">Violating these terms may result in permanent suspension without refund.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "Sharing account access is strictly prohibited.",
                "Multiple suspicious logins trigger permanent ban.",
                "All course purchases are strictly non-refundable.",
                "Screen recording or piracy is illegal and prohibited."
              ].map((text, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Bottom Spacing */}
      <div className="h-10" />
    </div>
  );
};

export default Profile;