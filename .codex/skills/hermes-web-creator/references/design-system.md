# Hermes web design system

## Tokens
| Token | Dark | Light |
| --- | --- | --- |
| Background | #050705 | #ffffff |
| Panel | #11130d | #f5f5f5 |
| Alternate panel | #171a12 | #ebebeb |
| Text | #eee6ce | #202020 |
| Muted text | #a7a58f | #626262 |
| Text accent | #f4b900 | #886300 |
| Line | #34372a | #d5d5d5 |
| Grid | #25291c | #e8e8e8 |

Use #f4b900 for yellow fill with near-black text. Light-mode small accent text uses #886300 for contrast. Reuse CSS custom properties and data-theme; avoid growing duplicate overrides.

## Type and layout
- Body: Segoe UI, Arial, sans-serif; 16px / 1.75.
- Monospace: Consolas/Courier New for brand, eyebrows and diagrams.
- Hero 38–68px responsive; section h2 32–44px; card headings 24px.
- Article 17px desktop / 16px mobile at 1.85; h2 24–29px, h3 19–21px.
- TOC 15px / 1.65, generated from H2 headings only. Use actual section count, not a fixed eleven sections.
- Max wrap 1280px, gutters 40px desktop / 24px mobile / 16px very narrow.
- Reading layout: sticky 280px TOC, 64px gap, flexible text column; below 960px collapsible TOC above article.
- Grid cards: three columns desktop, two tablet, one mobile. List cards: horizontal, compact thumbnails on mobile.
- Landing member cards: centered circular portrait, centered text/action, no visible border and the section background showing through.
- Partner carousel: three visible logos, panels 180px desktop / 110px mobile, prev/next/pause.

Use sentence case for long reading headings. Leave room for Vietnamese diacritics and translated labels. Avoid fixed text heights and heading nowrap.

## Motion and interaction
Reuse --ease-out cubic-bezier(.23, 1, .32, 1).
Button feedback is brief (160ms); explanatory packet loops use 2200ms linear transform/opacity motion. Pause loops under motion-paused and disable under reduced motion.
Carousel autoplay: 4 seconds while visible, paused on hover, focus, hidden tabs and reduced motion. Preserve explicit controls and 44px targets.
Use inline SVG channel icons with aria-hidden; retain link text and accessible button names.

## Thư mục hỗ trợ và hình ảnh

- docs/: tài liệu phát triển, kế hoạch, ảnh kiểm tra và bản nguồn tham chiếu.
- .agents/skills/: các skill tái sử dụng và starter của website.
- vendor.js: bundle runtime duy nhất ở thư mục gốc, gồm Marked trước và DOMPurify sau. Giữ THIRD_PARTY_LICENSES.md khi triển khai; không tạo lại .vendor/.
- node_modules/: phụ thuộc npm do công cụ quản lý; giữ tên chuẩn để npm hoạt động.
- Card Thành viên trên landing dùng avatar tròn, tên, mô tả ngắn và liên kết hồ sơ; thông tin đầy đủ nằm trong Markdown của hồ sơ.
- Ảnh cover và ảnh Markdown căn giữa trong cột nội dung bài viết, áp dụng blog/project/member.
