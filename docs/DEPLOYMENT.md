# Deployment

Ctrl+Alt+Steal runs on free plans: one **Render** web service (website and game server together), a **Supabase** Postgres database, and an **UptimeRobot** monitor to keep the server awake. Setting it up takes about 30 minutes.

| Piece | Service | Job |
| --- | --- | --- |
| Website + game server | Render | One Node.js service: serves every page and runs the live game for every phone. |
| Database | Supabase | Saves every change, so a server restart loses nothing. |
| Keep-awake | UptimeRobot | Pings the server every 5 minutes so Render never puts it to sleep. |

Vercel is optional; see [the end of this guide](#optional-the-website-on-vercel-as-well).

## 1. Supabase (the database)

1. Sign up at <https://supabase.com> and create a **New project**. Pick the region closest to your venue (for Bengaluru, **Singapore**), set a database password, and save it. Setup takes a minute or two.
2. Click **Connect** at the top of the project and choose the **Session pooler** connection string. Don't use "Direct connection": on the free plan it only works over IPv6, which Render can't reach.
3. Put your database password into the string and **add `?sslmode=no-verify` to the end**:

   ```text
   postgresql://postgres.abcdefghijklmnop:YOUR-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
   ```

   Supabase signs its connections with its own certificate, which Node doesn't recognise. `no-verify` keeps the connection encrypted but skips that check. For full verification, download the certificate from Supabase (Project settings → Database → SSL configuration), set it as `DATABASE_CA_CERT` on Render, and leave the ending off.
4. Optional but recommended: test the string from your machine before deploying.

   ```bash
   npm install
   npx tsx scripts/check-database.ts "postgresql://postgres.abc…?sslmode=no-verify"
   ```

   It prints ✅ when it connects, or a plain sentence saying what to fix.

A free Supabase project **pauses after one week without activity**. Open the dashboard the day before the event and on the morning of it; if the project says **Paused**, click **Restore**. The game server waits and reconnects by itself without losing anything.

> **Neon works too**, with no code changes: both are plain Postgres. Create a project at <https://neon.tech>, click **Connect**, and use its connection string as is. Neon sleeps after 5 minutes idle and wakes on the next save, so it never needs un-pausing.

## 2. Render (the website and game server)

1. Sign up at <https://render.com> with your GitHub account.
2. Click **New → Blueprint**, pick your copy of this repository, and confirm. Render reads [`render.yaml`](../render.yaml) and creates one free web service.
3. Fill in the three secrets it asks for:
   - `ADMIN_PASSWORD`: the club heads' password. Make it long.
   - `VOLUNTEER_PASSWORD`: the desk volunteers' password.
   - `DATABASE_URL`: the Supabase connection string from step 1.
4. Wait for the first deploy (about 5 minutes) and copy the service's address, e.g. `https://your-event.onrender.com`. **This is your website's address.**
5. Open `https://<your-render-address>/api/health`. You should see `"ok":true` and `"kind":"postgres"`. If it says the game is starting up, open Render's **Logs**: a database problem is explained there in one sentence.

Every push to the repository redeploys and restarts the server. Phones reconnect within seconds and nothing is lost, but avoid pushing during the event.

## 3. UptimeRobot (keep the server awake)

Render's free server sleeps after 15 minutes without visitors, and waking takes about a minute.

1. Sign up at <https://uptimerobot.com>.
2. **New monitor → HTTP(s)**, URL `https://<your-render-address>/api/health`, interval **5 minutes**.

UptimeRobot also emails you if the server goes down.

## 4. Rehearse with a full hall

From your machine, run the load test against the real server:

```bash
npm run load-test -- https://<your-render-address> <your-admin-password>
```

It plays 40 crews on 120 phones for 3 minutes, then prints response times, errors, data per phone, and the server's CPU and memory use. It removes its test crews and puts the screens back afterwards. Then press **Reset after dry run** in Admin → Settings & data to clear the test messages from the live feed.

If it stops partway (Ctrl+C or a dropped connection), it says why and tidies up. If it can't reach the server to tidy up, run the same command with `--cleanup` once you're back online.

Options: `--crews 40`, `--phones 3`, `--minutes 3`.

## Optional: the website on Vercel as well

Not needed. The one benefit: during a Render restart (a few seconds), the landing and registration pages stay up on Vercel while the game reconnects.

1. On <https://vercel.com>, **Add New → Project** and import the repository. It detects Vite.
2. Add the environment variable `VITE_API_URL` = your Render address (no trailing slash), then **Deploy**.
3. On Render, add `ALLOWED_ORIGINS` = your Vercel address in the service's **Environment** tab, and redeploy.

## Free plan limits

| Service | Limits that matter | For one event |
| --- | --- | --- |
| Render (Free) | 750 server hours a month; sleeps after 15 min idle; may restart at any time | One server all month is about 744 hours. UptimeRobot stops the sleeping; the database covers restarts. |
| Supabase (Free) | 500 MB database; pauses after 1 week without activity | A whole event is under 5 MB. |
| UptimeRobot (Free) | 50 monitors, 5-minute checks | 1 monitor |

Render's own free database isn't a good fit: it is deleted 30 days after creation, and its free Redis isn't persisted.

### Measured performance

Production build with Postgres saving, 40 crews:

- One active phone per crew (a realistic hall): 2% of one CPU core, median response 1 ms.
- All 120 phones busy at once (about 3× a real peak): 5.4% of one core, median 1 ms, 0 errors, 128 MB memory.

Database speed doesn't affect players: the live game runs in the server's memory and is saved in the background. The database is only read when the server starts.

## On the day

1. **Before doors open:** check `/api/health` shows `"ok":true`. Open `/screen` on the projector laptop and click once to turn on sound and full screen. Open `/admin` on the host's laptop. Download a backup (Settings & data).
2. **Check-in:** volunteers sign in to `/admin` with the volunteer password and use **Teams & check-in**. Crews can't answer until they're checked in, which also records attendance.
3. **Run the show:** in the **Control room**, press **Next** to step through the schedule. Timers lock answers automatically at zero.
4. **If the server restarts:** screens show "Reconnecting…" and come back within seconds, with every saved answer intact.
5. **If the Wi-Fi dies:** print answer slips from **Print kit** beforehand; volunteers type paper answers in under **Rounds & answers → Enter**.
6. **Afterwards:** download the attendance and scores CSVs, and a final backup. Then suspend the Render service and pause the Supabase project: the database holds participants' names and contact details.

## Plan B: one laptop, no internet

If both the venue Wi-Fi and mobile data fail, one laptop can run the whole event on the local network:

```bash
npm install
cp .env.example .env      # set the passwords inside
npm run laptop
```

It builds the site and serves it at `http://<laptop-ip>:8787`. Phones on the same Wi-Fi (or the laptop's hotspot) open that address. To move a game in progress, download a backup from the online admin and restore it on the laptop.
