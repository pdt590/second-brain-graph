const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {gzip} = require('node:zlib');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.md':'text/markdown; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res) => {
 let url, pathname;
 try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
 const redirects = {'/privacy.html':'/policy/privacy/','/policy/privacy.html':'/policy/privacy/','/privacy.js':'/policy/privacy/privacy.js','/policy/privacy.js':'/policy/privacy/privacy.js','/blog/tai-lieu-iot.html':'/blog/tai-lieu-iot/','/blog/tai-lieu-iot.vi.md':'/blog/tai-lieu-iot/content.vi.md','/blog/tai-lieu-iot.en.md':'/blog/tai-lieu-iot/content.en.md','/blog/images/tai-lieu-iot.png':'/blog/tai-lieu-iot/images/cover.png'};
 const collectionPath = /^\/(blog|project|policy|member)(?:\/[a-z0-9-]+)?$/i.test(pathname);
 if (redirects[pathname] || collectionPath) { res.writeHead(301, {'Location':(redirects[pathname] || pathname + '/') + url.search}); res.end(); return; }
 if (pathname.endsWith('/')) pathname += 'index.html';
 const file = path.resolve(root, '.' + pathname);
 if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
 const relative = path.relative(root,file).split(path.sep).join('/');
 const shared = ['robots.txt','sitemap.xml','seo.js','index.html','style.css','app.js','page.js','article.js','vendor.js','policy/privacy/privacy.js','logo/logo-black.png','logo/logo-light.png'];
 const contentPage = /^(blog|project|policy|member)\/(?:[a-z0-9-]+\/)?index\.html$/i.test(relative);
 const markdownPage = /^(blog|project|policy|member)\/[a-z0-9-]+\/content\.(vi|en)\.md$/i.test(relative);
 const contentAsset = /^(blog|project|policy|member)\/[a-z0-9-]+\/images\/[a-z0-9-]+\.(png|webp|jpg|jpeg)$/i.test(relative);
 const logoAsset = /^logo\/(?:partners\/)?[a-z0-9-]+\.(png|webp|svg)$/i.test(relative);
 if (!shared.includes(relative) && !contentPage && !contentAsset && !markdownPage && !logoAsset) { res.writeHead(404); res.end('Not found'); return; }
 fs.stat(file, (error, stat) => {
  if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
  const extension = path.extname(file);
  const compressed = /\.(html|css|js|md|svg|xml|txt)$/.test(extension) && /\bgzip\b(?!\s*;\s*q=0(?:\D|$))/.test(req.headers['accept-encoding'] || '');
  const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
  const headers = {'Content-Type':types[extension] || 'application/octet-stream', 'Cache-Control':'no-cache', 'ETag':etag, 'Last-Modified':stat.mtime.toUTCString(), 'Vary':'Accept-Encoding'};
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
  if (compressed) headers['Content-Encoding'] = 'gzip';
  if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
  fs.readFile(file, (readError, data) => {
   if (readError) { res.writeHead(404); res.end('Not found'); return; }
   const send = (body) => { res.writeHead(200, {...headers, 'Content-Length':body.length}); res.end(body); };
   if (compressed) gzip(data, (zipError, body) => { if (zipError) { delete headers['Content-Encoding']; send(data); } else send(body); });
   else send(data);
  });
 });
}).listen(5173,'0.0.0.0',()=>console.log('HubPlus: http://0.0.0.0:5173'));
