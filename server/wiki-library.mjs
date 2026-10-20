import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createWikiGraphIndexer } from './wiki-graph-indexer.mjs';

// Keep a stable API and SSE subscriptions while replacing the active indexer.
export function createWikiLibrary({ wikiDir, stateRootDir }) {
  const settingsFile = path.join(stateRootDir, 'data', 'wiki-settings.json');
  const listeners = new Set();
  let current = createWikiGraphIndexer({ wikiDir });
  let unsubscribe = () => {};
  let revision = 0;
  let switching = false;
  const notify = () => {
    revision += 1;
    for (const listener of listeners) listener({ version: revision });
  };
  const subscribe = () => { unsubscribe = current.onUpdate(notify); };
  return {
    get wikiDir() { return current.wikiDir; },
    async start() {
      try {
        const saved = JSON.parse(await readFile(settingsFile, 'utf8'));
        if (typeof saved.wikiDir === 'string') {
          await validateDirectory(saved.wikiDir);
          current.close();
          current = createWikiGraphIndexer({ wikiDir: saved.wikiDir });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('[wiki-library] Saved folder unavailable; using configured wiki directory.');
      }
      subscribe();
      await current.start();
    },
    getGraph: () => current.getGraph(),
    getNodeContent: (id) => current.getNodeContent(id),
    getNodeAsset: (id) => current.getNodeAsset(id),
    getVersion: () => revision,
    onUpdate(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async browse(value) {
      const directory = await validateDirectory(value || current.wikiDir || homedir());
      const entries = await readdir(directory, { withFileTypes: true });
      const roots = process.platform === 'win32'
        ? (await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (letter) => {
          const drive = `${letter}:\\`;
          try { await access(drive, constants.R_OK); return drive; } catch { return null; }
        }))).filter(Boolean)
        : ['/'];
      return {
        path: directory,
        parent: path.dirname(directory),
        home: homedir(), roots,
        directories: entries.filter((entry) => entry.isDirectory())
          .map((entry) => ({ name: entry.name, path: path.join(directory, entry.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))
      };
    },
    async selectDirectory(value) {
      if (switching) throw Object.assign(new Error('Another folder change is in progress. Try again.'), { status: 409 });
      switching = true;
      let candidate;
      try {
        const directory = await validateDirectory(value);
        candidate = createWikiGraphIndexer({ wikiDir: directory });
        await candidate.start();
        await mkdir(path.dirname(settingsFile), { recursive: true });
        const temporary = `${settingsFile}.tmp`;
        await writeFile(temporary, JSON.stringify({ wikiDir: directory }, null, 2), { mode: 0o600 });
        await rename(temporary, settingsFile);
        unsubscribe();
        current.close();
        current = candidate;
        candidate = null;
        subscribe();
        notify();
        return { wikiDir: directory };
      } finally {
        candidate?.close();
        switching = false;
      }
    },
    close() { unsubscribe(); current.close(); listeners.clear(); }
  };
}

async function validateDirectory(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error('Enter a valid folder path.');
  }
  const directory = path.resolve(value.trim().replace(/^~(?=$|[\\/])/, homedir()));
  const info = await stat(directory);
  if (!info.isDirectory()) throw new Error('The selected path is not a folder.');
  await access(directory, constants.R_OK);
  return directory;
}
