import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const ROOT = join(import.meta.dir, "..");

const PAIRS: Array<[string, string]> = [
  ["vendor/src/hooks/caveman-config.js", "caveman-config.cjs"],
  ["vendor/src/hooks/caveman-parse.js", "caveman-parse.cjs"],
  ["vendor/src/plugins/opencode/plugin.js", "plugin.js"],
  ["vendor/src/plugins/opencode/package.json", "package.json"],
];

function candidates(): string[] {
  const dirs = [];
  if (process.env.XDG_CONFIG_HOME) dirs.push(join(process.env.XDG_CONFIG_HOME, "opencode"));
  dirs.push(join(os.homedir(), ".config", "opencode"));
  return dirs.map((dir) => join(dir, "plugins", "caveman"));
}

const INSTALLED =
  candidates().find((dir) => PAIRS.every(([, name]) => existsSync(join(dir, name)))) ?? candidates()[0];

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const present = PAIRS.every(([, name]) => existsSync(join(INSTALLED, name)));
describe.skipIf(!present)("installed payload", () => {
  for (const [rel, name] of PAIRS.slice(0, 3)) {
    test(`${name} matches ${rel} byte for byte`, () => {
      expect(sha(join(INSTALLED, name))).toBe(sha(join(ROOT, rel)));
    });
  }

  test("package.json keeps loader-relevant fields", () => {
    const pkg = JSON.parse(readFileSync(join(INSTALLED, "package.json"), "utf8"));
    expect(pkg.name).toBe("caveman-opencode-plugin");
    expect(pkg.type).toBe("module");
  });
});
