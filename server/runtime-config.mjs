import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_PRODUCT_HERMES_PORT = '18643';

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
  const rootEnv = loadEnvFile(path.join(rootDir, '.env'));
  const rootProductEnv = loadEnvFile(path.join(rootDir, 'config', 'product.env'));
  const preliminaryEnv = {
    ...rootEnv,
    ...rootProductEnv,
    ...process.env
  };

  if (isProductMode(preliminaryEnv)) {
    const paths = resolveProductPaths({ rootDir, env: preliminaryEnv });
    const productEnv = {
      ...rootProductEnv,
      ...loadEnvFile(paths.productEnvPath)
    };
    const mergedEnv = {
      ...productEnv,
      ...process.env,
      SECOND_BRAIN_PRODUCT_MODE: '1'
    };
    return withProductDefaults(mergedEnv, paths, productEnv);
  }

  return {
    ...loadEnvFile(path.join(homedir(), '.hermes', '.env')),
    ...rootEnv,
    ...loadEnvFile(path.join(rootDir, '.hermes', '.env')),
    ...process.env
  };
}

export function ensureProductRuntimeEnv({ rootDir = process.cwd(), env = process.env } = {}) {
  if (!isProductMode(env)) return env;

  const paths = resolveProductPaths({ rootDir, env });
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.runtimeDir, { recursive: true });
  mkdirSync(paths.hermesHome, { recursive: true });
  mkdirSync(paths.wikiDir, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });

  const productEnv = loadEnvFile(paths.productEnvPath);
  const generated = {};
  if (!productEnv.SECOND_BRAIN_PRODUCT_MODE) generated.SECOND_BRAIN_PRODUCT_MODE = '1';
  if (!productEnv.HERMES_HOME) generated.HERMES_HOME = paths.hermesHome;
  if (!productEnv.HERMES_WIKI_DIR) generated.HERMES_WIKI_DIR = paths.wikiDir;
  if (!productEnv.HERMES_API_TARGET) generated.HERMES_API_TARGET = env.SECOND_BRAIN_HERMES_API_TARGET || defaultProductHermesTarget(env);
  if (!productEnv.API_SERVER_KEY && !env.SECOND_BRAIN_HERMES_API_KEY) {
    generated.API_SERVER_KEY = `sb_${randomBytes(24).toString('base64url')}`;
  }

  if (Object.keys(generated).length) writeEnvValues(paths.productEnvPath, generated);

  const refreshedProductEnv = {
    ...productEnv,
    ...generated,
    ...loadEnvFile(paths.productEnvPath)
  };
  const nextEnv = withProductDefaults({
    ...env,
    ...refreshedProductEnv,
    SECOND_BRAIN_PRODUCT_MODE: '1'
  }, paths, refreshedProductEnv);
  mkdirSync(nextEnv.HERMES_HOME, { recursive: true });
  mkdirSync(nextEnv.HERMES_WIKI_DIR, { recursive: true });
  Object.assign(env, nextEnv);
  return env;
}

export async function getHermesConfig(env) {
  return {
    target: await detectHermesTarget(env),
    apiKey: env.API_SERVER_KEY || ''
  };
}

export async function detectHermesTarget(env = {}) {
  if (env.HERMES_API_TARGET) return env.HERMES_API_TARGET;

  if (isProductMode(env)) return defaultProductHermesTarget(env);

  const logTarget = findHermesTargetFromLog(path.join(homedir(), '.hermes', 'logs', 'gateway.log'));
  if (logTarget && await requestHealth(logTarget)) return logTarget;

  const candidates = ['8643', '8642'].map((port) => `http://127.0.0.1:${port}`);
  for (const candidate of candidates) {
    if (await requestHealth(candidate)) return candidate;
  }

  return candidates[0];
}

export function requestHealth(target, timeoutMs = 700) {
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

export function isProductMode(env = process.env) {
  return isEnabled(env.SECOND_BRAIN_PRODUCT_MODE);
}

export function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function isDisabled(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}

export function resolveProductPaths({ rootDir = process.cwd(), env = process.env } = {}) {
  const productHome = path.resolve(expandHome(env.SECOND_BRAIN_PRODUCT_HOME) || defaultProductHome(rootDir));
  const configDir = path.resolve(expandHome(env.SECOND_BRAIN_CONFIG_DIR) || path.join(productHome, 'config'));
  const runtimeDir = path.resolve(expandHome(env.SECOND_BRAIN_RUNTIME_DIR) || path.join(productHome, 'runtime'));
  const dataDir = path.resolve(expandHome(env.SECOND_BRAIN_DATA_DIR) || path.join(productHome, 'data'));
  const logsDir = path.resolve(expandHome(env.SECOND_BRAIN_LOG_DIR) || path.join(productHome, 'logs'));
  const hermesHome = path.resolve(expandHome(env.SECOND_BRAIN_HERMES_HOME) || path.join(runtimeDir, 'hermes'));
  const wikiDir = path.resolve(expandHome(env.SECOND_BRAIN_WIKI_DIR) || path.join(runtimeDir, 'llm-wiki'));
  const productEnvPath = path.resolve(expandHome(env.SECOND_BRAIN_PRODUCT_ENV) || path.join(configDir, 'product.env'));

  return {
    productHome,
    configDir,
    runtimeDir,
    dataDir,
    logsDir,
    hermesHome,
    wikiDir,
    productEnvPath
  };
}

function withProductDefaults(env, paths, productEnv = {}) {
  const hermesTarget = productEnv.HERMES_API_TARGET || env.SECOND_BRAIN_HERMES_API_TARGET || defaultProductHermesTarget(env);

  return {
    ...env,
    SECOND_BRAIN_PRODUCT_MODE: '1',
    SECOND_BRAIN_PRODUCT_HOME: paths.productHome,
    SECOND_BRAIN_CONFIG_DIR: paths.configDir,
    SECOND_BRAIN_RUNTIME_DIR: paths.runtimeDir,
    SECOND_BRAIN_DATA_DIR: paths.dataDir,
    SECOND_BRAIN_LOG_DIR: paths.logsDir,
    SECOND_BRAIN_PRODUCT_ENV: paths.productEnvPath,
    HERMES_HOME: productEnv.HERMES_HOME || env.SECOND_BRAIN_HERMES_HOME || paths.hermesHome,
    HERMES_WIKI_DIR: productEnv.HERMES_WIKI_DIR || env.SECOND_BRAIN_WIKI_DIR || paths.wikiDir,
    HERMES_API_TARGET: hermesTarget,
    API_SERVER_KEY: productEnv.API_SERVER_KEY || env.SECOND_BRAIN_HERMES_API_KEY || ''
  };
}

function defaultProductHome(rootDir) {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'SecondBrain');
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support', 'SecondBrain');
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'second-brain');
  return path.join(homedir(), '.local', 'share', 'second-brain');
}

function defaultProductHermesTarget(env = process.env) {
  const port = env.SECOND_BRAIN_HERMES_PORT || DEFAULT_PRODUCT_HERMES_PORT;
  return `http://127.0.0.1:${port}`;
}

function expandHome(value) {
  if (!value) return value;
  return String(value).replace(/^~(?=$|\/|\\)/, homedir());
}

function writeEnvValues(filePath, values) {
  const existingLines = existsSync(filePath) ? readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  const pending = new Map(Object.entries(values).filter(([, value]) => value != null && value !== ''));
  const lines = existingLines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });

  if (!lines.length || lines.at(-1)?.trim()) lines.push('');
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  writeFileSync(filePath, `${lines.join('\n').replace(/\n*$/, '')}\n`, { mode: 0o600 });
}
