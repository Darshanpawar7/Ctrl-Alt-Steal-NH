import { describe, expect, test } from "vitest";
import config from "../vite.config";

describe("website build", () => {
  test("fonts stay separate files, because the security policy blocks fonts inlined as data: URLs", () => {
    const limit = config.build?.assetsInlineLimit;
    expect(typeof limit).toBe("function");
    const inline = limit as (filePath: string, content: Buffer) => boolean | undefined;
    const tiny = Buffer.alloc(100);
    expect(inline("/node_modules/@fontsource-variable/unbounded/files/unbounded-cyrillic-ext-wght-normal.woff2", tiny)).toBe(false);
    expect(inline("/fonts/plain.woff", tiny)).toBe(false);
    // Everything else keeps Vite's default rule.
    expect(inline("/src/client/icon.svg", tiny)).toBeUndefined();
  });
});
