import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildGraphFromWiki, resolveWikiDir, toPublicGraph } from '../server/wiki-graph-indexer.mjs';

const cwd = process.cwd();
const wikiDir = path.resolve(cwd, process.argv[2] ?? resolveWikiDir());
const graphOutPath = path.resolve(cwd, 'public', 'graph-data.json');

const graph = toPublicGraph(await buildGraphFromWiki(wikiDir));

await mkdir(path.dirname(graphOutPath), { recursive: true });
await writeFile(graphOutPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');

console.log(`Generated ${graph.nodes.length} nodes and ${graph.links.length} links`);
console.log(`Source: ${wikiDir}`);
console.log(`Output: ${graphOutPath}`);
console.log('Note: source Markdown is no longer copied into public/. Runtime content is served by /api/wiki/content.');
