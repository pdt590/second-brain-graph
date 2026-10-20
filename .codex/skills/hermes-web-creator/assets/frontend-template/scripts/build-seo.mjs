import fs from 'node:fs';
import path from 'node:path';
import {marked} from 'marked';

// One public URL per page; language and collection view are browser preferences.
const origin = new URL(process.env.SITE_URL || (() => { throw new Error('Set SITE_URL to the owner-provided public HTTPS origin'); })()).origin;
if (!origin.startsWith('https://')) throw new Error('SITE_URL must use HTTPS');
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode = value => value.replace(/&(?:amp|quot|#39|lt|gt);/g, c => ({'&amp;':'&','&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>'}[c]));
const plain = value => decode(value.replace(/<[^>]*>/g, '')).trim();
const attribute = (tag, name) => decode(tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
const files = ['index.html'];
for (const folder of ['blog','project','member','policy']) {
  for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
    if (entry.name === 'index.html') files.push(`${folder}/index.html`);
    else if (entry.isDirectory() && fs.existsSync(`${folder}/${entry.name}/index.html`)) files.push(`${folder}/${entry.name}/index.html`);
  }
}
const safeUrl = href => !/&(?:#|colon|Tab|NewLine)/i.test(href) && !/[\u0000-\u0020\\]/.test(href) && !href.startsWith('//') && (!/^[a-z][a-z\d+.-]*:/i.test(href) || /^(https?:|mailto:|tel:)/i.test(href));
const renderer = {
  html() { return ''; }, // Raw HTML is intentionally unsupported in pre-rendered Markdown.
  link({href, title, tokens}) {
    const label = this.parser.parseInline(tokens);
    return safeUrl(href) ? `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''}>${label}</a>` : label;
  },
  image({href, text}) {
    return safeUrl(href) && !/^(mailto:|tel:)/i.test(href) ? `<img src="${escape(href)}" alt="${escape(text)}" class="markdown-image" decoding="async" loading="lazy">` : escape(text);
  }
};
marked.use({renderer});
let stale = false;
function write(file, value) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === value) return;
  if (check) { console.error(`SEO needs regeneration: ${file}`); stale = true; }
  else fs.writeFileSync(file, value);
}
const urls = [];
for (const file of files.sort()) {
  let source = fs.readFileSync(file, 'utf8');
  const route = file === 'index.html' ? '/' : '/' + file.replace(/index\.html$/, '');
  const url = origin + route;
  urls.push(url);
  let title = plain(source.match(/<title>(.*?)<\/title>/s)?.[1] || '');
  let description = attribute(source.match(/<meta name="description"[^>]*>/)?.[0] || '', 'content');
  if (!title || !description) throw new Error(`Missing title/description: ${file}`);
  if (file === 'policy/privacy/index.html') {
    title = 'Chính sách quyền riêng tư | HubPlus';
    description = 'Chính sách quyền riêng tư của HubPlus: thu thập, xử lý thông tin và quyền của bạn.';
    source = source.replace(/<title>.*?<\/title>/s, `<title>${escape(title)}</title>`).replace(/(<meta name="description" content=")[^"]*/, '$1' + escape(description));
  }
  const markdownTag = source.match(/<article\b[^>]*data-markdown-vi="([^"]+)"[^>]*>/);
  let image = origin + '/logo/logo-black.png';
  let imageAlt = 'HubPlus';
  if (markdownTag) {
    const markdown = fs.readFileSync(path.join(path.dirname(file), markdownTag[1]), 'utf8');
    const cover = markdown.match(/!\[([^\]]*)\]\(([^\s)]+)\)/);
    if (cover) { image = new URL(cover[2], url).href; imageAlt = cover[1]; }
    let section = 0;
    const body = marked.parse(markdown, {gfm:true}).replace(/<h2>/g, () => `<h2 id="section-${++section}">`);
    source = source.replace(/(<article\b[^>]*data-markdown-vi="[^"]+"[^>]*>)[\s\S]*?<\/article>/, (_, tag) => tag.replace(' aria-busy="true"', '') + '\n' + body + '</article>');
    source = source.replace(/<noscript>.*?<\/noscript>/s, '');
  }
  const type = markdownTag && !file.startsWith('member/') ? 'Article' : file.startsWith('member/') && markdownTag ? 'ProfilePage' : route.split('/').filter(Boolean).length === 1 ? 'CollectionPage' : 'WebPage';
  const organization = {'@type':'Organization','@id':origin+'/#organization',name:'HubPlus',url:origin+'/',logo:origin+'/logo/logo-black.png'};
  const website = {'@type':'WebSite','@id':origin+'/#website',name:'HubPlus',url:origin+'/',publisher:{'@id':organization['@id']},inLanguage:['vi','en']};
  const page = {'@type':type,'@id':url+'#page',url,name:title,description,inLanguage:'vi',isPartOf:{'@id':website['@id']},image};
  if (type === 'Article') {
    page.headline = plain(source.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] || title);
    page.mainEntityOfPage = url;
    page.publisher = {'@id':organization['@id']};
    const date = source.match(/<time\b[^>]*datetime="([^"]+)"/);
    if (date) page.datePublished = date[1];
  }
  if (type === 'ProfilePage') page.mainEntity = {'@type':'Person', name:plain(source.match(/<h1[^>]*>(.*?)<\/h1>/s)[1]),image,url};
  const crumbs = [{name:'Trang chủ', item:origin+'/'}];
  const labels = {blog:'Blog',project:'Dự án',member:'Thành viên',policy:'Điều khoản'};
  const segments = route.split('/').filter(Boolean);
  if (segments.length) crumbs.push({name:labels[segments[0]],item:origin+'/'+segments[0]+'/'});
  if (segments.length > 1) crumbs.push({name:page.headline || page.name,item:url});
  const breadcrumb = {'@type':'BreadcrumbList',itemListElement:crumbs.map((crumb,index) => ({'@type':'ListItem',position:index+1,...crumb}))};
  const graph = {'@context':'https://schema.org','@graph':[organization,website,page,breadcrumb]};
  const metadata = `<!-- SEO: generated by npm run seo -->\n<link rel="canonical" href="${escape(url)}">\n<meta name="robots" content="index, follow, max-image-preview:large">\n<meta property="og:site_name" content="HubPlus">\n<meta property="og:type" content="${type === 'Article' ? 'article' : 'website'}">\n<meta property="og:locale" content="vi_VN">\n<meta property="og:locale:alternate" content="en_US">\n<meta property="og:url" content="${escape(url)}">\n<meta property="og:title" content="${escape(title)}">\n<meta property="og:description" content="${escape(description)}">\n<meta property="og:image" content="${escape(image)}">\n<meta property="og:image:alt" content="${escape(imageAlt)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${escape(title)}">\n<meta name="twitter:description" content="${escape(description)}">\n<meta name="twitter:image" content="${escape(image)}">\n<meta name="twitter:image:alt" content="${escape(imageAlt)}">\n<script type="application/ld+json">${JSON.stringify(graph).replace(/</g,'\\u003c')}</script>\n<!-- /SEO -->`;
  source = source.replace(/\n?<!-- SEO:[\s\S]*?<!-- \/SEO -->\n?/g, '').replace('</head>', '\n'+metadata+'\n</head>');
  write(file, source);
}
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')+'\n</urlset>\n');
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
if (stale) process.exitCode = 1;
else console.log(`SEO ${check ? 'verified' : 'generated'} for ${files.length} pages (${origin}).`);
