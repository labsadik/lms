import { supabase } from '@/integrations/supabase/client';

/** Parse "mm:ss" or "hh:mm:ss" into seconds. */
export function parseDurationToSeconds(d?: string | null): number {
  if (!d) return 0;
  const parts = d.split(':').map(n => parseInt(n, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

async function bumpStreak(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: p } = await supabase.from('profiles')
    .select('current_streak, longest_streak, last_activity_date')
    .eq('user_id', userId).maybeSingle();
  if (!p || p.last_activity_date === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = p.last_activity_date === yesterday ? (p.current_streak || 0) + 1 : 1;
  await supabase.from('profiles').update({
    current_streak: newStreak,
    longest_streak: Math.max(p.longest_streak || 0, newStreak),
    last_activity_date: today,
  }).eq('user_id', userId);
}

/**
 * Award 1 coin + 1 XP for a specific watched-minute of a video.
 * Idempotent per (user, part, minute) via ref_id = `${partId}:m${minute}`.
 * `minute` is the 1-based minute index the user just finished watching.
 */
export async function awardWatchedMinute(userId: string, partId: string, minute: number, courseId?: string) {
  const { data, error } = await supabase.functions.invoke('award-watch-minute', {
    body: { part_id: partId, minute, course_id: courseId || null },
  });
  if (error || (data as any)?.error) return false;
  return Boolean((data as any)?.awarded);
}

/**
 * Mark a part complete (for progress tracking only). NO coin reward here —
 * coins come from watched-minutes ticks and from tests.
 */
export async function completePart(userId: string, partId: string, _courseId?: string) {
  const { data: existing } = await supabase
    .from('progress').select('id, completed').eq('user_id', userId).eq('part_id', partId).maybeSingle();
  if (existing?.completed) return;
  if (existing) {
    await supabase.from('progress').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('progress').insert({ user_id: userId, part_id: partId, completed: true, completed_at: new Date().toISOString() });
  }
  await bumpStreak(userId);
}

/** Legacy no-ops kept for backward compatibility with old imports. */
export async function tickWatch(_userId: string, _partId: string, _courseId?: string) { return; }
export async function award(_userId: string, _source: string, _refId: string, _opts: any = {}) { return false; }
export const trackVideoActivity = (userId: string, partId: string) => completePart(userId, partId);
