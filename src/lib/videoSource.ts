// videoSource.ts
export type VideoProvider = "bunny" | "fastpix_live" | "unknown";

export interface DetectedVideo {
  provider: VideoProvider;
  id: string;
  embedUrl: string | null;
  streamUrl: string | null;
  thumbnail: string;
}

export const BUNNY_CDN_HOSTNAME = 
  import.meta.env.VITE_BUNNY_CDN_HOSTNAME || "vz-3cf84610-3c6";

export const FASTPIX_STREAM_BASE = 
  import.meta.env.VITE_FASTPIX_STREAM_BASE || "https://stream.fastpix.io";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function detectVideo(
  rawId: string | null | undefined,
  kind: "recorded" | "live" = "recorded"
): DetectedVideo {
  
  const id = (rawId || "").trim();
  
  if (!id || !UUID_RE.test(id)) {
    return { 
      provider: "unknown", 
      id: "", 
      embedUrl: null, 
      streamUrl: null, 
      thumbnail: "/placeholder.svg" 
    };
  }

  if (kind === "live") {
    return {
      provider: "fastpix_live",
      id,
      embedUrl: null,
      // ✅ Ensures https:// is used
      streamUrl: `${FASTPIX_STREAM_BASE}/${id}.m3u8`,
      thumbnail: "/assets/live-stream.png",
    };
  }
  
  if (kind === "recorded") {
    return {
      provider: "bunny",
      id,
      embedUrl: null,
      streamUrl: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/playlist.m3u8`,
      thumbnail: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/thumbnail.jpg`,
    };
  }

  return { 
    provider: "unknown", 
    id, 
    embedUrl: null, 
    streamUrl: null, 
    thumbnail: "/placeholder.svg" 
  };
}














// // Video provider detection from a single `video_id` field.
// // Supports YouTube IDs, Bunny.net Stream UUIDs, and live URLs (zoom/meet/etc).

// export type VideoProvider = "youtube" | "bunny" | "external" | "unknown";

// export interface DetectedVideo {
//   provider: VideoProvider;
//   /** Normalised id (YouTube id, Bunny uuid, or original string for external). */
//   id: string;
//   /** Embed URL. Returns NULL for Bunny because it requires a secure backend token. */
//   embedUrl: string | null;
//   /** Default thumbnail URL. */
//   thumbnail: string;
// }

// // ✅ ONLY this goes in your .env file
// export const BUNNY_CDN_HOSTNAME = import.meta.env.VITE_BUNNY_CDN_HOSTNAME || "vz-3cf84610-3c6";

// // ❌ DO NOT ADD THE TOKEN KEY HERE. 
// // It must be added in Supabase Dashboard -> Settings -> Edge Functions -> Secrets
// // Secret Name: BUNNY_TOKEN_AUTH_KEY

// const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// export function detectVideo(rawId: string | null | undefined): DetectedVideo {
//   const id = (rawId || "").trim();
  
//   if (!id) {
//     return { provider: "unknown", id: "", embedUrl: null, thumbnail: "/placeholder.svg" };
//   }

//   // ── External URL (zoom, meet, teams, http/https link) ──
//   if (/^https?:\/\//i.test(id)) {
//     return {
//       provider: "external",
//       id,
//       embedUrl: id,
//       thumbnail: "/placeholder.svg",
//     };
//   }

//   // ── Bunny.net stream (UUID format) ──
//   if (UUID_RE.test(id)) {
//     return {
//       provider: "bunny",
//       id,
//       embedUrl: null, 
//       thumbnail: `https://${BUNNY_CDN_HOSTNAME}.b-cdn.net/${id}/thumbnail.jpg`,
//     };
//   }

//   // ── YouTube (exact 11-char ID) ──
//   if (YT_ID_RE.test(id)) {
//     return {
//       provider: "youtube",
//       id,
//       embedUrl: `https://www.youtube.com/embed/${id}`,
//       thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
//     };
//   }

//   // ── YouTube URL extraction ──
//   const ytMatch = id.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
//   if (ytMatch?.[1]) {
//     const yid = ytMatch[1];
//     return {
//       provider: "youtube",
//       id: yid,
//       embedUrl: `https://www.youtube.com/embed/${yid}`,
//       thumbnail: `https://img.youtube.com/vi/${yid}/maxresdefault.jpg`,
//     };
//   }

//   // ── Fallback ──
//   return { provider: "unknown", id, embedUrl: null, thumbnail: "/placeholder.svg" };
// }

// ///



