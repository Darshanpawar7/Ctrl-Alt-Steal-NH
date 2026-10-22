// Worker entry. Static files are served by Workers Assets; only /api/*
// reaches this code, and all of it goes to the single game room.

import { GameRoom } from "./room";

export { GameRoom };

const ROOM_NAME = "ctrl-alt-steal";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.GAME.getByName(ROOM_NAME).fetch(request);
  },
} satisfies ExportedHandler<Env>;
