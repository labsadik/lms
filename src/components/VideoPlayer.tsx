import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";
// @ts-ignore - Plyr's official types are incomplete
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Hls from "hls.js";
import { detectVideo, type DetectedVideo } from "@/lib/videoSource";
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

/* Device helpers — wrapped in try/catch for SSR + strict TS */
function checkMobile(): boolean {
  try {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  } catch {
    return false;
  }
}

function checkLowEnd(): boolean {
  try {
    const n = navigator as any;
    return (n.hardwareConcurrency <= 4) || (n.deviceMemory <= 2);
  } catch {
    return false;
  }
}

function checkSaveData(): boolean {
  try {
    return (navigator as any).connection?.saveData === true;
  } catch {
    return false;
  }
}

/* Component*/
export default function VideoPlayer({
  video,
  onPlayed,
  onComplete,
  onProgress,
  onMinuteWatched,
}: VideoPlayerProps) {
  const detected = useMemo<DetectedVideo>(() => detectVideo(video.id), [video.id]);
  const thumbnailSrc = video.thumbnail || detected.thumbnail;

  const [state, setState] = useState<"thumbnail" | "loading" | "playing" | "error">("thumbnail");
  const [isSeeking, setIsSeeking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [thumbFailed, setThumbFailed] = useState(false);

  const playerRef = useRef<Plyr | null>(null);
  const playerElRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const completedRef = useRef(false);
  const lastProgressEmitRef = useRef(0);
  const watchedSecondsRef = useRef(0);
  const lastTickTsRef = useRef<number | null>(null);
  const awardedMinuteRef = useRef(0);
  const playedFiredRef = useRef(false);
  const thumbFailedRef = useRef(false);

  /* Keep thumbFailedRef in sync — read inside initPlayer to avoid stale dep */
  useEffect(() => {
    thumbFailedRef.current = thumbFailed;
  }, [thumbFailed]);

  /* Refs for callback props — prevents stale closures in event handlers */
  const onPlayedRef = useRef(onPlayed);
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  const onMinuteWatchedRef = useRef(onMinuteWatched);
  useEffect(() => { onPlayedRef.current = onPlayed; }, [onPlayed]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onMinuteWatchedRef.current = onMinuteWatched; }, [onMinuteWatched]);

  const mobile = useMemo(checkMobile, []);
  const lowEnd = useMemo(checkLowEnd, []);
  const saveData = useMemo(checkSaveData, []);

  /* ── Safety timer ── */
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
        onPlayedRef.current?.();
      }
    }, mobile ? 8000 : 5000);
  }, [clearSafetyTimer, mobile]);

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
        onPlayedRef.current?.();
      }
    },
    [clearSafetyTimer]
  );

  /* ── Full teardown — also calls wirePlayer cleanup ── */
  const destroyPlayer = useCallback(() => {
    clearSafetyTimer();
    if (cleanupRef.current) {
      try {
        cleanupRef.current();
      } catch {
        /* noop */
      }
      cleanupRef.current = null;
    }
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
        v.removeAttribute("src");
        v.load();
      }
      playerElRef.current.innerHTML = "";
    }
    playedFiredRef.current = false;
  }, [clearSafetyTimer]);

  /* ── Reset on video change ── */
  useEffect(() => {
    destroyPlayer();
    setState("thumbnail");
    setIsSeeking(false);
    setErrorMsg("");
    setThumbFailed(false);
    completedRef.current = false;
    lastProgressEmitRef.current = 0;
    watchedSecondsRef.current = 0;
    lastTickTsRef.current = null;
    awardedMinuteRef.current = 0;
  }, [video.id, destroyPlayer]);

  useEffect(() => () => destroyPlayer(), [destroyPlayer]);

  /* ── Pause when tab goes background ── */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && playerRef.current) {
        try {
          if (!playerRef.current.paused) playerRef.current.pause();
        } catch {
          /* noop */
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /*  Plyr tracking — empty deps, reads everything from refs */
  const attachPlyrTracking = useCallback((player: Plyr) => {
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
            onMinuteWatchedRef.current?.(awardedMinuteRef.current);
          }
        }

        const pct = Math.min(1, cur / dur);
        const now2 = Date.now();
        if (onProgressRef.current && now2 - lastProgressEmitRef.current > 1000) {
          lastProgressEmitRef.current = now2;
          onProgressRef.current(pct);
        }
        if (!completedRef.current && pct >= 0.95) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      } catch {
        /* noop */
      }
    };

    const onEnded = () => {
      lastTickTsRef.current = null;
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wirePlayer = useCallback(
    (player: Plyr) => {
      const onReady = () => markAsPlaying(player);
      try {
        if ((player as any).ready) onReady();
      } catch {
        /* noop */
      }
      player.on("ready", onReady);
      const cleanupTracking = attachPlyrTracking(player);
      cleanupRef.current = () => {
        player.off("ready", onReady);
        cleanupTracking();
      };
    },
    [markAsPlaying, attachPlyrTracking]
  );

    //  Init
  
  const initPlayer = useCallback(async () => {
    if (!playerElRef.current) return;
    playerElRef.current.innerHTML = "";
    setErrorMsg("");
    startSafetyTimer();

    if (detected.provider === "unknown") {
      setErrorMsg("Unsupported video format");
      setState("error");
      return;
    }

    /* ── EXTERNAL ── */
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

    /* ── YOUTUBE ── */
    if (detected.provider === "youtube" && detected.id) {
      try {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-plyr-provider", "youtube");
        wrapper.setAttribute("data-plyr-embed-id", detected.id);
        playerElRef.current.appendChild(wrapper);

        const player = new Plyr(wrapper, {
          controls: mobile
            ? [
                "play-large",
                "play",
                "progress",
                "current-time",
                "fullscreen",
              ]
            : [
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
          tooltips: { controls: !mobile, seek: !mobile },
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
        }, 150);
      } catch {
        setErrorMsg("Failed to load YouTube video");
        setState("error");
      }
      return;
    }

    /* ── BUNNY HLS ── */
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
            { body: { videoPath: `/${detected.id}/playlist.m3u8` } }
          );

          if (error || !data?.secureUrl) {
            throw new Error(error?.message || "Failed to authenticate video");
          }
          src = data.secureUrl;
        }

        let tokenParam = "";
        let expiresParam = "";
        try {
          const urlObj = new URL(src);
          tokenParam = urlObj.searchParams.get("token") || "";
          expiresParam = urlObj.searchParams.get("expires") || "";
        } catch {
          /* noop */
        }

        const videoEl = document.createElement("video");
        videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("webkit-playsinline", "");
        videoEl.setAttribute("x5-playsinline", "");
        videoEl.setAttribute("x5-video-player-type", "h5");
        videoEl.preload = "auto";
        videoEl.playsInline = true;
        videoEl.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;";

        // Read from ref — avoids adding thumbFailed to deps
        if (thumbnailSrc && !thumbFailedRef.current) {
          videoEl.poster = thumbnailSrc;
        }

        playerElRef.current.appendChild(videoEl);

        const baseControls = [
          "play-large",
          "play",
          "progress",
          "current-time",
          "fullscreen",
        ];
        const fullControls = [
          "play-large",
          "play",
          "progress",
          "current-time",
          "duration",
          "captions",
          "settings",
          "airplay",
          "fullscreen",
        ];

        const bootPlyr = () => {
          try {
            const player = new Plyr(videoEl, {
              controls: mobile ? baseControls : fullControls,
              settings: ["quality", "speed"],
              autoplay: true,
              ratio: "16:9",
              hideControls: false,
              resetOnEnd: false,
              muted: false,
              volume: 1,
              invertTime: true,
              tooltips: { controls: !mobile, seek: !mobile },
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
            }, 150);
          } catch {
            setErrorMsg("Failed to initialize player");
            setState("error");
          }
        };

        if (Hls.isSupported()) {
          const maxBuf = saveData ? 10 : mobile ? 15 : 30;
          const maxMaxBuf = saveData ? 20 : mobile ? 30 : 60;
          const maxBufSize = saveData
            ? 10 * 1024 * 1024
            : mobile
              ? 15 * 1024 * 1024
              : 60 * 1024 * 1024;
          const startEstimate = saveData
            ? 200000
            : mobile
              ? 300000
              : 500000;

          const hls = new Hls({
            enableWorker: !lowEnd,
            lowLatencyMode: false,
            backBufferLength: mobile ? 15 : 30,
            maxBufferLength: maxBuf,
            maxMaxBufferLength: maxMaxBuf,
            maxBufferSize: maxBufSize,
            testBandwidth: !mobile,
            progressive: true,
            startLevel: -1,
            abrEwmaDefaultEstimate: startEstimate,
            xhrSetup: (xhr: XMLHttpRequest, requestUrl: string) => {
              if (tokenParam && !requestUrl.includes("token=")) {
                const sep = requestUrl.includes("?") ? "&" : "?";
                xhr.open(
                  "GET",
                  `${requestUrl}${sep}token=${tokenParam}&expires=${expiresParam}`,
                  true
                );
              }
            },
          });

          hls.loadSource(src);
          hls.attachMedia(videoEl);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hls.on("hlsManifestParsed" as any, (_event: any, data: any) => {
            if (mobile && data?.levels?.length > 1) {
              const midIdx = Math.max(0, Math.floor(data.levels.length / 3));
              hls.currentLevel = midIdx;
            }
            bootPlyr();
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hls.on("hlsError" as any, (_event: any, data: any) => {
            if (data?.fatal) {
              const statusCode =
                data.response?.code || data.context?.response?.code;

              if (statusCode === 403) {
                setErrorMsg(
                  "Access denied. Video link may be expired or your CDN domain settings need updating."
                );
                setState("error");
                return;
              }

              if (data.type === "networkError") {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const retryCount = (hls as any)._retryCount || 0;
                if (retryCount < 3) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (hls as any)._retryCount = retryCount + 1;
                  setTimeout(() => hls.startLoad(), mobile ? 1500 : 500);
                } else {
                  setErrorMsg(
                    "Network error. Please check your connection and try again."
                  );
                  setState("error");
                }
              } else if (data.type === "mediaError") {
                hls.recoverMediaError();
              } else {
                setErrorMsg("Failed to load video stream");
                setState("error");
              }
            }
          });

          hlsRef.current = hls;
        } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
          videoEl.src = src;
          if (videoEl.readyState >= 1) {
            bootPlyr();
          } else {
            videoEl.addEventListener("loadedmetadata", bootPlyr, { once: true });
          }

          videoEl.addEventListener(
            "error",
            () => {
              const mediaErr = videoEl.error;
              let msg = "Failed to load video";
              if (mediaErr?.message?.includes("403")) {
                msg = "Access denied. Video link may be expired.";
              } else if (mediaErr?.code === MediaError.MEDIA_ERR_NETWORK) {
                msg = "Network error. Check your connection.";
              }
              setErrorMsg(msg);
              setState("error");
            },
            { once: true }
          );
        } else {
          setErrorMsg("Your browser doesn't support HLS video");
          setState("error");
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Video authentication failed";
        setErrorMsg(message);
        setState("error");
      }
      return;
    }

    setErrorMsg("Unsupported video provider");
    setState("error");
  }, [
    detected,
    wirePlayer,
    startSafetyTimer,
    video.id,
    video.title,
    mobile,
    lowEnd,
    saveData,
    thumbnailSrc,
  ]);

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
    [handlePlay]
  );

  const handleRetry = useCallback(() => {
    setErrorMsg("");
    setState("thumbnail");
  }, []);

  const activeThumb = thumbFailed ? "/placeholder.svg" : thumbnailSrc;

  // Set fetchpriority imperatively — avoids TS type error and React warning
  const setThumbPriority = useCallback((el: HTMLImageElement | null) => {
    if (el) {
      el.setAttribute("fetchpriority", "high");
    }
  }, []);

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden select-none"
      role="region"
      aria-label={`Video player: ${video.title}`}
    >
      {/* ── THUMBNAIL ── */}
      {(state === "thumbnail" || state === "loading") && (
        <div className="absolute inset-0 z-10 bg-neutral-900">
          <img
            ref={setThumbPriority}
            src={activeThumb}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
            loading="eager"
            decoding="async"
          />
        </div>
      )}

      {/* ── PLAY BUTTON ── */}
      {state === "thumbnail" && (
        <button
          type="button"
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
          onClick={handlePlay}
          onKeyDown={handleKeyDown}
          aria-label={`Play video: ${video.title}`}
          style={{ touchAction: "manipulation" }}
        >
          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 group-active:bg-black/55 transition-colors duration-200" />
          <div className="relative z-10 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-white/95 flex items-center justify-center shadow-xl shadow-black/30 group-hover:scale-105 group-active:scale-95 transition-transform duration-150">
            <Play className="w-7 h-7 text-black fill-current ml-0.5" />
          </div>
          {video.duration && (
            <span className="absolute bottom-3 right-3 z-10 px-2.5 py-1 text-xs font-semibold bg-black/75 text-white rounded-lg backdrop-blur-sm tabular-nums">
              {video.duration}
            </span>
          )}
        </button>
      )}

      {/* ── LOADING SPINNER ── */}
      {state === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
              <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 text-white animate-spin" />
            </div>
            <span className="text-xs font-medium text-white/80 tracking-wide">
              Loading video…
            </span>
          </div>
        </div>
      )}

      {/* ── ERROR OVERLAY ── */}
      {state === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-neutral-900">
            <img
              src={activeThumb}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30"
              onError={() => setThumbFailed(true)}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-4 text-center max-w-[300px]">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm text-white/90 leading-relaxed">
              {errorMsg || "Failed to load video"}
            </p>
            <button
              onClick={handleRetry}
              className="px-5 py-2.5 text-sm font-semibold bg-white/95 hover:bg-white active:bg-white/90 text-black rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 min-h-[44px]"
              style={{ touchAction: "manipulation" }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── BUFFERING OVERLAY ── */}
      {state === "playing" && isSeeking && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/20" />
          <Loader2 className="relative z-10 w-8 h-8 sm:w-10 sm:h-10 text-white animate-spin" />
        </div>
      )}

      {/* ── PLYR MOUNT POINT ── */}
      <div
        ref={playerElRef}
        className={`plyr-container absolute inset-0 z-30 ${
          state === "playing" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
}