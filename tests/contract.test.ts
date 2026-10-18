import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const VENDOR = join(ROOT, "vendor");
const PLUGIN = join(VENDOR, "src/plugins/opencode");

const pin = JSON.parse(readFileSync(join(ROOT, "UPSTREAM_PIN.json"), "utf8"));

// env before the plugin import: it resolves its flag path at module load.
const TEST_HOME = mkdtempSync(join(tmpdir(), "caveman-plugin-test-"));
process.env.XDG_CONFIG_HOME = TEST_HOME;
process.env.CAVEMAN_DEFAULT_MODE = "ultracave";

const require = createRequire(import.meta.url);
const testConfig = require(join(VENDOR, "src/hooks/caveman-config.js"));
const testParse = require(join(VENDOR, "src/hooks/caveman-parse.js"));
const { CavemanPlugin } = await import(join(PLUGIN, "plugin.js"));

describe("pin", () => {
  test("records repo, full sha and one hash per file", () => {
    expect(pin.repo).toBe("JuliusBrussee/caveman");
    expect(pin.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(pin.files).length).toBeGreaterThan(0);
  });

  test("vendor matches the pin byte for byte", () => {
    for (const [rel, hash] of Object.entries<string>(pin.files)) {
      const body = readFileSync(join(VENDOR, rel));
      expect(createHash("sha256").update(body).digest("hex")).toBe(hash);
    }
  });
});

describe("payload", () => {
  const COMMANDS = [
    "caveman",
    "ultracave",
    "megacave",
    "caveman-commit",
    "caveman-review",
    "caveman-compress",
    "caveman-stats",
    "caveman-help",
  ];

  test("plugin entry is an esm module with main plugin.js", () => {
    const pkg = JSON.parse(readFileSync(join(PLUGIN, "package.json"), "utf8"));
    expect(pkg.type).toBe("module");
    expect(pkg.main).toBe("plugin.js");
    expect(existsSync(join(PLUGIN, "plugin.js"))).toBe(true);
  });

  test("commands exist and carry a description", () => {
    for (const name of COMMANDS) {
      const text = readFileSync(join(PLUGIN, "commands", `${name}.md`), "utf8");
      expect(text).toMatch(/^---\ndescription: .+/m);
    }
  });

  test("shared helpers are vendored", () => {
    for (const f of ["src/hooks/caveman-config.js", "src/hooks/caveman-parse.js"]) {
      expect(existsSync(join(VENDOR, f))).toBe(true);
    }
  });

  test("skills and agents are vendored", () => {
    for (const s of ["caveman", "ultracave", "megacave", "caveman-commit", "caveman-review", "caveman-help", "caveman-stats", "caveman-compress", "cavecrew"]) {
      expect(existsSync(join(VENDOR, "skills", s, "SKILL.md"))).toBe(true);
    }
    for (const a of ["cavecrew-investigator.md", "cavecrew-builder.md", "cavecrew-reviewer.md"]) {
      expect(existsSync(join(VENDOR, "agents", a))).toBe(true);
    }
  });

  test("vendored compress skill keeps the atomic utf-8 write", () => {
    const source = readFileSync(join(VENDOR, "skills/caveman-compress/scripts/compress.py"), "utf8");
    expect(source).toContain("os.replace(");
    expect(source).toContain('encoding="utf-8"');
  });
});

describe("helper API surface", () => {
  test("parse helper exposes the mode API", () => {
    expect(typeof testParse.parseModeChange).toBe("function");
    expect(testParse.INDEPENDENT_MODES instanceof Set).toBe(true);
    for (const action of ["commit", "review", "compress"]) {
      expect(testParse.INDEPENDENT_MODES.has(action)).toBe(true);
    }
  });

  test("config helper exposes the adapter API", () => {
    for (const key of ["getDefaultMode", "canonicalMode", "safeWriteFlag", "readFlag", "recordModeChange", "loadRuleset", "thesisLine"]) {
      expect(typeof testConfig[key]).toBe("function");
    }
  });
});

describe("command templates", () => {
  const body = (name: string) =>
    readFileSync(join(PLUGIN, "commands", name), "utf8").replace(/^---[\s\S]*?---\s*/, "");
  const opts = { getDefaultMode: () => "caveman", expandedTpl: true, unwrapQuotes: true };

  test("expanded templates keep resolving to their modes", () => {
    const expectations: Array<[string, unknown]> = [
      [body("caveman.md").replace("$ARGUMENTS", ""), { action: "set", mode: "caveman" }],
      [body("caveman.md").replace("$ARGUMENTS", "ultracave"), { action: "set", mode: "ultracave" }],
      [body("caveman.md").replace("$ARGUMENTS", "off"), { action: "clear" }],
      [body("caveman.md").replace("$ARGUMENTS", "status"), { action: "status" }],
      [body("caveman-commit.md"), { action: "set", mode: "commit" }],
      [body("caveman-review.md"), { action: "set", mode: "review" }],
      [body("caveman-compress.md"), { action: "set", mode: "compress" }],
      [body("ultracave.md"), { action: "set", mode: "ultracave" }],
      [body("megacave.md"), { action: "set", mode: "megacave" }],
    ];
    for (const [text, expected] of expectations) {
      expect(testParse.parseModeChange(text, opts)).toEqual(expected);
    }
    expect(testParse.parseModeChange(body("caveman-help.md"), opts)).toBeNull();
    expect(testParse.parseModeChange(body("caveman-stats.md"), opts)).toBeNull();
  });
});

describe("plugin behavior", () => {
  const home = TEST_HOME;
  const flag = join(home, "opencode", ".caveman-active");
  const config = testConfig;

  const msg = (text: string) => ({ parts: [{ type: "text", text }] });
  let hooks: Record<string, (input: never, output: never) => Promise<void>>;

  afterAll(() => rmSync(home, { recursive: true, force: true }));

  test("factory exposes the three hooks", async () => {
    hooks = await CavemanPlugin({});
    for (const key of ["event", "chat.message", "experimental.chat.system.transform"]) {
      expect(typeof hooks[key]).toBe("function");
    }
  });

  test("session start writes the configured default mode", async () => {
    expect(config.readFlag(flag)).toBe("ultracave");
    rmSync(flag, { force: true });
    await hooks["event"]({ event: { type: "session.created" } });
    expect(config.readFlag(flag)).toBe("ultracave");
  });

  test("mode command switches the flag", async () => {
    await hooks["chat.message"](undefined, msg("/megacave"));
    expect(config.readFlag(flag)).toBe("megacave");
  });

  test("independent command records its own mode", async () => {
    await hooks["chat.message"](undefined, msg("/caveman-commit fix the login bug"));
    expect(config.readFlag(flag)).toBe("commit");
  });

  test("transform skips independent modes", async () => {
    const output = { system: ["hello"] };
    await hooks["experimental.chat.system.transform"](undefined, output);
    expect(output.system).toEqual(["hello"]);
  });

  test("natural-language stop clears the flag", async () => {
    await hooks["chat.message"](undefined, msg("stop caveman"));
    expect(config.readFlag(flag)).toBeNull();
    expect(existsSync(flag)).toBe(false);
  });

  test("transform is a no-op while caveman is off", async () => {
    const output = { system: ["hello"] };
    await hooks["experimental.chat.system.transform"](undefined, output);
    expect(output.system).toEqual(["hello"]);
  });

  test("transform injects one banner while active", async () => {
    await hooks["chat.message"](undefined, msg("/megacave"));
    const output = { system: ["hello"] };
    const transform = hooks["experimental.chat.system.transform"];
    await transform(undefined, output);
    expect(output.system.join("\n")).toContain("CAVEMAN MODE ACTIVE (megacave)");
    await transform(undefined, output);
    const hits = output.system.join("\n").match(/CAVEMAN MODE ACTIVE/g) ?? [];
    expect(hits.length).toBe(1);
  });

  test("/caveman status reports the mode without changing it", async () => {
    const out = msg("/caveman status");
    await hooks["chat.message"](undefined, out);
    expect(out.parts[0].text).toContain("Report this status verbatim");
    expect(out.parts[0].text).toContain("Caveman mode: megacave");
    expect(config.readFlag(flag)).toBe("megacave");
  });
});
