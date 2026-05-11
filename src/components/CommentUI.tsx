import { useRef, useCallback, useEffect, useState, memo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useComments, type Comment } from "@/hooks/useComments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Reply, AtSign, X, MessageSquare } from "lucide-react";
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
  // Hidden by default
  const [showReplies, setShowReplies] = useState(false);
  const hasReplies = comment.replies && comment.replies.length > 0;
  const isReply = !!parentDisplayName;

  const content = (
    <div className="flex gap-3 py-3 px-4 group hover:bg-muted/30 transition-colors duration-150">
      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary/20 to-muted border border-border/50 flex items-center justify-center overflow-hidden shadow-sm">
        {comment.avatar_url ? (
          <img src={comment.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-xs font-bold text-primary/70">
            {(comment.display_name || "S").charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Meta */}
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className={cn(
            "text-xs sm:text-sm font-semibold leading-none",
            own ? "text-primary" : "text-foreground"
          )}>
            {comment.display_name || "Student"}
            {own && <span className="ml-1 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">You</span>}
          </span>
          {isReply && parentDisplayName && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/5 border border-primary/10 shrink-0">
              <AtSign className="w-2.5 h-2.5 text-primary/40" />
              <span className="text-[10px] text-primary/60 font-medium">{parentDisplayName}</span>
            </span>
          )}
          <span className="text-[10px] sm:text-[11px] text-muted-foreground/40 ml-auto">{timeAgo(comment.created_at)}</span>
        </div>
        
        {/* Message */}
        <p className="text-[13px] sm:text-sm text-foreground/90 leading-relaxed break-words whitespace-pre-wrap mt-1">
          {comment.message}
        </p>

        {/* Actions - Both visible by default */}
        <div className="flex items-center gap-1 mt-1.5">
          {/* Reply button - Always visible now */}
          <button 
            onClick={() => onReply(comment.id, comment.display_name || "Student")}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-primary transition-colors font-medium py-1 px-2 rounded-md hover:bg-primary/5"
          >
            <Reply className="w-3 h-3" />Reply
          </button>
          
          {/* View Replies button - Always visible */}
          {hasReplies && (
            <button 
              onClick={() => setShowReplies((v) => !v)}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors font-medium py-1 px-2 rounded-md hover:bg-muted/50"
            >
              {showReplies ? "Hide" : "View"} {comment.replies!.length} replies
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isReply) {
    return (
      <div className="relative ml-2 sm:ml-4 animate-in fade-in slide-in-from-left-1 duration-300">
        {/* Thread Line */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border/40" />
        <div className="absolute left-0 top-4 w-2.5 h-px bg-border/40" />
        <div className="pl-4 sm:pl-5">{content}</div>
      </div>
    );
  }

  return (
    <div className={cn(own && "bg-primary/[0.02] border-l-2 border-primary/20")}>
      {content}
      {/* Replies only show when "View X replies" is clicked */}
      {hasReplies && showReplies && (
        <div className="bg-muted/10">
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
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border/40 flex items-center gap-2 bg-muted/20">
        <MessageSquare className="w-4 h-4 text-primary/70" />
        <h3 className="text-sm font-semibold text-foreground">
          Discussion
          {comments.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </h3>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-muted-foreground/20" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground/60">No comments yet</p>
              <p className="text-xs text-muted-foreground/30 mt-1">Start the conversation by sharing your thoughts below.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {comments.map((c) => (
              <CommentRow
                key={c.id} comment={c} own={user?.id === c.user_id}
                onReply={(id, name) => setReplyTarget({ id, name })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input Bar */}
      {user ? (
        <div className="shrink-0 border-t border-border/40 bg-card p-3 sm:p-4 space-y-2">
          {/* Reply Target Pill */}
          {replyTarget && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10 animate-in slide-in-from-bottom-1 duration-200">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background shadow-sm border border-border/50">
                <AtSign className="w-3 h-3 text-primary/60" />
                <span className="text-xs text-primary/80 font-medium">{replyTarget.name}</span>
              </div>
              <button
                onClick={() => setReplyTarget(null)}
                className="ml-auto p-1 rounded-md hover:bg-muted transition-colors"
                aria-label="Cancel reply"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground/60" />
              </button>
            </div>
          )}
          
          {/* Unified Input Area */}
          <div className="flex gap-2 items-end bg-muted/30 p-1.5 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10 transition-all">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder={replyTarget ? `Reply to ${replyTarget.name}...` : "Add to the discussion..."}
              disabled={sending}
              rows={1}
              className="min-h-[36px] max-h-[100px] resize-none text-sm py-2 px-3 bg-transparent border-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="shrink-0 h-9 w-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm disabled:opacity-30"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          
          <p className="text-[10px] text-muted-foreground/30 text-center pt-0.5">
            Press <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[9px]">Enter</kbd> to send
          </p>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/40 p-4 sm:p-6 bg-muted/10 text-center">
          <p className="text-sm text-muted-foreground/50">Sign in to join the discussion</p>
        </div>
      )}
    </div>
  );
}