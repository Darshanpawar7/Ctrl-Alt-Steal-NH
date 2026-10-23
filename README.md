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
| Website + game server | **Render** | One Node.js service: serves every page and runs the live game for every phone. |
| Database | **Supabase** | Saves every change. If Render restarts the server, nothing is lost. |
| Keep-awake | **UptimeRobot** | Pings the server every 5 minutes so Render never puts it to sleep. |

One service means one address for everything and nothing to wire together. (Vercel is optional, see the end of this section.)

## Put it online

Do these in order. Each one is a free account, and everything below uses only free plans.

### 1. Supabase (the database)

1. Sign up at <https://supabase.com> and create a **New project**. Pick the **Singapore** region (closest to Bengaluru), set a database password, and save that password somewhere. Wait a minute or two while it sets up.
2. Click **Connect** at the top of the project. Choose the **Session pooler** connection string. Not "Direct connection": that one only works over IPv6 on the free plan, and Render can't reach it.
3. Put your database password into the string, and **add `?sslmode=no-verify` to the end**. It should look like:

   ```text
   postgresql://postgres.abcdefghijklmnop:YOUR-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
   ```

   Why the ending: Supabase signs its connections with its own certificate, which Node doesn't recognise. `no-verify` keeps the connection encrypted but skips that check. For the full check, download the certificate from Supabase (Project settings → Database → SSL configuration), paste it into Render as `DATABASE_CA_CERT`, and leave the ending off.
4. Optional but recommended: check the string from your laptop before deploying:

   ```bash
   npm install
   npx tsx scripts/check-database.ts "postgresql://postgres.abc…?sslmode=no-verify"
   ```

   It prints ✅ when it connects, or a plain sentence saying what to fix.

A free Supabase project **pauses after one week without activity**. Open the Supabase dashboard the day before the event and on the morning of it. If the project says **Paused**, click **Restore**: the game server waits and reconnects by itself, without losing anything.

> **Neon works too**, with no code changes (both are plain Postgres). Create a project in Singapore at <https://neon.tech>, click **Connect**, and use its connection string as is. Neon sleeps after 5 minutes idle and wakes up by itself on the next save, so it never needs un-pausing.

### 2. Render (the website and game server)

1. Sign up at <https://render.com> with your GitHub account.
2. Click **New → Blueprint**, pick this repository, and confirm. Render reads `render.yaml` and sets up one free web service in Singapore.
3. Fill in the three secrets it asks for:
   - `ADMIN_PASSWORD`: the club heads' password. Make it long.
   - `VOLUNTEER_PASSWORD`: the desk volunteers' password.
   - `DATABASE_URL`: the Supabase connection string from step 1 (with `?sslmode=no-verify` on the end).
4. Wait for the first deploy (about 5 minutes). Copy the service's address, like `https://ctrl-alt-steal.onrender.com`. **This is your website's address**: share it with players.
5. Open `https://<your-render-address>/api/health`. You should see `"ok":true` and `"kind":"postgres"`. If it says the game is starting up, open Render's **Logs**: a database problem is explained there in one sentence.
6. Open `https://<your-render-address>` and you should see the landing page.

### 3. UptimeRobot (keep the server awake)

Render's free server sleeps after 15 minutes without visitors, and waking up takes about a minute. Stop that from ever happening:

1. Sign up at <https://uptimerobot.com>.
2. **New monitor → HTTP(s)**, URL `https://<your-render-address>/api/health`, check every **5 minutes**.

Bonus: UptimeRobot emails you if the server ever goes down.

### 4. Prove it before the event

From this folder on your laptop, run a full-hall rehearsal against the real server:

```bash
npm install
npm run load-test -- https://<your-render-address> <your-admin-password>
```

It plays 40 crews on 120 phones for 3 minutes, cleans up after itself, and prints response times, errors, data per phone, and how much of the server's CPU and memory it used. Afterwards, press **Reset after dry run** in Admin → Settings & data to clear the test announcements.

### Optional: the website on Vercel as well

Not needed. The one thing it adds: if Render restarts (rare, a few seconds), the landing and registration pages stay up on Vercel while the game reconnects. If you want it:

1. On <https://vercel.com>, **Add New → Project** and import this repository. It detects Vite.
2. Add the environment variable `VITE_API_URL` = your Render address (no slash at the end), then **Deploy**.
3. On Render, add `ALLOWED_ORIGINS` = your Vercel address in the service's **Environment** tab, and **Save and deploy**.

Both addresses then work, and share the same game.

## What each free plan gives you

| Service | Free limits that matter | This event |
| --- | --- | --- |
| Render (Free) | 750 server hours a month; sleeps after 15 min idle; may restart at any time | One server all month is about 744 hours. UptimeRobot stops the sleeping; restarts are covered by the database. |
| Supabase (Free) | 500 MB database, 2 projects; pauses after 1 week with no activity | Under 5 MB |
| UptimeRobot (Free) | 50 monitors, 5-minute checks | 1 monitor |

Measured on the production build with Postgres saving, 40 crews:

- One active phone per crew (a realistic hall): 2% of one CPU core, median response 1 ms.
- All 120 phones busy at once (about 3× a real peak): 5.4% of one core, median 1 ms, 0 errors, 128 MB memory.

Database speed doesn't affect players: the live game runs in the Render server's memory, and saving happens in the background. The database is only read when the server starts.

Why not Render's own free database? It is deleted 30 days after you create it, and its free Redis isn't saved at all.

## On the day

1. **Before doors open:** check `https://<render>/api/health` shows `"ok":true`. Open `https://<render>/screen` on the projector laptop and click once to turn on sound and full screen. Open `/admin` on the host's laptop. Download a backup (Settings & data).
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
