import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Play, Loader2 } from "lucide-react";
// @ts-ignore
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Hls from "hls.js";
import { detectVideo } from "@/lib/videoSource";

export interface PlayerVideo {
  id: string;
  title: string;
  /** Optional override; auto-derived from id when omitted. */
  thumbnail?: string;
  duration?: string;
}

interface VideoPlayerProps {
  video: PlayerVideo;
  onPlayed?: () => void;
  /** Fired exactly once when the user has watched ≥95% of the video. */
  onComplete?: () => void;
  /** Fired with current watch progress (0..1) at most once per second. */
  onProgress?: (pct: number) => void;
  /** Fired each time the user crosses a new whole-minute of *watched* time (1, 2, 3 ...). */
  onMinuteWatched?: (minute: number) => void;
}

const VideoPlayer = ({ video, onPlayed, onComplete, onProgress, onMinuteWatched }: VideoPlayerProps) => {
  const detected = useMemo(() => detectVideo(video.id), [video.id]);
  const thumbnail = video.thumbnail || detected.thumbnail;

  const [state, setState] = useState<"thumbnail" | "loading" | "playing">("thumbnail");
  const [isSeeking, setIsSeeking] = useState(false);
  const playerRef = useRef<Plyr | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerElRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const lastProgressEmitRef = useRef(0);
  const watchedSecondsRef = useRef(0);
  const lastTickTsRef = useRef<number | null>(null);
  const awardedMinuteRef = useRef(0);
  const minuteIntervalRef = useRef<number | null>(null);

  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }
    if (playerElRef.current) {
      const v = playerElRef.current.querySelector("video") as any;
      if (v?._hls) { try { v._hls.destroy(); } catch {} }
    }
    if (minuteIntervalRef.current) {
      window.clearInterval(minuteIntervalRef.current);
      minuteIntervalRef.current = null;
    }
    if (playerElRef.current) playerElRef.current.innerHTML = "";
  }, []);

  useEffect(() => {
    destroyPlayer();
    setState("thumbnail");
    setIsSeeking(false);
    completedRef.current = false;
    lastProgressEmitRef.current = 0;
    watchedSecondsRef.current = 0;
    lastTickTsRef.current = null;
    awardedMinuteRef.current = 0;
  }, [video.id, destroyPlayer]);

  useEffect(() => {
    return () => destroyPlayer();
  }, [destroyPlayer]);

  const attachPlyrTracking = useCallback((player: Plyr) => {
    player.on("ready", () => {
      setState("playing");
      try { player.muted = false; player.volume = 1; } catch {}
      onPlayed?.();
    });
    player.on("seeking", () => { setIsSeeking(true); lastTickTsRef.current = null; });
    player.on("seeked", () => setIsSeeking(false));
    player.on("waiting", () => setIsSeeking(true));
    player.on("playing", () => { setIsSeeking(false); lastTickTsRef.current = Date.now(); });
    player.on("pause", () => { lastTickTsRef.current = null; });

    player.on("timeupdate", () => {
      try {
        const dur = player.duration || 0;
        const cur = player.currentTime || 0;
        if (dur <= 0) return;

        if (!player.paused) {
          const now = Date.now();
          if (lastTickTsRef.current != null) {
            const delta = (now - lastTickTsRef.current) / 1000;
            if (delta > 0 && delta < 2) watchedSecondsRef.current += delta;
          }
          lastTickTsRef.current = now;

          const wholeMinutes = Math.floor(watchedSecondsRef.current / 60);
          while (awardedMinuteRef.current < wholeMinutes) {
            awardedMinuteRef.current += 1;
            onMinuteWatched?.(awardedMinuteRef.current);
          }
        }

        const pct = Math.min(1, cur / dur);
        const now2 = Date.now();
        if (onProgress && now2 - lastProgressEmitRef.current > 1000) {
          lastProgressEmitRef.current = now2;
          onProgress(pct);
        }
        if (!completedRef.current && pct >= 0.95) {
          completedRef.current = true;
          onComplete?.();
        }
      } catch {}
    });

    player.on("ended", () => {
      lastTickTsRef.current = null;
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    });
  }, [onPlayed, onProgress, onComplete, onMinuteWatched]);

  const initPlayer = useCallback(() => {
    if (!playerElRef.current) return;
    playerElRef.current.innerHTML = "";

    // ---- External (zoom/meet/http link) — iframe, no tracking possible ----
    if (detected.provider === "external") {
      const iframe = document.createElement("iframe");
      iframe.src = detected.embedUrl!;
      iframe.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;";
      iframe.allowFullscreen = true;
      iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;";
      playerElRef.current.appendChild(iframe);
      setState("playing");
      onPlayed?.();
      return;
    }

    // ---- Bunny.net via HLS.js + Plyr (real watch tracking) ----
    if (detected.provider === "bunny") {
      const video = document.createElement("video");
      video.setAttribute("playsinline", "");
      video.crossOrigin = "anonymous";
      video.style.cssText = "width:100%;height:100%;";
      playerElRef.current.appendChild(video);

      const src = detected.embedUrl!;
      const startPlyr = () => {
        const player = new Plyr(video, {
          controls: ["play-large","play","progress","current-time","duration","captions","settings","pip","airplay","fullscreen"],
          autoplay: true, ratio: "16:9", hideControls: true, resetOnEnd: false, muted: false, volume: 1,
        });
        attachPlyrTracking(player);
        playerRef.current = player;
      };

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, startPlyr);
        (video as any)._hls = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        startPlyr();
      } else {
        video.src = src;
        startPlyr();
      }
      return;
    }

    // ---- YouTube via Plyr ----
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-plyr-provider", "youtube");
    wrapper.setAttribute("data-plyr-embed-id", detected.id);
    playerElRef.current.appendChild(wrapper);

    const player = new Plyr(wrapper, {
      controls: ["play-large","play","progress","current-time","duration","captions","settings","pip","airplay","fullscreen"],
      youtube: { noCookie: true, rel: 0, showinfo: 0, iv_load_policy: 3, modestbranding: 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
      autoplay: true, ratio: "16:9", hideControls: true, resetOnEnd: false, muted: false, volume: 1,
    });
    attachPlyrTracking(player);
    playerRef.current = player;
  }, [detected, attachPlyrTracking, onPlayed]);

  const handlePlay = useCallback(() => {
    setState("loading");
    setTimeout(() => {
      initPlayer();
    }, 300);
  }, [initPlayer]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-player overflow-hidden">
      {/* Thumbnail + Play Button */}
      {state === "thumbnail" && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer group"
          style={{
            backgroundImage: `url(${video.thumbnail})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          onClick={handlePlay}
        >
          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 transition-all duration-300" />
          <div className="relative z-10 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-[68px] lg:h-[68px] rounded-full bg-accent/90 group-hover:bg-accent flex items-center justify-center shadow-lg shadow-accent/40 group-hover:shadow-accent/60 group-hover:scale-110 transition-all duration-300">
            <Play className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-accent-foreground ml-0.5 fill-current" />
          </div>
        </div>
      )}

      {/* Loading State with thumbnail background */}
      {state === "loading" && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{
            backgroundImage: `url(${video.thumbnail})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 flex flex-col items-center gap-2.5">
            <Loader2 className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 text-accent animate-spin" />
            <span className="text-[11px] sm:text-xs md:text-sm font-semibold text-foreground/90 tracking-wider uppercase">
              Loading...
            </span>
          </div>
        </div>
      )}

      {/* Seeking/Buffering overlay on top of playing video */}
      {state === "playing" && isSeeking && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <Loader2 className="w-9 h-9 sm:w-10 sm:h-10 text-accent animate-spin" />
            <span className="text-[10px] sm:text-xs font-semibold text-foreground/80 tracking-wider uppercase">
              Buffering...
            </span>
          </div>
        </div>
      )}

      {/* Plyr Player Container */}
      <div
        ref={playerElRef}
        className={`absolute inset-0 z-30 plyr-container ${state === "playing" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
    </div>
  );
};

export default VideoPlayer;
