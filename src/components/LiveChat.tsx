import { useEffect, useState, useRef, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Radio, ChevronDown, ShieldAlert, X, AlertTriangle, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ── */
interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  message: string;
  createdAt: Timestamp | null;
}

interface LiveChatProps {
  partId: string;
}

/* ── Constants ── */
const MAX_CHAR_LIMIT = 250;
const SEND_COOLDOWN_MS = 3000; // 3 seconds

const CHAT_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#14b8a6',
  '#6366f1', '#f97316',
];

const BLOCKED_WORDS = [
  'casino', 'betting', 'gamble', 'lottery', 'poker', 'slot', 'wager',
  'fuck', 'shit', 'asshole', 'bitch', 'bastard',
  'porn', 'nsfw', 'nude', 'drug', 'cocaine', 'weed',
];

const POLICIES = [
  { icon: '🚫', title: 'No Illegal Content', desc: 'Sharing illegal websites or content is strictly prohibited.' },
  { icon: '🎰', title: 'No Gambling', desc: 'Gambling, betting, or lottery links/content are not allowed.' },
  { icon: '📞', title: 'No Phone Numbers', desc: 'Do not share personal phone numbers.' },
  { icon: '🔗', title: 'No Links', desc: 'Posting external URLs is not permitted.' },
  { icon: '🤬', title: 'No Bad Words', desc: 'Profanity, abuse, and harassment will not be tolerated.' },
  { icon: '🤝', title: 'Be Respectful', desc: 'Treat everyone with respect and kindness.' },
];

/* ── Helpers ── */
function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

function getInitial(name: string): string {
  return name?.charAt(0)?.toUpperCase() || '?';
}

function formatTime(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'now';
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function validateMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Message cannot be empty';
  if (trimmed.length > MAX_CHAR_LIMIT) return `Message exceeds ${MAX_CHAR_LIMIT} characters`;

  const urlPattern = /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*[a-z0-9]\.(com|in|io|net|org|xyz|cc|tv|me|co)[\/\s]?)/i;
  if (urlPattern.test(trimmed)) return '🔗 Links are not allowed in live chat';

  const cleaned = trimmed.replace(/[\s\-().]/g, '');
  if (/(?:\+?\d){8,}/.test(cleaned)) return '📞 Phone numbers are not allowed';

  const lower = trimmed.toLowerCase();
  for (const word of BLOCKED_WORDS) {
    if (lower.includes(word)) return '🚫 Inappropriate content detected';
  }
  return null;
}

/* ════════════════════════════════════════════════════════
   LIVE CHAT COMPONENT
   ════════════════════════════════════════════════════════ */
export default function LiveChat({ partId }: LiveChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [connected, setConnected] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  /* Smart scroll */
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLenRef = useRef(0);
  const isAtBottomRef = useRef(true);
  
  const [showPolicies, setShowPolicies] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  /* 3-Second Send Cooldown */
  const [sendCooldown, setSendCooldown] = useState(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { isAtBottomRef.current = isAtBottom; }, [isAtBottom]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  if (!db) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-6 gap-3">
        <Radio className="w-8 h-8 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground font-medium">Live chat unavailable</p>
        <p className="text-xs text-muted-foreground/60">Firebase is not configured.</p>
      </div>
    );
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (alive && data) setProfile(data);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  /* ── Firestore Real-time Listener ── */
  useEffect(() => {
    const messagesRef = collection(db!, 'live_chats', partId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(300));

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatMessage[];
      setMessages(msgs);
      setConnected(true);
      setPermissionError(false);

      // Track unread only if user scrolled up
      if (!isAtBottomRef.current && msgs.length > prevLenRef.current) {
        setUnreadCount((c) => c + (msgs.length - prevLenRef.current));
      }
      prevLenRef.current = msgs.length;
    }, (err) => {
      console.error('Firestore snapshot error:', err);
      setConnected(false);
      if (err.code === 'permission-denied') setPermissionError(true);
    });

    return () => unsub();
  }, [partId]);

  /* ── Auto-scroll when at bottom ── */
  useEffect(() => {
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [messages.length, isAtBottom]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
    setUnreadCount(0);
  }, []);

  /* ── Send Message (with 3s cooldown) ── */
  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = newMsg.trim();
    if (!user || !text || sendCooldown) return; 

    const error = validateMessage(text);
    if (error) {
      setValidationError(error);
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    setNewMsg('');
    setValidationError(null);
    
    // Start 3-second cooldown
    setSendCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => setSendCooldown(false), SEND_COOLDOWN_MS);

    try {
      const messagesRef = collection(db!, 'live_chats', partId, 'messages');
      await addDoc(messagesRef, {
        userId: user.id,
        displayName: profile?.display_name || (user.email ? user.email.split('@')[0] : 'Anonymous'),
        avatarUrl: profile?.avatar_url || null,
        message: text,
        createdAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Send failed:', err);
      setNewMsg(text); 
      if (err.code === 'permission-denied') {
        setValidationError('⚠️ Firebase permission denied. Check Rules.');
        setPermissionError(true);
      } else {
        setValidationError('⚠️ Network error. Ad-blocker might be blocking it.');
      }
      setTimeout(() => setValidationError(null), 4000);
    }
  }, [user, newMsg, partId, profile, sendCooldown]);

  return (
    <div className="flex flex-col h-full bg-card relative">
      {showPolicies && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPolicies(false)}>
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-xs w-[90%] max-h-[80%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card flex items-center justify-between px-4 pt-4 pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-sm">Community Guidelines</h3>
              </div>
              <button onClick={() => setShowPolicies(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {POLICIES.map((policy, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="text-base shrink-0 mt-0.5">{policy.icon}</span>
                  <div>
                    <p className="text-xs font-semibold">{policy.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{policy.desc}</p>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-border/40">
                <p className="text-[10px] text-muted-foreground/60 mb-3">⚠️ Violations may result in a permanent ban from chat.</p>
                <Button onClick={() => setShowPolicies(false)} className="w-full h-9 text-xs rounded-lg font-semibold" size="sm">
                  ✅ I Understand
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 py-2.5 border-b border-border/40 bg-card flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Live Chat</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowPolicies(true)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground/50 hover:text-red-500 transition-colors" title="Community Guidelines">
            <ShieldAlert className="w-3.5 h-3.5" />
          </button>
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide', permissionError ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : connected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400')}>
            {permissionError ? 'Error' : connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>

      {permissionError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3 bg-red-50/50 dark:bg-red-950/10">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">Permission Denied</p>
          <p className="text-xs text-muted-foreground max-w-[250px] leading-relaxed">
            Firebase Security Rules are blocking the chat. Please update your rules in the Firebase Console.
          </p>
        </div>
      ) : (
        <div className="flex-1 relative min-h-0">
          <div 
            ref={containerRef} 
            onScroll={handleScroll} 
            className="h-full overflow-y-auto px-2 py-2 space-y-1 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" 
            style={{ scrollbarWidth: 'none' }}
          >
            {messages.length === 0 && connected && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-2 px-4">
                <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-1">
                  <Radio className="w-6 h-6 text-muted-foreground/25" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">Waiting for messages…</p>
                <p className="text-[11px] text-muted-foreground/50">Be the first to say something! 👋</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="group flex items-start gap-2 py-1.5 px-2 rounded-xl hover:bg-muted/30 transition-colors">
                {msg.avatarUrl ? (
                  <img src={msg.avatarUrl} alt={msg.displayName} className="w-6 h-6 rounded-full shrink-0 object-cover mt-0.5 ring-1 ring-border/20" />
                ) : (
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5" style={{ backgroundColor: getUserColor(msg.userId) }}>
                    {getInitial(msg.displayName)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold truncate max-w-[100px] sm:max-w-[130px]" style={{ color: getUserColor(msg.userId) }}>
                      {msg.displayName}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 shrink-0 tabular-nums">{formatTime(msg.createdAt)}</span>
                  </div>
                  <p className="text-[12px] sm:text-[13px] text-foreground/90 break-words leading-relaxed">{msg.message}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Floating Arrow / Scroll to Bottom Button */}
          {!isAtBottom && unreadCount > 0 && (
            <div className="absolute bottom-4 right-4 z-20">
              <button
                onClick={scrollToBottom}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground h-9 px-3 rounded-full text-xs font-semibold shadow-lg hover:bg-primary/90 transition-all animate-in fade-in zoom-in-95 duration-200"
              >
                <ChevronDown className="w-4 h-4" />
                {unreadCount} new
              </button>
            </div>
          )}
        </div>
      )}

      {user ? (
        <div className="shrink-0 border-t border-border/40 bg-card p-2 sm:p-2.5">
          {validationError && (
            <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-[11px] text-red-600 dark:text-red-400 font-medium animate-in fade-in slide-in-from-bottom-1 duration-200">
              {validationError}
            </div>
          )}
          <form onSubmit={sendMessage} className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={newMsg}
              onChange={(e) => { if (e.target.value.length <= MAX_CHAR_LIMIT) setNewMsg(e.target.value); if (validationError) setValidationError(null); }}
              placeholder={sendCooldown ? "Wait 3s..." : "Say something…"}
              className="h-9 sm:h-10 text-xs sm:text-sm rounded-lg border-border/40 bg-muted/30 focus-visible:ring-1 flex-1 min-w-0"
              disabled={sendCooldown}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!newMsg.trim() || sendCooldown || permissionError}
              className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg relative"
            >
              {sendCooldown ? (
                <Timer className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>

          <div className="flex items-center justify-between mt-1 px-1">
            <span className="text-[9px] text-muted-foreground/40 truncate max-w-[60%]">
              {profile?.display_name || user.email?.split('@')[0]}
            </span>
            <span className={cn('text-[9px] tabular-nums shrink-0', newMsg.length > MAX_CHAR_LIMIT * 0.9 ? 'text-amber-500 font-semibold' : 'text-muted-foreground/30')}>
              {newMsg.length}/{MAX_CHAR_LIMIT}
            </span>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/40 p-4 text-center bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium">Log in to join the conversation</p>
        </div>
      )}
    </div>
  );
}