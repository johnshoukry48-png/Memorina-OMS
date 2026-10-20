# Memorina OMS — Deployment Guide (Phase 10)

Everything below uses only free tiers: GitHub, Vercel, Supabase.
Follow it top to bottom for a first deploy.

## 0. Before you start
Make sure all 8 Supabase migrations have been run, in order, on your
Supabase project (see `supabase/migrations/` — 001 through 008), and
that you've promoted yourself to `admin` (see `README.md` step 4).
Deploying doesn't touch the database — Vercel only hosts the frontend.

## 1. Push the code to GitHub
From the project folder:
```bash
git init
git add .
git commit -m "Memorina OMS"
```
Create a new **empty** repository on https://github.com/new (don't
add a README/license there — you already have files). Then:
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/memorina-oms.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `dist`, and your
`.env.local` — your Supabase keys will never be committed. Double
check `git status` doesn't show `.env.local` before pushing, just in case.

## 2. Import the project on Vercel
1. Go to https://vercel.com → **Add New… → Project**.
2. Choose **Import Git Repository** and select the repo you just pushed.
3. Vercel auto-detects **Vite** as the framework — leave the build
   settings as-is (`npm run build`, output directory `dist`).
4. **Before clicking Deploy**, add the environment variables (next step).

## 3. Environment variables on Vercel
In the same import screen (or later under **Project → Settings →
Environment Variables**), add exactly these two, for **all**
environments (Production, Preview, Development):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | same as in your local `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | same — the **anon/public** key only |

Never add `SUPABASE_SERVICE_ROLE_KEY` here or anywhere in this
project — it isn't needed and must never reach the frontend.

## 4. Deploy
Click **Deploy**. Vercel builds and gives you a live URL like
`https://memorina-oms.vercel.app`. `vercel.json` (already in the repo)
tells Vercel to serve `index.html` for every route, so refreshing a
page like `/orders/abc123` won't 404 — this is required for a
React Router single-page app.

## 5. Tell Supabase about your live URL
Password reset emails (and any future magic-link/OAuth flow) need
Supabase to know where to send people back to:
1. Supabase Dashboard → **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel URL.
3. Add `https://YOUR-PROJECT.vercel.app/**` under **Redirect URLs**.

Without this step, the "reset password" email link will redirect
to `localhost` instead of your live site.

## 6. Verify
- Open the live URL, log in.
- Try **نسيت كلمة المرور؟** (forgot password) with a real account's
  email — confirm the email arrives and the reset link lands you back
  on the live site's `/reset-password` page, not localhost.
- Create a test order, add an item, confirm the total computes.
- Log in as a non-admin role and confirm the sidebar/bottom nav only
  shows what that role should see.

## 7. Every future update
```bash
git add .
git commit -m "describe the change"
git push
```
Vercel redeploys automatically on every push to `main`. Any new
database change still needs its own migration run manually in the
Supabase SQL Editor — Vercel only redeploys the frontend, it never
touches your database.

## Custom domain (optional, still free)
Vercel → Project → **Settings → Domains** → add your own domain and
follow the DNS instructions there. Update Supabase's **Site URL** /
**Redirect URLs** (step 5) to match once you switch to it.
