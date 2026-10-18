import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dir, "..");

// Contract for the installer's output, run against its own throwaway config
// dir: what it writes must be byte-identical to the vendored sources, so a
// stale or hand-edited install can never drift unnoticed. Provisioning it
// here keeps the suite deterministic everywhere — no ambient home state, no
// skips, no workflow-injected directories.
const home = mkdtempSync(join(tmpdir(), "caveman-installed-test-"));
const installed = join(home, "opencode", "plugins", "caveman");

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("installed payload", () => {
  beforeAll(() => {
    const res = spawnSync("sh", [join(ROOT, "scripts", "install-pinned.sh")], {
      env: { ...process.env, XDG_CONFIG_HOME: home },
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
  });

  for (const [rel, name] of [
    ["vendor/src/hooks/caveman-config.js", "caveman-config.cjs"],
    ["vendor/src/hooks/caveman-parse.js", "caveman-parse.cjs"],
  ] as Array<[string, string]>) {
    test(`${name} matches ${rel} byte for byte`, () => {
      expect(sha(join(installed, name))).toBe(sha(join(ROOT, rel)));
    });
  }

  test("package.json keeps loader-relevant fields", () => {
    const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
    expect(pkg.name).toBe("caveman-opencode-plugin");
    expect(pkg.type).toBe("module");
  });
});
