# Project notes for Claude Code

## Commit rules

- **Do NOT add a co-author trailer** to commits. Never append `Co-Authored-By: Claude <noreply@anthropic.com>` or any `Co-Authored-By:` line. Commit messages should contain only the human-authored subject and body.
- Do not add "Generated with Claude Code" footers or similar attribution lines in commit messages.
- Keep commit messages concise and focused on the "why".

## Bilingual / i18n system

The site is bilingual (English / Traditional Chinese) with **no URL routing** — language is controlled entirely client-side and persists via `localStorage`.

### How it works

- **Single source of truth:** `document.documentElement.lang` is either `"en"` or `"zh"`.
- **Persistence:** `localStorage["site-lang"]`. On first visit, detected from `navigator.language` (defaults to `"en"`).
- **Pre-paint:** every page loads `/js/i18n.js` in `<head>` so the `lang` attribute is set before the body paints — avoids a flash of the wrong language.
- **CSS-driven visibility:** rules in `css/site.css` hide the inactive language:

  ```css
  html[lang="en"] [data-lang="zh"],
  html[lang="zh"] [data-lang="en"] { display: none !important; }
  ```

- **Toggle button:** `<button class="lang-toggle">` lives inside `.nav-links` on every page. `js/i18n.js` binds the click handler.
- **Chinese typography:** when `html[lang="zh"]`, the body switches to a PingFang / Noto Sans TC stack with looser line-height.

### How to write bilingual content

**Inline text** (headings, buttons, labels):

```html
<h1>
  <span data-lang="en">English heading</span>
  <span data-lang="zh">中文標題</span>
</h1>
```

**Block prose inside Markdown posts** (use `markdown="1"` so kramdown still parses the inner content):

```html
<div data-lang="en" markdown="1">
## English section
Body paragraph.
</div>

<div data-lang="zh" markdown="1">
## 中文段落
內文段落。
</div>
```

**Page titles** — use `data-title-en` / `data-title-zh` on `<title>`:

```html
<title data-title-en="Home - Yuu" data-title-zh="首頁 - Yuu">Home - Yuu</title>
```

`i18n.js` updates it on toggle.

### Required on every HTML page

1. `<script src="/js/i18n.js"></script>` inside `<head>` (before body paint).
2. A `.lang-toggle` button inside the nav so users can switch.
3. Every user-facing string wrapped in paired `data-lang` elements (nav links, headings, paragraphs, buttons, footer, etc.).
4. Load `css/site.css` (which now contains the bilingual visibility rules).

### What NOT to do

- Do not introduce `/en/` or `/zh/` URL prefixes. The whole point is URL-free switching.
- Do not inline a small "lang init" script per page — use `/js/i18n.js`, which is a single source of truth.
- Do not use `display: none` manually on language blocks — let the CSS rules handle it.
- Do not put bilingual text directly inside `MEMORY.md` or build pipelines that would cache only one language.

## Site conventions

- Insights posts live in `_posts/` and use `layout: insight`. The layout supports a `hero_image:` frontmatter field that renders a full-width image between the title and body.
- Post thumbnails on the insights index can be either a keyword (`sparkles`, `terminal`, `database`) or an image URL — the template in `insights/index.html` handles both.
- When using Unsplash images, prefer URLs with `?w=1600&q=90&auto=format&fit=crop` (or `2000w` for hero) so thumbnails render sharp on retina and hero scaling.
- `css/insights.css` owns the `.insight-thumb`, `.insight-card`, `.post-body`, and `.post-hero` styling. Global styles (including all bilingual rules) live in `css/site.css`.
- `js/i18n.js` owns language state. `js/site-ui.js` handles nav, anchors, and forms and calls `SiteI18n.init()` as a safety net — don't duplicate language logic elsewhere.
