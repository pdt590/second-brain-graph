# Current website structure

- Root: index.html, app.js, style.css, page.js, article.js, vendor.js, THIRD_PARTY_LICENSES.md, server.cjs, package.json.
- Each collection blog/, project/, policy/, member/ has index.html for grid/list cards.
- Each article has <collection>/<slug>/index.html, content.vi.md, content.en.md and images/.
- Current posts: blog/tai-lieu-iot/, project/dao-tao-microsoft-365-copilot-ai-cap-quan-ly/, member/phan-duy-thang/.
- Current legal policy: policy/privacy/index.html and privacy.js; keeps existing HTML VI/EN translations.
- Shared assets: logo/ plus root vendor.js; development artifacts: docs/; reusable skills: .agents/skills/.

## Paths and runtime
Collection pages use ../ root assets. Article shells load ../../style.css, then ../../vendor.js, then ../../article.js; logos use ../../logo/. Header links use ../../<collection>/index.html; back-to-list link is ../index.html. Cards link <slug>/, images <slug>/images/<file>. Markdown images use images/<file>.
article.js resolves brand assets relative to its own script URL, derives metadata from shell fields and active nav from the collection path. It fetches localized Markdown, sanitizes through local Marked/DOMPurify and rebuilds TOC with request-race protection.
page.js manages collection view and language/theme persistence. Preference keys: hubplus-language, hubplus-theme, hubplus-collection-view.
Every HTML shell restores `hubplus-theme` in an inline script before loading style.css to prevent a dark first-paint flash. Landing app.js only treats non-empty same-page hashes as hash navigation, so cross-page links cannot all become active.
Every served HTML shell also contains exactly one Google tag for this repository's Measurement ID `G-KHSSZY8WHD`. New pages copy the tag from the root index. The reusable starter intentionally contains no live Measurement ID; use only an ID supplied by the destination site's owner.
Legal policy still uses escaped HTML translations; other posts use data-markdown-vi/en file paths. Do not put translation attributes on parents containing live controls.

## Routes
Header order is Home, Projects, Members, Blog, Terms. Blog links to its existing collection. Local image derivatives use WebP; partner logos are external WebP/SVG files under logo/partners/. The server serves these logo formats, compresses text responses with gzip and revalidates through ETag/304 with Cache-Control: no-cache. Keep original supplied images. Version shared CSS/JS URLs when editing runtime.
Server exposes the root runtime bundle, collection indexes, one folder per article, content.vi.md/en.md and PNG/WebP/JPG/JPEG under that article's images/. docs/ and .agents/skills/ are not served.
Old privacy/IoT flat URLs redirect. Folder URLs use a trailing slash. Restart the server after changing routing; content changes only need page reload.

## Members
Header includes Members. Landing Members section precedes Partners. Detailed profiles follow member/<slug>/ with user-supplied facts and local photos. Do not invent credentials or experience. The project collection contains the Microsoft 365 Copilot management training case study for Honda Vietnam.

## Thư mục hỗ trợ và hình ảnh

- docs/: tài liệu phát triển, kế hoạch, ảnh kiểm tra và bản nguồn tham chiếu.
- .agents/skills/: các skill tái sử dụng và starter của website.
- vendor.js: bundle runtime duy nhất ở thư mục gốc, gồm Marked trước và DOMPurify sau; giấy phép đầy đủ nằm trong THIRD_PARTY_LICENSES.md. Không tạo lại .vendor/.
- node_modules/: phụ thuộc npm do công cụ quản lý; giữ tên chuẩn để npm hoạt động.
- Card Thành viên trên landing dùng avatar tròn, tên, mô tả ngắn và liên kết hồ sơ; thông tin đầy đủ nằm trong Markdown của hồ sơ.
- Ảnh cover và ảnh Markdown căn giữa trong cột nội dung bài viết, áp dụng blog/project/member.

## SEO generation

Follow the SEO contract in the skill entrypoint and the host `docs/SEO.md`. Article shells load root `seo.js` before the controller. Run the host SEO generator after shell/Markdown changes to refresh static content, canonical/share metadata, schema and sitemap. Keep Markdown as the editable source.
