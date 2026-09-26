import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

    // 1. Must install v2 adapter and required CJS helpers
    expect(existsSync(join(configDir, "plugins", "caveman-v2.ts"))).toBe(true);
    expect(existsSync(join(configDir, "plugins", "caveman", "caveman-config.cjs"))).toBe(true);
    expect(existsSync(join(configDir, "plugins", "caveman", "caveman-parse.cjs"))).toBe(true);

    // 2. Must install core skills
    expect(existsSync(join(configDir, "skills", "caveman", "SKILL.md"))).toBe(true);

    // 3. Must NOT dump Claude/Gemini subagents into agents/
    const agentsDir = join(configDir, "agents");
    if (existsSync(agentsDir)) {
      const files = readdirSync(agentsDir);
      expect(files.some((f) => f.startsWith("cavecrew"))).toBe(false);
    }

    // 4. caveman-compress ships as a command, so its skill must be present
    expect(existsSync(join(configDir, "skills", "caveman-compress", "SKILL.md"))).toBe(true);
    expect(existsSync(join(configDir, "skills", "caveman-compress", "scripts", "__main__.py"))).toBe(true);
  });
});
