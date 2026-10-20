const root = document.documentElement;
let language = 'vi', currentTheme = 'light';
try { language = localStorage.getItem('hubplus-language') === 'en' ? 'en' : 'vi'; currentTheme = localStorage.getItem('hubplus-theme') === 'dark' ? 'dark' : 'light'; } catch {}
function save(key, value) { try { localStorage.setItem(key, value); } catch {} }
function renderTheme() {
 root.dataset.theme = currentTheme;
 document.querySelectorAll('.logo').forEach(img => { img.src = '../logo/logo-' + (currentTheme === 'dark' ? 'black' : 'light') + '.webp'; });
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
 document.querySelector('nav').setAttribute('aria-label', language === 'vi' ? 'Điều hướng chính' : 'Main navigation');
 document.title = document.querySelector('h1').textContent + ' | HubPlus';
 document.querySelector('meta[name="description"]').content = document.querySelector('.collection-intro').textContent;
  window.updateSeoLanguage?.(language);
 renderTheme();
 renderView();
}
document.querySelector('#theme').addEventListener('click', () => { currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; save('hubplus-theme', currentTheme); renderTheme(); });
document.querySelector('#language').addEventListener('click', () => { language = language === 'vi' ? 'en' : 'vi'; save('hubplus-language', language); renderLanguage(); });
document.querySelector('nav a[href="../' + document.body.dataset.page + '/index.html"]').setAttribute('aria-current', 'page');

let view = 'grid';
try {
 const requested = new URLSearchParams(location.search).get('view');
 const saved = localStorage.getItem('hubplus-collection-view');
 view = (requested || saved) === 'list' ? 'list' : 'grid';
} catch {}
function renderView() {
 document.querySelector('.collection-cards').dataset.layout = view;
 document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
 document.querySelector('.collection-view-controls').setAttribute('aria-label', language === 'vi' ? 'Kiểu hiển thị' : 'View style');
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
 view = button.dataset.view;
 save('hubplus-collection-view', view);
 const url = new URL(location.href);
 url.searchParams.set('view', view);
 history.replaceState(null, '', url);
 renderView();
}));
renderLanguage();
