import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dir, "..");
const SH_SCRIPT = join(ROOT, "shell", "caveman-prompt.sh");
const FISH_SCRIPT = join(ROOT, "shell", "caveman-prompt.fish");

const home = mkdtempSync(join(tmpdir(), "caveman-shell-test-"));
const configDir = join(home, "opencode");
const flag = join(configDir, ".caveman-active");

afterAll(() => rmSync(home, { recursive: true, force: true }));

function cleanFlag() {
  mkdirSync(configDir, { recursive: true });
  rmSync(flag, { force: true });
}

function runSh(): string {
  const res = spawnSync("bash", ["-c", 'source "$1"; caveman_prompt_segment', "bash", SH_SCRIPT], {
    env: { ...process.env, XDG_CONFIG_HOME: home },
    encoding: "utf8",
  });
  return res.stdout;
}

function runFish(): string {
  const res = spawnSync("fish", ["-c", "source $argv[1]; caveman_prompt_segment", FISH_SCRIPT], {
    env: { ...process.env, XDG_CONFIG_HOME: home },
    encoding: "utf8",
  });
  return res.stdout;
}

const fishAvailable = spawnSync("fish", ["--version"]).status === 0;

describe("shell prompt segment (bash)", () => {
  test("renders the stored mode without trailing newline noise", () => {
    cleanFlag();
    writeFileSync(flag, "ultracave\n");
    expect(runSh()).toBe("caveman:ultracave");
  });

  test("renders nothing without a flag", () => {
    cleanFlag();
    expect(runSh()).toBe("");
  });

  test("rejects garbage and multiline overflow", () => {
    cleanFlag();
    writeFileSync(flag, "not a mode!\nultracave\n");
    expect(runSh()).toBe("");
    writeFileSync(flag, "megacave\nextra\n");
    expect(runSh()).toBe("caveman:megacave");
  });

  test("ignores a symlinked flag", () => {
    cleanFlag();
    writeFileSync(join(configDir, "elsewhere"), "ultracave\n");
    symlinkSync(join(configDir, "elsewhere"), flag);
    expect(runSh()).toBe("");
  });
});

describe("shell prompt segment (fish)", () => {
  test.skipIf(!fishAvailable)("renders the stored mode and ignores garbage", () => {
    cleanFlag();
    writeFileSync(flag, "ultracave\n");
    expect(runFish()).toBe("caveman:ultracave");
    writeFileSync(flag, "not a mode!\n");
    expect(runFish()).toBe("");
  });
});
