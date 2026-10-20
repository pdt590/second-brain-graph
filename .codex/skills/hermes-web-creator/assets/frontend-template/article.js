const root = document.documentElement;
let language = 'vi', currentTheme = 'light';
try { language = localStorage.getItem('hubplus-language') === 'en' ? 'en' : 'vi'; currentTheme = localStorage.getItem('hubplus-theme') === 'dark' ? 'dark' : 'light'; } catch {}
function save(key, value) { try { localStorage.setItem(key, value); } catch {} }
function renderTheme() {
  root.dataset.theme = currentTheme;
  document.querySelectorAll('.logo').forEach(img => { img.src = new URL('logo/logo-' + (currentTheme === 'dark' ? 'black' : 'light') + '.webp', document.querySelector('script[src*="article.js"]').src).href; });
  const button = document.querySelector('#theme');
  button.textContent = currentTheme === 'dark' ? '☼' : '☾';
  button.setAttribute('aria-label', language === 'vi' ? 'Chuyển sang chế độ ' + (currentTheme === 'dark' ? 'sáng' : 'tối') : 'Switch to ' + (currentTheme === 'dark' ? 'light' : 'dark') + ' mode');
  document.querySelector('meta[name="theme-color"]').content = currentTheme === 'dark' ? '#050705' : '#ffffff';
}

let articleRequest = 0;
const articleBody = document.querySelector('[data-markdown-vi]');
const articleStatus = document.querySelector('#article-status');
function renderLanguage() {
  root.lang = language;
  document.querySelectorAll('[data-vi][data-en]').forEach(el => { el.innerHTML = el.dataset[language]; });
  const button = document.querySelector('#language');
  button.innerHTML = language === 'vi' ? 'VI <span>/ EN</span>' : 'EN <span>/ VI</span>';
  button.setAttribute('aria-label', language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt');
  document.querySelector('.site-header nav').setAttribute('aria-label', language === 'vi' ? 'Điều hướng chính' : 'Main navigation');
  document.title = document.querySelector('h1').textContent + ' | HubPlus';
  const description = document.querySelector('meta[name="description"]');
  description.content = description.dataset[language] || description.content;
  window.updateSeoLanguage?.(language);
  renderTheme();
  loadMarkdown();
}
async function loadMarkdown() {
  const request = ++articleRequest;
  const locale = language;
  articleBody.setAttribute('aria-busy', 'true');
  articleStatus.hidden = false;
  articleStatus.textContent = locale === 'vi' ? 'Đang tải bài viết…' : 'Loading article…';
  if (tocObserver) tocObserver.disconnect();
  toc.replaceChildren();
  try {
    const url = new URL(articleBody.dataset[locale === 'vi' ? 'markdownVi' : 'markdownEn'], location.href);
    const response = await fetch(url, {cache: 'no-cache'});
    if (!response.ok) throw new Error('Markdown HTTP ' + response.status);
    const markdown = await response.text();
    const html = DOMPurify.sanitize(marked.parse(markdown, {gfm: true}), {USE_PROFILES: {html: true}});
    if (request !== articleRequest) return;
    articleBody.innerHTML = html;
    articleBody.querySelectorAll('h2').forEach((heading, index) => { heading.id = 'section-' + (index + 1); });
    articleBody.querySelectorAll('table').forEach((table, tableIndex) => {
      table.classList.add('resource-table');
      table.querySelectorAll('thead th').forEach(th => { th.scope = 'col'; });
      const wrapper = document.createElement('div');
      wrapper.className = 'resource-table-wrap';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', locale === 'vi' ? 'Bảng tài liệu, có thể cuộn ngang' : 'Resource table, scroll horizontally');
      table.before(wrapper); wrapper.append(table);
      table.querySelectorAll('tbody tr').forEach((row, index) => {
        const name = row.cells[1];
        if (name && table.querySelector('thead th')?.textContent === (locale === 'vi' ? 'STT' : 'No.')) {
          const th = document.createElement('th'); th.scope = 'row';
          const heading = document.createElement('h3'); heading.id = 'resource-' + (index + 1) + (tableIndex ? '-' + tableIndex : '');
          heading.textContent = name.textContent;
          th.append(heading); name.replaceWith(th);
          row.querySelectorAll('a').forEach(link => link.setAttribute('aria-label', (locale === 'vi' ? 'Tải tài liệu: ' : 'Download: ') + heading.textContent));
        }
      });
    });
    articleBody.querySelectorAll('a').forEach(link => {
      if (/^https?:/.test(link.href) && new URL(link.href).origin !== location.origin) {
        link.target = '_blank'; link.rel = 'noopener noreferrer';
      }
    });
    articleBody.querySelectorAll('img').forEach((img, index) => {
      img.classList.add('markdown-image');
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      if (index === 0) img.fetchPriority = 'high';
      img.addEventListener('load', () => { img.width = img.naturalWidth; img.height = img.naturalHeight; }, {once: true});
    });
    renderContents();
    articleStatus.hidden = true;
    const target = document.getElementById(location.hash.slice(1));
    if (target && articleBody.contains(target)) target.scrollIntoView({behavior: 'instant', block: 'start'});
  } catch (error) {
    if (request !== articleRequest) return;
    articleStatus.textContent = locale === 'vi' ? 'Không tải được bài viết. Hãy tải lại trang và mở website bằng máy chủ HTTP.' : 'Unable to load this article. Reload the page and open the website through an HTTP server.';
    console.error(error);
    tocDisclosure.hidden = true;
  } finally {
    if (request === articleRequest) articleBody.removeAttribute('aria-busy');
  }
}

document.querySelector('#theme').addEventListener('click', () => { currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; save('hubplus-theme', currentTheme); renderTheme(); });
document.querySelector('#language').addEventListener('click', () => { language = language === 'vi' ? 'en' : 'vi'; save('hubplus-language', language); renderLanguage(); });
const collection = location.pathname.split('/').filter(Boolean)[0];
[...document.querySelectorAll('.site-header nav a')].find(link => new URL(link.href).pathname.endsWith('/' + collection + '/index.html'))?.setAttribute('aria-current', 'page');

let tocObserver;
const toc = document.querySelector('#privacy-toc-links');
const tocDisclosure = document.querySelector('.privacy-toc');
const compactToc = window.matchMedia('(max-width: 959px)');
tocDisclosure.open = !compactToc.matches;
compactToc.addEventListener('change', event => { tocDisclosure.open = !event.matches; });
function setActiveSection(id) {
  toc.querySelectorAll('a').forEach(link => {
    if (link.hash === '#' + id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
function renderContents() {
  if (tocObserver) tocObserver.disconnect();
  const headings = [...document.querySelectorAll('.privacy-content h2')];
  toc.replaceChildren();
  toc.setAttribute('aria-label', language === 'vi' ? 'Mục lục bài viết' : 'Article contents');
  const list = document.createElement('ol');
  headings.forEach(heading => {
    const text = heading.textContent;
    heading.textContent = text;
    heading.tabIndex = -1;
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#' + heading.id;
    link.textContent = text.replace(/^\d+\.\s*/, '');
    link.addEventListener('click', () => {
      if (compactToc.matches) tocDisclosure.open = false;
      setActiveSection(heading.id);
      heading.focus({preventScroll: true});
    });
    item.append(link);
    list.append(item);
  });
  toc.append(list);
  tocDisclosure.hidden = headings.length === 0;
  setActiveSection(location.hash.slice(1));
  tocObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting);
    if (visible.length) setActiveSection(visible[0].target.id);
  }, {rootMargin: '-15% 0px -65% 0px'});
  headings.forEach(heading => tocObserver.observe(heading));
}
window.addEventListener('hashchange', () => setActiveSection(location.hash.slice(1)));

renderLanguage();
