const root = document.documentElement;
let language = 'vi';
let currentTheme = 'light';
let motionPaused = false;
try {
  language = localStorage.getItem('hubplus-language') === 'en' ? 'en' : 'vi';
  currentTheme = localStorage.getItem('hubplus-theme') === 'dark' ? 'dark' : 'light';
} catch {}
const dialog = document.querySelector('#contact-dialog');
function save(key, value) { try { localStorage.setItem(key, value); } catch {} }
function renderTheme() {
  root.dataset.theme = currentTheme;
  document.querySelectorAll('.logo').forEach(img => { img.src = `logo/logo-${currentTheme === 'dark' ? 'black' : 'light'}.webp`; });
  const button = document.querySelector('#theme');
  const label = language === 'vi' ? `Chuyển sang chế độ ${currentTheme === 'dark' ? 'sáng' : 'tối'}` : `Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`;
  button.textContent = currentTheme === 'dark' ? '☼' : '☾';
  button.setAttribute('aria-label', label);
  button.title = label;
  document.querySelector('meta[name="theme-color"]').content = currentTheme === 'dark' ? '#050705' : '#ffffff';
}
function renderMotion() {
  root.classList.toggle('motion-paused', motionPaused);
  const button = document.querySelector('#motion');
  button.setAttribute('aria-pressed', String(motionPaused));
  button.textContent = language === 'vi' ? (motionPaused ? 'Tiếp tục chuyển động ▷' : 'Tạm dừng chuyển động Ⅱ') : (motionPaused ? 'Resume animation ▷' : 'Pause animation Ⅱ');
}
function renderLanguage() {
  root.lang = language;
  document.querySelectorAll('[data-vi][data-en]').forEach(el => { el.innerHTML = el.dataset[language]; });
  const button = document.querySelector('#language');
  button.innerHTML = language === 'vi' ? 'VI <span>/ EN</span>' : 'EN <span>/ VI</span>';
  button.setAttribute('aria-label', language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt');
  document.querySelector('nav').setAttribute('aria-label', language === 'vi' ? 'Điều hướng chính' : 'Main navigation');
  document.querySelector('.dialog-close').setAttribute('aria-label', language === 'vi' ? 'Đóng cửa sổ liên hệ' : 'Close contact dialog');
  document.title = language === 'vi' ? 'HubPlus — Đào tạo & giải pháp AI' : 'HubPlus — AI training & business solutions';
  document.querySelector('meta[name="description"]').content = language === 'vi' ? 'HubPlus: đào tạo ứng dụng AI và triển khai giải pháp AI cho doanh nghiệp. Kết nối công nghệ – Kiến tạo tương lai.' : 'HubPlus: practical AI training and AI solutions for businesses. Connecting Innovation. Creating Value.';
  window.updateSeoLanguage?.(language);
  const subject = language === 'vi' ? 'Tư vấn đào tạo và giải pháp AI — HubPlus' : 'AI training and solutions enquiry — HubPlus';
  const body = language === 'vi' ? 'Chào HubPlus,\n\nTôi muốn trao đổi về:\nNhu cầu của tôi:\nThông tin liên hệ:\n' : 'Hello HubPlus,\n\nI would like to discuss:\nMy needs:\nContact details:\n';
  document.querySelector('#email-link').href = `mailto:info@hubplus.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  renderTheme();
  renderMotion();
  renderPartners();
}
document.querySelector('#theme').addEventListener('click', () => { currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; save('hubplus-theme', currentTheme); renderTheme(); });
document.querySelector('#language').addEventListener('click', () => { language = language === 'vi' ? 'en' : 'vi'; save('hubplus-language', language); renderLanguage(); });
document.querySelector('#motion').addEventListener('click', () => { motionPaused = !motionPaused; renderMotion(); });
document.querySelectorAll('[data-contact]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
const navLinks = [...document.querySelectorAll('.site-header nav a')];
function targetsPageHash(link, hash) {
  const href = link.getAttribute('href');
  return Boolean(hash && href?.startsWith('#') && link.hash === hash);
}
function activate(hash) {
  navLinks.forEach(link => {
    if (targetsPageHash(link, hash) || (hash === '#projects' && link.getAttribute('href') === 'project/index.html') || (hash === '#members' && link.getAttribute('href') === 'member/index.html')) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
function syncHashNavigation() {
  if (navLinks.some(link => targetsPageHash(link, location.hash))) activate(location.hash);
}
window.addEventListener('hashchange', syncHashNavigation);
navLinks.forEach(link => link.addEventListener('click', () => {
  if (targetsPageHash(link, link.hash)) activate(link.hash);
}));
const sections = [...document.querySelectorAll('main > section[id]')];
const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting);
  if (!visible.length) return;
  const id = visible[0].target.id;
  activate(['home', 'services', 'benefits'].includes(id) ? '#home' : ['reviews','partners'].includes(id) ? '#projects' : `#${id}`);
}, { rootMargin: '-20% 0px -50% 0px', threshold: 0 });
sections.forEach(section => observer.observe(section));

const partnerStrip = document.querySelector('.partner-logos');
const partnerRegion = document.querySelector('.partner-carousel');
const partnerPause = document.querySelector('#partner-pause');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let partnersPaused = reducedMotion.matches;
let partnerVisible = false;
let partnerTimer;
function renderPartners() {
  const vi = language === 'vi';
  partnerRegion.setAttribute('aria-label', vi ? 'Logo đối tác' : 'Partner logos');
  partnerStrip.setAttribute('aria-label', vi ? 'Danh sách đối tác' : 'Partner list');
  document.querySelector('#partner-prev').setAttribute('aria-label', vi ? 'Đối tác trước' : 'Previous partners');
  document.querySelector('#partner-next').setAttribute('aria-label', vi ? 'Đối tác tiếp theo' : 'Next partners');
  partnerPause.textContent = vi ? (partnersPaused ? 'Tiếp tục' : 'Tạm dừng') : (partnersPaused ? 'Resume' : 'Pause');
  partnerPause.setAttribute('aria-pressed', String(partnersPaused));
}
function movePartners(direction) {
  const step = partnerStrip.children[1].offsetLeft - partnerStrip.children[0].offsetLeft;
  const maxIndex = partnerStrip.children.length - 3;
  const index = Math.round(partnerStrip.scrollLeft / step);
  const next = (index + direction + maxIndex + 1) % (maxIndex + 1);
  partnerStrip.scrollTo({left: next * step, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
}
function schedulePartners() {
  clearInterval(partnerTimer);
  if (partnersPaused || reducedMotion.matches || !partnerVisible || document.hidden || partnerRegion.matches(':hover') || partnerRegion.contains(document.activeElement)) return;
  partnerTimer = setInterval(() => movePartners(1), 4000);
}
for (const [id, direction] of [['partner-prev', -1], ['partner-next', 1]]) {
  document.getElementById(id).addEventListener('click', () => movePartners(direction));
}
partnerPause.addEventListener('click', () => { partnersPaused = !partnersPaused; renderPartners(); schedulePartners(); });
partnerStrip.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); movePartners(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
for (const event of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) partnerRegion.addEventListener(event, () => setTimeout(schedulePartners, 0));
document.addEventListener('visibilitychange', schedulePartners);
reducedMotion.addEventListener('change', () => { partnersPaused = reducedMotion.matches; renderPartners(); schedulePartners(); });
new IntersectionObserver(entries => { partnerVisible = entries[0].isIntersecting; schedulePartners(); }, {threshold: 0.25}).observe(partnerRegion);
window.addEventListener('resize', () => { partnerStrip.scrollTo({left: 0, behavior: 'instant'}); schedulePartners(); });
renderLanguage();
syncHashNavigation();
