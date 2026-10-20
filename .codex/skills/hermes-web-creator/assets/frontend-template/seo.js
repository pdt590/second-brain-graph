// Keep sharing metadata consistent with the language currently displayed.
window.updateSeoLanguage = function (language) {
  const description = document.querySelector('meta[name="description"]').content;
  for (const [selector, content] of [
    ['meta[property="og:title"]', document.title],
    ['meta[property="og:description"]', description],
    ['meta[name="twitter:title"]', document.title],
    ['meta[name="twitter:description"]', description],
    ['meta[property="og:locale"]', language === 'en' ? 'en_US' : 'vi_VN'],
    ['meta[property="og:locale:alternate"]', language === 'en' ? 'vi_VN' : 'en_US']
  ]) {
    const tag = document.querySelector(selector);
    if (tag) tag.content = content;
  }
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script) return;
  const data = JSON.parse(script.textContent);
  const page = data['@graph'].find(item => item['@id']?.endsWith('#page'));
  if (page) {
    page.name = document.title;
    page.description = description;
    page.inLanguage = language;
    if (page.headline) page.headline = document.querySelector('h1').textContent;
  }
  script.textContent = JSON.stringify(data);
};
