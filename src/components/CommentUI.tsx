import { useRef, useCallback, useEffect, useState, memo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useComments, type Comment } from "@/hooks/useComments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, User, Reply, AtSign, X, MessageSquare } from "lucide-react";
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

/* ─── Comment Row ─── */
const CommentRow = memo(function CommentRow({
  comment, own, onReply, parentDisplayName,
}: {
  comment: Comment;
  own: boolean;
  onReply: (id: string, name: string) => void;
  parentDisplayName?: string;
}) {
  const [showReplies, setShowReplies] = useState(true);
  const hasReplies = comment.replies && comment.replies.length > 0;
  const isReply = !!parentDisplayName;

  const content = (
    <div className="flex gap-2 sm:gap-2.5 py-2 sm:py-2.5 px-3 sm:px-4">
      <div className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden">
        {comment.avatar_url ? (
          <img src={comment.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground/50" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 sm:gap-1.5 mb-px flex-wrap">
          <span className={cn("text-[11px] sm:text-sm font-semibold leading-none", own ? "text-primary" : "text-foreground")}>
            {comment.display_name || "Student"}
            {own && <span className="ml-1 text-[9px] sm:text-[10px] font-normal text-muted-foreground">(You)</span>}
          </span>
          {isReply && parentDisplayName && (
            <span className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-primary/8 shrink-0">
              <AtSign className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-primary/40" />
              <span className="text-[9px] sm:text-[10px] text-primary/50 font-medium">{parentDisplayName}</span>
            </span>
          )}
          <span className="text-[9px] sm:text-[11px] text-muted-foreground/50">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-[12px] sm:text-sm text-foreground/90 leading-relaxed break-words whitespace-pre-wrap mt-0.5">{comment.message}</p>
        <div className="flex items-center gap-3 mt-1">
          <button onClick={() => onReply(comment.id, comment.display_name || "Student")}
            className="flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors py-0.5">
            <Reply className="w-2.5 h-2.5 sm:w-3 sm:h-3" />Reply
          </button>
          {hasReplies && (
            <button onClick={() => setShowReplies((v) => !v)}
              className="text-[10px] sm:text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors py-0.5">
              {showReplies ? "Hide" : "View"} {comment.replies!.length}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isReply) {
    return (
      <div className="relative ml-1 sm:ml-2 animate-in fade-in slide-in-from-left-1 duration-300">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent" />
        <div className="absolute left-0 top-2 sm:top-2.5 w-2 sm:w-2.5 h-px bg-primary/20" />
        <div className="pl-2.5 sm:pl-3.5">{content}</div>
      </div>
    );
  }

  return (
    <div className={cn(own && "bg-primary/[0.02]")}>
      {content}
      {hasReplies && showReplies && (
        <div>
          {comment.replies!.map((r) => (
            <CommentRow
              key={r.id} comment={r} own={own} onReply={onReply}
              parentDisplayName={comment.display_name || "Student"}
            />
          ))}
        </div>
      )}
    </div>
  );
});

/* ─── Main Comment UI ─── */
export default function CommentUI({ partId }: CommentUIProps) {
  const { user } = useAuth();
  const { comments, loading, sending, sendComment } = useComments(partId);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [comments.length]);

  /* Scroll to input when reply target changes */
  useEffect(() => {
    if (replyTarget) inputRef.current?.focus();
  }, [replyTarget]);

  const handleSend = useCallback(async () => {
    if (!draft.trim()) return;
    const ok = await sendComment(draft, replyTarget?.id);
    if (ok) { setDraft(""); setReplyTarget(null); inputRef.current?.focus(); }
  }, [draft, replyTarget, sendComment]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/40 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/50" />
        <h3 className="text-xs sm:text-sm font-semibold text-foreground">
          Comments
          {comments.length > 0 && (
            <span className="ml-1.5 text-[10px] sm:text-xs font-normal text-muted-foreground">{comments.length}</span>
          )}
        </h3>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-muted-foreground/30" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-muted/40 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/25" />
            </div>
            <p className="text-[11px] sm:text-sm text-muted-foreground/50">No comments yet</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/30">Be the first to share your thoughts</p>
          </div>
        ) : (
          <div className="divide-y divide-border/15">
            {comments.map((c) => (
              <CommentRow
                key={c.id} comment={c} own={user?.id === c.user_id}
                onReply={(id, name) => setReplyTarget({ id, name })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Single input bar — handles both comments and replies */}
      {user ? (
        <div className="shrink-0 border-t border-border/40 bg-muted/15">
          {/* Reply indicator — only shows when replying, click X to cancel */}
          {replyTarget && (
            <div className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 border-b border-primary/10 bg-primary/[0.03] animate-in slide-in-from-bottom-1 duration-200">
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/10">
                <AtSign className="w-2.5 h-2.5 text-primary/50" />
                <span className="text-[10px] sm:text-[11px] text-primary/70 font-medium">{replyTarget.name}</span>
              </div>
              <button
                onClick={() => setReplyTarget(null)}
                className="ml-auto p-0.5 rounded hover:bg-muted/60 transition-colors"
                aria-label="Cancel reply"
              >
                <X className="w-3 h-3 text-muted-foreground/50" />
              </button>
            </div>
          )}
          <div className="p-2.5 sm:p-3">
            <div className="flex gap-1.5 sm:gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                placeholder={replyTarget ? `Reply to ${replyTarget.name}...` : "Add a comment..."}
                disabled={sending}
                rows={1}
                className="min-h-[34px] sm:min-h-[36px] max-h-[80px] resize-none text-xs sm:text-sm py-1.5 sm:py-2 px-2.5 sm:px-3 bg-background border-border/60 focus-visible:ring-primary/30"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="shrink-0 h-[34px] w-[34px] sm:h-[36px] sm:w-[36px] rounded-lg"
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              </Button>
            </div>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground/30 mt-1 px-0.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/40 p-3 sm:p-4 bg-muted/15 text-center">
          <p className="text-[11px] sm:text-xs text-muted-foreground/50">Sign in to leave a comment</p>
        </div>
      )}
    </div>
  );
}