// Developer tool: runs the game server with the CPU profiler on for a fixed
// time (start a load test against it meanwhile), then prints where the CPU
// time went. Usage: npx tsx scripts/profile-server.ts [seconds] [port]

import { Session } from "node:inspector/promises";
import { createApp } from "../src/server/app";
import { GameServer } from "../src/server/game-server";
import { FileStore } from "../src/server/store";

const seconds = Number(process.argv[2] ?? 60);
const port = Number(process.argv[3] ?? 8788);

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}

const game = new GameServer(new FileStore(null), { adminPassword: "change-me-admin", volunteerPassword: "change-me-desk" });
await game.start();
const server = createApp(game, { allowedOrigins: [], clientDir: null });
server.listen(port);
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.start");
console.log(`profiling for ${seconds}s on port ${port}…`);
await new Promise((r) => setTimeout(r, seconds * 1000));
const { profile } = (await session.post("Profiler.stop")) as { profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] } };

// Self time per function.
const self = new Map<number, number>();
profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
const byName = new Map<string, number>();
let busy = 0;
for (const node of profile.nodes) {
  const us = self.get(node.id) ?? 0;
  const { functionName, url, lineNumber } = node.callFrame;
  if (functionName === "(idle)" || functionName === "(program)") continue;
  busy += us;
  const where = url ? `${url.split(/[\\/]/).slice(-2).join("/")}:${lineNumber + 1}` : "";
  const key = `${functionName || "(anonymous)"} ${where}`;
  byName.set(key, (byName.get(key) ?? 0) + us);
}
console.log(`busy CPU: ${(busy / 1000).toFixed(0)} ms over ${seconds}s = ${((busy / 1e6 / seconds) * 100).toFixed(1)}% of one core`);
for (const [name, us] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${(us / 1000).toFixed(1).padStart(8)} ms  ${name}`);
server.close();
await game.shutdown();
process.exit(0);
