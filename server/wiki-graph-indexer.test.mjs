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

test('解析 Markdown frontmatter 与三类链接', async () => {
  const dir = makeWiki({
    'index.md': [
      '---',
      'id: index',
      'title: 入口',
      'summary: 总览节点',
      'date: 2025-08-01',
      'links:',
      '  - concepts/a',
      '---',
      '# 入口',
      '见 [[concepts/a]] 和 [b](concepts/b.md)。'
    ].join('\n'),
    'concepts/a.md': '---\nid: concepts/a\ntitle: A\n---\n# A\n',
    'concepts/b.md': '---\ntitle: B\n---\n# B\n'
  });

  const graph = await buildGraphFromWiki(dir);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.equal(graph.nodes.length, 3);

  const index = nodes.get('index');
  assert.equal(index.name, '入口');
  assert.equal(index.summary, '总览节点');
  assert.equal(index.date, '2025-08-01');
  assert.equal(index.category, 'root');

  const sourceIds = new Set(graph.links.filter((link) => link.source === 'index').map((link) => link.target));
  assert.ok(sourceIds.has('concepts/a'), 'frontmatter links 应生成边');
  assert.ok(sourceIds.has('concepts/b'), 'markdown 链接应生成边');
  assert.ok(nodes.get('concepts/b'), '无 id 的文档按相对路径生成 id');

  rmSync(dir, { recursive: true });
});

test('解析 JSON 关系文件', async () => {
  const dir = makeWiki({
    'relations.json': JSON.stringify({
      nodes: [
        { id: 'entities/x', name: 'X', summary: '实体 X' },
        { id: 'entities/y', name: 'Y', summary: '实体 Y' }
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

test('原始资产节点与图片附件', async () => {
  const dir = makeWiki({
    'note.md': [
      '---',
      'id: note',
      'title: 带图笔记',
      '---',
      '# 带图笔记',
      '![示意图](assets/diagram.svg)'
    ].join('\n'),
    'assets/diagram.svg': '<svg/>'
  });

  const graph = await buildGraphFromWiki(dir);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.ok(nodes.has('assets/diagram'), 'svg 应成为原始资产节点');
  assert.ok(nodes.get('assets/diagram').isRawAsset);
  assert.equal(nodes.get('note').attachments.length, 1, '图片引用应成为附件');
  const hasAttachmentLink = graph.links.some((link) => link.source === 'note' && link.target === 'assets/diagram');
  assert.ok(hasAttachmentLink, '附件应生成边');

  rmSync(dir, { recursive: true });
});

test('忽略 .obsidian 等目录', async () => {
  const dir = makeWiki({
    'a.md': '---\ntitle: A\n---\n# A\n',
    '.obsidian/workspace.json': '{}'
  });

  const graph = await buildGraphFromWiki(dir);
  assert.equal(graph.nodes.length, 1, '.obsidian 内容不应进入图谱');

  rmSync(dir, { recursive: true });
});

test('增量缓存：无变化不重建，变更正确反映', async () => {
  const dir = makeWiki({
    'a.md': '---\nid: a\ntitle: A\n---\n# A\n[[b]]\n',
    'b.md': '---\nid: b\ntitle: B\n---\n# B\n'
  });
  const fileA = path.join(dir, 'a.md');

  const indexer = createWikiGraphIndexer({ wikiDir: dir, debounceMs: 0, pollMs: 0 });
  await indexer.start();
  assert.equal(indexer.getVersion(), 1);

  // 无变化重建：版本不变
  await indexer.rebuild();
  assert.equal(indexer.getVersion(), 1, '无变化时版本不应递增');

  // 修改文件：版本递增，内容更新
  writeFileSync(fileA, '---\nid: a\ntitle: A 改版\n---\n# A\n[[b]]\n');
  await indexer.rebuild();
  assert.equal(indexer.getVersion(), 2);
  const graph = await indexer.getGraph();
  const nodeA = graph.nodes.find((node) => node.id === 'a');
  assert.equal(nodeA.name, 'A 改版');

  // 删除文件：节点移除
  rmSync(fileA);
  await indexer.rebuild();
  assert.equal(indexer.getVersion(), 3);
  const after = await indexer.getGraph();
  assert.ok(!after.nodes.some((node) => node.id === 'a'), '删除的节点应移除');
  assert.ok(!after.links.some((link) => link.source === 'a' || link.target === 'a'), '不应有悬空边');

  indexer.close();
  rmSync(dir, { recursive: true });
});

test('新增资产文件会使文档缓存失效（附件模糊匹配）', async () => {
  const dir = makeWiki({
    'note.md': '---\ntitle: 笔记\n---\n# 笔记\n![图](assets/pic.svg)\n'
  });
  const indexer = createWikiGraphIndexer({ wikiDir: dir, debounceMs: 0, pollMs: 0 });
  await indexer.start();
  let graph = await indexer.getGraph();
  assert.ok(!graph.nodes.some((node) => node.id === 'assets/pic'), '资产不存在时无资产节点');
  assert.equal(graph.nodes.find((node) => node.id === 'note').attachments.length, 0, '资产不存在时无附件');

  // 新增资产：缓存必须失效并重新解析文档
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(path.join(dir, 'assets/pic.svg'), '<svg/>');
  await indexer.rebuild();
  graph = await indexer.getGraph();
  assert.equal(indexer.getVersion(), 2);
  assert.ok(graph.nodes.some((node) => node.id === 'assets/pic'), '新增资产应进入图谱');
  const note = graph.nodes.find((node) => node.id === 'note');
  assert.equal(note.attachments.length, 1, '文档应重新解析出附件');

  indexer.close();
  rmSync(dir, { recursive: true });
});

test('resolveWikiDir 探测顺序', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sbwiki-resolve-'));
  const env = { HERMES_WIKI_DIR: dir };
  assert.equal(resolveWikiDir(env), dir, '优先使用 HERMES_WIKI_DIR');
  rmSync(dir, { recursive: true });
});
