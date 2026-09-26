import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const home = mkdtempSync(join(tmpdir(), "caveman-v2-test-"));
process.env.XDG_CONFIG_HOME = home;
process.env.CAVEMAN_DEFAULT_MODE = "full";
process.env.CAVEMAN_HELPERS_DIR = join(ROOT, "vendor", "src", "hooks");

const flag = join(home, "opencode", ".caveman-active");
const adapter = await import(join(ROOT, "adapter", "v2", "caveman.ts"));

function makeCtx(events: unknown[] = []) {
  const hooks: Record<string, (input: any) => Promise<void>> = {};
  return {
    hooks,
    ctx: {
      event: {
        subscribe: () => (async function* () {
          for (const event of events) yield event;
        })(),
      },
      session: {
        hook: async (name: string, callback: (input: any) => Promise<void>) => {
          hooks[name] = callback;
          return { dispose: async () => {} };
        },
      },
    },
  };
}

async function waitFor(path: string, present: boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (existsSync(path) === present) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timeout waiting for ${path} present=${present}`);
}

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("v2 adapter", () => {
  test("default export carries id and setup", () => {
    expect(adapter.default.id).toBe("caveman");
    expect(typeof adapter.default.setup).toBe("function");
  });

  test("setup writes the default flag", async () => {
    const { ctx } = makeCtx();
    await adapter.default.setup(ctx);
    expect(readFileSync(flag, "utf8").trim()).toBe("full");
  });

  test("session.created re-asserts the flag", async () => {
    const { ctx } = makeCtx([{ type: "session.created" }]);
    rmSync(flag, { force: true });
    await adapter.default.setup(ctx);
    await waitFor(flag, true);
    expect(readFileSync(flag, "utf8").trim()).toBe("full");
  });

  test("prompt hook switches and clears the flag", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ prompt: { text: "/caveman ultra" } });
    expect(readFileSync(flag, "utf8").trim()).toBe("ultra");
    await hooks["prompt"]({ prompt: { text: "stop caveman" } });
    expect(existsSync(flag)).toBe(false);
  });

  test("context hook injects one banner while active", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ prompt: { text: "/caveman ultra" } });
    const output = { system: [] as unknown[] };
    await hooks["context"](output);
    const joined = JSON.stringify(output.system);
    expect(joined).toContain("CAVEMAN MODE ACTIVE (ultra)");
    await hooks["context"](output);
    expect(JSON.stringify(output.system).match(/CAVEMAN MODE ACTIVE/g)?.length).toBe(1);
  });

  test("context hook skips independent modes", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ sessionID: "s1", prompt: { text: "/caveman-commit fix it" } });
    expect(readFileSync(flag, "utf8").trim()).toBe("commit");
    const output = { sessionID: "s1", system: [{ type: "text", text: "hello" }] };
    await hooks["context"](output);
    expect(output.system).toEqual([{ type: "text", text: "hello" }]);
  });

  test("explicit session modes stick, untouched sessions follow global", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ sessionID: "a", prompt: { text: "/caveman ultra" } });
    const outA = { sessionID: "a", system: [] as unknown[] };
    const outB = { sessionID: "b", system: [] as unknown[] };
    await hooks["context"](outA);
    await hooks["context"](outB);
    expect(JSON.stringify(outA.system)).toContain("CAVEMAN MODE ACTIVE (ultra)");
    expect(JSON.stringify(outB.system)).toContain("CAVEMAN MODE ACTIVE (ultra)");
    await hooks["prompt"]({ sessionID: "b", prompt: { text: "/caveman lite" } });
    const outA2 = { sessionID: "a", system: [] as unknown[] };
    const outB2 = { sessionID: "b", system: [] as unknown[] };
    await hooks["context"](outA2);
    await hooks["context"](outB2);
    expect(JSON.stringify(outA2.system)).toContain("CAVEMAN MODE ACTIVE (ultra)");
    expect(JSON.stringify(outB2.system)).toContain("CAVEMAN MODE ACTIVE (lite)");
  });

  test("clear on one session leaves the other alone", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ sessionID: "a", prompt: { text: "/caveman ultra" } });
    await hooks["prompt"]({ sessionID: "b", prompt: { text: "/caveman lite" } });
    await hooks["prompt"]({ sessionID: "a", prompt: { text: "stop caveman" } });
    const outB = { sessionID: "b", system: [] as unknown[] };
    await hooks["context"](outB);
    expect(JSON.stringify(outB.system)).toContain("CAVEMAN MODE ACTIVE (lite)");
  });

  test("resolves vendored helpers without override", async () => {
    delete process.env.CAVEMAN_HELPERS_DIR;
    const mod = await import(join(ROOT, "adapter", "v2", "caveman.ts") + "?layout=realpath");
    expect(mod.default.id).toBe("caveman");
    process.env.CAVEMAN_HELPERS_DIR = join(ROOT, "vendor", "src", "hooks");
  });
});
