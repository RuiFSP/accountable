import { Plugin } from "@opencode/plugin";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Project hooks: two agent-facing hooks in one plugin.
//
// 1. Turn-end check — when a root session in this location finishes a turn
//    cleanly, run `checkCommand` (default `npm run check:quick`). On failure,
//    send the output back to the session as a synthetic message so the agent
//    fixes it. Each session gets at most one such message per user prompt:
//    the flag set when a message is injected stops the next failure from
//    waking the agent again, so a broken state can never loop forever.
// 2. `.env` protection — a permission `evaluate` hook that denies any edit
//    (and any shell write) touching `.env` / `.env.*`, except the committed
//    template files.
//
// Observability: every decision is appended to `logs/hooks.log` (git-ignored).

const DEFAULT_CHECK_COMMAND = "npm run check:quick";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const OUTPUT_LIMIT = 200_000;
const TAIL_LIMIT = 6_000;
const TEMPLATE_ENV_FILES = [".env.example", ".env.sample", ".env.template"];
const ENV_DENY_MESSAGE =
  "Blocked by the project hooks plugin: .env files are protected from agent edits. Edit them outside OpenCode.";

type RunResult = {
  code: number | null;
  timedOut: boolean;
  output: string;
};

function log(directory: string, message: string): void {
  try {
    const dir = path.join(directory, "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "hooks.log"),
      `${new Date().toISOString()} ${message}\n`,
    );
  } catch {
    // Logging must never break a hook.
  }
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

// --- .env protection -------------------------------------------------------

function isEnvPath(target: string): boolean {
  const cleaned = target.replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  const name = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  if (name === ".env") return true;
  if (!name.startsWith(".env.")) return false;
  return !TEMPLATE_ENV_FILES.includes(name);
}

function redirectTargets(command: string): string[] {
  const targets: string[] = [];
  const pattern = /(?:^|[^>])>{1,2}\s*([^\s;|&]+)/g;
  let match: RegExpExecArray | null = pattern.exec(command);
  while (match !== null) {
    targets.push(match[1]);
    match = pattern.exec(command);
  }
  return targets;
}

function keywordWritesEnv(command: string): boolean {
  const tokens = command.split(/\s+/);
  const writesInPlace = /\b(?:tee|rm|mv)\b/.test(command);
  if (writesInPlace && tokens.some(isEnvPath)) return true;
  const sedInPlace =
    /\bsed\b/.test(command) &&
    /(?:^|\s)-{1,2}[a-zA-Z]*i[a-zA-Z]*(?:\s|$)/.test(command);
  if (sedInPlace && tokens.some(isEnvPath)) return true;
  if (/\bcp\b/.test(command)) {
    const operands = tokens.filter((token) => !token.startsWith("-"));
    const destination = operands[operands.length - 1];
    if (destination !== undefined && isEnvPath(destination)) return true;
  }
  return false;
}

function shellWritesEnv(command: string): boolean {
  if (redirectTargets(command).some(isEnvPath)) return true;
  return keywordWritesEnv(command);
}

// --- running external commands --------------------------------------------

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The process group is already gone.
        }
      }
    }, timeoutMs);
    const record = (chunk: Buffer): void => {
      if (output.length < OUTPUT_LIMIT) output += chunk.toString();
    };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, timedOut, output: `${output}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, output });
    });
  });
}

function failureMessage(command: string, result: RunResult): string {
  const status = result.timedOut
    ? "timed out"
    : `exited with code ${String(result.code)}`;
  const tail = truncate(result.output, TAIL_LIMIT);
  return [
    `The automated check failed: \`${command}\` ${status}.`,
    `Fix the problems it reports, then run \`${command}\` to verify.`,
    "",
    "Output (tail):",
    "```",
    tail,
    "```",
  ].join("\n");
}

// --- turn-end check --------------------------------------------------------

type CheckContext = {
  directory: string;
  command: string;
  timeoutMs: number;
  sessionID: string;
  status: string;
};

async function checkTurn(
  ctx: Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0],
  input: CheckContext,
): Promise<void> {
  const passKey = `pass:${path.resolve(input.directory)}`;
  const retriedKey = `retried:${input.sessionID}`;
  const started = Date.now();
  log(
    input.directory,
    `check start session=${input.sessionID} cmd="${input.command}"`,
  );
  const result = await runCommand(
    input.command,
    input.directory,
    input.timeoutMs,
  );
  const elapsed = `${String(Math.round((Date.now() - started) / 1000))}s`;

  if (result.code === 0 && !result.timedOut) {
    await ctx.storage.set(passKey, input.status);
    await ctx.storage.remove(retriedKey);
    log(input.directory, `check pass session=${input.sessionID} in ${elapsed}`);
    return;
  }

  log(
    input.directory,
    `check fail session=${input.sessionID} in ${elapsed} code=${String(result.code)} timedOut=${String(result.timedOut)}`,
  );
  const alreadyRetried = (await ctx.storage.get(retriedKey)) === true;
  if (alreadyRetried) {
    log(
      input.directory,
      `suppressed session=${input.sessionID}: already sent one failure this round`,
    );
    return;
  }
  await ctx.storage.set(retriedKey, true);
  await ctx.session.synthetic({
    sessionID: input.sessionID,
    text: failureMessage(input.command, result),
  });
  log(input.directory, `injected session=${input.sessionID}`);
}

type IdleEvent = {
  location?: { directory?: string };
  data: { sessionID: string };
};

async function onIdle(
  ctx: Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0],
  state: { running: boolean },
  options: { command: string; timeoutMs: number },
  event: IdleEvent,
): Promise<void> {
  const directory = ctx.location.directory;
  const sessionID = event.data.sessionID;
  const info = await ctx.session.get({ sessionID });
  const eventDirectory = event.location?.directory ?? info.location.directory;
  if (path.resolve(eventDirectory) !== path.resolve(directory)) return;
  if (state.running) {
    log(directory, `skip session=${sessionID}: a check is already running`);
    return;
  }
  if (info.parentID !== undefined) {
    log(directory, `skip session=${sessionID}: subagent turn`);
    return;
  }
  if (info.outcome !== "succeeded") {
    log(
      directory,
      `skip session=${sessionID}: outcome=${info.outcome ?? "none"}`,
    );
    return;
  }
  const status = await runCommand("git status --porcelain", directory, 30_000);
  const lastPass = await ctx.storage.get(`pass:${path.resolve(directory)}`);
  if (lastPass === status.output) {
    log(
      directory,
      `skip session=${sessionID}: tree unchanged since last passing check`,
    );
    return;
  }
  state.running = true;
  try {
    await checkTurn(ctx, {
      directory,
      command: options.command,
      timeoutMs: options.timeoutMs,
      sessionID,
      status: status.output,
    });
  } finally {
    state.running = false;
  }
}

// --- plugin ----------------------------------------------------------------

export default Plugin.define({
  id: "accountable.hooks",
  async setup(ctx) {
    const rawOptions = (ctx.options ?? {}) as {
      checkCommand?: unknown;
      timeoutMs?: unknown;
    };
    const options = {
      command:
        typeof rawOptions.checkCommand === "string"
          ? rawOptions.checkCommand
          : DEFAULT_CHECK_COMMAND,
      timeoutMs:
        typeof rawOptions.timeoutMs === "number"
          ? rawOptions.timeoutMs
          : DEFAULT_TIMEOUT_MS,
    };
    const directory = ctx.location.directory;
    log(directory, `loaded cmd="${options.command}"`);

    const permissionRegistration = await ctx.permission.hook(
      "evaluate",
      (event) => {
        // Never log raw command text: gitleaks dir scans git-ignored files
        // too, so a secret echoed in a logged command would break
        // `npm run secrets`. File paths are logged (edit/read); everything
        // else is only counted.
        const pathActions = new Set(["edit", "read", "external_directory"]);
        const detail = pathActions.has(event.action)
          ? event.resources
              .map((resource) => truncate(resource, 160))
              .join(" | ")
          : `${String(event.resources.length)} resource(s)`;
        log(
          directory,
          `permission action=${event.action} effect=${event.effect} resources=${detail}`,
        );
        if (event.action === "edit" && event.resources.some(isEnvPath)) {
          event.effect = "deny";
          event.message = ENV_DENY_MESSAGE;
          log(directory, `denied edit of env file: ${detail}`);
          return;
        }
        if (event.action === "shell" && event.resources.some(shellWritesEnv)) {
          event.effect = "deny";
          event.message = ENV_DENY_MESSAGE;
          log(directory, "denied shell write to env file");
        }
      },
    );

    const promptRegistration = await ctx.session.hook("prompt", (event) => {
      void ctx.storage.remove(`retried:${event.sessionID}`);
      log(
        directory,
        `prompt session=${event.sessionID}: retry allowance reset`,
      );
    });

    const controller = new AbortController();
    const state = { running: false };
    const subscription = ctx.event.subscribe({
      types: ["session.idle"],
      signal: controller.signal,
    });
    void (async () => {
      for await (const event of subscription) {
        try {
          await onIdle(ctx, state, options, event as unknown as IdleEvent);
        } catch (error) {
          log(
            directory,
            `idle handler error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    })();

    return () => {
      controller.abort();
      void permissionRegistration.dispose();
      void promptRegistration.dispose();
      log(directory, "unloaded");
    };
  },
});
