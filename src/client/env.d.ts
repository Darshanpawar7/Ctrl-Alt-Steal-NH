/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The game server's address, e.g. https://ctrl-alt-steal-api.onrender.com. Empty = same address as the website. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
