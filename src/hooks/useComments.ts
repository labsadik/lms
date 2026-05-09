import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

  // Thread raw flat list into nested structure
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

  // Fetch existing comments
  useEffect(() => {
    if (!partId) return;
    let alive = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, parent_id, display_name, avatar_url, message, created_at")
        .eq("part_id", partId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (alive) {
        if (error) console.error(error);
        else setRawComments((data as Comment[]) ?? []);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [partId]);

  // Realtime new comments
  useEffect(() => {
    if (!partId) return;

    const channel = supabase
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
          const c = payload.new as Comment;
          if (sentIds.current.has(c.id)) {
            sentIds.current.delete(c.id);
            return;
          }
          setRawComments((prev) => [...prev, c]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partId]);

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
        toast.error(msg.includes("Not enrolled") ? "Enroll to comment" : msg);
        return false;
      } finally {
        setSending(false);
      }
    },
    [user, session?.access_token, partId]
  );

  return { comments, loading, sending, sendComment };
}