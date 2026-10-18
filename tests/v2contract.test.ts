import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const home = mkdtempSync(join(tmpdir(), "caveman-v2-test-"));
process.env.XDG_CONFIG_HOME = home;
// A current-mode id, deliberately different from the built-in default so the
// written flag proves the configured value was used.
process.env.CAVEMAN_DEFAULT_MODE = "ultracave";
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

  test("setup writes the configured default mode", async () => {
    const { ctx } = makeCtx();
    await adapter.default.setup(ctx);
    expect(readFileSync(flag, "utf8").trim()).toBe("ultracave");
  });

  test("session.created re-asserts the flag", async () => {
    const { ctx } = makeCtx([{ type: "session.created" }]);
    rmSync(flag, { force: true });
    await adapter.default.setup(ctx);
    await waitFor(flag, true);
    expect(readFileSync(flag, "utf8").trim()).toBe("ultracave");
  });

  test("prompt hook switches and clears the flag", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ prompt: { text: "/megacave" } });
    expect(readFileSync(flag, "utf8").trim()).toBe("megacave");
    await hooks["prompt"]({ prompt: { text: "stop caveman" } });
    expect(existsSync(flag)).toBe(false);
  });

  test("context hook injects one banner while active", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ prompt: { text: "/megacave" } });
    const output = { system: [] as unknown[] };
    await hooks["context"](output);
    const joined = JSON.stringify(output.system);
    expect(joined).toContain("CAVEMAN MODE ACTIVE (megacave)");
    await hooks["context"](output);
    expect(JSON.stringify(output.system).match(/CAVEMAN MODE ACTIVE/g)?.length).toBe(1);
  });

  test("explicit session modes stick, untouched sessions follow global", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ sessionID: "a", prompt: { text: "/megacave" } });
    const outA = { sessionID: "a", system: [] as unknown[] };
    const outB = { sessionID: "b", system: [] as unknown[] };
    await hooks["context"](outA);
    await hooks["context"](outB);
    expect(JSON.stringify(outA.system)).toContain("CAVEMAN MODE ACTIVE (megacave)");
    expect(JSON.stringify(outB.system)).toContain("CAVEMAN MODE ACTIVE (megacave)");
    await hooks["prompt"]({ sessionID: "b", prompt: { text: "/caveman caveman" } });
    const outA2 = { sessionID: "a", system: [] as unknown[] };
    const outB2 = { sessionID: "b", system: [] as unknown[] };
    await hooks["context"](outA2);
    await hooks["context"](outB2);
    expect(JSON.stringify(outA2.system)).toContain("CAVEMAN MODE ACTIVE (megacave)");
    expect(JSON.stringify(outB2.system)).toContain("CAVEMAN MODE ACTIVE (caveman)");
  });

  test("clear on one session leaves the other alone", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ sessionID: "a", prompt: { text: "/megacave" } });
    await hooks["prompt"]({ sessionID: "b", prompt: { text: "/caveman caveman" } });
    await hooks["prompt"]({ sessionID: "a", prompt: { text: "stop caveman" } });
    const outB = { sessionID: "b", system: [] as unknown[] };
    await hooks["context"](outB);
    expect(JSON.stringify(outB.system)).toContain("CAVEMAN MODE ACTIVE (caveman)");
  });

  test("action turn gets no injection, and exactly one turn only", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    await hooks["prompt"]({ sessionID: "s8", prompt: { text: "/caveman-commit fix it" } });
    const actionTurn = { sessionID: "s8", system: [] as unknown[] };
    await hooks["context"](actionTurn);
    expect(actionTurn.system).toEqual([]);
    const nextTurn = { sessionID: "s8", system: [] as unknown[] };
    await hooks["context"](nextTurn);
    expect(JSON.stringify(nextTurn.system)).toContain("CAVEMAN MODE ACTIVE (ultracave)");
  });

  test("action in one session never touches stored modes", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    const before = readFileSync(flag, "utf8");
    await hooks["prompt"]({ sessionID: "s9", prompt: { text: "/caveman-review the diff" } });
    const actionTurn = { sessionID: "s9", system: [] as unknown[] };
    await hooks["context"](actionTurn);
    expect(readFileSync(flag, "utf8")).toBe(before);
    expect(existsSync(join(adapter.__test.sessionsDir, "s9"))).toBe(false);
    const untouched = { sessionID: "s9b", system: [] as unknown[] };
    await hooks["context"](untouched);
    expect(JSON.stringify(untouched.system)).toContain("CAVEMAN MODE ACTIVE (ultracave)");
  });

  test("stored action ids are refused by the mode writer", () => {
    const before = readFileSync(flag, "utf8");
    for (const action of ["commit", "review", "compress"]) {
      expect(() => adapter.__test.writeModeFlag(flag, action)).toThrow();
    }
    expect(readFileSync(flag, "utf8")).toBe(before);
  });

  test("action configured as default keeps the caveman default", async () => {
    process.env.CAVEMAN_DEFAULT_MODE = "commit";
    try {
      const { ctx } = makeCtx();
      await adapter.default.setup(ctx);
      expect(readFileSync(flag, "utf8").trim()).toBe("caveman");
    } finally {
      process.env.CAVEMAN_DEFAULT_MODE = "ultracave";
    }
  });

  test("legacy stored action is pruned and the base banner returns", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    mkdirSync(adapter.__test.sessionsDir, { recursive: true });
    writeFileSync(join(adapter.__test.sessionsDir, "old"), "commit");
    const out = { sessionID: "old", system: [] as unknown[] };
    await hooks["context"](out);
    expect(JSON.stringify(out.system)).toContain("CAVEMAN MODE ACTIVE (ultracave)");
    expect(existsSync(join(adapter.__test.sessionsDir, "old"))).toBe(false);
  });

  test("manual default activates caveman on setup", async () => {
    process.env.CAVEMAN_DEFAULT_MODE = "manual";
    try {
      const { ctx } = makeCtx();
      await adapter.default.setup(ctx);
      expect(readFileSync(flag, "utf8").trim()).toBe("caveman");
    } finally {
      process.env.CAVEMAN_DEFAULT_MODE = "ultracave";
    }
  });

  test("/caveman status reports the mode without changing it", async () => {
    const { ctx, hooks } = makeCtx();
    await adapter.default.setup(ctx);
    const input = { prompt: { text: "/caveman status" } };
    await hooks["prompt"](input);
    expect(input.prompt.text).toContain("Report this status verbatim");
    expect(input.prompt.text).toContain("Caveman mode: ultracave");
    expect(readFileSync(flag, "utf8").trim()).toBe("ultracave");
  });

  test("resolves vendored helpers without override", async () => {
    delete process.env.CAVEMAN_HELPERS_DIR;
    const mod = await import(join(ROOT, "adapter", "v2", "caveman.ts") + "?layout=realpath");
    expect(mod.default.id).toBe("caveman");
    process.env.CAVEMAN_HELPERS_DIR = join(ROOT, "vendor", "src", "hooks");
  });

  test("trims oversized mode log on setup", async () => {
    const { writeFileSync, statSync } = await import("node:fs");
    const log = join(home, "opencode", ".caveman-mode-log.jsonl");
    writeFileSync(log, Array.from({ length: 5000 }, (_, i) => `{"i":${i},"pad":"${"x".repeat(300)}"}`).join("\n") + "\n");
    expect(statSync(log).size).toBeGreaterThan(1024 * 1024);
    const { ctx } = makeCtx();
    await adapter.default.setup(ctx);
    const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(1000);
    expect(lines.some((line) => JSON.parse(line).i === 4999)).toBe(true);
  });
});
