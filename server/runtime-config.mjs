import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import path from 'node:path';

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return env;
      const [, key, rawValue] = match;
      env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
      return env;
    }, {});
}

export function loadRuntimeEnv({ rootDir = process.cwd() } = {}) {
  return {
    ...loadEnvFile(path.join(homedir(), '.hermes', '.env')),
    ...loadEnvFile(path.join(rootDir, '.env')),
    ...loadEnvFile(path.join(rootDir, '.hermes', '.env')),
    ...process.env
  };
}

export async function getHermesConfig(env) {
  return {
    target: await detectHermesTarget(env),
    apiKey: env.API_SERVER_KEY || ''
  };
}

export async function detectHermesTarget(env = {}) {
  if (env.HERMES_API_TARGET) return env.HERMES_API_TARGET;

  const logTarget = findHermesTargetFromLog(path.join(homedir(), '.hermes', 'logs', 'gateway.log'));
  if (logTarget && await requestHealth(logTarget)) return logTarget;

  const candidates = ['8643', '8642'].map((port) => `http://127.0.0.1:${port}`);
  for (const candidate of candidates) {
    if (await requestHealth(candidate)) return candidate;
  }

  return candidates[0];
}

function requestHealth(target, timeoutMs = 700) {
  return new Promise((resolve) => {
    const url = new URL('/health', target);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function findHermesTargetFromLog(logPath) {
  if (!existsSync(logPath)) return '';
  const text = readFileSync(logPath, 'utf8');
  const matches = [...text.matchAll(/API server listening on (https?:\/\/[^\s]+) \(model:/g)];
  return matches.at(-1)?.[1] || '';
}
