const root = document.documentElement;
let language = 'vi', currentTheme = 'light';
try { language = localStorage.getItem('hubplus-language') === 'en' ? 'en' : 'vi'; currentTheme = localStorage.getItem('hubplus-theme') === 'dark' ? 'dark' : 'light'; } catch {}
function save(key, value) { try { localStorage.setItem(key, value); } catch {} }
function renderTheme() {
  root.dataset.theme = currentTheme;
  document.querySelectorAll('.logo').forEach(img => { img.src = '../../logo/logo-' + (currentTheme === 'dark' ? 'black' : 'light') + '.webp'; });
  const button = document.querySelector('#theme');
  button.textContent = currentTheme === 'dark' ? '☼' : '☾';
  button.setAttribute('aria-label', language === 'vi' ? 'Chuyển sang chế độ ' + (currentTheme === 'dark' ? 'sáng' : 'tối') : 'Switch to ' + (currentTheme === 'dark' ? 'light' : 'dark') + ' mode');
  document.querySelector('meta[name="theme-color"]').content = currentTheme === 'dark' ? '#050705' : '#ffffff';
}
function renderLanguage() {
  root.lang = language;
  document.querySelectorAll('[data-vi][data-en]').forEach(el => { el.innerHTML = el.dataset[language]; });
  const button = document.querySelector('#language');
  button.innerHTML = language === 'vi' ? 'VI <span>/ EN</span>' : 'EN <span>/ VI</span>';
  button.setAttribute('aria-label', language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt');
  document.querySelector('.site-header nav').setAttribute('aria-label', language === 'vi' ? 'Điều hướng chính' : 'Main navigation');
  document.title = language === 'vi' ? 'Chính sách quyền riêng tư | HubPlus' : 'Privacy Policy | HubPlus';
  document.querySelector('meta[name="description"]').content = language === 'vi' ? 'Chính sách quyền riêng tư của HubPlus: thu thập, xử lý thông tin và quyền của bạn.' : 'HubPlus privacy policy: information collection, processing and your rights.';
  window.updateSeoLanguage?.(language);
  renderTheme();
  renderContents();
}
document.querySelector('#theme').addEventListener('click', () => { currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; save('hubplus-theme', currentTheme); renderTheme(); });
document.querySelector('#language').addEventListener('click', () => { language = language === 'vi' ? 'en' : 'vi'; save('hubplus-language', language); renderLanguage(); });
document.querySelector('.site-header a[href="../../policy/index.html"]').setAttribute('aria-current', 'page');

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
  toc.setAttribute('aria-label', language === 'vi' ? 'Mục lục điều khoản' : 'Privacy policy contents');
  const list = document.createElement('ol');
  headings.forEach(heading => {
    const text = heading.textContent.toLocaleLowerCase(language).replace(/^(\d+\.\s*)(\p{L})/u, (_, number, letter) => number + letter.toLocaleUpperCase(language));
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
  setActiveSection(location.hash.slice(1));
  tocObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting);
    if (visible.length) setActiveSection(visible[0].target.id);
  }, {rootMargin: '-15% 0px -65% 0px'});
  headings.forEach(heading => tocObserver.observe(heading));
}
window.addEventListener('hashchange', () => setActiveSection(location.hash.slice(1)));

renderLanguage();
