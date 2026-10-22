// Load test: pretends to be a full hall of crews playing at once, against a
// running game server, and reports whether the server keeps up.
//
//   npm run load-test -- <server-url> <admin-password> [--crews 40] [--phones 3] [--minutes 3]
//
// Example:
//   npm run load-test -- https://ctrl-alt-steal-api.onrender.com my-admin-password
//
// Run it BEFORE the event day. It adds "Load Crew" teams, opens the finale
// round, makes every phone auto-save answers every few seconds, and then
// removes its crews and closes the round again. Afterwards, press
// "Reset after dry run" in Admin → Settings & data to clear the live feed.

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const [serverUrl, password] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!serverUrl || !password) {
  console.log("Usage: npm run load-test -- <server-url> <admin-password> [--crews 40] [--phones 3] [--minutes 3]");
  process.exit(1);
}
const CREWS = flag("crews", 40);
const PHONES = flag("phones", 3);
const MINUTES = flag("minutes", 3);
const base = serverUrl.replace(/\/$/, "");
const wsUrl = `${base.replace(/^http/, "ws")}/api/ws`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

/** One WebSocket connection that tracks acks, timings and traffic. */
function client(hello, stats) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    let view = null;
    const c = {
      ws,
      get view() {
        return view;
      },
      act(action) {
        const id = String(++seq);
        const sent = performance.now();
        ws.send(JSON.stringify({ t: "act", id, action }));
        return new Promise((done) => pending.set(id, { done, sent }));
      },
    };
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onerror = () => reject(new Error("could not connect"));
    ws.onclose = () => {
      if (stats && !stats.finished) stats.disconnects++;
    };
    ws.onmessage = (event) => {
      const text = String(event.data);
      if (stats) {
        stats.messages++;
        stats.bytes += text.length;
      }
      if (text === "pong") return;
      const msg = JSON.parse(text);
      if (msg.t === "denied") reject(new Error(msg.reason));
      if (msg.t === "state") {
        view = msg.view;
        resolve(c);
      }
      if (msg.t === "patch" && view) view = { ...view, ...msg.view };
      if (msg.t === "ack") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        const ms = performance.now() - p.sent;
        if (stats) {
          stats.latencies.push(ms);
          if (!msg.ok) stats.errors.push(msg.error);
        }
        p.done(msg);
      }
    };
    setTimeout(() => reject(new Error("timed out connecting")), 20_000);
  });
}

async function health() {
  const res = await fetch(`${base}/api/health`);
  return res.json();
}

console.log(`Load test: ${CREWS} crews × ${PHONES} phones for ${MINUTES} min against ${base}`);
console.log("Waking the server…");
const h0 = await health();
console.log(`Server is up · storage: ${h0.storage.kind} · ${h0.memoryMb} MB memory`);

const admin = await client({ t: "hello", role: "admin", password }, null);
if (admin.view.status.finale !== "pending") {
  console.log("The finale round is already in use. Run this before the event (or reset the game first).");
  process.exit(1);
}

console.log(`Adding ${CREWS} load-test crews…`);
for (let i = 1; i <= CREWS; i++) {
  const name = `Load Crew ${String(i).padStart(2, "0")}`;
  const ack = await admin.act({ type: "team.add", team: { name, emoji: "🤖", members: [{ name: "Bot", srn: "" }], contact: "", notes: "load test" }, checkIn: true });
  if (!ack.ok && !/taken/.test(ack.error)) throw new Error(ack.error);
}
await sleep(500);
const crews = admin.view.staff.teams.filter((t) => t.name.startsWith("Load Crew "));

const stats = { latencies: [], errors: [], messages: 0, bytes: 0, disconnects: 0, finished: false };
console.log(`Connecting ${crews.length * PHONES} phones…`);
const phones = [];
for (const crew of crews) for (let p = 0; p < PHONES; p++) phones.push({ crew, conn: await client({ t: "hello", role: "team", code: crew.code }, stats) });

await admin.act({ type: "round.set", roundId: "finale", status: "open" });
await admin.act({ type: "timer.start", seconds: MINUTES * 60 + 60, label: "Load test" });
const c = admin.view.caseFile;
const thieves = c.suspects.map((s) => s.id);
const places = c.locations.map((l) => l.id);
const methods = c.methods.map((m) => m.id);

const before = await health();
const started = Date.now();
const until = started + MINUTES * 60_000;
console.log("Playing… (every phone saves every 2–5 s, plus board marks, notes and announcements)");

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
  while (Date.now() < until) {
    await sleep(15_000);
    await admin.act({ type: "announce", text: `Load test announcement at ${new Date().toLocaleTimeString()}` });
  }
})();
const ticker = setInterval(() => {
  const s = [...stats.latencies].sort((a, b) => a - b);
  process.stdout.write(`\r  ${Math.round((Date.now() - started) / 1000)}s · ${stats.latencies.length} actions · median ${Math.round(percentile(s, 0.5))} ms · errors ${stats.errors.length}   `);
}, 2000);
await Promise.all([...loops, announcer]);
clearInterval(ticker);
stats.finished = true;
const after = await health();

console.log("\nCleaning up…");
await admin.act({ type: "round.set", roundId: "finale", status: "pending" });
await admin.act({ type: "timer.clear" });
await admin.act({ type: "announce", text: "" });
for (const crew of crews) await admin.act({ type: "team.remove", id: crew.id });
for (const { conn } of phones) conn.ws.close();
admin.ws.close();

const sorted = [...stats.latencies].sort((a, b) => a - b);
const seconds = (after.uptimeMs - before.uptimeMs) / 1000;
const cpuShare = seconds > 0 ? (after.cpuMs - before.cpuMs) / 1000 / seconds : 0;
const p95 = percentile(sorted, 0.95);
console.log("\n──────── Results ────────");
console.log(`Actions sent:         ${sorted.length} (${(sorted.length / (MINUTES * 60)).toFixed(1)} per second)`);
console.log(`Response time:        median ${Math.round(percentile(sorted, 0.5))} ms · 95% under ${Math.round(p95)} ms · slowest ${Math.round(sorted.at(-1) ?? 0)} ms`);
console.log(`Errors:               ${stats.errors.length}${stats.errors.length ? ` (e.g. "${stats.errors[0]}")` : ""}`);
console.log(`Unexpected drops:     ${stats.disconnects}`);
console.log(`Data per phone:       ${(stats.bytes / phones.length / 1024 / MINUTES).toFixed(0)} KB per minute`);
console.log(`Server CPU used:      ${(cpuShare * 100).toFixed(1)}% of one core (Render's free plan gives a small share; under ~8% is comfortable)`);
console.log(`Server memory:        ${after.memoryMb} MB (free plan limit 512 MB)`);
console.log(`Saving to database:   ${after.storage.ok ? "OK" : `FAILING: ${after.storage.error}`}`);
const healthy = stats.errors.length === 0 && stats.disconnects === 0 && p95 < 1000 && after.storage.ok;
console.log(healthy ? "\n✅ The server kept up comfortably." : "\n⚠ Something needs a look: see the numbers above.");
console.log('Tip: press "Reset after dry run" in Admin → Settings & data to clear the test announcements from the feed.');
process.exit(healthy ? 0 : 1);
