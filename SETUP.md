# Setting Up Your League (No Coding Required)

This guide takes you from this code to a working app on everyone's iPhone.
It takes about 30–45 minutes and costs nothing. You only click through
websites and copy and paste values; you don't write any code.

**What you'll set up**

| Service | What it does | Cost |
|---|---|---|
| **GitHub** (you already have it) | Stores the app's code | Free |
| **Supabase** | Saves your league's shared data (teams, rosters, trades) and handles sign-in | Free tier |
| **Vercel** | Puts the app on the internet and fetches live NHL stats | Free "Hobby" tier |

> **Tip:** You can do Step 3 (Vercel) first if you just want to see the app.
> Without Supabase it runs in **demo mode**: a fictional 8-team league
> that lives only on your phone. It's a good way to preview the design.

---

## Step 1 — Create the Supabase project (the database)

1. Go to **https://supabase.com** and click **Start your project**. Sign up (the easiest way is "Continue with GitHub").
2. Click **New project**.
   - **Name:** `fantasy-hockey`
   - **Database password:** click **Generate a password** and save it somewhere safe (you'll rarely need it).
   - **Region:** pick the one closest to your league (e.g. *East US*).
   - Click **Create new project** and wait about 2 minutes.
3. In the left sidebar, open **SQL Editor** → **New query**.
4. In GitHub, open the file [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), click the **Copy raw file** button, and paste everything into the Supabase SQL editor.
5. Click **Run**. You should see "Success. No rows returned."
   This creates all the league tables and the rules for rosters, trades and draft picks.

## Step 2 — Set up sign-in by email code

Players sign in with a 6-digit code emailed to them, so nobody needs a
password. A code is used instead of an email link because links open in
Safari rather than in the Home Screen app.

1. In Supabase, go to **Authentication** → **Sign In / Providers** and make sure **Email** is enabled.
2. Go to **Authentication** → **Emails** → **Templates** → **Magic Link**.
3. Replace the message body with the following, then **Save**:

   ```html
   <h2>Your Fantasy Hockey sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>This code expires in 1 hour.</p>
   ```

   Supabase fills in `{{ .Token }}` with the code. See Supabase's guide:
   [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless).
4. Do the same for the **Confirm signup** template, so first-time users also get a code.
5. Go to **Project Settings** → **API Keys** (in older layouts, **Project Settings → API**) and keep this tab open. You'll need three values in Step 3:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon / public** key (a long string; this one is safe to put in the app)
   - **service_role** key (another long string; **keep this one secret**)

> **Email limits:** Supabase's built-in email sender allows only a few emails
> per hour, which is fine for a league signing in once. If people hit
> "rate limit" errors, add a free SMTP sender (for example Resend) under
> **Authentication → Emails → SMTP Settings**.

## Step 3 — Put the app online with Vercel

1. Go to **https://vercel.com** and sign up with **Continue with GitHub**.
2. Click **Add New…** → **Project**, find **Fantasy-App** in the list, and click **Import**.
   (If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to the repo.)
3. Leave the build settings as they are; Vercel detects everything. Open **Environment Variables** and add these four:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase **Project URL** |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase **anon / public** key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase **service_role** key |
   | `CRON_SECRET` | any long random text, e.g. mash the keyboard for 40 characters |

4. Click **Deploy**. After a minute or two you'll get a web address like
   `https://fantasy-app-yourname.vercel.app`. That's your app.
5. Back in Supabase, go to **Authentication** → **URL Configuration** and set **Site URL** to that web address.

> Vercel runs a job every morning (7 AM Eastern) that locks in final scores
> for the previous week; this is what builds the standings. It's set up
> automatically from `vercel.json`. See Vercel's docs on
> [cron jobs](https://vercel.com/docs/cron-jobs) and
> [environment variables](https://vercel.com/docs/projects/environment-variables).

**If the app is branch-based:** Vercel deploys your repository's main branch
by default. If this code is still on the `claude/fantasy-hockey-app-ksw9hr`
branch, merge it into `main` on GitHub first (open a pull request and click
**Merge**), or choose that branch in Vercel's project settings under **Git**.

## Step 4 — Install it on your iPhone

1. Open your app's web address in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open it from the Home Screen. It runs full-screen like a regular app, with no browser bar and no ads.

Android users can use Chrome's **⋮** menu → **Add to Home screen**.

## Step 5 — Create your league (commissioner)

1. Sign in with your email and the 6-digit code.
2. Tap **Start a New League Instead**, then enter a league name and your team name.
3. You'll land on **Commissioner Tools**. Share the **invite code** from the **League** tab. Everyone signs in, taps *Join*, and enters the code.
4. When everyone has joined:
   - **Draft picks:** in Commissioner Tools, create picks for each future draft year (e.g. 2027 and 2028, 3 rounds each). Picks can then be traded.
   - **Rosters:** to copy your ESPN rosters, open each player in the **Players** tab (switch to **All Players** and search) and tap **Assign to Team…**.
   - **Schedule:** choose the first Monday of the fantasy season and the number of weeks, then tap **Create Schedule**.
   - **Scoring & Rules:** adjust points per stat, lineup sizes, roster limit and the daily lineup lock time.

## How the league works

- **Scoring:** head-to-head points. Each player's stats from every NHL game count toward your team if they were in your starting lineup (not the bench) that day.
- **Lineup lock:** moves made before the lock hour (default 12 PM Eastern) count for that day's games. Later moves take effect the next day.
- **Trades:** offer any mix of players and future draft picks. The other owner accepts or declines. If a player in the offer was dropped or traded in the meantime, the trade safely fails and nothing changes.
- **Free agents:** add anyone not on a team. If your roster is full, you pick someone to drop in the same step.
- **Stats:** pulled from the NHL's public stats service (the one NHL.com uses) and refreshed every couple of minutes during games.

## Troubleshooting

| Problem | Fix |
|---|---|
| App says "demo mode" after deploying | The `VITE_SUPABASE_…` variables are missing or misspelled in Vercel. Fix them, then **Deployments → ⋯ → Redeploy**. |
| Sign-in email has a link but no code | Redo Step 2, part 3. |
| "Could not load NHL data" | The NHL's service may be briefly down; try again in a few minutes. |
| Standings don't update after a week ends | In Vercel, check **Settings → Cron Jobs**; make sure `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are set. |
| Supabase project "paused" | Free projects pause after about a week with no activity (e.g. in the off-season). Open Supabase and click **Restore**. |

## Making changes later

You can ask Claude (or any developer) to change things, such as new stat
categories, playoff brackets or a live draft room. Changes pushed to GitHub
redeploy to Vercel automatically.
