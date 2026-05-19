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
  createdAt: number | null;
}

interface LiveChatProps {
  partId: string;
}

/* ── Constants ── */
const MAX_CHAR_LIMIT = 250;
const MESSAGE_COOLDOWN = 3500; // 🛡️ 3.5 seconds visual loader & spam protection
const MAX_MESSAGES = 150; // ⏳ Memory optimization for long streams

const CHAT_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1', '#f97316',
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
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

function getInitial(name: string): string {
  return name?.charAt(0)?.toUpperCase() || '?';
}

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
  if (trimmed.length > MAX_CHAR_LIMIT) return `Max ${MAX_CHAR_LIMIT} characters`;
  const urlPattern = /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*[a-z0-9]\.(com|in|io|net|org|xyz|cc|tv|me|co)[\/\s]?)/i;
  if (urlPattern.test(trimmed)) return '🔗 Links are not allowed';
  const cleaned = trimmed.replace(/[\s\-().]/g, '');
  if (/(?:\+?\d){8,}/.test(cleaned)) return '📞 Phone numbers are not allowed';
  const lower = trimmed.toLowerCase();
  for (const word of BLOCKED_WORDS) if (lower.includes(word)) return '🚫 Inappropriate content';
  return null;
}

function getChannelName(partId: string): string {
  return `live-chats:${partId.replace(/[^a-zA-Z0-9._:-]/g, '_')}`;
}

function toChatMsg(msg: any): ChatMessage {
  return { id: msg.id, userId: msg.data.userId, displayName: msg.data.displayName, avatarUrl: msg.data.avatarUrl, message: msg.data.message, createdAt: msg.timestamp };
}

/* ════════════════════════════════════════════════════════
   LIGHT MODE PROFESSIONAL STREAMING LIVE CHAT
   ════════════════════════════════════════════════════════ */
export default function LiveChat({ partId }: LiveChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const isAtBottomRef = useRef(true);

  const [showPolicies, setShowPolicies] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCooldown, setIsCooldown] = useState(false); // 🛡️ 3.5 Sec Loader State

  useEffect(() => { isAtBottomRef.current = isAtBottom; }, [isAtBottom]);

  if (!ably) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-6 gap-3 bg-card">
        <Radio className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Live chat unavailable</p>
      </div>
    );
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle();
      if (alive && data) setProfile(data);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!ably) return;
    const channelName = getChannelName(partId);
    const channel = ably.channels.get(channelName);

    const suppressStrictModeErrors = (stateChange: any) => {
      if (stateChange.reason?.message?.includes('superseded')) stateChange.reason = null;
    };
    channel.on(suppressStrictModeErrors);

    const onMessage = (msg: any) => {
      const chatMsg = toChatMsg(msg);
      setMessages(prev => {
        if (prev.some(m => m.id === chatMsg.id)) return prev;
        const updated = [...prev, chatMsg];
        return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
      });
    };

    channel.subscribe('chat-message', onMessage);

    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    channel.history({ limit: MAX_MESSAGES, direction: 'forwards', start: thirtyMinAgo }).then((page) => {
      const historyMsgs = page.items.map(toChatMsg);
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newHistoryMsgs = historyMsgs.filter(m => !existingIds.has(m.id));
        const allMsgs = [...newHistoryMsgs, ...prev];
        allMsgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return allMsgs.slice(-MAX_MESSAGES);
      });
      setConnected(true);
      setConnectionError(false);
    }).catch(() => setConnectionError(true));

    const onConnectionChange = (stateChange: any) => {
      setConnected(stateChange.current === 'connected');
      if (['failed', 'suspended'].includes(stateChange.current)) setConnectionError(true);
    };
    ably.connection.on(onConnectionChange);
    setConnected(ably.connection.state === 'connected');

    return () => {
      channel.off(suppressStrictModeErrors);
      channel.unsubscribe('chat-message', onMessage);
      ably.connection.off(onConnectionChange);
    };
  }, [partId]);

  useEffect(() => {
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [messages.length, isAtBottom]);

  useEffect(() => {
    if (!isAtBottomRef.current && messages.length > prevLenRef.current) {
      setUnreadCount(c => c + (messages.length - prevLenRef.current));
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

  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = newMsg.trim();
    if (!user || !text || isCooldown) return;

    const error = validateMessage(text);
    if (error) { setValidationError(error); setTimeout(() => setValidationError(null), 3000); return; }

    setNewMsg('');
    setValidationError(null);
    setIsCooldown(true); // 🛡️ START 3.5 SECOND LOADER

    try {
      const channel = ably!.channels.get(getChannelName(partId));
      await channel.publish('chat-message', {
        userId: user.id,
        displayName: profile?.display_name || (user.email ? user.email.split('@')[0] : 'Anonymous'),
        avatarUrl: profile?.avatar_url || null,
        message: text,
      });
    } catch (err: any) {
      setNewMsg(text);
      setValidationError('⚠️ Failed to send.');
      setTimeout(() => setValidationError(null), 4000);
    } finally {
      setTimeout(() => setIsCooldown(false), MESSAGE_COOLDOWN); // Keep loader for 3.5s
    }
  }, [user, newMsg, partId, profile, isCooldown]);

  return (
    <div className="flex flex-col h-full bg-card relative overflow-hidden">
      <style>{`
        @keyframes bounceLoader { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        .dot-loader span { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background-color: currentColor; animation: bounceLoader 1.4s infinite ease-in-out both; }
        .dot-loader span:nth-child(1) { animation-delay: -0.32s; }
        .dot-loader span:nth-child(2) { animation-delay: -0.16s; }
        .dot-loader span:nth-child(3) { animation-delay: 0s; }
      `}</style>

      {/* ── Policies Modal ── */}
      {showPolicies && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPolicies(false)}>
          <div className="bg-card rounded-xl shadow-2xl border border-border max-w-xs w-[90%] max-h-[80%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40">
              <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-500" /><h3 className="font-bold text-sm">Community Guidelines</h3></div>
              <button onClick={() => setShowPolicies(false)} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted/50"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {POLICIES.map((policy, i) => (<div key={i} className="flex items-start gap-2"><span className="text-sm shrink-0">{policy.icon}</span><div><p className="text-xs font-semibold">{policy.title}</p><p className="text-[10px] text-muted-foreground">{policy.desc}</p></div></div>))}
              <Button onClick={() => setShowPolicies(false)} variant="default" className="w-full h-8 text-xs rounded-lg mt-2" size="sm">✅ I Understand</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stream Header (Light Mode) ── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border/40 bg-card flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">Live Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPolicies(true)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground/50 hover:text-red-500 transition-colors"><ShieldAlert className="w-3.5 h-3.5" /></button>
          <span className={cn('text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider', connectionError ? 'bg-red-100 text-red-700' : connected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>
            {connectionError ? 'Error' : connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>

      {/* ── Messages ── */}
      {connectionError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3 bg-red-50/50">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-sm font-semibold text-red-600">Connection Error</p>
        </div>
      ) : (
        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none]" style={{ scrollbarWidth: 'none' }}>
          {messages.length === 0 && connected && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-2 px-4">
              <p className="text-xs text-muted-foreground/50">Be the first to chat! 👋</p>
            </div>
          )}

          <div className="py-2 space-y-0.5">
            {messages.map((msg) => (
              <div key={msg.id} className="group flex items-start gap-2.5 px-4 py-1.5 hover:bg-muted/30 transition-colors">
                {msg.avatarUrl ? (
                  <img src={msg.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5 object-cover ring-1 ring-border/30" />
                ) : (
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white mt-0.5 shadow-sm" style={{ backgroundColor: getUserColor(msg.userId) }}>{getInitial(msg.displayName)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold truncate max-w-[120px]" style={{ color: getUserColor(msg.userId) }}>{msg.displayName}</span>
                    <span className="text-[8px] text-muted-foreground/40 shrink-0 tabular-nums">{formatTime(msg.createdAt)}</span>
                  </div>
                  <p className="text-[13px] text-foreground/90 break-words leading-snug">{msg.message}</p>
                </div>
              </div>
            ))}
          </div>
          <div ref={endRef} />
        </div>
      )}

      {/* ── Unread Badge ── */}
      {!isAtBottom && unreadCount > 0 && !connectionError && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
          <button onClick={scrollToBottom} className="flex items-center gap-1.5 bg-foreground text-background px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg hover:opacity-90 transition-opacity">
            <ChevronDown className="w-3 h-3" /> {unreadCount} new
          </button>
        </div>
      )}

      {/* ── Light Mode Input Area ── */}
      {user ? (
        <div className="shrink-0 border-t border-border/40 bg-card z-20 p-3">
          {validationError && (
            <div className="mb-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-[10px] text-red-600 font-medium">{validationError}</div>
          )}
          <form onSubmit={sendMessage} className="flex items-center gap-2">
            <Input
              value={newMsg}
              onChange={(e) => { if (e.target.value.length <= MAX_CHAR_LIMIT) setNewMsg(e.target.value); if (validationError) setValidationError(null); }}
              placeholder="Say something…"
              disabled={isCooldown}
              className="h-10 text-sm rounded-xl border-border/50 bg-muted/40 focus-visible:ring-1 focus-visible:ring-primary/30 text-foreground placeholder:text-muted-foreground/50 flex-1 min-w-0 px-4"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!newMsg.trim() || connectionError || isCooldown} 
              className="h-10 w-10 shrink-0 rounded-xl bg-foreground text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground transition-all"
            >
              {isCooldown ? (
                <div className="dot-loader flex items-center justify-center gap-[3px]"><span></span><span></span><span></span></div>
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[9px] text-muted-foreground/40 truncate max-w-[60%]">{profile?.display_name || user.email?.split('@')[0]}</span>
            <span className={cn('text-[9px] tabular-nums shrink-0', newMsg.length > MAX_CHAR_LIMIT * 0.9 ? 'text-amber-500 font-semibold' : 'text-muted-foreground/30')}>
              {newMsg.length}/{MAX_CHAR_LIMIT}
            </span>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/40 p-4 text-center bg-muted/20">
          <p className="text-[10px] text-muted-foreground font-medium">Log in to join the conversation</p>
        </div>
      )}
    </div>
  );
}