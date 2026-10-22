# Ctrl+Alt+Steal

The live game website for **Ctrl+Alt+Steal**, Neural Hive's AI heist challenge at PES University.

Neural Hive's prize AI model has been stolen. Crews of 3–4 "recovery agents" play four rounds on their phones, earn and bet Compute Credits, collect clues, and finally bet on naming the thief. The projector shows everything live, and the organisers run the whole show from an admin control room.

## What's inside

| Page | Who uses it | What it does |
| --- | --- | --- |
| `/` | Everyone | Hype landing page: the story, suspects, rounds, schedule, FAQ. |
| `/register` | Crews, before the event | Sign up a crew and get a 6-character team code. |
| `/play` | Crews, on their phones | The agent console: every round, timers, clues, a shared deduction board. |
| `/screen` | The projector | Big-screen display for every moment of the event, with sound. |
| `/admin` | Club heads and desk volunteers | Run of show, check-in, answers, scores, fixes, content, backups, print kit. |

Everything stays in sync live. When the host presses **Next** in the control room, the projector and every phone change at the same moment.

## The game in one minute

- Every crew starts with **1,000 credits**.
- **Round 1 · The Trading Floor:** bet credits on which leads are real. Real leads pay out at their odds.
- **Round 2 · The Training Log:** decode a corrupted log. Buy hints if stuck. The first 3 crews to lock in all-correct answers win a speed bonus.
- **Round 3 · The Lineup:** mark each piece of evidence Real or AI-fake.
- **Round 4 · The Vault:** bank your credits or pick one of six doors and wager. Doors open one by one on the big screen. Winning doors give a bonus clue.
- **Finale · Name the Thief:** pick the thief, the hideout and the recovery method, then bet any part of your credits. Most credits wins.

The full rules, payouts and what changed from the original plan are in [docs/EVENT-GUIDE.md](docs/EVENT-GUIDE.md). The answer key and host script are in [docs/HOST-ANSWER-KEY.md](docs/HOST-ANSWER-KEY.md) (spoilers).

## How it's hosted (all free)

| Piece | Service | Job |
| --- | --- | --- |
| Website | **Vercel** | Serves every page. Static files, so it never sleeps. |
| Game server | **Render** | A Node.js program that holds the live game and every phone's connection. |
| Database | **Neon** | Saves every change. If Render restarts the server, nothing is lost. |
| Keep-awake | **UptimeRobot** | Pings the server every 5 minutes so Render never puts it to sleep. |

## Put it online

Do these in order. Each one is a free account, and everything below uses only free plans.

### 1. Neon (the database)

1. Sign up at <https://neon.tech> and create a project. Pick the **Asia Pacific (Singapore)** region, closest to Bengaluru.
2. On the project dashboard, click **Connect** and copy the connection string. It looks like `postgresql://user:password@ep-something.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

> **Prefer Supabase?** It works too, with no code changes: both are plain Postgres. Create a project in the Singapore region, click **Connect**, and copy the **Session pooler** string (not "Direct": that one is IPv6-only on the free plan and Render can't reach it). Two catches: a free Supabase project **pauses after one week without activity** and has to be un-paused by hand, and setup takes a couple of minutes longer. That's why Neon is the default here: it sleeps when idle but wakes up by itself on the next save.

### 2. Render (the game server)

1. Sign up at <https://render.com> with your GitHub account.
2. Click **New → Blueprint**, pick this repository, and confirm. Render reads `render.yaml` and sets up a free web service in Singapore.
3. Fill in the secrets it asks for:
   - `ADMIN_PASSWORD`: the club heads' password. Make it long.
   - `VOLUNTEER_PASSWORD`: the desk volunteers' password.
   - `DATABASE_URL`: the Neon connection string from step 1.
   - `ALLOWED_ORIGINS`: leave it empty for now. You fill it in at step 3.
4. Wait for the first deploy (a few minutes). Copy the service's address, like `https://ctrl-alt-steal-api.onrender.com`.
5. Open `https://<your-render-address>/api/health`. You should see `"ok":true` and `"kind":"postgres"`.

### 3. Vercel (the website)

1. Sign up at <https://vercel.com> with your GitHub account and **Add New → Project**, then import this repository. It detects Vite automatically.
2. Under **Environment Variables**, add `VITE_API_URL` = your Render address from step 2 (no slash at the end).
3. Deploy, and copy your site's address, like `https://ctrl-alt-steal.vercel.app`.
4. Back on Render, open the service's **Environment** tab and set `ALLOWED_ORIGINS` to your Vercel address. If you add a custom domain later, list both, separated by a comma. Choose **Save and deploy**.

### 4. UptimeRobot (keep the server awake)

Render's free server sleeps after 15 minutes without visitors, and waking up takes about a minute. Stop that from ever happening:

1. Sign up at <https://uptimerobot.com>.
2. **New monitor → HTTP(s)**, URL `https://<your-render-address>/api/health`, check every **5 minutes**.

Bonus: UptimeRobot emails you if the server ever goes down.

### 5. Prove it before the event

From this folder on your laptop, run a full-hall rehearsal against the real server:

```bash
npm install
npm run load-test -- https://<your-render-address> <your-admin-password>
```

It plays 40 crews on 120 phones for 3 minutes, cleans up after itself, and prints response times, errors, data per phone, and how much of the server's CPU and memory it used. Afterwards, press **Reset after dry run** in Admin → Settings & data to clear the test announcements.

## What each free plan gives you

| Service | Free limits that matter | This event |
| --- | --- | --- |
| Vercel (Hobby) | 100 GB bandwidth a month, non-commercial use | A few hundred MB |
| Render (Free) | 750 server hours a month; sleeps after 15 min idle; may restart at any time | One server all month is about 744 hours. UptimeRobot stops the sleeping; restarts are covered by Neon. |
| Neon (Free) | 1 GB storage, 100 compute hours a month; sleeps after 5 min idle and wakes on the next save | Under 5 MB, a few compute hours |
| UptimeRobot (Free) | 50 monitors, 5-minute checks | 1 monitor |

Measured on the production build with Postgres saving, 40 crews:

- One active phone per crew (a realistic hall): 2% of one CPU core, median response 1 ms.
- All 120 phones busy at once (about 3× a real peak): 5.4% of one core, median 1 ms, 0 errors, 128 MB memory.

Why not Render's own free database? It is deleted 30 days after you create it, and its free Redis isn't saved at all. Neon's free plan has no such expiry, and running out of a Neon limit pauses it rather than deleting data.

## On the day

1. **Before doors open:** check `https://<render>/api/health` shows `"ok":true`. Open `/screen` on the projector laptop and click once to turn on sound and full screen. Open `/admin` on the host's laptop. Download a backup (Settings & data).
2. **Check-in:** volunteers sign in to `/admin` with the volunteer password and use **Teams & check-in**. Crews can't answer until they're checked in, which also records attendance.
3. **Run the show:** in the **Control room**, press **Next** to step through the schedule. Timers lock answers automatically at zero.
4. **If the server restarts:** phones show "Reconnecting…" and come back by themselves within seconds. Every saved answer is still there.
5. **If the Wi-Fi dies:** print slips from **Print kit** beforehand. Volunteers type paper answers in under **Rounds & answers → Enter**.
6. **After:** download the attendance and scores CSVs for the post-event report.

### Plan B: run everything from one laptop

If both the internet and mobile data are down, a laptop can run the whole event on the venue's local network:

```bash
npm install
cp .env.example .env      # set the passwords inside
npm run laptop
```

It builds the site and starts it at `http://<laptop-ip>:8787`. Phones on the same Wi-Fi (or the laptop's hotspot) open that address. To move the live game over, download a backup from the online admin first and restore it on the laptop.

### Mistakes are fixable

- Credits are never stored as a running total. They're recalculated from answers and answer keys every time. Fix a wrong answer or a wrong key, and every total updates.
- Anything else (a dispute, a prize, a penalty) goes in as an **adjustment** with a written reason.
- Every staff action is in the **audit log**.
- After the dry run, use **Reset after dry run** to clear answers and check-ins but keep crews and content.

## Keep the answers secret

- Players' phones and the projector never receive an answer key until that round is revealed.
- The answers live in `src/server/game/content.ts`. **Keep this repository private**, or change the mystery in **Admin → Case & content** before the event. Edits made there are saved in the database, not in the code.

## For developers

```bash
npm install
cp .env.example .env
npm run dev          # game server on :8787 + website on http://localhost:5173
npm test             # 77 tests: engine, live server, Postgres store, restarts
npm run typecheck    # TypeScript for the website and the server
npm run build        # website → dist/        npm run build:server → dist-server/
```

```text
src/
  shared/        types and the wire protocol (safe for the browser: no answers)
  server/        Node game server: HTTP + WebSocket app, game room, storage
    game/        the engine: actions, scoring, views (what each role may see), default content
  client/        React app
    pages/       Landing, Register, play/ (phones), screen/ (projector), admin/
    components/  shared UI, round forms, evidence cards, timers, leaderboard
scripts/         dev runner, load test, profiler
test/            Vitest suites
```

How it works: one Node process holds the whole event. Phones, the projector and the admin panel connect over WebSockets. Each action is checked and applied (only the changed parts of the game are copied), then queued for saving to Postgres. Each connection is sent just the parts of its own view that changed. A timer locks rounds when the clock hits zero, and a clean shutdown saves everything before a restart.
