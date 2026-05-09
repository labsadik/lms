// Video provider detection from a single `video_id` field.
// Supports YouTube IDs, Bunny.net Stream UUIDs, and live URLs (zoom/meet/etc).

export type VideoProvider = "youtube" | "bunny" | "external" | "unknown";

export interface DetectedVideo {
  provider: VideoProvider;
  /** Normalised id (YouTube id, Bunny uuid, or original string for external). */
  id: string;
  /** Embed URL (for bunny/external iframes or HLS playlist). */
  embedUrl?: string;
  /** Default thumbnail URL. */
  thumbnail: string;
}

// ✅ Bunny config — ONLY VITE_BUNNY_CDN_HOSTNAME required
// Example: "vz-3cf84610-3c6" → builds: https://vz-3cf84610-3c6.b-cdn.net/{uuid}/playlist.m3u8
export const BUNNY_CDN_HOSTNAME =
  (import.meta as any).env?.VITE_BUNNY_CDN_HOSTNAME || "vz-3cf84610-3c6";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function detectVideo(rawId: string | null | undefined): DetectedVideo {
  const id = (rawId || "").trim();
  
  if (!id) {
    return { provider: "unknown", id: "", thumbnail: "/placeholder.svg" };
  }

  // ── External URL (zoom, meet, teams, http/https link) ──
  if (/^https?:\/\//i.test(id)) {
    return {
      provider: "external",
      id,
      embedUrl: id,
      thumbnail: "/placeholder.svg",
    };
  }

  // ── Bunny.net stream (UUID format) ──
  if (UUID_RE.test(id)) {
    return {
      provider: "bunny",
      id,
      embedUrl: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/playlist.m3u8`,
      thumbnail: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/thumbnail.jpg`,
    };
  }

  // ── YouTube (exact 11-char ID) ──
  if (YT_ID_RE.test(id)) {
    return {
      provider: "youtube",
      id,
      thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
    };
  }

  // ── YouTube URL extraction ──
  const ytMatch = id.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch?.[1]) {
    const yid = ytMatch[1];
    return {
      provider: "youtube",
      id: yid,
      thumbnail: `https://img.youtube.com/vi/${yid}/maxresdefault.jpg`,
    };
  }

  // ── Fallback ──
  return { provider: "unknown", id, thumbnail: "/placeholder.svg" };
}