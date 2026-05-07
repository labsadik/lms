# LearnHub — Full Setup Guide (A → Z)

Follow this top-to-bottom on a fresh clone. After step 11 you'll have a working LMS with auth, payments, gamification (per-minute coin/XP awards), tests, rewards, real-time updates, Bunny.net HLS streaming, and admin tools.

---

## 1. Prerequisites

- **Node.js 18+** or **Bun**
- **Supabase** project (free tier OK) — https://supabase.com
- **Stripe** account (test mode OK) — https://dashboard.stripe.com
- **Bunny.net** Stream library (optional, for HLS-hosted videos) — https://bunny.net
- **Supabase CLI** — `npm i -g supabase` (only needed to deploy edge functions yourself)

---

## 2. Clone & install

```bash
git clone <your-repo-url> learnhub
cd learnhub
bun install        # or: npm install
```

---

## 3. Database setup

Open the **Supabase SQL Editor** and run the entire `schema.sql` file in the project root. It creates:

- 5 enum types (`app_role`, `part_kind`, `test_scope`, `test_type`, `discount_type`)
- 22 tables (profiles, user_roles, courses, subjects, chapters, parts, enrollments, progress, tests, questions, question_options, test_attempts, test_answers, promocodes, promocode_redemptions, rewards, reward_redemptions, badges, user_badges, referrals, coin_ledger, activity_log, announcements, announcement_reads)
- All RLS policies (roles enforced via the `has_role()` security-definer function — no recursion)
- A `handle_new_user()` trigger that auto-creates a profile + user role + referral on signup
- Indexes, timestamp triggers, and the `avatars` storage bucket + policies
- **Realtime** enabled on `profiles` and `coin_ledger` so the rewards/coin-store UI updates live
- Seed data: three coin-purchasable discount rewards (5% / 10% / 15%)

```sql
-- Paste the contents of schema.sql and click Run
```

### 3.1 Promote your first admin

Sign up once through the app, then in the SQL editor:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';
```

---

## 4. Frontend environment (`.env`)

```env
# Supabase (auto-managed in Lovable Cloud — only set manually for self-hosting)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon / publishable key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Bunny.net Stream — used by src/lib/videoSource.ts to build HLS URLs
VITE_BUNNY_LIBRARY_ID=<your-bunny-library-id>
VITE_BUNNY_CDN_HOSTNAME=<your-cdn-hostname>   # e.g. vz-3cf84610-3c6
```

The publishable / anon key is safe to commit — RLS protects your data.

The frontend builds Bunny URLs as
`https://<VITE_BUNNY_CDN_HOSTNAME>.b-cdn.net/<videoId>/playlist.m3u8`
and plays them with `hls.js`, so the player can track real watch time and award coins per minute.

---

## 5. Authentication setup (Supabase dashboard)

**Authentication → Providers**

- **Email**: enabled (default).
- **Google**: enable, paste your Google OAuth client ID + secret.
  - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`

**Authentication → URL Configuration**

- Site URL: `http://localhost:5173` (dev) or your production URL.
- Add the same URL under **Redirect URLs**.

**Authentication → Email** (recommended for production)

- Enable **Password HIBP Check** (leaked-password protection).
- Keep "Confirm email" ON unless you have a reason to disable it.

---

## 6. Edge Functions

The project ships **seven** functions under `supabase/functions/`:

| Function | Purpose | `verify_jwt` |
|---|---|---|
| `grade-test` | Grades a test submission, writes attempt + answers + ledger, awards XP/coins. | `false` (validates JWT in code) |
| `create-checkout-session` | Creates a Stripe Checkout Session for a course. | `false` (validates JWT in code) |
| `stripe-webhook` | Receives `checkout.session.completed`, creates the enrollment. | `false` (verified via Stripe signature) |
| `award-watch-minute` | Server-side per-minute coin/XP grant for video watch (Bunny + YouTube). Idempotent via `ref_id = '{part_id}:m{minute}'`. | default (JWT verified) |
| `redeem-reward` | Spends coins, mints a single-use promocode, records the redemption. Returns precise HTTP status codes (404/410/409/402/422). | default (JWT verified) |
| `start-test-attempt` | Idempotent "begin attempt" endpoint; returns previous-attempt count. | default |
| `admin-users` | Admin-only listing of `auth.users` via service role. | default |

Deploy via the Supabase CLI (Lovable Cloud auto-deploys these for you):

```bash
supabase functions deploy grade-test
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy award-watch-minute
supabase functions deploy redeem-reward
supabase functions deploy start-test-attempt
supabase functions deploy admin-users
```

### `supabase/config.toml`

```toml
project_id = "<project-ref>"

[functions.stripe-webhook]
verify_jwt = false

[functions.create-checkout-session]
verify_jwt = false

[functions.grade-test]
verify_jwt = false
```

The other functions (`award-watch-minute`, `redeem-reward`, `start-test-attempt`, `admin-users`) keep the default `verify_jwt = true` because they require a logged-in user.

---

## 7. Secrets

Add these in **Project Settings → Edge Functions → Secrets** (or `supabase secrets set`):

| Secret | Where to get it | Used by |
|---|---|---|
| `SUPABASE_URL` | auto-injected | all functions |
| `SUPABASE_ANON_KEY` | auto-injected | all functions |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected (Settings → API) | `grade-test`, `stripe-webhook`, `award-watch-minute`, `redeem-reward`, `start-test-attempt`, `admin-users` |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/apikeys | `create-checkout-session`, `stripe-webhook` |
| `STRIPE_WEBHOOK_SECRET` | created in step 8 below | `stripe-webhook` |

The `SUPABASE_*` secrets are auto-injected on the platform — only the two `STRIPE_*` ones must be added manually.

---

## 8. Stripe webhook

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL:
   ```
   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
   ```
3. Events to send: `checkout.session.completed`
4. Copy the **Signing secret** (`whsec_…`) and store it as `STRIPE_WEBHOOK_SECRET`.

---

## 9. Storage

The `avatars` bucket (public-read; users can upload only into a folder named after their own UUID) is created automatically by `schema.sql`. Add more buckets in **Storage → New bucket** if needed.

---

## 10. Bunny.net Stream (optional but recommended)

1. Create a **Stream library** at https://dash.bunny.net/stream.
2. Note the **Library ID** and **CDN Hostname** (looks like `vz-xxxxxxxx-xxx`).
3. Put both into `.env` (step 4) as `VITE_BUNNY_LIBRARY_ID` and `VITE_BUNNY_CDN_HOSTNAME`.
4. When creating a part in `/admin`, set `kind = recorded` and `video_id = <bunny-video-guid>`. The player automatically loads `https://<hostname>.b-cdn.net/<video_id>/playlist.m3u8` via `hls.js`.
5. YouTube parts still work — set `video_id = <youtube-id>` and the player wraps it with Plyr (native YouTube branding hidden, mute/volume removed per project rules).

---

## 11. Run the app

```bash
bun run dev      # → http://localhost:5173
bun run build    # production build
bun run test     # vitest unit tests
```

To run the edge-function tests:

```bash
deno test -A supabase/functions/award-watch-minute/index_test.ts
deno test -A supabase/functions/redeem-reward/index_test.ts
```

---

## 12. Smoke-test checklist

- [ ] Sign up — a row appears in `public.profiles` and `public.user_roles`.
- [ ] Promote yourself to admin (3.1) — `/admin` becomes accessible.
- [ ] Create a course in `/admin/courses`, publish it, add subjects → chapters → parts (Bunny or YouTube).
- [ ] As a non-admin user, browse `/courses` → "Buy Course". Stripe Checkout opens; test card `4242 4242 4242 4242` creates an enrollment via the webhook.
- [ ] Watch a recorded part — every actually-watched minute calls `award-watch-minute`, granting **+1 coin / +1 XP**, idempotent per `{part}:{minute}`. Live parts award nothing.
- [ ] Open `/rewards` while watching another tab — coin/XP totals update in real time (via the `profiles` realtime channel).
- [ ] Submit a DPP/test — coins = +5 per correct, −5 per wrong, 0 per skipped; XP = max(0, net coins). Reopening shows a locked result with "Re-attempt".
- [ ] Redeem a coin reward in `/rewards`. Errors return precise statuses (404 missing, 410 inactive/out-of-stock, 409 already redeemed, 402 not enough coins, 422 misconfigured).
- [ ] Open the leaderboard popup from the dashboard — caches for 1 minute, sortable by XP / Coins / Videos / Tests.

---

## 13. Project structure

```
src/
  pages/             # Home, Courses, Learn, TestPage, Rewards, Dashboard, admin/*
  components/        # Header, VideoPlayer, GlobalLeaderboardDialog, AnnouncementBell, …
  lib/
    gamify.ts        # Client helpers — calls award-watch-minute, never inserts to coin_ledger
    videoSource.ts   # Builds Bunny HLS / YouTube embed URLs from .env
  integrations/supabase/   # Auto-generated client + types (DO NOT EDIT)
supabase/
  config.toml
  functions/
    grade-test/
    create-checkout-session/
    stripe-webhook/
    award-watch-minute/        # + index_test.ts
    redeem-reward/             # + index_test.ts
    start-test-attempt/
    admin-users/
schema.sql                     # ← Full a-to-z database schema (run once)
setup.md                       # ← This file
```

That's it — you have a fully working LMS with payments, per-minute gamification, tests, rewards, real-time coin updates, Bunny HLS streaming, and admin tools.
