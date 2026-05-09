import { useRef, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useComments, type Comment } from "@/hooks/useComments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, User, Reply, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommentUIProps {
  partId: string;
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function ReplyInput({
  replyingTo,
  onCancel,
  onSend,
  sending,
}: {
  replyingTo: { id: string; name: string };
  onCancel: () => void;
  onSend: (text: string) => Promise<boolean>;
  sending: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    const ok = await onSend(text);
    if (ok) setText("");
  };

  return (
    <div className="flex gap-2 items-start px-4 py-2 bg-muted/30 border-t border-border/30">
      <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-2" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-muted-foreground">
            Replying to{" "}
            <span className="font-semibold text-foreground">{replyingTo.name}</span>
          </span>
          <button
            onClick={onCancel}
            className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
        <div className="flex gap-2 items-end">
          <Textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Write a reply..."
            disabled={sending}
            rows={1}
            className="min-h-[32px] max-h-[60px] resize-none text-xs py-1.5 px-2.5 bg-background border-border/60 focus-visible:ring-primary/30"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="shrink-0 h-[32px] w-[32px] rounded-md"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  comment, own, depth, onReply,
}: {
  comment: Comment; own: boolean; depth: number; onReply: (id: string, name: string) => void;
}) {
  const [showReplies, setShowReplies] = useState(true);
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className={cn(own && "bg-primary/[0.02]")}>
      <div className="flex gap-2.5 px-4 py-2.5" style={{ paddingLeft: `${depth * 20 + 16}px` }}>
        <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {comment.avatar_url ? (
            <img src={comment.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={cn("text-xs sm:text-sm font-semibold leading-none", own ? "text-primary" : "text-foreground")}>
              {comment.display_name || "Student"}
              {own && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(You)</span>}
            </span>
            <span className="text-[10px] sm:text-xs text-muted-foreground/60">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed break-words whitespace-pre-wrap">{comment.message}</p>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => onReply(comment.id, comment.display_name || "Student")} className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <Reply className="w-3 h-3" />Reply
            </button>
            {hasReplies && (
              <button onClick={() => setShowReplies((v) => !v)} className="text-[10px] sm:text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                {showReplies ? "Hide" : "View"} {comment.replies!.length}{" "}
                {comment.replies!.length === 1 ? "reply" : "replies"}
              </button>
            )}
          </div>
        </div>
      </div>
      {hasReplies && showReplies && (
        <div className="border-l-2 border-border/30 ml-[26px] sm:ml-[30px]">
          {comment.replies!.map((r) => (
            <CommentRow key={r.id} comment={r} own={own} depth={0} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentUI({ partId }: CommentUIProps) {
  const { user } = useAuth();
  const { comments, loading, sending, sendComment } = useComments(partId);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comments.length]);

  const handleSend = useCallback(async () => {
    if (!draft.trim()) return;
    const ok = await sendComment(draft, replyTarget?.id);
    if (ok) { setDraft(""); setReplyTarget(null); inputRef.current?.focus(); }
  }, [draft, replyTarget, sendComment]);

  const handleReplySend = useCallback(async (text: string) => {
    if (!replyTarget) return false;
    const ok = await sendComment(text, replyTarget.id);
    if (ok) setReplyTarget(null);
    return ok;
  }, [replyTarget, sendComment]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Comments
          {comments.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">({comments.length})</span>
          )}
        </h3>
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center"><User className="w-5 h-5 text-muted-foreground/30" /></div>
            <p className="text-xs sm:text-sm text-muted-foreground/60">No comments yet</p>
            <p className="text-[11px] text-muted-foreground/40">Be the first to share your thoughts</p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {comments.map((c) => (
              <CommentRow key={c.id} comment={c} own={user?.id === c.user_id} depth={0} onReply={(id, name) => setReplyTarget({ id, name })} />
            ))}
          </div>
        )}
      </div>
      {replyTarget && (
        <ReplyInput replyingTo={replyTarget} onCancel={() => setReplyTarget(null)} onSend={handleReplySend} sending={sending} />
      )}
      {user ? (
        <div className="shrink-0 border-t border-border/50 p-3 bg-muted/20">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder={replyTarget ? `Reply to ${replyTarget.name}...` : "Add a comment..."}
              disabled={sending}
              rows={1}
              className="min-h-[36px] max-h-[80px] resize-none text-xs sm:text-sm py-2 px-3 bg-background border-border/60 focus-visible:ring-primary/30"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="shrink-0 h-[36px] w-[36px] rounded-lg"
              aria-label="Send comment"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-1.5 px-0.5">Enter to send · Shift+Enter for new line</p>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/50 p-4 bg-muted/20 text-center">
          <p className="text-xs text-muted-foreground/60">Sign in to leave a comment</p>
        </div>
      )}
    </div>
  );
}