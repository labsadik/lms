import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

function safeMd5(input: string): string {
  function add32(a: number, b: number) { return (a + b) & 0xFFFFFFFF; }
  function rol(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return add32(rol(add32(add32(a, q), add32(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

  function md5cycle(state: number[], block: number[]) {
    let a = state[0], b = state[1], c = state[2], d = state[3];
    a = ff(a, b, c, d, block[0], 7, -680876936); d = ff(d, a, b, c, block[1], 12, -389564586); c = ff(c, d, a, b, block[2], 17, 606105819); b = ff(b, c, d, a, block[3], 22, -1044525330);
    a = ff(a, b, c, d, block[4], 7, -176418897); d = ff(d, a, b, c, block[5], 12, 1200080426); c = ff(c, d, a, b, block[6], 17, -1473231341); b = ff(b, c, d, a, block[7], 22, -45705983);
    a = ff(a, b, c, d, block[8], 7, 1770035416); d = ff(d, a, b, c, block[9], 12, -1958414417); c = ff(c, d, a, b, block[10], 17, -42063); b = ff(b, c, d, a, block[11], 22, -1990404162);
    a = ff(a, b, c, d, block[12], 7, 1804603682); d = ff(d, a, b, c, block[13], 12, -40341101); c = ff(c, d, a, b, block[14], 17, -1502002290); b = ff(b, c, d, a, block[15], 22, 1236535329);
    a = gg(a, b, c, d, block[1], 5, -165796510); d = gg(d, a, b, c, block[6], 9, -1069501632); c = gg(c, d, a, b, block[11], 14, 643717713); b = gg(b, c, d, a, block[0], 20, -373897302);
    a = gg(a, b, c, d, block[5], 5, -701558691); d = gg(d, a, b, c, block[10], 9, 38016083); c = gg(c, d, a, b, block[15], 14, -660478335); b = gg(b, c, d, a, block[4], 20, -405537848);
    a = gg(a, b, c, d, block[9], 5, 568446438); d = gg(d, a, b, c, block[14], 9, -1019803690); c = gg(c, d, a, b, block[3], 14, -187363961); b = gg(b, c, d, a, block[8], 20, 1163531501);
    a = gg(a, b, c, d, block[13], 5, -1444681467); d = gg(d, a, b, c, block[2], 9, -51403784); c = gg(c, d, a, b, block[7], 14, 1735328473); b = gg(b, c, d, a, block[12], 20, -1926607734);
    a = hh(a, b, c, d, block[5], 4, -378558); d = hh(d, a, b, c, block[8], 11, -2022574463); c = hh(c, d, a, b, block[11], 16, 1839030562); b = hh(b, c, d, a, block[14], 23, -35309556);
    a = hh(a, b, c, d, block[1], 4, -1530992060); d = hh(d, a, b, c, block[4], 11, 1272893353); c = hh(c, d, a, b, block[7], 16, -155497632); b = hh(b, c, d, a, block[10], 23, -1094730640);
    a = hh(a, b, c, d, block[13], 4, 681279174); d = hh(d, a, b, c, block[0], 11, -358537222); c = hh(c, d, a, b, block[3], 16, -722521979); b = hh(b, c, d, a, block[6], 23, 76029189);
    a = hh(a, b, c, d, block[9], 4, -640364487); d = hh(d, a, b, c, block[12], 11, -421815835); c = hh(c, d, a, b, block[15], 16, 530742520); b = hh(b, c, d, a, block[2], 23, -995338651);
    a = ii(a, b, c, d, block[0], 6, -198630844); d = ii(d, a, b, c, block[7], 10, 1126891415); c = ii(c, d, a, b, block[14], 15, -1416354905); b = ii(b, c, d, a, block[5], 21, -57434055);
    a = ii(a, b, c, d, block[12], 6, 1700485571); d = ii(d, a, b, c, block[3], 10, -1894986606); c = ii(c, d, a, b, block[10], 15, -1051523); b = ii(b, c, d, a, block[1], 21, -2054922799);
    a = ii(a, b, c, d, block[8], 6, 1873313359); d = ii(d, a, b, c, block[15], 10, -30611744); c = ii(c, d, a, b, block[6], 15, -1560198380); b = ii(b, c, d, a, block[13], 21, 1309151649);
    a = ii(a, b, c, d, block[4], 6, -145523070); d = ii(d, a, b, c, block[11], 10, -1120210379); c = ii(c, d, a, b, block[2], 15, 718787259); b = ii(b, c, d, a, block[9], 21, -343485551);
    state[0] = add32(a, state[0]); state[1] = add32(b, state[1]); state[2] = add32(c, state[2]); state[3] = add32(d, state[3]);
  }

  const len = input.length;
  let state = [1732584193, -271733879, -1732584194, 271733878];
  
  // Step 1: Process first 64 bytes (pad with zeros if string is shorter)
  const first64 = input.substring(0, 64);
  let block = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 16; i++) {
    const offset = i * 4;
    block[i] = (first64.charCodeAt(offset) || 0) 
             | ((first64.charCodeAt(offset + 1) || 0) << 8) 
             | ((first64.charCodeAt(offset + 2) || 0) << 16) 
             | ((first64.charCodeAt(offset + 3) || 0) << 24);
  }
  md5cycle(state, block);

  // Step 2: Process tail block (bytes 56+)
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (len > 55) {
    for (let i = 55; i < len; i++) {
      tail[(i - 56) >> 2] |= (input.charCodeAt(i) || 0) << (((i - 56) % 4) * 8);
    }
  }
  
  // Step 3: Add standard MD5 padding (0x80 terminator + message length)
  const bitLen = len * 8;
  const pos = len < 56 ? (len % 64) : (len % 64) - 56;
  tail[pos >> 2] |= 0x80 << ((pos % 4) * 8);
  tail[14] = bitLen & 0xFFFFFFFF;
  tail[15] = len < 64 ? 0 : Math.floor(bitLen / 4294967296);
  
  md5cycle(state, tail);

  // Step 4: Convert to hex string
  const hexChr = "0123456789abcdef";
  let hex = "";
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const byte = (state[i] >>> (j * 8)) & 0xFF;
      hex += hexChr.charAt((byte >> 4) & 0x0F) + hexChr.charAt(byte & 0x0F);
    }
  }
  return hex;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { videoPath } = await req.json();
    if (!videoPath) {
      return new Response(JSON.stringify({ error: "Missing videoPath" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

      const tokenKey = (Deno.env.get("BUNNY_TOKEN_AUTH_KEY") || "").replace(/\s+/g, '');
    if (!tokenKey) {
      return new Response(JSON.stringify({ error: "Missing server config" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const bunnyHostname = Deno.env.get("BUNNY_CDN_HOSTNAME");
    if (!bunnyHostname) {
      return new Response(JSON.stringify({ error: "Missing server config" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expirationTime = Math.floor(Date.now() / 1000) + 7200;
        const tokenString = `${tokenKey}${videoPath}${expirationTime}`;
    const tokenHash = safeMd5(tokenString);

    const secureUrl = `https://${bunnyHostname}.b-cdn.net${videoPath}?token=${tokenHash}&expires=${expirationTime}`;

    return new Response(JSON.stringify({ secureUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Server Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});