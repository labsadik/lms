import { useEffect, useState, useRef, useCallback } from 'react';
import { ably } from '@/lib/ably';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Radio, ChevronDown, ShieldAlert, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ── */
interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  message: string;
  createdAt: number | null; // Ably timestamp = milliseconds
}

interface LiveChatProps {
  partId: string;
}

/* ── Constants ── */
const MAX_CHAR_LIMIT = 250;

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

// Adapted for Ably: timestamp is a number (ms) instead of Firestore Timestamp
function formatTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'now';
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// Ably channel names only allow: a-zA-Z0-9 . _ : -
function getChannelName(partId: string): string {
  return `live-chats:${partId.replace(/[^a-zA-Z0-9._:-]/g, '_')}`;
}

// Convert Ably message → our ChatMessage type
function toChatMsg(msg: any): ChatMessage {
  return {
    id: msg.id,
    userId: msg.data.userId,
    displayName: msg.data.displayName,
    avatarUrl: msg.data.avatarUrl,
    message: msg.data.message,
    createdAt: msg.timestamp,
  };
}

/* ════════════════════════════════════════════════════════
   LIVE CHAT COMPONENT
   ════════════════════════════════════════════════════════ */
export default function LiveChat({ partId }: LiveChatProps) {
  const { user } = useAuth(); // Supabase Auth
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLenRef = useRef(0);
  const isAtBottomRef = useRef(true);

  const [showPolicies, setShowPolicies] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false); // State for send button loader

  useEffect(() => { isAtBottomRef.current = isAtBottom; }, [isAtBottom]);

  /* ── Fallback if Ably not configured ── */
  if (!ably) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-6 gap-3">
        <Radio className="w-8 h-8 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground font-medium">Live chat unavailable</p>
        <p className="text-xs text-muted-foreground/60">Ably is not configured.</p>
      </div>
    );
  }

  /* ── Load Supabase Profile (Auth handled by Supabase) ── */
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

  /* ── Ably Real-time Subscription + History ── */
  useEffect(() => {
    if (!ably) return;
    
    const channelName = getChannelName(partId);
    const channel = ably.channels.get(channelName);

    // ✅ FIX: Suppress React 18 Strict Mode race condition errors
    const suppressStrictModeErrors = (stateChange: any) => {
      if (stateChange.reason?.message?.includes('superseded')) {
        stateChange.reason = null; 
      }
    };
    channel.on(suppressStrictModeErrors);

    // Message handler
    const onMessage = (msg: any) => {
      const chatMsg = toChatMsg(msg);
      setMessages((prev) => {
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        const updated = [...prev, chatMsg];
        return updated.length > 300 ? updated.slice(-300) : updated;
      });
    };

    // Subscribe FIRST to not miss any real-time messages
    channel.subscribe('chat-message', onMessage);

    // Load message history
    channel.history({ limit: 300, direction: 'forwards' }).then((page) => {
      const historyMsgs = page.items.map(toChatMsg);

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newHistoryMsgs = historyMsgs.filter((m) => !existingIds.has(m.id));
        const allMsgs = [...newHistoryMsgs, ...prev];
        allMsgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return allMsgs.slice(-300);
      });

      setConnected(true);
      setConnectionError(false);
    }).catch((err) => {
      console.error('Ably history error:', err);
      setConnectionError(true);
    });

    // Track Ably connection state
    const onConnectionChange = (stateChange: any) => {
      setConnected(stateChange.current === 'connected');
      if (stateChange.current === 'failed' || stateChange.current === 'suspended') {
        setConnectionError(true);
      }
    };
    ably.connection.on(onConnectionChange);
    setConnected(ably.connection.state === 'connected');

    return () => {
      channel.off(suppressStrictModeErrors);
      channel.unsubscribe('chat-message', onMessage);
      ably.connection.off(onConnectionChange);
      // 🚨 DO NOT ADD channel.detach() HERE! That causes the superseded error.
    };
  }, [partId]);

  /* ── Auto-scroll to bottom ── */
  useEffect(() => {
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [messages.length, isAtBottom]);

  /* ── Track unread count ── */
  useEffect(() => {
    if (!isAtBottomRef.current && messages.length > prevLenRef.current) {
      setUnreadCount((c) => c + (messages.length - prevLenRef.current));
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

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

  /* ── Send Message (Requires Supabase User) ── */
  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = newMsg.trim();
    if (!user || !text || isSending) return; // Prevent double-sending

    const error = validateMessage(text);
    if (error) {
      setValidationError(error);
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    setNewMsg('');
    setValidationError(null);
    setIsSending(true); // Start 3-dot loader

    try {
      const channel = ably!.channels.get(getChannelName(partId));
      await channel.publish('chat-message', {
        userId: user.id, // Save Supabase User ID
        displayName: profile?.display_name || (user.email ? user.email.split('@')[0] : 'Anonymous'),
        avatarUrl: profile?.avatar_url || null,
        message: text,
      });
    } catch (err: any) {
      console.error('Send failed:', err);
      setNewMsg(text); // Restore text on failure
      if (err.code === 401 || err.code === 403) {
        setValidationError('⚠️ Ably authentication failed. Check your API key.');
      } else if (err.code === 429) {
        setValidationError('⚠️ Rate limit exceeded. Please wait a moment.');
      } else {
        setValidationError('⚠️ Failed to send message. Please try again.');
      }
      setTimeout(() => setValidationError(null), 4000);
    } finally {
      setIsSending(false); // Stop 3-dot loader
    }
  }, [user, newMsg, partId, profile, isSending]);

  return (
    <div className="flex flex-col h-full bg-card relative">
      {/* ── Policies Modal ── */}
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

      {/* ── Header ── */}
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
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide', connectionError ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : connected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400')}>
            {connectionError ? 'Error' : connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>

      {/* ── Connection Error State ── */}
      {connectionError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3 bg-red-50/50 dark:bg-red-950/10">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">Connection Error</p>
          <p className="text-xs text-muted-foreground max-w-[250px] leading-relaxed">
            Unable to connect to Ably. Please check your API key and internet connection.
          </p>
        </div>
      ) : (
        /* ── Messages ── */
        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ scrollbarWidth: 'none' }}>
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
      )}

      {/* ── Unread Badge ── */}
      {!isAtBottom && unreadCount > 0 && !connectionError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <button onClick={scrollToBottom} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-200">
            <ChevronDown className="w-3 h-3" /> {unreadCount} new
          </button>
        </div>
      )}

      {/* ── Input Area ── */}
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
              placeholder="Say something…"
              className="h-9 sm:h-10 text-xs sm:text-sm rounded-lg border-border/40 bg-muted/30 focus-visible:ring-1 flex-1 min-w-0"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!newMsg.trim() || connectionError || isSending} 
              className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg"
            >
              {isSending ? (
                /* ✅ 3-Dot Bouncing Loader */
                <div className="flex items-center justify-center gap-[3px]">
                  <span className="w-[4px] h-[4px] bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-[4px] h-[4px] bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-[4px] h-[4px] bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
          <div className="flex items-center justify-between mt-1 px-1">
            <span className="text-[9px] text-muted-foreground/40 truncate max-w-[60%]">{profile?.display_name || user.email?.split('@')[0]}</span>
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