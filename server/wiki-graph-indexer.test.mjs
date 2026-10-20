import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGraphFromWiki, createWikiGraphIndexer, resolveWikiDir } from './wiki-graph-indexer.mjs';

function makeWiki(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sbwiki-'));
  for (const [relative, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relative);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

test('parses Markdown frontmatter and three link types', async () => {
  const dir = makeWiki({
    'index.md': [
      '---',
      'id: index',
      'title: Entry',
      'summary: Overview node',
      'date: 2025-08-01',
      'links:',
      '  - concepts/a',
      '---',
      '# Entry',
      'See [[concepts/a]] and [b](concepts/b.md).'
    ].join('\n'),
    'concepts/a.md': '---\nid: concepts/a\ntitle: A\n---\n# A\n',
    'concepts/b.md': '---\ntitle: B\n---\n# B\n'
  });

  const graph = await buildGraphFromWiki(dir);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.equal(graph.nodes.length, 3);

  const index = nodes.get('index');
  assert.equal(index.name, 'Entry');
  assert.equal(index.summary, 'Overview node');
  assert.equal(index.date, '2025-08-01');
  assert.equal(index.category, 'root');

  const sourceIds = new Set(graph.links.filter((link) => link.source === 'index').map((link) => link.target));
  assert.ok(sourceIds.has('concepts/a'), 'frontmatter links should create edges');
  assert.ok(sourceIds.has('concepts/b'), 'Markdown links should create edges');
  assert.ok(nodes.get('concepts/b'), 'documents without an id should use their relative path');

  rmSync(dir, { recursive: true });
});

test('parses JSON relationship files', async () => {
  const dir = makeWiki({
    'relations.json': JSON.stringify({
      nodes: [
        { id: 'entities/x', name: 'X', summary: 'Entity X' },
        { id: 'entities/y', name: 'Y', summary: 'Entity Y' }
      ],
      links: [{ source: 'entities/x', target: 'entities/y' }]
    })
  });

  const graph = await buildGraphFromWiki(dir);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].source, 'entities/x');
  assert.equal(graph.links[0].target, 'entities/y');

  rmSync(dir, { recursive: true });
});

test('raw asset nodes and image attachments', async () => {
  const dir = makeWiki({
    'note.md': [
      '---',
      'id: note',
      'title: Note with image',
      '---',
      '# Note with image',
      '![Diagram](assets/diagram.svg)'
    ].join('\n'),
    'assets/diagram.svg': '<svg/>'
  });

  const graph = await buildGraphFromWiki(dir);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.ok(nodes.has('assets/diagram'), 'SVG files should become raw asset nodes');
  assert.ok(nodes.get('assets/diagram').isRawAsset);
  assert.equal(nodes.get('note').attachments.length, 1, 'image references should become attachments');
  const hasAttachmentLink = graph.links.some((link) => link.source === 'note' && link.target === 'assets/diagram');
  assert.ok(hasAttachmentLink, 'attachments should create edges');

  rmSync(dir, { recursive: true });
});

test('ignores directories such as .obsidian', async () => {
  const dir = makeWiki({
    'a.md': '---\ntitle: A\n---\n# A\n',
    '.obsidian/workspace.json': '{}'
  });

  const graph = await buildGraphFromWiki(dir);
  assert.equal(graph.nodes.length, 1, '.obsidian contents should not enter the graph');

  rmSync(dir, { recursive: true });
});

test('incremental cache skips unchanged content and reflects changes', async () => {
  const dir = makeWiki({
    'a.md': '---\nid: a\ntitle: A\n---\n# A\n[[b]]\n',
    'b.md': '---\nid: b\ntitle: B\n---\n# B\n'
  });
  const fileA = path.join(dir, 'a.md');

  const indexer = createWikiGraphIndexer({ wikiDir: dir, debounceMs: 0, pollMs: 0 });
  await indexer.start();
  assert.equal(indexer.getVersion(), 1);

  // Rebuilding unchanged content preserves the version.
  await indexer.rebuild();
  assert.equal(indexer.getVersion(), 1, 'the version should not increase without changes');

  // Editing a file increases the version and updates content.
  writeFileSync(fileA, '---\nid: a\ntitle: A revised\n---\n# A\n[[b]]\n');
  await indexer.rebuild();
  assert.equal(indexer.getVersion(), 2);
  const graph = await indexer.getGraph();
  const nodeA = graph.nodes.find((node) => node.id === 'a');
  assert.equal(nodeA.name, 'A revised');

  // Deleting a file removes its node.
  rmSync(fileA);
  await indexer.rebuild();
  assert.equal(indexer.getVersion(), 3);
  const after = await indexer.getGraph();
  assert.ok(!after.nodes.some((node) => node.id === 'a'), 'deleted nodes should be removed');
  assert.ok(!after.links.some((link) => link.source === 'a' || link.target === 'a'), 'there should be no dangling edges');

  indexer.close();
  rmSync(dir, { recursive: true });
});

test('new assets invalidate the document cache for fuzzy attachment matching', async () => {
  const dir = makeWiki({
    'note.md': '---\ntitle: Note\n---\n# Note\n![Image](assets/pic.svg)\n'
  });
  const indexer = createWikiGraphIndexer({ wikiDir: dir, debounceMs: 0, pollMs: 0 });
  await indexer.start();
  let graph = await indexer.getGraph();
  assert.ok(!graph.nodes.some((node) => node.id === 'assets/pic'), 'missing assets should not create asset nodes');
  assert.equal(graph.nodes.find((node) => node.id === 'note').attachments.length, 0, 'missing assets should not create attachments');

  // Adding an asset must invalidate the cache and reparse documents.
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(path.join(dir, 'assets/pic.svg'), '<svg/>');
  await indexer.rebuild();
  graph = await indexer.getGraph();
  assert.equal(indexer.getVersion(), 2);
  assert.ok(graph.nodes.some((node) => node.id === 'assets/pic'), 'new assets should enter the graph');
  const note = graph.nodes.find((node) => node.id === 'note');
  assert.equal(note.attachments.length, 1, 'reparsed documents should include attachments');

  indexer.close();
  rmSync(dir, { recursive: true });
});

test('resolveWikiDir discovery order', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sbwiki-resolve-'));
  const env = { HERMES_WIKI_DIR: dir };
  assert.equal(resolveWikiDir(env), dir, 'HERMES_WIKI_DIR should take precedence');
  rmSync(dir, { recursive: true });
});
