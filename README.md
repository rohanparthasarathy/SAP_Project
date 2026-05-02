# SAP Health — Nutrition label analyzer

Next.js app that accepts a nutrition-label photo and runs **one combined vision request** (label check + structured extraction) using **`OPENAI_VISION_DETAIL`** (default **`low`** to minimize image tokens), then **one text-only call** for age-specific bullet guidance.

## Prerequisites

- Node.js 18+ and npm (install from [nodejs.org](https://nodejs.org/) if needed)

## Local setup

1. Clone or open this folder and install dependencies:

   ```bash
   cd SAP_Health
   npm install
   ```

2. Copy environment variables:

   ```bash
   copy .env.example .env.local
   ```

   On macOS/Linux use `cp .env.example .env.local`.

3. Set `OPENAI_API_KEY` in `.env.local` (from [OpenAI API keys](https://platform.openai.com/api-keys)).

4. Optional: see [.env.example](.env.example) for `OPENAI_MODEL`, `OPENAI_VISION_DETAIL`, `OPENAI_MODEL_ADVICE`, **daily quota**, and optional **Upstash Redis** for production rate limits.

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Behavior

- **Checkbox:** You must confirm the image shows a Nutrition Facts panel before analyzing.
- **Token flow:** One vision API call (classification + numbers in one JSON). If the model says the image is **not** a nutrition label, the server returns an error and **does not** run the age-advice text call. If it is a label, **one** text call produces the three age columns.
- **Detail level:** Default `OPENAI_VISION_DETAIL=low` minimizes image token usage. Use `high` on Vercel if labels are hard to read.
- **Daily limit:** **20** analyze actions per **client IP** per **UTC day** (configurable). Set `ANALYZE_LIMIT_DISABLED=true` to turn off. The UI shows **analyses remaining**. Without **Upstash Redis** env vars, the count is **in-memory** (single instance / dev; resets on cold start). For production, add a free [Upstash](https://upstash.com) Redis and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- **History:** Past runs are stored in **browser localStorage** only (this device).

## Deploy to Vercel (free `*.vercel.app` URL)

1. Push this repository to GitHub (or GitLab / Bitbucket).

2. Sign in at [vercel.com](https://vercel.com) and **Add New Project** → import the repo.

3. Use the repository root as the project root (this folder if the repo is only `SAP_Health`).

4. Under **Environment Variables**, add at least:

   - `OPENAI_API_KEY` — your secret key (Production; add Preview too if you want preview deployments to work).

5. Optionally add quota, vision detail, models, and Upstash Redis as in [.env.example](.env.example).

6. Deploy. Vercel will build with `npm run build` and assign a URL like `https://your-project.vercel.app`.

## Custom domain (later)

1. Purchase or use a domain at any registrar (Cloudflare, Namecheap, Google Domains successor, etc.).

2. In Vercel: **Project → Settings → Domains** → enter `example.com` and `www.example.com`.

3. Add the DNS records Vercel shows (often **A** / **CNAME** to Vercel’s hosts) at your DNS provider.

4. Wait for DNS to propagate; Vercel issues **HTTPS** automatically.

## Legacy static page

The previous standalone clock page is served as static HTML at `/ist-world-clock.html`.

## Disclaimer

Output is for education only, not medical advice. Models can misread blurry or unusual labels—always verify critical values on the package.
