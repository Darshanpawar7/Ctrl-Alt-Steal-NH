// `npm run dev`: starts the game server and the website together.
import { spawn } from "node:child_process";

const children = [
  spawn("npx", ["tsx", "watch", "src/server/main.ts"], { stdio: "inherit", shell: true }),
  spawn("npx", ["vite"], { stdio: "inherit", shell: true }),
];

function stopAll() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
for (const child of children) child.on("exit", stopAll);
