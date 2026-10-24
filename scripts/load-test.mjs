// Load test: pretends to be a full hall of crews playing at once, against a
// running game server, and reports whether the server keeps up.
//
//   npm run load-test -- <server-url> <admin-password> [--crews 40] [--phones 3] [--minutes 3]
//   npm run load-test -- <server-url> <admin-password> --cleanup
//
// Example:
//   npm run load-test -- https://ctrl-alt-steal.onrender.com my-admin-password
//
// Run it BEFORE the event day, when no round is live. It adds "Load Crew" teams,
// opens the finale round, makes every phone auto-save answers every few seconds,
// then removes its crews and puts the screens back where they were. If it is
// stopped early (Ctrl+C, a dropped connection), it still cleans up; if even that
// fails, --cleanup removes whatever an earlier run left behind.

const NUMBER_FLAGS = ["crews", "phones", "minutes"];
const args = process.argv.slice(2);
const positional = [];
const options = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--")) positional.push(args[i]);
  else if (NUMBER_FLAGS.includes(args[i].slice(2))) options[args[i].slice(2)] = Number(args[++i]);
  else options[args[i].slice(2)] = true;
}
const [serverUrl, password] = positional;
if (!serverUrl || !password) {
  console.log("Usage: npm run load-test -- <server-url> <admin-password> [--crews 40] [--phones 3] [--minutes 3] [--cleanup]");
  process.exit(1);
}
const CREWS = options.crews ?? 40;
const PHONES = options.phones ?? 3;
const MINUTES = options.minutes ?? 3;
const base = serverUrl.replace(/\/$/, "");
const wsUrl = `${base.replace(/^http/, "ws")}/api/ws`;

const CREW_PREFIX = "Load Crew ";
const CREW_NOTES = "load test";
const TIMER_LABEL = "Load test";
const ANNOUNCE_PREFIX = "Load test announcement";
/** A request the server hasn't answered by now is treated as lost. */
const ANSWER_TIMEOUT_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
const isTestCrew = (team) => team.name.startsWith(CREW_PREFIX) && team.notes === CREW_NOTES;
const timerRunning = (timer) => Boolean(timer && (timer.endsAt || timer.pausedLeftMs));
const describeClose = (event) => `code ${event.code}${event.reason ? `: ${event.reason}` : ""}`;

/** One WebSocket connection that tracks answers, timings and traffic. */
function client(hello, stats, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const pongs = [];
    let seq = 0;
    let view = null;
    let signedIn = false;
    const c = {
      ws,
      closed: null,
      get view() {
        return view;
      },
      act(action) {
        if (c.closed) return Promise.reject(new Error(`the ${label} connection closed (${c.closed})`));
        const id = String(++seq);
        const sent = performance.now();
        ws.send(JSON.stringify({ t: "act", id, action }));
        return new Promise((done, fail) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            fail(new Error(`the server didn't answer "${action.type}" within ${ANSWER_TIMEOUT_MS / 1000} s`));
          }, ANSWER_TIMEOUT_MS);
          pending.set(id, { done, fail, sent, timer });
        });
      },
      /** Round trip to the server and back, in ms. */
      ping() {
        const sent = performance.now();
        ws.send(JSON.stringify({ t: "ping" }));
        return new Promise((done, fail) => {
          const timer = setTimeout(() => fail(new Error("the server didn't answer a ping")), ANSWER_TIMEOUT_MS);
          pongs.push(() => {
            clearTimeout(timer);
            done(performance.now() - sent);
          });
        });
      },
    };
    const connectTimer = setTimeout(() => reject(new Error("timed out connecting")), 20_000);
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onerror = () => reject(new Error("could not connect"));
    ws.onclose = (event) => {
      clearTimeout(connectTimer);
      c.closed = describeClose(event);
      if (!signedIn) reject(new Error(`the connection closed before signing in (${c.closed})`));
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.fail(new Error(`the ${label} connection closed (${c.closed}) while waiting for an answer`));
      }
      pending.clear();
      if (stats && !stats.finished) {
        stats.disconnects++;
        stats.closeCodes[event.code] = (stats.closeCodes[event.code] ?? 0) + 1;
      }
    };
    ws.onmessage = (event) => {
      const text = String(event.data);
      if (stats) {
        stats.messages++;
        stats.bytes += text.length;
      }
      if (text === "pong") return;
      const msg = JSON.parse(text);
      if (msg.t === "denied") {
        clearTimeout(connectTimer);
        reject(new Error(msg.reason));
      }
      if (msg.t === "state") {
        view = msg.view;
        if (!signedIn) {
          signedIn = true;
          clearTimeout(connectTimer);
          resolve(c);
        }
      }
      // Same merge as the app: a patch carries only the sections that changed.
      if (msg.t === "patch" && view) view = { ...view, ...msg.view, ...(msg.view.staff ? { staff: { ...view.staff, ...msg.view.staff } } : {}) };
      if (msg.t === "pong") pongs.shift()?.();
      if (msg.t === "ack") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (stats) {
          stats.latencies.push(performance.now() - p.sent);
          if (!msg.ok) stats.errors.push(msg.error);
        }
        p.done(msg);
      }
    };
  });
}

async function health() {
  const res = await fetch(`${base}/api/health`);
  return res.json();
}

const signInAdmin = () => client({ t: "hello", role: "admin", password }, null, "admin");

/**
 * Removes everything a load test added and puts the screens back. `before` is
 * where the game was when this run started; without it (--cleanup), the finale,
 * timer and screen are only touched if a load test was clearly mid-run.
 */
async function cleanUp(admin, before) {
  const conn = admin && !admin.closed ? admin : await signInAdmin();
  const { live, status } = conn.view;
  const midRun = live.timer?.label === TIMER_LABEL;
  if (midRun) await conn.act({ type: "timer.clear" });
  if (before || midRun) {
    if (status.finale !== "pending") await conn.act({ type: "round.set", roundId: "finale", status: "pending" });
    const stage = before && before.stage !== "finalReveal" ? before.stage : "lobby";
    const roundId = before ? before.roundId : null;
    if (live.stage !== stage || live.roundId !== roundId) await conn.act({ type: "stage.set", stage, roundId });
  }
  if (live.announcement?.text.startsWith(ANNOUNCE_PREFIX)) await conn.act({ type: "announce", text: "" });
  const crews = conn.view.staff.teams.filter(isTestCrew);
  for (const crew of crews) await conn.act({ type: "team.remove", id: crew.id });
  return { conn, removed: crews.length };
}

console.log(`Load test against ${base}`);
console.log("Waking the server…");
const h0 = await health();
console.log(`Server is up · storage: ${h0.storage.kind} · ${h0.memoryMb} MB memory`);
let admin = await signInAdmin();

if (options.cleanup) {
  const { removed } = await cleanUp(admin, null);
  console.log(removed ? `Removed ${removed} leftover test crew(s). Your game is tidy again.` : "Nothing to clean up: no test crews were left behind.");
  process.exit(0);
}

const { live, status } = admin.view;
if (live.timer?.label === TIMER_LABEL) {
  console.log("An earlier load test was stopped halfway and left the finale open. Tidy up first with:");
  console.log(`  npm run load-test -- ${base} <admin-password> --cleanup`);
  process.exit(1);
}
if (status.finale !== "pending" || Object.values(status).includes("open") || timerRunning(live.timer) || live.stage === "finalReveal" || live.stage === "podium") {
  console.log("Something is live right now (a round, a timer or the finale). Run this before the event, when nothing is running.");
  process.exit(1);
}
const before = { stage: live.stage, roundId: live.roundId };
const keepAnnouncement = Boolean(live.announcement);
const leftovers = admin.view.staff.teams.filter(isTestCrew).length;
if (leftovers) console.log(`Found ${leftovers} test crew(s) left over from an earlier run: they'll be reused, then removed.`);

const rtts = [];
for (let i = 0; i < 5; i++) rtts.push(await admin.ping());
const rtt = percentile([...rtts].sort((a, b) => a - b), 0.5);
console.log(`Your connection to the server: ${Math.round(rtt)} ms round trip`);
if (rtt > 400) console.log("  That's slow: the results will mostly measure your network, not the server. A wired or faster connection gives truer numbers.");
console.log(`Plan: ${CREWS} crews × ${PHONES} phones for ${MINUTES} min`);

const stats = { latencies: [], errors: [], messages: 0, bytes: 0, disconnects: 0, closeCodes: {}, finished: false };
const phones = [];
let until = 0;
let stopping = false;

/** Stops the run, then cleans up; used when anything goes wrong and on Ctrl+C. */
async function abort(reason, code) {
  if (stopping) return;
  stopping = true;
  until = 0;
  stats.finished = true;
  console.log(`\n\n⚠ The load test stopped: ${reason}`);
  console.log("Cleaning up what it added…");
  for (const { conn } of phones) conn.ws.close();
  try {
    const { removed } = await cleanUp(admin, before);
    console.log(`Cleaned up: removed ${removed} test crew(s) and put the screens back.`);
  } catch (error) {
    console.log(`Couldn't clean up (${error.message}). When your connection is back, run:`);
    console.log(`  npm run load-test -- ${base} <admin-password> --cleanup`);
  }
  process.exit(code);
}
process.on("SIGINT", () => void abort("you pressed Ctrl+C", 130));

try {
  const started0 = Date.now();
  for (let i = 1; i <= CREWS; i++) {
    const name = `${CREW_PREFIX}${String(i).padStart(2, "0")}`;
    const ack = await admin.act({ type: "team.add", team: { name, emoji: "🤖", members: [{ name: "Bot", srn: "" }], contact: "", notes: CREW_NOTES }, checkIn: true });
    if (!ack.ok && !/taken/.test(ack.error)) throw new Error(ack.error);
    process.stdout.write(`\rAdding crews: ${i}/${CREWS} (${((Date.now() - started0) / i / 1000).toFixed(1)} s each)   `);
  }
  await sleep(500);
  const crews = admin.view.staff.teams.filter(isTestCrew);

  console.log("");
  for (const crew of crews) {
    for (let p = 0; p < PHONES; p++) {
      phones.push({ crew, conn: await client({ t: "hello", role: "team", code: crew.code }, stats, "phone") });
      process.stdout.write(`\rConnecting phones: ${phones.length}/${crews.length * PHONES}   `);
    }
  }

  await admin.act({ type: "round.set", roundId: "finale", status: "open" });
  await admin.act({ type: "timer.start", seconds: MINUTES * 60 + 60, label: TIMER_LABEL });
  const c = admin.view.full?.caseFile ?? admin.view.caseFile;
  const thieves = c.suspects.map((s) => s.id);
  const places = c.locations.map((l) => l.id);
  const methods = c.methods.map((m) => m.id);

  const startHealth = await health();
  const started = Date.now();
  until = started + MINUTES * 60_000;
  console.log("\nPlaying… (every phone saves every 2–5 s, plus board marks, notes and announcements)");

  const loops = phones.map(async ({ conn }) => {
    await sleep(Math.random() * 3000);
    while (Date.now() < until) {
      const roll = Math.random();
      if (roll < 0.75) await conn.act({ type: "sub.save", roundId: "finale", data: { thiefId: pick(thieves), locationId: pick(places), methodId: pick(methods), bet: Math.floor(Math.random() * 90) * 10 } });
      else if (roll < 0.95) await conn.act({ type: "board.mark", key: `s:${pick(thieves)}`, mark: pick(["maybe", "cleared", "prime", "none"]) });
      else await conn.act({ type: "board.notes", notes: `theory ${Math.random().toString(36).repeat(20)}` });
      await sleep(2000 + Math.random() * 3000);
    }
  });
  const announcer = (async () => {
    if (keepAnnouncement) return;
    while (Date.now() < until) {
      await sleep(15_000);
      if (Date.now() < until) await admin.act({ type: "announce", text: `${ANNOUNCE_PREFIX} at ${new Date().toLocaleTimeString()}` });
    }
  })();
  const ticker = setInterval(() => {
    const s = [...stats.latencies].sort((a, b) => a - b);
    process.stdout.write(`\r  ${Math.round((Date.now() - started) / 1000)}s · ${stats.latencies.length} actions · median ${Math.round(percentile(s, 0.5))} ms · errors ${stats.errors.length}   `);
  }, 2000);
  // A phone that drops mid-test is counted, not fatal; only the admin connection is essential.
  await Promise.all([...loops.map((loop) => loop.catch(() => {})), announcer]);
  clearInterval(ticker);
  stats.finished = true;
  const endHealth = await health();

  console.log("\nCleaning up…");
  for (const { conn } of phones) conn.ws.close();
  await cleanUp(admin, before);
  admin.ws.close();

  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const seconds = (endHealth.uptimeMs - startHealth.uptimeMs) / 1000;
  const cpuShare = seconds > 0 ? (endHealth.cpuMs - startHealth.cpuMs) / 1000 / seconds : 0;
  const p95 = percentile(sorted, 0.95);
  const codes = Object.entries(stats.closeCodes).map(([code, n]) => `${n}× code ${code}`).join(", ");
  console.log("\n──────── Results ────────");
  console.log(`Actions sent:         ${sorted.length} (${(sorted.length / (MINUTES * 60)).toFixed(1)} per second)`);
  console.log(`Response time:        median ${Math.round(percentile(sorted, 0.5))} ms · 95% under ${Math.round(p95)} ms · slowest ${Math.round(sorted.at(-1) ?? 0)} ms`);
  console.log(`Errors:               ${stats.errors.length}${stats.errors.length ? ` (e.g. "${stats.errors[0]}")` : ""}`);
  console.log(`Unexpected drops:     ${stats.disconnects}${codes ? ` (${codes})` : ""}`);
  console.log(`Data per phone:       ${(stats.bytes / phones.length / 1024 / MINUTES).toFixed(0)} KB per minute`);
  console.log(`Server CPU used:      ${(cpuShare * 100).toFixed(1)}% of one core (Render's free plan gives a small share; under ~8% is comfortable)`);
  console.log(`Server memory:        ${endHealth.memoryMb} MB (free plan limit 512 MB)`);
  console.log(`Saving to database:   ${endHealth.storage.ok ? "OK" : `FAILING: ${endHealth.storage.error}`}`);
  const healthy = stats.errors.length === 0 && stats.disconnects === 0 && p95 < 1000 && endHealth.storage.ok;
  console.log(healthy ? "\n✅ The server kept up comfortably." : "\n⚠ Something needs a look: see the numbers above.");
  console.log("Test crews removed and screens put back where they were.");
  console.log('Tip: press "Reset after dry run" in Admin → Settings & data to clear the test messages from the live feed.');
  process.exit(healthy ? 0 : 1);
} catch (error) {
  await abort(error.message, 1);
}
