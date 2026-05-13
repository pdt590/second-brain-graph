import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

export async function createAuth({ rootDir, env = process.env } = {}) {
  const auth = await createAuthStore({ rootDir, env });

  return {
    getSessionUser(request) {
      return verifySessionCookie(getCookie(request, 'sb_session'), auth.sessionSecret);
    },

    async handle(request, response, url) {
      if (request.method === 'GET' && url.pathname === '/api/auth/me') {
        const user = this.getSessionUser(request);
        return user ? sendJson(response, { user }) : sendJson(response, { error: 'Unauthorized' }, 401);
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await readJsonBody(request);
        if (body.name !== auth.username || !verifyPassword(body.password || '', auth.password)) {
          return sendJson(response, { error: '用户名或密码不正确。' }, 401);
        }
        response.setHeader('Set-Cookie', sessionCookie(signSession({ name: auth.username }, auth.sessionSecret), request));
        return sendJson(response, { user: { name: auth.username } });
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        response.setHeader('Set-Cookie', clearSessionCookie());
        return sendJson(response, { ok: true });
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/password') {
        const user = this.getSessionUser(request);
        if (!user) return sendJson(response, { error: 'Unauthorized' }, 401);
        const body = await readJsonBody(request);
        if (!verifyPassword(body.current || '', auth.password)) return sendJson(response, { error: '当前密码不正确。' }, 400);
        if (!body.next || String(body.next).length < 8) return sendJson(response, { error: '新密码至少需要 8 位。' }, 400);
        auth.password = hashPassword(String(body.next));
        await saveAuthStore(auth, { rootDir, env });
        return sendJson(response, { ok: true });
      }

      return sendJson(response, { error: 'Not found' }, 404);
    }
  };
}

export function sendJson(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function createAuthStore({ rootDir, env }) {
  const filePath = authFilePath({ rootDir, env });
  if (existsSync(filePath)) {
    const store = JSON.parse(await readFile(filePath, 'utf8'));
    if (!store.sessionSecret) {
      store.sessionSecret = randomBytes(32).toString('hex');
      await saveAuthStore(store, { rootDir, env });
    }
    return store;
  }

  const username = env.SECOND_BRAIN_ADMIN_USER || 'admin';
  const initialPassword = env.SECOND_BRAIN_ADMIN_PASSWORD || randomBytes(12).toString('base64url');
  const store = {
    username,
    password: hashPassword(initialPassword),
    sessionSecret: randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString()
  };
  await saveAuthStore(store, { rootDir, env });
  console.log(`[second-brain] initial admin user: ${username}`);
  if (!env.SECOND_BRAIN_ADMIN_PASSWORD) console.log(`[second-brain] generated admin password: ${initialPassword}`);
  return store;
}

async function saveAuthStore(store, { rootDir, env }) {
  const filePath = authFilePath({ rootDir, env });
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function authFilePath({ rootDir, env }) {
  return env.SECOND_BRAIN_AUTH_FILE || path.join(rootDir || process.cwd(), 'data', 'auth.json');
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString('hex'), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getCookie(request, name) {
  const cookie = request.headers.cookie || '';
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function signSession(user, secret) {
  const payload = Buffer.from(JSON.stringify({
    name: user.name,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionCookie(value, secret) {
  if (!value || !value.includes('.')) return null;
  const [payload, sig] = value.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.name || session.exp < Date.now()) return null;
    return { name: session.name };
  } catch {
    return null;
  }
}

function sessionCookie(value, request) {
  const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sb_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}${secure}`;
}

function clearSessionCookie() {
  return 'sb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}
