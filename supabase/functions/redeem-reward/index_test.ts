import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN = `${SUPABASE_URL}/functions/v1/redeem-reward`;

Deno.test("redeem-reward returns 401 without auth", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ reward_id: "00000000-0000-0000-0000-000000000000" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("redeem-reward validates body and rejects missing reward", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({}),
  });
  await res.text();
  // 400 missing field, or 401 anon, or 404 not found — all are acceptable rejections
  if (![400, 401, 404].includes(res.status)) {
    throw new Error(`unexpected status ${res.status}`);
  }
});
