---
name: hermes-web-creator
description: Build or restyle websites using the Hermes web design system of HubPlus, with dark amber panels, white-gray-yellow light mode, Vietnamese/English navigation, responsive landing pages and article collections. Use for whole-site design and structure, rather than individual posts.
---

# Hermes Web Creator

Create a runnable website in the established Hermes web style while preserving the user's branding, framework, content and scope.

## Choose a baseline

Read the target README and implementation notes; this project's notes are in docs/DEVELOPMENT.md. Inspect current source before using the bundled snapshot.

- Existing website: adapt current files; never replace it wholesale with the starter.
- New vanilla website: use assets/frontend-template/ or run node scripts/create-site.mjs <target-directory>. The script refuses to overwrite existing files.
- Existing framework: translate the same visual contracts into its components.

The starter is a HubPlus example, including sample reviews, partners, legal text and an IoT article. Replace example branding and content according to the user's brief. Do not reuse its partnership claims or legal policy as facts for another organization. Keep applicable asset licenses.

Read [references/design-system.md](references/design-system.md) for visual decisions and [references/site-structure.md](references/site-structure.md) for routing and runtime contracts.

## Build

Use near-black/olive surfaces, amber accents, thin industrial frames and restrained monospace labels. Body copy and reading pages use sans-serif. Light mode uses white, neutral gray and yellow; small yellow text on white needs a darker contrast-safe shade.

Provide the requested dark/light and VI/EN controls with choices persisted across pages. Translate headings, content, aria labels, title and description. HubPlus header order: Home, Projects, Members, Blog, Terms and preferences; no header CTA. Blog links to its existing collection. Enquiries use the landing contact dialog.

Collections support vertical grid cards and horizontal list cards, with a saved preference and ?view=grid or ?view=list. Reading pages use policy-style typography and bilingual TOC built from H2 headings only; H3 headings remain inside the article body and are not TOC entries. Blog/project bodies live in editable .vi.md/.en.md files; HTML is only the shell. Local Marked and DOMPurify render and sanitize Markdown. Do not add author biographies or displayed source blocks by default; follow explicit requirements and any source license.

Use supplied logos and local images; concepts may use meaningful SVG. Explanatory diagrams may show dots from the input into H+ and its three output branches. Ship pause controls and reduced motion with loops. Avoid unnecessary diagonal arrows.

Initialize the saved theme in a small inline head script before the stylesheet, so cross-page navigation never paints the default dark theme before applying a saved light preference. Scope landing navigation state to `.site-header nav`; never compare empty hashes from cross-page links, because they would mark every collection link current.

Preserve an existing site-wide Google tag on every HTML page. For this HubPlus repository, use Measurement ID `G-KHSSZY8WHD` exactly once near the start of `<head>`. When adapting the bundled starter for another website, never reuse HubPlus's live ID: keep analytics absent until the owner provides an ID, then apply that ID consistently to every HTML shell. Imported source analytics must not be copied.

Keep runtime source at root, including the combined `vendor.js` browser bundle and `THIRD_PARTY_LICENSES.md`. Content stays in policy/, blog/, project/, member/; generated plans, reference captures and previews stay in docs/. Repository skills stay in `.agents/skills/`.

## Verify

HubPlus performance contract: use WebP derivatives sized for display, retain original images, preserve vector logos as SVG, and use image dimensions, asynchronous decoding and lazy loading below the fold. Do not embed raster logos as base64. Synchronize theme-logo paths and starter assets. The Node server supports gzip, ETag and `Cache-Control: no-cache`; Markdown uses `cache: no-cache` to revalidate edits without downloading unchanged content. Preserve sanitization and request-race protection. Update CSS/JS version queries when shared assets change.

Run the site's syntax/build checks. Verify every served HTML page has exactly one loader and one `gtag('config', ...)` for the intended Measurement ID. Inspect desktop/mobile, both themes, full VI/EN content, contact keyboard behavior, collection views, asset loading and TOC anchors where relevant. Report checks actually completed and any unavailable browser verification. Publishing or deploying is a separate task.

## Folder-per-article contract

Use <collection>/<slug>/{index.html,content.vi.md,content.en.md,images/}, with collections blog, project, policy, member. Collection index.html remains at its root; cards link to <slug>/ and use <slug>/images/<file>. Article shells use ../../ root assets, ../../<collection>/index.html in header navigation and ../index.html to return to their own list. Markdown images use images/<file>. Existing legal privacy stays HTML-translated with colocated privacy.js under policy/privacy/. Keep empty collections empty rather than inventing articles. Members nav and a landing Members section precede Partners; member facts/photos come from the user.

## Current presentation contract

Landing member cards use a circular avatar linked to the member profile, centered name/summary, no separate profile CTA, no visible card border and the same background as the section. Keep detailed credentials in the member article. Featured project cards link through the card itself and do not add a second “view project” CTA inside the card. Section labels use the same monospace/amber treatment as the other numbered sections. Center cover and Markdown images within the article reading column using automatic inline margins. Supporting folders are `docs/` and `.agents/skills/`. Marked and DOMPurify are concatenated, in that order, into root `vendor.js`; preserve their complete notices in root `THIRD_PARTY_LICENSES.md`. This repository's served HTML uses Google Analytics `G-KHSSZY8WHD`; `npm run check` validates coverage. Do not recreate `.vendor/`. Keep node_modules/ unchanged.

## SEO contract

Read the host's `docs/SEO.md` when adding or changing pages. Keep a distinct, accurate title and description per page, absolute canonical/share URLs, local representative images with alt text, and appropriate JSON-LD types. Only use dates and identities supported by visible content. Never copy HubPlus's canonical domain into another website.

In this repository, run `npm run optimize` when assets/runtime change, then `npm run seo` and `npm run check`. The SEO generator pre-renders Vietnamese Markdown into the article shell and updates sitemap/robots; Markdown remains the source of truth. Do not hand-edit generated article bodies or SEO blocks. Preserve browser sanitization and retain existing static content while Markdown loads or fails. Raw HTML is excluded by the static renderer; use Markdown syntax for indexable content.

VI/EN currently share a URL; canonical ignores view preferences. Do not advertise separate hreflang URLs until real crawlable language routes exist. Load `seo.js` before the page controller to synchronize sharing metadata on language switches. For a new website using the bundled starter, set the owner-provided `SITE_URL=https://public-domain` when running `npm run seo`; install its declared dependencies first. Publishing and submitting sitemap to search engines remain separate tasks.

## Default theme

Use light mode for initial HTML, theme-color, logo and theme-button state. Runtime and the pre-stylesheet theme initializer select dark only when `hubplus-theme` explicitly stores `dark`; absent, invalid or inaccessible storage falls back to light. Preserve an existing user preference across pages.
