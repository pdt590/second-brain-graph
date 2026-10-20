import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWikiLibrary } from './wiki-library.mjs';

test('selected wiki switches live, survives restart, and rejects invalid paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wiki-library-'));
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  await mkdir(a); await mkdir(b);
  await writeFile(path.join(a, 'alpha.md'), '# Alpha');
  await writeFile(path.join(b, 'beta.md'), '# Beta');
  const library = createWikiLibrary({ wikiDir: a, stateRootDir: root });
  let restarted;
  try {
    await library.start();
    assert.equal((await library.getGraph()).nodes[0].name, 'Alpha');
    const notices = [];
    library.onUpdate((event) => notices.push(event));
    const listing = await library.browse(root);
    assert.deepEqual(listing.directories.map((item) => item.name), ['a', 'b']);
    await library.selectDirectory(b);
    assert.equal(library.wikiDir, b);
    assert.equal((await library.getGraph()).nodes[0].name, 'Beta');
    assert.equal(notices.length, 1);
    await assert.rejects(library.selectDirectory(path.join(root, 'missing')));
    await assert.rejects(library.selectDirectory(path.join(a, 'alpha.md')));
    assert.equal(library.wikiDir, b);
    library.close();
    restarted = createWikiLibrary({ wikiDir: a, stateRootDir: root });
    await restarted.start();
    assert.equal(restarted.wikiDir, b);
    assert.equal((await restarted.getGraph()).nodes[0].name, 'Beta');
  } finally {
    library.close(); restarted?.close();
    await rm(root, { recursive: true, force: true });
  }
});
