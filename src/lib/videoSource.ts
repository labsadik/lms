// Video provider detection from a single `video_id` field.
// Supports YouTube IDs, Bunny.net Stream UUIDs, and live URLs (zoom/meet/etc).

export type VideoProvider = "youtube" | "bunny" | "external" | "unknown";

export interface DetectedVideo {
  provider: VideoProvider;
  /** Normalised id (YouTube id, Bunny uuid, or original string for external). */
  id: string;
  /** Embed URL (for bunny/external iframes). */
  embedUrl?: string;
  /** Default thumbnail URL. */
  thumbnail: string;
}

// Bunny config — override via VITE_BUNNY_LIBRARY_ID / VITE_BUNNY_CDN_HOSTNAME.
export const BUNNY_LIBRARY_ID =
  (import.meta as any).env?.VITE_BUNNY_LIBRARY_ID || "654345";
export const BUNNY_CDN_HOSTNAME =
  (import.meta as any).env?.VITE_BUNNY_CDN_HOSTNAME || "vz-3cf84610-3c6";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function detectVideo(rawId: string | null | undefined): DetectedVideo {
  const id = (rawId || "").trim();
  if (!id) {
    return { provider: "unknown", id: "", thumbnail: "/placeholder.svg" };
  }

  // Live / external URL (zoom, meet, teams, http(s) link)
  if (/^https?:\/\//i.test(id)) {
    return {
      provider: "external",
      id,
      embedUrl: id,
      thumbnail: "/placeholder.svg",
    };
  }

  // Bunny.net stream — UUID. We play the HLS playlist directly (not the
  // iframe) so we can track real watch time client-side.
  if (UUID_RE.test(id)) {
    return {
      provider: "bunny",
      id,
      embedUrl: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/playlist.m3u8`,
      thumbnail: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/thumbnail.jpg`,
    };
  }

  // YouTube — 11-char id
  if (YT_ID_RE.test(id)) {
    return {
      provider: "youtube",
      id,
      thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
    };
  }

  // Try to extract YouTube id from a pasted URL like watch?v=... or youtu.be/
  const ytMatch =
    id.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) {
    const yid = ytMatch[1];
    return {
      provider: "youtube",
      id: yid,
      thumbnail: `https://img.youtube.com/vi/${yid}/maxresdefault.jpg`,
    };
  }

  return { provider: "unknown", id, thumbnail: "/placeholder.svg" };
}
