import { useEffect, useRef, useState } from 'react';
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
  Upload,
  Camera,
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

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useSEO({
    title: 'My Profile — LearnHub',
  });

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
        toast.error(error.message);
        return;
      }

      // Auto create profile
      if (!data) {
        const { data: created } =
          await supabase
            .from('profiles')
            .insert({
              user_id: user.id,
              display_name:
                user.email?.split('@')[0],
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

  // Upload avatar image
  const onPickFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file || !user) return;

    // Validate image
    if (!file.type.startsWith('image/')) {
      toast.error(
        'Please select an image'
      );
      return;
    }

    // Max 3MB
    if (file.size > 3 * 1024 * 1024) {
      toast.error(
        'Image must be under 3MB'
      );
      return;
    }

    setUploading(true);

    try {
      const ext =
        file.name.split('.').pop() || 'png';

      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });

      if (error) {
        toast.error(error.message);
        setUploading(false);
        return;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const imageUrl = data.publicUrl;

      // Update local UI instantly
      setAvatar(imageUrl);

      // Save directly to database
      await supabase
        .from('profiles')
        .update({
          avatar_url: imageUrl,
        })
        .eq('user_id', user.id);

      toast.success(
        'Profile image updated'
      );
    } catch (err) {
      toast.error(
        'Failed to upload image'
      );
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
      toast.error(error.message);
    } else {
      toast.success('Profile updated');
    }
  };

  // Loading
  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-2xl w-full mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        My Profile
      </h1>

      <Card className="p-6 space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="w-28 h-28 border-4 border-border">
              <AvatarImage
                src={avatar}
                alt={name}
              />

              <AvatarFallback className="text-2xl">
                {(name || 'U')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Camera Button */}
            <button
              type="button"
              onClick={() =>
                fileRef.current?.click()
              }
              className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 shadow-lg hover:scale-105 transition"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Hidden Input */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onPickFile}
          />

          <Button
            variant="outline"
            onClick={() =>
              fileRef.current?.click()
            }
            disabled={uploading}
          >
            <Upload className="w-4 h-4 mr-2" />

            {uploading
              ? 'Uploading...'
              : 'Choose Profile Image'}
          </Button>

          <p className="text-xs text-muted-foreground">
            PNG, JPG, WEBP up to 3MB
          </p>
        </div>

        {/* Name */}
        <div>
          <Label htmlFor="name">
            Display Name
          </Label>

          <Input
            id="name"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            placeholder="Your name"
          />
        </div>

        {/* Phone */}
        <div>
          <Label htmlFor="phone">
            Phone Number
          </Label>

          <Input
            id="phone"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            placeholder="+91 9876543210"
          />
        </div>

        {/* Bio */}
        <div>
          <Label htmlFor="bio">
            Bio
          </Label>

          <Textarea
            id="bio"
            rows={4}
            value={bio}
            onChange={(e) =>
              setBio(e.target.value)
            }
            placeholder="Write something about yourself..."
          />
        </div>

        {/* Email */}
        <div className="text-sm text-muted-foreground">
          <strong>Email:</strong>{' '}
          {user?.email}
        </div>

        {/* Save */}
        <Button
          onClick={save}
          disabled={saving}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Save Changes'
          )}
        </Button>
      </Card>
    </div>
  );
};

export default Profile;