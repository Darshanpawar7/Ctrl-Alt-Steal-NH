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

## Run it on your laptop

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars     # then change the two passwords inside
npm run dev
```

Open <http://localhost:5173>. The admin panel is at <http://localhost:5173/admin>.

To let phones on the same Wi-Fi join your laptop, run `npm run dev:lan` and share the "Network" address it prints (for example `http://192.168.1.20:5173`). Campus Wi-Fi often blocks phone-to-laptop traffic, so for the real event, deploy it (below).

## Put it online (free, on Cloudflare)

The site runs on Cloudflare Workers. The free plan is enough for this event.

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. Log in from this folder: `npx wrangler login`
3. Set the two passwords (it asks you to type each one):

   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put VOLUNTEER_PASSWORD
   ```

4. Deploy: `npm run deploy`

It prints your site's address, like `https://ctrl-alt-steal.<your-name>.workers.dev`. Run `npm run deploy` again any time you change the code. Game data is kept when you redeploy.

## Cost: free

Everything runs on Cloudflare's **Workers Free plan**. There is no database service, no image host and no paid add-on. The game's data lives in the Durable Object's built-in storage, and Round 3 photos are stored there too. On the free plan, going over a limit **blocks** that kind of request for the rest of the day; it never bills you. Daily limits reset at 00:00 UTC (5:30 AM in India).

Expected use for one event with 40 crews (about 120 phones) over 3 hours:

| Free limit (per day) | Expected for the event |
| --- | --- |
| 100,000 Worker requests (page files are free and don't count) | A few thousand: connections, sign-ups, and game actions counted at 20 messages = 1 request |
| 13,000 GB-seconds of Durable Object time | About 2,000 (the server is awake roughly 4 hours) |
| 100,000 storage rows written | About 10,000 (one per game action) |
| 5 GB of storage | Under 1 MB of game data, plus any Round 3 photos (1.5 MB each at most) |
| CPU per message | About 5 ms measured with 40 crews, under the strictest 10 ms reading |

The free `*.workers.dev` web address is enough. A custom domain is optional and is the only thing here that would cost money.

## On the day

1. **Before doors open:** open `/screen` on the projector laptop and click once to turn on sound and full screen. Open `/admin` on the host's laptop. Download a backup (Settings & data).
2. **Check-in:** volunteers sign in to `/admin` with the volunteer password and use **Teams & check-in**. Crews can't answer until they're checked in, which also records attendance.
3. **Run the show:** in the **Control room**, press **Next** to step through the schedule. Timers lock answers automatically at zero.
4. **If the Wi-Fi dies:** print slips from **Print kit** beforehand. Volunteers type paper answers in under **Rounds & answers → Enter**.
5. **After:** download the attendance and scores CSVs for the post-event report.

### Mistakes are fixable

- Credits are never stored as a running total. They're recalculated from answers and answer keys every time. Fix a wrong answer or a wrong key, and every total updates.
- Anything else (a dispute, a prize, a penalty) goes in as an **adjustment** with a written reason.
- Every staff action is in the **audit log**.
- After the dry run, use **Reset after dry run** to clear answers and check-ins but keep crews and content.

## Keep the answers secret

- Players' phones and the projector never receive an answer key until that round is revealed.
- The answers live in `src/worker/game/content.ts`. **Keep this repository private**, or change the mystery in **Admin → Case & content** before the event. Edits made there are saved on the server, not in the code.

## For developers

```bash
npm test             # engine tests: scoring, rules, timers, secrecy, puzzle consistency
npm run typecheck    # TypeScript for the client and the server
npm run build        # production build
```

```text
src/
  shared/        types and the wire protocol (safe for the browser: no answers)
  worker/        Cloudflare Worker + the GameRoom Durable Object
    game/        the engine: actions, scoring, views (what each role may see), default content
  client/        React app
    pages/       Landing, Register, play/ (phones), screen/ (projector), admin/
    components/  shared UI, round forms, evidence cards, timers, leaderboard
test/            Vitest tests for the engine
```

How it works: one Durable Object holds the whole event. Phones, the projector and the admin panel connect to it over WebSockets. Each action is checked, applied to a copy of the state, saved, and then each connected screen gets its own filtered view. An alarm locks rounds when the timer hits zero.
