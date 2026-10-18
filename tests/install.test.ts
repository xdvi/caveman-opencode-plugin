import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dir, "..");
const testHome = mkdtempSync(join(tmpdir(), "caveman-install-test-"));

afterAll(() => rmSync(testHome, { recursive: true, force: true }));

describe("surgical v2 installer", () => {
  test("installs clean v2 plugin without dumping claude/gemini subagents or python scripts", () => {
    const configDir = join(testHome, "opencode");
    const res = spawnSync("sh", [join(ROOT, "scripts", "install-pinned.sh")], {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: testHome,
      },
      encoding: "utf8",
    });

    expect(res.status).toBe(0);

    // 1. Must install v2 adapter and required CJS helpers, and no v1 payload
    expect(existsSync(join(configDir, "plugins", "caveman-v2.ts"))).toBe(true);
    expect(existsSync(join(configDir, "plugins", "caveman", "caveman-config.cjs"))).toBe(true);
    expect(existsSync(join(configDir, "plugins", "caveman", "caveman-parse.cjs"))).toBe(true);
    expect(existsSync(join(configDir, "plugins", "caveman", "plugin.js"))).toBe(false);

    // 2. Must install the mode skills and the command skills
    expect(existsSync(join(configDir, "skills", "caveman", "SKILL.md"))).toBe(true);
    expect(existsSync(join(configDir, "skills", "ultracave", "SKILL.md"))).toBe(true);
    expect(existsSync(join(configDir, "skills", "megacave", "SKILL.md"))).toBe(true);

    // 3. Must NOT dump Claude/Gemini subagents into agents/
    const agentsDir = join(configDir, "agents");
    if (existsSync(agentsDir)) {
      const files = readdirSync(agentsDir);
      expect(files.some((f) => f.startsWith("cavecrew"))).toBe(false);
    }

    // 4. caveman-compress ships as a command, so its skill must be present
    expect(existsSync(join(configDir, "skills", "caveman-compress", "SKILL.md"))).toBe(true);
    expect(existsSync(join(configDir, "skills", "caveman-compress", "scripts", "__main__.py"))).toBe(true);

    // 5. Tier-3 AGENTS.md fence names the current mode commands
    const agentsMd = readFileSync(join(configDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("/ultracave");
    expect(agentsMd).toContain("/megacave");
  });
});
