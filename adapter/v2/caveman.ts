import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function helperDir(): string {
  const override = process.env.CAVEMAN_HELPERS_DIR;
  if (override && existsSync(join(override, "caveman-config.js"))) return override;
  const installed = join(here, "caveman");
  if (existsSync(join(installed, "caveman-config.cjs")) || existsSync(join(installed, "caveman-config.js"))) {
    return installed;
  }
  return join(here, "..", "..", "vendor", "src", "hooks");
}

function loadCjs(target: string) {
  const code = readFileSync(target, "utf8").replace(/^#![^\n]*\n/, "");
  const mod = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", "require", "__dirname", "__filename", code)(
    mod,
    mod.exports,
    createRequire(pathToFileURL(target).href),
    dirname(target),
    target,
  );
  return mod.exports as Record<string, any>;
}

function loadHelper(name: string): Record<string, any> {
  const dir = helperDir();
  for (const file of [`${name}.js`, `${name}.cjs`]) {
    const target = join(dir, file);
    if (existsSync(target)) return loadCjs(target);
  }
  throw new Error(`caveman: helper missing: ${name}`);
}

const config = loadHelper("caveman-config");
const { getDefaultMode, safeWriteFlag, readFlag } = config;
const recordModeChange: (dir: string, mode: string | null) => void =
  config.recordModeChange || (() => {});
const { parseModeChange, INDEPENDENT_MODES } = loadHelper("caveman-parse");

function opencodeConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, "opencode");
  return path.join(os.homedir(), ".config", "opencode");
}

const opencodeDir = opencodeConfigDir();
const flagPath = path.join(opencodeDir, ".caveman-active");
const sessionsDir = path.join(opencodeDir, ".caveman-sessions");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MODE_LOG_MAX_BYTES = 1024 * 1024;
const MODE_LOG_KEEP_LINES = 1000;

function sessionFlagPath(sessionID: string): string {
  return path.join(sessionsDir, sessionID);
}

function resolveMode(sessionID?: string): string | null {
  if (sessionID) {
    try {
      const mode = readFlag(sessionFlagPath(sessionID));
      if (mode) return mode;
    } catch {}
  }
  try {
    return readFlag(flagPath);
  } catch {
    return null;
  }
}

function pruneSessions() {
  try {
    const now = Date.now();
    for (const name of readdirSync(sessionsDir)) {
      try {
        const file = join(sessionsDir, name);
        if (now - statSync(file).mtimeMs > SESSION_TTL_MS) unlinkSync(file);
      } catch {}
    }
  } catch {}
}

function trimModeLog() {
  try {
    const file = join(opencodeDir, ".caveman-mode-log.jsonl");
    if (!existsSync(file)) return;
    if (statSync(file).size <= MODE_LOG_MAX_BYTES) return;
    const lines = readFileSync(file, "utf8").split("\n");
    const kept = lines.slice(-MODE_LOG_KEEP_LINES).join("\n");
    writeFileSync(file, kept);
  } catch {}
}

function removeFlag() {
  try {
    unlinkSync(flagPath);
  } catch (error: any) {
    if (process.env.CAVEMAN_DEBUG === "1" && error?.code !== "ENOENT") {
      console.error(`caveman: failed to remove flag ${flagPath}: ${error?.message}`);
    }
  }
}

function reinforcementBanner(mode: string): string {
  return "CAVEMAN MODE ACTIVE (" + mode + ") — session ruleset applies.";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const [bannerPrefix, bannerSuffix] = reinforcementBanner("\0").split("\0");
const staleBlock = new RegExp(escapeRegExp(bannerPrefix) + "[a-z-]+" + escapeRegExp(bannerSuffix) + "[\\s\\S]*$");

function loadFilteredRuleset(mode: string): string | null {
  if (typeof config.loadFilteredRuleset !== "function") return null;
  for (const base of [helperDir(), join(helperDir(), "..")]) {
    const ruleset = config.loadFilteredRuleset(mode, base);
    if (ruleset) return ruleset;
  }
  return null;
}

function hasCavemanRules(system: SystemEntry[]): boolean {
  for (const entry of system) {
    const text = typeof entry === "string" ? entry : (typeof entry?.text === "string" ? entry.text : "");
    if (text.includes("caveman-begin")) return true;
    const stripped = text.replace(staleBlock, "");
    if (stripped.includes("Respond terse like smart caveman")) return true;
  }
  return false;
}

function reinforcementLine(mode: string, alreadyPresent = false): string {
  const banner = reinforcementBanner(mode);
  if (alreadyPresent) return banner;
  const ruleset = loadFilteredRuleset(mode);
  return ruleset ? banner + "\n\n" + ruleset : banner;
}

function applyModeChange(change: { action: string; mode?: string } | null | undefined, sessionID?: string) {
  if (!change) return;
  if (change.action === "clear") {
    recordModeChange(opencodeDir, null, sessionID);
    if (sessionID) {
      try {
        unlinkSync(sessionFlagPath(sessionID));
      } catch {}
    }
    removeFlag();
    return;
  }
  if (change.action === "set" && change.mode) {
    recordModeChange(opencodeDir, change.mode, sessionID);
    if (sessionID) {
      try {
        mkdirSync(sessionsDir, { recursive: true });
      } catch {}
      safeWriteFlag(sessionFlagPath(sessionID), change.mode);
    }
    safeWriteFlag(flagPath, change.mode);
  }
}

function initFlag() {
  const mode = getDefaultMode();
  if (mode === "off") {
    recordModeChange(opencodeDir, null);
    removeFlag();
    return;
  }
  recordModeChange(opencodeDir, mode);
  safeWriteFlag(flagPath, mode);
}

type SystemEntry = string | { type: string; text: string; [key: string]: unknown };

function injectSystem(system: SystemEntry[], line: string) {
  for (let i = 0; i < system.length; i++) {
    const entry = system[i];
    if (typeof entry === "string" && staleBlock.test(entry)) {
      system[i] = entry.replace(staleBlock, line);
      return;
    }
    if (entry && typeof entry === "object" && typeof entry.text === "string" && staleBlock.test(entry.text)) {
      entry.text = entry.text.replace(staleBlock, line);
      return;
    }
  }
  system.push({ type: "text", text: line });
}

async function setup(ctx: any) {
  initFlag();
  pruneSessions();
  trimModeLog();

  try {
    const stream = ctx?.event?.subscribe?.();
    if (stream && typeof stream[Symbol.asyncIterator] === "function") {
      void (async () => {
        try {
          for await (const ev of stream) {
            if (ev && ev.type === "session.created") initFlag();
          }
        } catch {}
      })();
    }
  } catch {}

  await ctx.session.hook("prompt", async (input: any) => {
    const text = typeof input?.prompt?.text === "string" ? input.prompt.text : "";
    const sessionID = typeof input?.sessionID === "string" ? input.sessionID : undefined;
    applyModeChange(parseModeChange(text, { getDefaultMode, expandedTpl: true, unwrapQuotes: true }), sessionID);
  });

  await ctx.session.hook("context", async (input: any) => {
    const sessionID = typeof input?.sessionID === "string" ? input.sessionID : undefined;
    const active = resolveMode(sessionID);
    if (active && !INDEPENDENT_MODES.has(active) && Array.isArray(input?.system)) {
      const alreadyPresent = hasCavemanRules(input.system);
      injectSystem(input.system, reinforcementLine(active, alreadyPresent));
    }
  });
}

export default {
  id: "caveman",
  setup,
};

export const __test = { initFlag, applyModeChange, injectSystem, reinforcementLine, resolveMode, sessionsDir, flagPath, opencodeDir };
