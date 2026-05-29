import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  ensureProductRuntimeEnv,
  isDisabled,
  isEnabled,
  isProductMode,
  requestHealth
} from './runtime-config.mjs';

const DEFAULT_HERMES_ARGS = 'gateway run';

export function createEmbeddedHermesManager({ rootDir = process.cwd(), env = process.env } = {}) {
  let child = null;
  let started = false;

  const isManagerEnabled = () => {
    if (!isProductMode(env)) return false;
    if (isEnabled(env.SECOND_BRAIN_DISABLE_EMBEDDED_HERMES)) return false;
    return !isDisabled(env.SECOND_BRAIN_EMBEDDED_HERMES);
  };

  const start = async () => {
    if (!isManagerEnabled()) return { started: false, reason: 'disabled' };

    ensureProductRuntimeEnv({ rootDir, env });
    mkdirSync(env.SECOND_BRAIN_LOG_DIR, { recursive: true });
    mkdirSync(env.HERMES_WIKI_DIR, { recursive: true });

    if (await requestHealth(env.HERMES_API_TARGET, 700)) {
      console.log(`[second-brain] embedded Hermes already responding at ${env.HERMES_API_TARGET}`);
      return { started: false, reason: 'already-running' };
    }

    const commandSpec = resolveHermesCommand(env);
    if (!commandSpec.command) {
      const message = `[second-brain] bundled Hermes executable not found under ${env.HERMES_HOME}`;
      if (isEnabled(env.SECOND_BRAIN_REQUIRE_EMBEDDED_HERMES)) throw new Error(message);
      console.warn(message);
      console.warn('[second-brain] continuing without embedded Hermes; chat will work after Hermes is added to the runtime bundle.');
      return { started: false, reason: 'missing-executable' };
    }

    const logPath = path.join(env.SECOND_BRAIN_LOG_DIR, 'hermes.log');
    const logStream = createWriteStream(logPath, { flags: 'a' });
    logStream.write(`\n[${new Date().toISOString()}] starting Hermes: ${commandSpec.command} ${commandSpec.args.join(' ')}\n`);

    child = spawn(commandSpec.command, commandSpec.args, {
      cwd: existsSync(env.HERMES_HOME) ? env.HERMES_HOME : rootDir,
      env: createHermesEnv(env),
      shell: shouldUseShell(commandSpec.command),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    started = true;

    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.on('exit', (code, signal) => {
      logStream.write(`[${new Date().toISOString()}] Hermes exited: code=${code ?? ''} signal=${signal ?? ''}\n`);
      logStream.end();
      child = null;
      started = false;
    });

    const ready = await waitForHealth(env.HERMES_API_TARGET, Number(env.SECOND_BRAIN_HERMES_START_TIMEOUT_MS || 15000));
    if (!ready) {
      const message = `[second-brain] embedded Hermes did not become ready at ${env.HERMES_API_TARGET}`;
      if (isEnabled(env.SECOND_BRAIN_REQUIRE_EMBEDDED_HERMES)) throw new Error(message);
      console.warn(message);
      console.warn(`[second-brain] Hermes logs: ${logPath}`);
      return { started: true, reason: 'not-ready', logPath };
    }

    console.log(`[second-brain] embedded Hermes ready at ${env.HERMES_API_TARGET}`);
    return { started: true, reason: 'ready', logPath };
  };

  const stop = () => {
    if (!child || child.killed) return;
    child.kill();
  };

  return {
    start,
    stop,
    get started() {
      return started;
    }
  };
}

function resolveHermesCommand(env) {
  if (env.SECOND_BRAIN_HERMES_COMMAND) {
    const [command, ...commandArgs] = parseArgs(env.SECOND_BRAIN_HERMES_COMMAND);
    return { command, args: [...commandArgs, ...resolveHermesArgs(env)] };
  }

  const binaryNames = process.platform === 'win32' ? ['hermes.exe', 'hermes.cmd', 'hermes.bat'] : ['hermes'];
  const candidates = [
    ...binaryNames.map((binaryName) => path.join(env.HERMES_HOME, 'bin', binaryName)),
    ...binaryNames.map((binaryName) => path.join(env.HERMES_HOME, binaryName)),
    ...binaryNames.map((binaryName) => path.join(env.HERMES_HOME, 'hermes', 'bin', binaryName)),
    ...binaryNames.map((binaryName) => path.join(env.HERMES_HOME, 'hermes', binaryName))
  ];
  const command = candidates.find((candidate) => existsSync(candidate));
  return { command, args: command ? resolveHermesArgs(env) : [] };
}

function resolveHermesArgs(env) {
  if (env.SECOND_BRAIN_HERMES_ARGS_JSON) {
    try {
      const parsed = JSON.parse(env.SECOND_BRAIN_HERMES_ARGS_JSON);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      console.warn('[second-brain] ignored invalid SECOND_BRAIN_HERMES_ARGS_JSON');
    }
  }
  return parseArgs(env.SECOND_BRAIN_HERMES_ARGS || DEFAULT_HERMES_ARGS);
}

function createHermesEnv(env) {
  const next = {
    ...process.env,
    ...env,
    HERMES_HOME: env.HERMES_HOME,
    HERMES_WIKI_DIR: env.HERMES_WIKI_DIR,
    API_SERVER_KEY: env.API_SERVER_KEY,
    HERMES_API_TARGET: env.HERMES_API_TARGET
  };

  try {
    const url = new URL(env.HERMES_API_TARGET);
    if (url.hostname) {
      next.HERMES_GATEWAY_HOST = url.hostname;
      next.API_SERVER_HOST = url.hostname;
    }
    if (url.port) {
      next.HERMES_GATEWAY_PORT = url.port;
      next.API_SERVER_PORT = url.port;
    }
  } catch {
    // The proxy will surface malformed target errors if the configured URL is invalid.
  }

  return next;
}

function parseArgs(value) {
  return String(value || '')
    .match(/"[^"]*"|'[^']*'|\S+/g)
    ?.map((part) => part.replace(/^(['"])(.*)\1$/, '$2')) || [];
}

function shouldUseShell(command = '') {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
}

async function waitForHealth(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await requestHealth(target, 700)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
