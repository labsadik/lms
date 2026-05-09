import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";
// @ts-ignore - Plyr's official types are incomplete
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Hls from "hls.js";
import { detectVideo, DetectedVideo } from "@/lib/videoSource";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerVideo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: string;
}

interface VideoPlayerProps {
  video: PlayerVideo;
  onPlayed?: () => void;
  onComplete?: () => void;
  onProgress?: (pct: number) => void;
  onMinuteWatched?: (minute: number) => void;
}

const VideoPlayer = ({
  video,
  onPlayed,
  onComplete,
  onProgress,
  onMinuteWatched,
}: VideoPlayerProps) => {
  const detected = useMemo<DetectedVideo>(() => detectVideo(video.id), [video.id]);
  const thumbnail = video.thumbnail || detected.thumbnail;

  const [state, setState] = useState<"thumbnail" | "loading" | "playing" | "error">("thumbnail");
  const [isSeeking, setIsSeeking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const playerRef = useRef<Plyr | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerElRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completedRef = useRef(false);
  const lastProgressEmitRef = useRef(0);
  const watchedSecondsRef = useRef(0);
  const lastTickTsRef = useRef<number | null>(null);
  const awardedMinuteRef = useRef(0);
  const playedFiredRef = useRef(false);

  /* ─── Safety timeout helpers ─── */
  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const startSafetyTimer = useCallback(() => {
    clearSafetyTimer();
    safetyTimerRef.current = setTimeout(() => {
      setState((prev) => (prev === "loading" ? "playing" : prev));
      if (!playedFiredRef.current) {
        playedFiredRef.current = true;
        onPlayed?.();
      }
    }, 4000);
  }, [clearSafetyTimer, onPlayed]);

  /* ─── Centralised "mark as playing" ─── */
  const markAsPlaying = useCallback(
    (player?: Plyr | null) => {
      clearSafetyTimer();
      setState("playing");
      if (player) {
        try {
          player.muted = false;
          player.volume = 1;
        } catch {
          /* noop */
        }
      }
      if (!playedFiredRef.current) {
        playedFiredRef.current = true;
        onPlayed?.();
      }
    },
    [clearSafetyTimer, onPlayed],
  );

  /* ─── Destroy ─── */
  const destroyPlayer = useCallback(() => {
    clearSafetyTimer();
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        /* noop */
      }
      hlsRef.current = null;
    }
    if (playerElRef.current) {
      const v = playerElRef.current.querySelector("video");
      if (v) {
        v.pause();
        v.src = "";
        v.removeAttribute("src");
        v.load();
      }
      playerElRef.current.innerHTML = "";
    }
    playedFiredRef.current = false;
  }, [clearSafetyTimer]);

  /* ─── Reset on video change ─── */
  useEffect(() => {
    destroyPlayer();
    setState("thumbnail");
    setIsSeeking(false);
    setErrorMsg("");
    completedRef.current = false;
    lastProgressEmitRef.current = 0;
    watchedSecondsRef.current = 0;
    lastTickTsRef.current = null;
    awardedMinuteRef.current = 0;
  }, [video.id, destroyPlayer]);

  useEffect(() => () => destroyPlayer(), [destroyPlayer]);

  /* ─── Plyr event tracking (no ready handler — handled outside) ─── */
  const attachPlyrTracking = useCallback(
    (player: Plyr) => {
      const onSeeking = () => {
        setIsSeeking(true);
        lastTickTsRef.current = null;
      };
      const onSeeked = () => setIsSeeking(false);
      const onWaiting = () => setIsSeeking(true);
      const onPlaying = () => {
        setIsSeeking(false);
        lastTickTsRef.current = Date.now();
      };
      const onPause = () => {
        lastTickTsRef.current = null;
      };

      const onTimeUpdate = () => {
        try {
          const dur = player.duration || 0;
          const cur = player.currentTime || 0;
          if (dur <= 0) return;

          if (!player.paused && !player.ended) {
            const now = Date.now();
            if (lastTickTsRef.current != null) {
              const delta = (now - lastTickTsRef.current) / 1000;
              if (delta > 0 && delta < 2) watchedSecondsRef.current += delta;
            }
            lastTickTsRef.current = now;

            const wholeMin = Math.floor(watchedSecondsRef.current / 60);
            while (awardedMinuteRef.current < wholeMin) {
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
        } catch {
          /* noop */
        }
      };

      const onEnded = () => {
        lastTickTsRef.current = null;
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      };

      const onError = () => {
        setErrorMsg("Failed to load video");
        setState("error");
      };

      player.on("seeking", onSeeking);
      player.on("seeked", onSeeked);
      player.on("waiting", onWaiting);
      player.on("playing", onPlaying);
      player.on("pause", onPause);
      player.on("timeupdate", onTimeUpdate);
      player.on("ended", onEnded);
      player.on("error", onError);

      return () => {
        player.off("seeking", onSeeking);
        player.off("seeked", onSeeked);
        player.off("waiting", onWaiting);
        player.off("playing", onPlaying);
        player.off("pause", onPause);
        player.off("timeupdate", onTimeUpdate);
        player.off("ended", onEnded);
        player.off("error", onError);
      };
    },
    [onProgress, onComplete, onMinuteWatched],
  );

  /* ─── Wire up ready + tracking together ─── */
  const wirePlayer = useCallback(
    (player: Plyr) => {
      const onReady = () => markAsPlaying(player);

      // *** KEY FIX: check if ready already fired (mobile race condition) ***
      try {
        if ((player as any).ready) onReady();
      } catch {
        /* noop */
      }
      player.on("ready", onReady);

      const cleanupTracking = attachPlyrTracking(player);

      return () => {
        player.off("ready", onReady);
        cleanupTracking();
      };
    },
    [markAsPlaying, attachPlyrTracking],
  );

  /* ─── Init player ─── */
  const initPlayer = useCallback(async () => {
    if (!playerElRef.current) return;
    playerElRef.current.innerHTML = "";
    setErrorMsg("");

    // Start safety net timer — forces playing if nothing else does
    startSafetyTimer();

    if (detected.provider === "unknown") {
      setErrorMsg("Unsupported video format");
      setState("error");
      return;
    }

    /* ── External embed ── */
    if (detected.provider === "external" && detected.embedUrl) {
      try {
        const iframe = document.createElement("iframe");
        iframe.src = detected.embedUrl;
        iframe.allow =
          "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen";
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.loading = "lazy";
        iframe.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;border:0;";
        iframe.title = video.title || "External video";
        iframe.sandbox =
          "allow-same-origin allow-scripts allow-popups allow-forms";
        iframe.onload = () => markAsPlaying();
        iframe.onerror = () => {
          setErrorMsg("Failed to load external video");
          setState("error");
        };
        playerElRef.current.appendChild(iframe);
      } catch {
        setErrorMsg("Failed to load video");
        setState("error");
      }
      return;
    }

    /* ── YouTube ── */
    if (detected.provider === "youtube" && detected.id) {
      try {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-plyr-provider", "youtube");
        wrapper.setAttribute("data-plyr-embed-id", detected.id);
        playerElRef.current.appendChild(wrapper);

        const player = new Plyr(wrapper, {
          controls: [
            "play-large",
            "play",
            "progress",
            "current-time",
            "duration",
            "captions",
            "settings",
            "pip",
            "airplay",
            "fullscreen",
          ],
          youtube: {
            noCookie: true,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
          },
          autoplay: true,
          ratio: "16:9",
          hideControls: false,
          resetOnEnd: false,
          muted: false,
          volume: 1,
          tooltips: { controls: true, seek: true },
          keyboard: { focused: true, global: false },
          clickToPlay: true,
          storage: { key: `plyr-yt-${video.id}` },
        });

        wirePlayer(player);
        playerRef.current = player;
        setTimeout(() => {
          try {
            (player as any).emit?.("resize");
          } catch {
            /* noop */
          }
        }, 100);
      } catch {
        setErrorMsg("Failed to load YouTube video");
        setState("error");
      }
      return;
    }

    /* ── Bunny HLS ── */
    if (detected.provider === "bunny") {
      try {
        let src = detected.embedUrl;

        if (!src) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) {
            throw new Error("Please sign in to watch this video");
          }

          const { data, error } = await supabase.functions.invoke(
            "generate-video-url",
            {
              body: { videoPath: `/${detected.id}/playlist.m3u8` },
            },
          );

          if (error || !data?.secureUrl) {
            throw new Error(error?.message || "Failed to authenticate video");
          }
          src = data.secureUrl;
        }

        const videoEl = document.createElement("video");
        videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("webkit-playsinline", "");
        videoEl.setAttribute("x5-playsinline", "");
        videoEl.preload = "auto"; // was "metadata" — "auto" lets browser fetch sooner
        videoEl.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;";
        playerElRef.current.appendChild(videoEl);

        const bootPlyr = () => {
          try {
            const player = new Plyr(videoEl, {
              controls: [
                "play-large",
                "play",
                "progress",
                "current-time",
                "duration",
                "captions",
                "settings",
                "airplay",
                "fullscreen",
              ],
              settings: ["captions", "quality", "speed"],
              autoplay: true,
              ratio: "16:9",
              hideControls: false,
              resetOnEnd: false,
              muted: false,
              volume: 1,
              invertTime: true,
              tooltips: { controls: true, seek: true },
              keyboard: { focused: true, global: false },
              clickToPlay: true,
              storage: { key: `plyr-bunny-${video.id}` },
            });

            wirePlayer(player);
            playerRef.current = player;
            setTimeout(() => {
              try {
                (player as any).emit?.("resize");
              } catch {
                /* noop */
              }
            }, 100);
          } catch {
            setErrorMsg("Failed to initialize player");
            setState("error");
          }
        };

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            testBandwidth: false, // skip bandwidth probe → faster first frame on mobile
            progressive: true,
            startLevel: -1,
            abrEwmaDefaultEstimate: 500000, // assume 500 kbps → pick lower quality fast
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 3,
            levelLoadingTimeOut: 10000,
            levelLoadingMaxRetry: 3,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 3,
          });
          hls.loadSource(src);
          hls.attachMedia(videoEl);
          hls.on(Hls.Events.MANIFEST_PARSED, bootPlyr);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR)
                hls.recoverMediaError();
              else {
                setErrorMsg("Failed to load video stream");
                setState("error");
              }
            }
          });
          hlsRef.current = hls;
        } else if (
          videoEl.canPlayType("application/vnd.apple.mpegurl")
        ) {
          // Native HLS (Safari / iOS)
          videoEl.src = src;

          // *** FIX: readyState may already be ≥ 1 from a cached response ***
          if (videoEl.readyState >= 1) {
            bootPlyr();
          } else {
            videoEl.addEventListener("loadedmetadata", bootPlyr, { once: true });
          }
          videoEl.addEventListener("error", () => {
            setErrorMsg("Failed to load video");
            setState("error");
          });
        } else {
          setErrorMsg("Your browser doesn't support HLS video");
          setState("error");
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Video authentication failed");
        setState("error");
      }
      return;
    }

    setErrorMsg("Unsupported video provider");
    setState("error");
  }, [detected, wirePlayer, startSafetyTimer, video.id, video.title]);

  /* ─── User actions ─── */
  const handlePlay = useCallback(() => {
    if (state !== "thumbnail") return;
    setState("loading");
    initPlayer();
  }, [state, initPlayer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePlay();
      }
    },
    [handlePlay],
  );

  const handleRetry = useCallback(() => {
    setErrorMsg("");
    setState("thumbnail");
  }, []);

  const thumbnailStyle = useMemo<React.CSSProperties>(() => {
    if (!thumbnail) return {};
    return {
      backgroundImage: `url(${thumbnail})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }, [thumbnail]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden"
      role="region"
      aria-label={`Video player: ${video.title}`}
    >
      {/* Ghost thumbnail – stays visible during loading to prevent black flash */}
      {(state === "thumbnail" || state === "loading") && thumbnail && (
        <div className="absolute inset-0 z-10" style={thumbnailStyle} />
      )}

      {/* Play button – only on initial thumbnail */}
      {state === "thumbnail" && (
        <button
          type="button"
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
          onClick={handlePlay}
          onKeyDown={handleKeyDown}
          aria-label={`Play video: ${video.title}`}
        >
          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 transition-colors duration-200" />
          <div className="relative z-10 w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-white/95 hover:bg-white flex items-center justify-center shadow-xl shadow-black/30 group-hover:scale-105 active:scale-95 transition-transform duration-150">
            <Play className="w-6 h-6 sm:w-7 sm:h-7 text-black fill-current ml-0.5" />
          </div>
          {video.duration && (
            <span className="absolute bottom-2.5 right-2.5 z-10 px-2 py-0.5 text-[11px] font-medium bg-black/75 text-white rounded-md backdrop-blur-sm tabular-nums">
              {video.duration}
            </span>
          )}
        </button>
      )}

      {/* Loading spinner */}
      {state === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
              <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 text-white animate-spin" />
            </div>
            <span className="text-xs font-medium text-white/80 tracking-wide">
              Loading video…
            </span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center p-6"
          style={thumbnail ? thumbnailStyle : {}}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-3 text-center max-w-[280px]">
            <AlertCircle className="w-9 h-9 text-red-400" />
            <p className="text-sm text-white/90 leading-relaxed">
              {errorMsg || "Failed to load video"}
            </p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 text-sm font-medium bg-white/95 hover:bg-white text-black rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Buffering overlay during playback */}
      {state === "playing" && isSeeking && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-spin" />
          </div>
        </div>
      )}

      {/* Plyr mount point */}
      <div
        ref={playerElRef}
        className={`plyr-container absolute inset-0 z-30 ${
          state === "playing" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
};

export default VideoPlayer;