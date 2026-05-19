import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Play, Loader2, AlertCircle, WifiOff, Settings, X } from "lucide-react";
// @ts-ignore - Bypass broken/incomplete Plyr types
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Hls, {
  Events,
  ErrorTypes,
  type HlsConfig,
} from "hls.js";
import { detectVideo, type DetectedVideo } from "@/lib/videoSource";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerVideo {
  id: string;
  title: string;
  kind: "recorded" | "live";
  duration?: string;
  liveUrl?: string | null;
}

interface VideoPlayerProps {
  video: PlayerVideo;
  onPlayed?: () => void;
  onComplete?: () => void;
  onProgress?: (pct: number) => void;
  onMinuteWatched?: (minute: number) => void;
}

/* ═══════════════════════════════════════════════════════════════
   NETWORK DETECTION
   ═══════════════════════════════════════════════════════════════ */

type ConnectionQuality = "very-slow" | "slow" | "medium" | "fast";

interface NetworkInfo {
  quality: ConnectionQuality;
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

function getNetworkInfo(): NetworkInfo {
  try {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (conn) {
      const effectiveType = conn.effectiveType || "4g";
      const downlink = conn.downlink || 10;
      const rtt = conn.rtt || 50;
      const saveData = conn.saveData === true;
      let quality: ConnectionQuality = "fast";
      if (saveData || effectiveType === "slow-2g" || effectiveType === "2g") quality = "very-slow";
      else if (effectiveType === "3g" || downlink < 1.5) quality = "slow";
      else if (effectiveType === "4g" && downlink < 5) quality = "medium";
      return { quality, effectiveType, downlink, rtt, saveData };
    }
  } catch { /* fallback */ }
  return { quality: "medium", effectiveType: "4g", downlink: 5, rtt: 50, saveData: false };
}

function checkMobile(): boolean {
  try {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  } catch { return false; }
}

function checkLowEnd(): boolean {
  try {
    const nav = navigator as any;
    return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
  } catch { return false; }
}

/* ═══════════════════════════════════════════════════════════════
   HLS CONFIGS
   ═══════════════════════════════════════════════════════════════ */

function getRecordedHlsConfig(net: NetworkInfo, isMobile: boolean, isLowEnd: boolean): Partial<HlsConfig> {
  const base: Partial<HlsConfig> = {
    enableWorker: !isLowEnd,
    lowLatencyMode: false,
    progressive: true,
    startLevel: -1,
    capLevelToPlayerSize: true,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    maxBufferSize: 60 * 1024 * 1024,
    backBufferLength: 30,
  };
  switch (net.quality) {
    case "very-slow":
      return { ...base, maxBufferLength: 5, maxMaxBufferLength: 10, maxBufferSize: 5 * 1024 * 1024, backBufferLength: 5, startLevel: 0, testBandwidth: false, abrEwmaDefaultEstimate: 100000, manifestLoadingTimeOut: 15000, manifestLoadingMaxRetry: 6, levelLoadingTimeOut: 15000, levelLoadingMaxRetry: 6, fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 8 };
    case "slow":
      return { ...base, maxBufferLength: 10, maxMaxBufferLength: 20, maxBufferSize: 15 * 1024 * 1024, backBufferLength: 10, startLevel: 0, testBandwidth: true, abrEwmaDefaultEstimate: 250000, manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 5, levelLoadingTimeOut: 12000, levelLoadingMaxRetry: 5, fragLoadingTimeOut: 15000, fragLoadingMaxRetry: 6 };
    case "medium":
      return { ...base, maxBufferLength: 15, maxMaxBufferLength: 30, maxBufferSize: 30 * 1024 * 1024, backBufferLength: 15, testBandwidth: true, abrEwmaDefaultEstimate: 400000 };
    default:
      return { ...base, maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 60 * 1024 * 1024, backBufferLength: 30, testBandwidth: true, abrEwmaDefaultEstimate: 800000 };
  }
}

function getLiveHlsConfig(net: NetworkInfo, isMobile: boolean, isLowEnd: boolean): Partial<HlsConfig> {
  const base: Partial<HlsConfig> = {
    enableWorker: !isLowEnd,
    lowLatencyMode: net.quality === "fast",
    progressive: true,
    maxBufferLength: 10,
    maxMaxBufferLength: 20,
    maxBufferSize: 15 * 1024 * 1024,
    backBufferLength: 5,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 6,
    liveDurationInfinity: true,
    startLevel: 0,
    capLevelToPlayerSize: true,
    abrEwmaDefaultEstimate: 300000,
    manifestLoadingTimeOut: 10000,
    manifestLoadingMaxRetry: 10,
    levelLoadingTimeOut: 10000,
    levelLoadingMaxRetry: 10,
    fragLoadingTimeOut: 15000,
    fragLoadingMaxRetry: 12,
  };
  switch (net.quality) {
    case "very-slow":
      return { ...base, maxBufferLength: 3, maxMaxBufferLength: 5, maxBufferSize: 3 * 1024 * 1024, backBufferLength: 2, lowLatencyMode: false, abrEwmaDefaultEstimate: 80000, liveSyncDurationCount: 1, liveMaxLatencyDurationCount: 3, startLevel: 0, testBandwidth: false };
    case "slow":
      return { ...base, maxBufferLength: 5, maxMaxBufferLength: 10, maxBufferSize: 8 * 1024 * 1024, backBufferLength: 3, lowLatencyMode: false, abrEwmaDefaultEstimate: 150000, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 4, startLevel: 0 };
    case "medium":
      return { ...base, maxBufferLength: 8, maxMaxBufferLength: 15, maxBufferSize: 12 * 1024 * 1024, abrEwmaDefaultEstimate: 300000 };
    default:
      return { ...base, lowLatencyMode: true, maxBufferLength: 15, maxMaxBufferLength: 25, maxBufferSize: 20 * 1024 * 1024, abrEwmaDefaultEstimate: 600000 };
  }
}

/* ═══════════════════════════════════════════════════════════════
   STALL DETECTION & AUTO QUALITY DROPPER
   ═══════════════════════════════════════════════════════════════ */

class QualityManager {
  private hls: Hls | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private stallCount = 0;
  private lastStallTime = 0;
  private stallCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onStallDetected?: () => void;

  constructor(private networkInfo: NetworkInfo, onStallDetected?: () => void) {
    this.onStallDetected = onStallDetected;
  }

  attach(hls: Hls, videoEl: HTMLVideoElement) {
    this.hls = hls;
    this.videoEl = videoEl;
    this.stop();
    this.stallCheckInterval = setInterval(() => this.check(), 2000);
  }

  private check() {
    if (!this.hls || !this.videoEl) return;
    const buffering = this.videoEl.readyState < 3;
    if (this.videoEl.paused === false && buffering) {
      const now = Date.now();
      if (now - this.lastStallTime > 5000) {
        this.stallCount++;
        this.lastStallTime = now;
        this.handleStall();
      }
    }
  }

  private handleStall() {
    if (!this.hls) return;
    if (this.hls.currentLevel === 0) {
      if (this.stallCount > 3) this.onStallDetected?.();
      return;
    }
    const drop = this.stallCount <= 1 ? 1 : this.stallCount;
    const next = Math.max(0, this.hls.currentLevel - drop);
    if (next < this.hls.currentLevel) this.hls.currentLevel = next;
    if (this.stallCount >= 4) this.onStallDetected?.();
  }

  forceLowestQuality() {
    if (this.hls) this.hls.currentLevel = 0;
  }

  setQuality(level: number) {
    if (this.hls) this.hls.currentLevel = level;
  }

  resetStallCount() {
    this.stallCount = 0;
  }

  private stop() {
    if (this.stallCheckInterval) {
      clearInterval(this.stallCheckInterval);
      this.stallCheckInterval = null;
    }
  }

  destroy() {
    this.stop();
    this.hls = null;
    this.videoEl = null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   PALER PLYR THEME (injected once)
   ═══════════════════════════════════════════════════════════════ */

let _palerStyleInjected = false;
function injectPalerTheme() {
  if (_palerStyleInjected || typeof document === "undefined") return;
  _palerStyleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .paler-plyr .plyr--full-ui input[type="range"] {
      color: #7c7c7c;
    }
    .paler-plyr .plyr__controls {
      background: linear-gradient(transparent, rgba(255,255,255,0.92));
    }
    .paler-plyr .plyr__control--overlaid {
      background: rgba(255,255,255,0.9);
      color: #222;
    }
    .paler-plyr .plyr__control--overlaid:hover {
      background: #fff;
    }
    .paler-plyr .plyr__control--overlaid svg {
      fill: #222;
      stroke: #222;
    }
    .paler-plyr .plyr__control {
      color: #555;
    }
    .paler-plyr .plyr__control:hover,
    .paler-plyr .plyr__control[aria-expanded="true"] {
      color: #222;
      background: rgba(0,0,0,0.06);
    }
    .paler-plyr .plyr__control svg {
      fill: #555;
      stroke: #555;
    }
    .paler-plyr .plyr__control:hover svg,
    .paler-plyr .plyr__control[aria-expanded="true"] svg {
      fill: #222;
      stroke: #222;
    }
    .paler-plyr .plyr__menu__container .plyr__control[role="menuitemradio"][aria-checked="true"]::before {
      background: #555;
    }
    .paler-plyr .plyr__tooltip {
      background: rgba(40,40,40,0.85);
      color: #fff;
      border-radius: 6px;
      font-size: 12px;
    }
    .paler-plyr .plyr__progress__buffer {
      color: rgba(0,0,0,0.12);
    }
    .paler-plyr .plyr__progress--played {
      color: #444;
    }
    .paler-plyr .plyr__progress--seek {
      color: rgba(60,60,60,0.5);
    }
    .paler-plyr .plyr__volume {
      color: #555;
    }
    .paler-plyr .plyr__time {
      color: #666;
      font-size: 13px;
    }
    .paler-plyr .plyr__menu {
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      backdrop-filter: blur(12px);
    }
    .paler-plyr .plyr__menu__container {
      background: rgba(255,255,255,0.96);
      border-radius: 10px;
    }
    .paler-plyr .plyr__menu__label {
      color: #555;
    }
    .paler-plyr .plyr__control[role="menuitemradio"] {
      color: #555;
    }
    .paler-plyr .plyr__control[role="menuitemradio"]:hover {
      color: #222;
      background: rgba(0,0,0,0.04);
    }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════════
   MAIN VIDEO PLAYER COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function VideoPlayer({
  video,
  onPlayed,
  onComplete,
  onProgress,
  onMinuteWatched,
}: VideoPlayerProps) {

  const detected = useMemo<DetectedVideo>(() => {
    if (video.kind === "live" && video.liveUrl) {
      const url = video.liveUrl.trim();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return { provider: "fastpix_live" as const, id: "", streamUrl: url, embedUrl: url, thumbnail: "/live-stream.jpg" };
      }
    }
    return detectVideo(video.id, video.kind);
  }, [video.id, video.kind, video.liveUrl]);

  const isLive = video.kind === "live";
  const networkInfo = useMemo(getNetworkInfo, []);
  const mobile = useMemo(checkMobile, []);
  const lowEnd = useMemo(checkLowEnd, []);

  /* ── Inject paler theme once ── */
  useEffect(() => { injectPalerTheme(); }, []);

  /* ── State ── */
  const [state, setState] = useState<"thumbnail" | "loading" | "playing" | "error">("thumbnail");
  const [isBuffering, setIsBuffering] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [thumbFailed, setThumbFailed] = useState(false);
  const [networkWarning, setNetworkWarning] = useState(
    networkInfo.quality === "very-slow" || networkInfo.quality === "slow"
  );
  const [currentQuality, setCurrentQuality] = useState<number | null>(null);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; bitrate: number; level: number }[]>([]);
  const [isAutoQuality, setIsAutoQuality] = useState(true);
  const [isMutedByAutoplay, setIsMutedByAutoplay] = useState(false);

  /* ── Refs ── */
  const playerRef = useRef<any>(null);
  const playerElRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const qualityManagerRef = useRef<QualityManager | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef(0);
  const initAttemptRef = useRef(0);
  const qualityPanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Tracking Refs ── */
  const completedRef = useRef(false);
  const lastProgressEmitRef = useRef(0);
  const watchedSecondsRef = useRef(0);
  const lastTickTsRef = useRef<number | null>(null);
  const awardedMinuteRef = useRef(0);
  const playedFiredRef = useRef(false);
  const thumbFailedRef = useRef(false);
  const userInteractedRef = useRef(false);

  /* ── Stable callback refs ── */
  useEffect(() => { thumbFailedRef.current = thumbFailed; }, [thumbFailed]);
  const onPlayedRef = useRef(onPlayed);
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  const onMinuteWatchedRef = useRef(onMinuteWatched);
  useEffect(() => { onPlayedRef.current = onPlayed; }, [onPlayed]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onMinuteWatchedRef.current = onMinuteWatched; }, [onMinuteWatched]);

  /* ── Mark as playing (no delays) ── */
  const markAsPlaying = useCallback((player?: any) => {
    setState("playing");
    if (player) {
      try {
        // Try unmute immediately - if browser allows it will work
        player.muted = false;
        player.volume = 1;
        setIsMutedByAutoplay(false);
      } catch { /* noop */ }
    }
    if (!playedFiredRef.current) {
      playedFiredRef.current = true;
      onPlayedRef.current?.();
    }
  }, []);

  /* ── Unmute on user interaction ── */
  const handleUserInteraction = useCallback(() => {
    if (!userInteractedRef.current) {
      userInteractedRef.current = true;
      if (isMutedByAutoplay && playerRef.current) {
        try {
          playerRef.current.muted = false;
          playerRef.current.volume = 1;
          setIsMutedByAutoplay(false);
        } catch { /* noop */ }
      }
    }
  }, [isMutedByAutoplay]);

  /* ── Destroy ── */
  const destroyPlayer = useCallback(() => {
    if (qualityPanelTimerRef.current) {
      clearTimeout(qualityPanelTimerRef.current);
      qualityPanelTimerRef.current = null;
    }
    qualityManagerRef.current?.destroy();
    qualityManagerRef.current = null;
    if (cleanupRef.current) {
      try { cleanupRef.current(); } catch { /* noop */ }
      cleanupRef.current = null;
    }
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch { /* noop */ }
      hlsRef.current = null;
    }
    if (playerElRef.current) {
      const v = playerElRef.current.querySelector("video");
      if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
      playerElRef.current.innerHTML = "";
    }
    playedFiredRef.current = false;
    userInteractedRef.current = false;
    retryCountRef.current = 0;
    setCurrentQuality(null);
    setQualityLevels([]);
    setIsAutoQuality(true);
    setIsBuffering(false);
    setShowQualityPanel(false);
    setIsMutedByAutoplay(false);
  }, []);

  /* ── Reset on video change ── */
  useEffect(() => {
    destroyPlayer();
    setState("thumbnail");
    setIsBuffering(false);
    setErrorMsg("");
    setThumbFailed(false);
    setNetworkWarning(networkInfo.quality === "very-slow" || networkInfo.quality === "slow");
    completedRef.current = false;
    lastProgressEmitRef.current = 0;
    watchedSecondsRef.current = 0;
    lastTickTsRef.current = null;
    awardedMinuteRef.current = 0;
    initAttemptRef.current = 0;
  }, [video.id, destroyPlayer, networkInfo.quality]);

  useEffect(() => () => destroyPlayer(), [destroyPlayer]);

  /* ── Pause when tab hidden ── */
  useEffect(() => {
    const fn = () => {
      if (document.hidden && playerRef.current) {
        try { if (!playerRef.current.paused) playerRef.current.pause(); } catch { /* noop */ }
      }
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);

  /* ── Network change listener ── */
  useEffect(() => {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!conn) return;
    const fn = () => {
      const n = getNetworkInfo();
      const slow = n.quality === "very-slow" || n.quality === "slow";
      setNetworkWarning(slow);
      if (slow && hlsRef.current) qualityManagerRef.current?.forceLowestQuality();
    };
    conn.addEventListener("change", fn);
    return () => conn.removeEventListener("change", fn);
  }, []);

  /* ── Hide quality panel after inactivity ── */
  useEffect(() => {
    if (!showQualityPanel) return;
    if (qualityPanelTimerRef.current) clearTimeout(qualityPanelTimerRef.current);
    qualityPanelTimerRef.current = setTimeout(() => setShowQualityPanel(false), 4000);
    return () => {
      if (qualityPanelTimerRef.current) {
        clearTimeout(qualityPanelTimerRef.current);
        qualityPanelTimerRef.current = null;
      }
    };
  }, [showQualityPanel]);

  /* ── Plyr tracking ── */
  const attachPlyrTracking = useCallback((player: any) => {
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => {
      setIsBuffering(false);
      qualityManagerRef.current?.resetStallCount();
      lastTickTsRef.current = Date.now();
    };
    const onPause = () => { lastTickTsRef.current = null; };

    const onTimeUpdate = () => {
      try {
        const dur = player.duration || 0;
        const cur = player.currentTime || 0;
        if (dur <= 0 || !isFinite(dur)) return;
        if (!player.paused && !player.ended) {
          const now = Date.now();
          if (lastTickTsRef.current != null) {
            const d = (now - lastTickTsRef.current) / 1000;
            if (d > 0 && d < 3) watchedSecondsRef.current += d;
          }
          lastTickTsRef.current = now;
          const wMin = Math.floor(watchedSecondsRef.current / 60);
          while (awardedMinuteRef.current < wMin) {
            awardedMinuteRef.current += 1;
            onMinuteWatchedRef.current?.(awardedMinuteRef.current);
          }
        }
        const pct = Math.min(1, cur / dur);
        const now2 = Date.now();
        if (onProgressRef.current && now2 - lastProgressEmitRef.current > 2000) {
          lastProgressEmitRef.current = now2;
          onProgressRef.current(pct);
        }
        if (!completedRef.current && pct >= 0.95) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      } catch { /* noop */ }
    };

    const onEnded = () => {
      lastTickTsRef.current = null;
      setIsBuffering(false);
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    };

    player.on("waiting", onWaiting);
    player.on("canplay", onCanPlay);
    player.on("playing", onPlaying);
    player.on("pause", onPause);
    player.on("timeupdate", onTimeUpdate);
    player.on("ended", onEnded);

    return () => {
      player.off("waiting", onWaiting);
      player.off("canplay", onCanPlay);
      player.off("playing", onPlaying);
      player.off("pause", onPause);
      player.off("timeupdate", onTimeUpdate);
      player.off("ended", onEnded);
    };
  }, []);

  /* ── Wire Plyr ── */
  const wirePlayer = useCallback((player: any) => {
    // Immediately mark as playing when ready - no delay
    const onReady = () => markAsPlaying(player);
    try {
      // Check if already ready
      if (player.ready) {
        onReady();
      } else {
        player.on("ready", onReady);
      }
    } catch { /* noop */ }
    const cleanupTracking = attachPlyrTracking(player);
    cleanupRef.current = () => {
      try { player.off("ready", onReady); } catch { /* noop */ }
      cleanupTracking();
    };
  }, [markAsPlaying, attachPlyrTracking]);

  /* ── HLS error handling ── */
  const setupHlsErrorHandling = useCallback((hls: Hls, videoEl: HTMLVideoElement, isLiveStream: boolean) => {
    const qm = new QualityManager(networkInfo, () => setNetworkWarning(true));
    qm.attach(hls, videoEl);
    qualityManagerRef.current = qm;

    hls.on(Events.LEVEL_SWITCHED, (_event, data) => {
      const lvl = hls.levels[data.level];
      setCurrentQuality(data.level);
      setIsAutoQuality(hls.currentLevel === -1);
      if (lvl) console.log(`[HLS] Quality → ${lvl.height}p`);
    });

    hls.on(Events.FRAG_BUFFERED, () => {
      qm.resetStallCount();
    });

    hls.on(Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      const statusCode = data.response?.code;
      if (statusCode === 403) { setErrorMsg("Access denied. Video link may be expired."); setState("error"); return; }
      if (statusCode === 404) { setErrorMsg(isLiveStream ? "Live stream is not available." : "Video not found."); setState("error"); return; }
      if (data.type === ErrorTypes.NETWORK_ERROR) {
        const rc = retryCountRef.current;
        if (rc < 5) {
          retryCountRef.current = rc + 1;
          hls.currentLevel = 0;
          const delay = Math.min(rc * 2000, 10000);
          console.log(`[HLS] Network retry ${rc + 1}/5 in ${delay}ms`);
          setTimeout(() => {
            try { hls.startLoad(); } catch { setErrorMsg("Connection failed. Check your internet."); setState("error"); }
          }, delay);
        } else {
          setErrorMsg("Unable to connect. Please check your internet.");
          setState("error");
        }
        return;
      }
      if (data.type === ErrorTypes.MEDIA_ERROR) {
        console.log("[HLS] Media error, recovering...");
        if (data.details === "bufferStalledError") { qm.forceLowestQuality(); return; }
        try { hls.recoverMediaError(); } catch { setErrorMsg("Video playback error."); setState("error"); }
        return;
      }
      setErrorMsg(isLiveStream ? "Live stream error." : "Failed to load video.");
      setState("error");
    });
    return qm;
  }, [networkInfo]);

  /* ── Create video element ── */
  const createVideoEl = useCallback((): HTMLVideoElement => {
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.setAttribute("x5-playsinline", "");
    v.setAttribute("x5-video-player-type", "h5");
    v.setAttribute("x5-video-player-fullscreen", "true");
    v.preload = "auto";
    v.playsInline = true;
    v.autoplay = true;
    v.muted = true; // Always start muted for autoplay to work
    v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;";
    if (detected.thumbnail && !thumbFailedRef.current) v.poster = detected.thumbnail;
    return v;
  }, [detected.thumbnail]);

  /* ── Init player ── */
  const initPlayer = useCallback(async () => {
    if (!playerElRef.current) return;
    playerElRef.current.innerHTML = "";
    setErrorMsg("");
    setIsBuffering(false);
    setShowQualityPanel(false);
    initAttemptRef.current++;
    const attempt = initAttemptRef.current;
    const alive = () => attempt === initAttemptRef.current;

    if (detected.provider === "unknown" || !detected.streamUrl) {
      setErrorMsg("Unsupported video format.");
      setState("error");
      return;
    }

    const videoEl = createVideoEl();
    playerElRef.current.appendChild(videoEl);
    if (!alive()) return;

    const hlsConfig = isLive
      ? getLiveHlsConfig(networkInfo, mobile, lowEnd)
      : getRecordedHlsConfig(networkInfo, mobile, lowEnd);

    /* ═══════════ HLS.JS PATH ═══════════ */
    if (Hls.isSupported()) {
      let finalConfig: Partial<HlsConfig> = { ...hlsConfig };

      // Bunny auth token injection
      if (!isLive && detected.provider === "bunny") {
        let cachedSrc = detected.streamUrl;
        let cachedToken = "";
        let cachedExpires = "";

        try {
          if (!cachedSrc.includes("token=")) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const { data } = await supabase.functions.invoke("generate-video-url", { body: { videoPath: `/${detected.id}/playlist.m3u8` } });
              if (data?.secureUrl) cachedSrc = data.secureUrl;
            }
          }
          const u = new URL(cachedSrc);
          cachedToken = u.searchParams.get("token") || "";
          cachedExpires = u.searchParams.get("expires") || "";
        } catch { /* auth resolve failed */ }

        if (!alive()) return;

        const token = cachedToken;
        const expires = cachedExpires;

        finalConfig = {
          ...finalConfig,
          xhrSetup: (xhr: XMLHttpRequest, requestUrl: string) => {
            let url = requestUrl;
            if (token && !url.includes("token=")) {
              const sep = url.includes("?") ? "&" : "?";
              url = `${url}${sep}token=${token}&expires=${expires}`;
            }
            xhr.open("GET", url, true);
            if (networkInfo.quality === "very-slow" || networkInfo.quality === "slow") {
              xhr.timeout = 30000;
            }
          },
        };
      }

      // Slow network timeout for live
      if (isLive && (networkInfo.quality === "very-slow" || networkInfo.quality === "slow")) {
        const origSetup = finalConfig.xhrSetup;
        finalConfig = {
          ...finalConfig,
          xhrSetup: origSetup
            ? (xhr: XMLHttpRequest, url: string) => { origSetup(xhr, url); xhr.timeout = 30000; }
            : (xhr: XMLHttpRequest, url: string) => { xhr.open("GET", url, true); xhr.timeout = 30000; },
        };
      }

      const hls = new Hls(finalConfig);
      hls.loadSource(detected.streamUrl);
      hls.attachMedia(videoEl);
      hlsRef.current = hls;

      setupHlsErrorHandling(hls, videoEl, isLive);

      hls.on(Events.MANIFEST_PARSED, () => {
        if (!alive()) return;

        // Extract quality levels
        const levels = hls.levels.map((l, i) => ({ height: l.height, bitrate: l.bitrate, level: i }));
        setQualityLevels(levels);

        // Start at lowest for slow or live, otherwise auto
        if (networkInfo.quality === "very-slow" || networkInfo.quality === "slow") {
          hls.currentLevel = 0;
          setIsAutoQuality(false);
        } else if (isLive) {
          hls.currentLevel = 0;
          setIsAutoQuality(false);
        } else {
          hls.currentLevel = -1; // auto
          setIsAutoQuality(true);
        }

        // Controls - always include progress (even for live to show buffer)
        const baseControls = ["play-large", "play", "progress", "current-time", "mute", "volume", "fullscreen"];
        const fullControls = ["play-large", "play", "progress", "current-time", "duration", "mute", "volume", "settings", "airplay", "fullscreen"];

        const controls = (mobile || isLive) ? baseControls : fullControls;
        const settings = ["quality", "speed"];

        const player = new Plyr(videoEl, {
          autoplay: true,
          muted: true, // Start muted - required for autoplay
          controls,
          settings,
          hideControls: false,
          resetOnEnd: false,
          invertTime: !isLive,
          tooltips: { controls: false, seek: false },
          keyboard: { focused: true, global: false },
          clickToPlay: true,
          storage: { key: `plyr-${video.id}` },
          // Disable built-in quality menu - we use our custom one
          quality: { default: -1, options: [], forced: false, onChange: () => {} },
        });

        wirePlayer(player);
        playerRef.current = player;

        // Try to unmute after first frame - if browser allows
        const tryUnmute = () => {
          if (!alive()) return;
          try {
            const playPromise = videoEl.play();
            if (playPromise) {
              playPromise.then(() => {
                // Playback started - try unmute
                try {
                  videoEl.muted = false;
                  player.muted = false;
                  setIsMutedByAutoplay(false);
                } catch {
                  // Can't unmute - user needs to interact
                  setIsMutedByAutoplay(true);
                }
              }).catch(() => {
                // Autoplay blocked even with muted
                setIsMutedByAutoplay(true);
              });
            }
          } catch {
            setIsMutedByAutoplay(true);
          }
        };

        // Try unmute immediately after play starts
        videoEl.addEventListener("playing", tryUnmute, { once: true });

        // Also try on first user interaction
        const onFirstInteraction = () => {
          handleUserInteraction();
          document.removeEventListener("click", onFirstInteraction);
          document.removeEventListener("touchstart", onFirstInteraction);
          document.removeEventListener("keydown", onFirstInteraction);
        };
        document.addEventListener("click", onFirstInteraction, { once: true });
        document.addEventListener("touchstart", onFirstInteraction, { once: true });
        document.addEventListener("keydown", onFirstInteraction, { once: true });

        setTimeout(() => { try { window.dispatchEvent(new Event("resize")); } catch { /* noop */ } }, 100);
      });

      // Force lowest for slow recorded
      if (!isLive && (networkInfo.quality === "very-slow" || networkInfo.quality === "slow")) {
        hls.on(Events.LEVEL_LOADED, () => {
          if (alive() && hls.currentLevel > 0) hls.currentLevel = 0;
        });
      }
    }

    /* ═══════════ NATIVE HLS (Safari) ═══════════ */
    else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = detected.streamUrl;
      videoEl.addEventListener("loadedmetadata", () => {
        if (!alive()) return;
        const player = new Plyr(videoEl, {
          autoplay: true,
          muted: true,
          controls: ["play-large", "play", "progress", "mute", "volume", "fullscreen"],
        });
        wirePlayer(player);
        playerRef.current = player;
      }, { once: true });
      videoEl.addEventListener("error", () => {
        if (!alive()) return;
        setErrorMsg("Failed to load stream.");
        setState("error");
      }, { once: true });
    }

    /* ═══════════ NOT SUPPORTED ═══════════ */
    else {
      setErrorMsg("HLS not supported in this browser.");
      setState("error");
    }
  }, [detected, wirePlayer, video.id, isLive, mobile, lowEnd, networkInfo, createVideoEl, setupHlsErrorHandling, handleUserInteraction]);

  /* ── Handlers ── */
  const handlePlay = useCallback(() => {
    if (state !== "thumbnail") return;
    setState("loading");
    retryCountRef.current = 0;
    initPlayer();
  }, [state, initPlayer]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePlay(); }
  }, [handlePlay]);

  const handleRetry = useCallback(() => {
    setErrorMsg("");
    setState("thumbnail");
    retryCountRef.current = 0;
  }, []);

  const handleForceLowQuality = useCallback(() => {
    qualityManagerRef.current?.forceLowestQuality();
    if (hlsRef.current) { hlsRef.current.currentLevel = 0; setIsAutoQuality(false); }
    setNetworkWarning(false);
  }, []);

  const handleQualitySelect = useCallback((level: number) => {
    if (level === -1) {
      if (hlsRef.current) hlsRef.current.currentLevel = -1;
      setIsAutoQuality(true);
    } else {
      if (hlsRef.current) hlsRef.current.currentLevel = level;
      qualityManagerRef.current?.setQuality(level);
      setIsAutoQuality(false);
    }
    setShowQualityPanel(false);
  }, []);

  const toggleQualityPanel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowQualityPanel(prev => !prev);
  }, []);

  const activeThumb = thumbFailed ? "/placeholder.svg" : detected.thumbnail;

  // Get current quality label
  const currentQualityLabel = useMemo(() => {
    if (isAutoQuality) return "Auto";
    if (currentQuality !== null && hlsRef.current?.levels?.[currentQuality]) {
      return `${hlsRef.current.levels[currentQuality].height}p`;
    }
    return "Auto";
  }, [currentQuality, isAutoQuality]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden select-none"
      role="region"
      aria-label={`Video player: ${video.title}`}
      onClick={handleUserInteraction}
    >

      {/* THUMBNAIL */}
      {(state === "thumbnail" || state === "loading" || state === "error") && (
        <div className="absolute inset-0 z-10 bg-neutral-900">
          <img
            src={activeThumb}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
            loading="eager"
            decoding="async"
          />
        </div>
      )}

      {/* PLAY BUTTON */}
      {state === "thumbnail" && (
        <button
          type="button"
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
          onClick={handlePlay}
          onKeyDown={handleKeyDown}
          aria-label={`Play video: ${video.title}`}
          style={{ touchAction: "manipulation" }}
        >
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/35 group-active:bg-black/45 transition-colors duration-150" />
          <div className="relative z-10 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-white/95 flex items-center justify-center shadow-xl shadow-black/20 group-hover:scale-105 group-active:scale-95 transition-transform duration-150">
            <Play className="w-7 h-7 text-black fill-current ml-0.5" />
          </div>
          {video.duration && (
            <span className="absolute bottom-3 right-3 z-10 px-2.5 py-1 text-xs font-semibold bg-black/60 text-white/90 rounded-lg backdrop-blur-sm tabular-nums">
              {video.duration}
            </span>
          )}
          {isLive && (
            <span className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-red-600/90 text-white rounded-lg backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
            </span>
          )}
        </button>
      )}

      {/* LOADING */}
      {state === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 text-white/90 animate-spin" />
            </div>
            <span className="text-xs font-medium text-white/70 tracking-wide">
              {networkInfo.quality === "very-slow" ? "Loading on slow connection…" : "Loading video…"}
            </span>
          </div>
        </div>
      )}

      {/* ERROR */}
      {state === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-4 text-center max-w-[320px]">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{errorMsg || "Failed to load video"}</p>
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <button
                onClick={handleRetry}
                className="flex-1 px-5 py-2.5 text-sm font-semibold bg-white/95 hover:bg-white active:bg-white/90 text-black rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 min-h-[44px]"
                style={{ touchAction: "manipulation" }}
              >
                Try Again
              </button>
              {hlsRef.current && (
                <button
                  onClick={handleForceLowQuality}
                  className="flex-1 px-5 py-2.5 text-sm font-semibold bg-white/15 hover:bg-white/25 active:bg-white/20 text-white rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 min-h-[44px]"
                  style={{ touchAction: "manipulation" }}
                >
                  Low Quality
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BUFFERING SPINNER */}
      {state === "playing" && isBuffering && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-white/90 animate-spin" />
            <span className="text-xs text-white/60 font-medium">Buffering…</span>
          </div>
        </div>
      )}

      {/* MUTED INDICATOR (when autoplay-muted) */}
      {state === "playing" && isMutedByAutoplay && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUserInteraction();
            if (playerRef.current) {
              try { playerRef.current.muted = false; playerRef.current.volume = 1; setIsMutedByAutoplay(false); } catch { /* noop */ }
            }
          }}
          className="absolute bottom-14 left-3 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-white/85 hover:bg-white text-gray-800 rounded-lg text-xs font-semibold shadow-lg transition-colors cursor-pointer backdrop-blur-sm"
          style={{ touchAction: "manipulation" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          Tap to unmute
        </button>
      )}

      {/* NETWORK WARNING BANNER */}
      {state === "playing" && networkWarning && (
        <div
          className="absolute top-3 left-3 z-50 flex items-center gap-2 px-3 py-1.5 bg-yellow-400/90 text-black rounded-lg text-xs font-semibold shadow-lg cursor-pointer hover:bg-yellow-300 transition-colors"
          onClick={handleForceLowQuality}
          title="Click to switch to lowest quality"
          style={{ touchAction: "manipulation" }}
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span>Slow connection</span>
          <span className="hidden sm:inline">• Tap for low quality</span>
        </div>
      )}

      {/* LIVE BADGE (during playback) */}
      {state === "playing" && isLive && (
        <div className="absolute top-3 left-3 z-50 flex items-center gap-1.5 px-2.5 py-1 bg-red-600/90 text-white rounded-lg text-xs font-bold backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          CUSTOM QUALITY CHANGER BUTTON + PANEL
          ═══════════════════════════════════════════════ */}
      {state === "playing" && qualityLevels.length > 0 && (
        <>
          {/* Quality toggle button */}
          <button
            onClick={toggleQualityPanel}
            className="absolute bottom-14 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/80 hover:bg-white text-gray-800 rounded-lg text-xs font-semibold shadow-lg transition-all cursor-pointer backdrop-blur-sm border border-white/50"
            style={{ touchAction: "manipulation" }}
            title="Change quality"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="tabular-nums">{currentQualityLabel}</span>
          </button>

          {/* Quality panel */}
          {showQualityPanel && (
            <div
              className="absolute bottom-24 right-3 z-[60] bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200/60 overflow-hidden min-w-[160px]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Quality</span>
                <button
                  onClick={() => setShowQualityPanel(false)}
                  className="p-0.5 rounded hover:bg-gray-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>

              {/* Auto option */}
              <button
                onClick={() => handleQualitySelect(-1)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                  isAutoQuality
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-700 hover:bg-gray-50 font-medium"
                }`}
              >
                <span>Auto</span>
                {isAutoQuality && (
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                )}
              </button>

              {/* Quality levels - sorted high to low */}
              {[...qualityLevels]
                .sort((a, b) => b.height - a.height)
                .map((q) => (
                  <button
                    key={q.level}
                    onClick={() => handleQualitySelect(q.level)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                      !isAutoQuality && currentQuality === q.level
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-gray-700 hover:bg-gray-50 font-medium"
                    }`}
                  >
                    <span>{q.height}p</span>
                    {(!isAutoQuality && currentQuality === q.level) && (
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
            </div>
          )}
        </>
      )}

      {/* PLYR MOUNT */}
      <div
        ref={playerElRef}
        className={`paler-plyr plyr-container absolute inset-0 z-30 ${
          state === "playing" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
}