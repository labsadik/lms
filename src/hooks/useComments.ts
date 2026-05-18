import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Comment {
  id: string;
  user_id: string;
  parent_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  message: string;
  created_at: string;
  replies?: Comment[];
}

interface UseCommentsReturn {
  comments: Comment[];
  loading: boolean;
  sending: boolean;
  sendComment: (text: string, parentId?: string | null) => Promise<boolean>;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-comment`;

export function useComments(partId: string | null): UseCommentsReturn {
  const { user, session } = useAuth();
  const [rawComments, setRawComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const sentIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Thread flat list → nested structure ──
  const comments = useMemo(() => {
    const map = new Map<string, Comment>();
    const roots: Comment[] = [];

    for (const c of rawComments) {
      map.set(c.id, { ...c, replies: [] });
    }

    for (const c of map.values()) {
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.replies!.push(c);
      } else {
        roots.push(c);
      }
    }

    const sortTime = (a: Comment, b: Comment) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    roots.sort(sortTime);
    for (const r of roots) {
      r.replies!.sort(sortTime);
    }

    return roots;
  }, [rawComments]);

  // ── FETCH + REALTIME IN ONE EFFECT ──
  useEffect(() => {
    if (!partId) return;

    let cancelled = false;

    const init = async () => {
      // 1. AWAIT full channel removal — this is critical!
      //    removeChannel() returns a Promise that resolves
      //    only after the WebSocket cleanly unsubscribes.
      //    Without await, React StrictMode's second mount
      //    creates a duplicate channel name before the
      //    old one is destroyed → "cannot add postgres_changes
      //    after subscribe()" error.
      if (channelRef.current) {
        const oldChannel = channelRef.current;
        channelRef.current = null; // clear ref immediately to prevent double-cleanup
        await supabase.removeChannel(oldChannel);
      }

      // 2. Fetch existing comments
      setLoading(true);
      const { data, error } = await supabase
        .from("comments")
        .select(
          "id, user_id, parent_id, display_name, avatar_url, message, created_at"
        )
        .eq("part_id", partId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;

      if (error) {
        console.error("Fetch comments error:", error);
      } else {
        setRawComments((data as Comment[]) ?? []);
      }
      setLoading(false);

      // 3. Abort if cleanup ran during fetch
      if (cancelled) return;

      // 4. Subscribe to realtime — ALL .on() BEFORE .subscribe()
      const channel: RealtimeChannel = supabase
        .channel(`comments:${partId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "comments",
            filter: `part_id=eq.${partId}`,
          },
          (payload) => {
            if (cancelled) return;
            const c = payload.new as Comment;

            // Skip if we already optimistically added this comment
            if (sentIds.current.has(c.id)) {
              sentIds.current.delete(c.id);
              return;
            }

            // Dedup guard — prevents double-insert from
            // fetch completing at same moment as realtime fires
            setRawComments((prev) =>
              prev.some((existing) => existing.id === c.id)
                ? prev
                : [...prev, c]
            );
          }
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR") {
            console.error("[RT] Channel error:", err);
          }
        });

      // Only store if not cancelled during subscribe
      if (!cancelled) {
        channelRef.current = channel;
      }
    };

    init();

    // ── CLEANUP ──
    return () => {
      cancelled = true;
      if (channelRef.current) {
        const oldChannel = channelRef.current;
        channelRef.current = null;
        // Fire-and-forget on unmount (can't await in cleanup)
        supabase.removeChannel(oldChannel);
      }
    };
  }, [partId]);

  // ── SEND COMMENT ──
  const sendComment = useCallback(
    async (text: string, parentId: string | null = null): Promise<boolean> => {
      if (!user || !session?.access_token || !partId) {
        toast.error("Sign in to comment");
        return false;
      }

      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 1000) return false;

      setSending(true);

      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            part_id: partId,
            message: trimmed,
            parent_id: parentId,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");

        // Optimistic insert — add immediately, skip when
        // realtime echo arrives via sentIds guard
        if (json.comment?.id) {
          sentIds.current.add(json.comment.id);
          setRawComments((prev) =>
            prev.some((c) => c.id === json.comment.id)
              ? prev
              : [...prev, json.comment as Comment]
          );
        }

        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        toast.error(
          msg.includes("Not enrolled") ? "Enroll to comment" : msg
        );
        return false;
      } finally {
        setSending(false);
      }
    },
    [user, session?.access_token, partId]
  );

  return { comments, loading, sending, sendComment };
}