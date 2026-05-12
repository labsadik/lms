import { useRef, useCallback, useEffect, useState, memo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useComments, type Comment } from "@/hooks/useComments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, Reply, AtSign, X, MessageSquare,
  ShieldAlert, Ban, Link2, VideoOff, MessageCircleOff,
  HelpCircle, Eye, AlertTriangle, ChevronRight,
} from "lucide-react";
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

/* ════════════════════════════════════════════════════════
   Community Guidelines Modal
   ════════════════════════════════════════════════════════ */
const GUIDELINES = [
  {
    Icon: Ban,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    title: "Zero Tolerance on Violations",
    desc: "Using abusive language, bad words, slurs, or any inappropriate content will result in 2 strict warnings. A 3rd violation means permanent ban — no exceptions, no appeals.",
  },
  {
    Icon: Link2,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    title: "No External Links or Promotion",
    desc: "Sharing links or promoting other websites — including gambling, trading, adult content, or any illegal platforms — will result in an immediate, permanent ban on the first offense itself.",
  },
  {
    Icon: VideoOff,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    title: "Live Video Processing",
    desc: "After a live session ends, the video needs processing time before it becomes available for course validation. This takes a few minutes. Do not panic or spam — wait patiently.",
  },
  {
    Icon: MessageCircleOff,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    title: "Live Chat is Teacher-Controlled",
    desc: "Live chat is NOT automatically enabled. The teacher turns it on only when the batch shows discipline, good scores, and genuine focus. It is a privilege you earn — not a right you demand.",
  },
  {
    Icon: HelpCircle,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    title: "Comments Are for Doubts Only",
    desc: "Do NOT use this section for general chatting or communication. Use it strictly for asking academic doubts and doubt-solving. Any non-academic comments may be deleted and warned.",
  },
  {
    Icon: Eye,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    title: "Strict Monitoring in Effect",
    desc: "Every user is actively monitored by our team. After purchasing the course, maintaining discipline becomes your responsibility. We enforce this to protect the learning environment for all serious students.",
  },
];

function GuidelinesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl max-h-[92vh] bg-background rounded-2xl shadow-2xl border border-border/50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-300">

        {/* ── Header ── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40 bg-gradient-to-b from-red-500/[0.04] to-transparent">
          <div className="flex items-start gap-3.5">
            <div className="shrink-0 w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground leading-snug">Community Guidelines</h3>
              <p className="text-xs text-red-500/80 font-semibold mt-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Mandatory reading before you participate
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg shrink-0 -mt-0.5 -mr-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Rules List ── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3" style={{ scrollbarWidth: "thin" }}>
          {GUIDELINES.map((rule, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3.5 p-4 rounded-xl border transition-colors",
                rule.border,
                "bg-card hover:bg-muted/30",
              )}
            >
              <div className={cn("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center", rule.bg)}>
                <rule.Icon className={cn("w-5 h-5", rule.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground/25 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h4 className="text-[13px] sm:text-sm font-bold text-foreground leading-snug">{rule.title}</h4>
                </div>
                <p className="text-xs sm:text-[13px] text-muted-foreground/80 leading-[1.65]">{rule.desc}</p>
              </div>
            </div>
          ))}

          {/* Bottom Warning Banner */}
          <div className="mt-3 p-4 rounded-xl bg-red-500/[0.06] border border-red-500/25">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-[13px] text-red-600 dark:text-red-400 font-semibold leading-[1.65]">
                Violation of any rule above can lead to account suspension or permanent ban without any refund. These rules exist to protect the learning environment for every serious student.
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-4 border-t border-border/40 bg-card">
          <Button
            onClick={onClose}
            className="w-full h-11 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90"
          >
            I Understand & Agree
          </Button>
          <p className="text-[10px] text-muted-foreground/30 text-center mt-2">
            By clicking above, you accept all guidelines and consequences of violations.
          </p>
        </div>
      </div>
    </div>
  );
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

        {/* Actions */}
        <div className="flex items-center gap-1 mt-1.5">
          <button 
            onClick={() => onReply(comment.id, comment.display_name || "Student")}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-primary transition-colors font-medium py-1 px-2 rounded-md hover:bg-primary/5"
          >
            <Reply className="w-3 h-3" />Reply
          </button>
          
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
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border/40" />
        <div className="absolute left-0 top-4 w-2.5 h-px bg-border/40" />
        <div className="pl-4 sm:pl-5">{content}</div>
      </div>
    );
  }

  return (
    <div className={cn(own && "bg-primary/[0.02] border-l-2 border-primary/20")}>
      {content}
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
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
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
      <div className="shrink-0 px-4 py-3 border-b border-border/40 flex items-center gap-2.5 bg-muted/20">
        <MessageSquare className="w-4 h-4 text-primary/70 shrink-0" />
        <h3 className="text-sm font-semibold text-foreground flex-1 min-w-0">
          Doubts & Discussion
          {comments.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setGuidelinesOpen(true)}
          className="shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.04] hover:bg-red-500/10 transition-colors group"
          aria-label="Community guidelines"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-500/70 group-hover:text-red-500 transition-colors" />
          <span className="text-[11px] font-semibold text-red-500/70 group-hover:text-red-500 transition-colors hidden sm:inline">Rules</span>
        </button>
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
              <p className="text-sm font-medium text-muted-foreground/60">No doubts asked yet</p>
              <p className="text-xs text-muted-foreground/30 mt-1 leading-relaxed">
                Ask any academic doubt about this lecture below.
              </p>
            </div>
            <button
              onClick={() => setGuidelinesOpen(true)}
              className="flex items-center gap-1.5 text-[11px] text-red-500/60 hover:text-red-500 font-semibold transition-colors mt-1"
            >
              <ShieldAlert className="w-3 h-3" />
              Read community guidelines first
            </button>
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
          
          {/* Input Area */}
          <div className="flex gap-2 items-end bg-muted/30 p-1.5 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10 transition-all">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a doubt about this lecture..."
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
          
          {/* Footer with Guidelines link */}
          <div className="flex items-center justify-between pt-0.5">
            <p className="text-[10px] text-muted-foreground/30">
              Press <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[9px]">Enter</kbd> to send
            </p>
            <button
              onClick={() => setGuidelinesOpen(true)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/30 hover:text-red-500/70 transition-colors font-medium"
            >
              <ShieldAlert className="w-2.5 h-2.5" />
              Guidelines
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/40 p-4 sm:p-6 bg-muted/10 text-center">
          <p className="text-sm text-muted-foreground/50">Sign in to ask doubts</p>
        </div>
      )}

      {/* Guidelines Modal */}
      <GuidelinesModal open={guidelinesOpen} onClose={() => setGuidelinesOpen(false)} />
    </div>
  );
}