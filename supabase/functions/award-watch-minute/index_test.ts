import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN = `${SUPABASE_URL}/functions/v1/award-watch-minute`;

Deno.test("award-watch-minute rejects unauthenticated requests", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ part_id: "00000000-0000-0000-0000-000000000000", minute: 1 }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("award-watch-minute validates payload shape", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({ minute: 9999 }),
  });
  await res.text();
  // 400 (validation) or 401 (anon token has no user) — both acceptable rejections
  if (res.status !== 400 && res.status !== 401) {
    throw new Error(`unexpected status ${res.status}`);
  }
});
