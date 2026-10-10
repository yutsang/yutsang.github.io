# yutsang.github.io

Personal portfolio site — Jekyll on GitHub Pages, fully bilingual (EN / 中文).

---

## Pages

| Tab | URL | Source |
|---|---|---|
| Home | `/` | `index.html` |
| Insights | `/insights/` | `insights/index.html` |
| Projects | `/projects/` | `projects/index.html` |
| Photos | `/photos/` | `photos/index.html` |
| About | `/contact/` | `contact/index.html` |

`/data-viz/` redirects to `/projects/` (Data Viz filter).

---

## Adding content

### Insights and Photos — Jekyll posts

Both tabs are driven by files in **`_posts/`**.
The only difference is the `layout:` value and a few extra frontmatter fields.

**`_posts/YYYY-MM-DD-slug.md`**

```yaml
---
# ---- INSIGHTS ----
layout: insight
title: "English title"
title_zh: "中文標題"
date: 2026-05-01
tags: [Tutorial, Engineering]
thumbnail: https://images.unsplash.com/…?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/…?w=2000&q=90&auto=format&fit=crop
excerpt: "One-sentence English summary."
excerpt_zh: "一句中文摘要。"
permalink: /insights/your-slug/
---
```

```yaml
---
# ---- PHOTOS ----
layout: photo
title: "English title"
title_zh: "中文標題"
date: 2026-05-01
tags: [city]                        # travel / city / nature / daily
location: "Hong Kong"
location_zh: "香港"
thumbnail: /photos/img/thumb.jpg    # or a remote URL
hero_image: /photos/img/hero.jpg    # or a remote URL
excerpt: "One-sentence English caption."
excerpt_zh: "一句中文說明。"
permalink: /photos/your-slug/
---
```

**Post body** — wrap each language in a `data-lang` div:

```markdown
<div data-lang="en" markdown="1">
Your English text here.
</div>

<div data-lang="zh" markdown="1">
中文內容。
</div>
```

**Multiple photos inside a post** — use `.photo-gallery`:

```markdown
<div data-lang="en" markdown="1">
Caption here.

<div class="photo-gallery">
  <img src="/photos/img/shot1.jpg" alt="…">
  <img src="/photos/img/shot2.jpg" alt="…">
</div>
</div>
```

**Insight thumbnails** accept a URL or one of three SVG keywords: `sparkles` · `terminal` · `database`.

**Photo image files** — store in `/photos/img/` and reference as `/photos/img/filename.jpg`.
For large sets use Cloudinary free tier and reference the CDN URL directly.

---

### Projects — static cards in `projects/index.html`

Copy an existing `.project-card` block and set `data-category`:

| `data-category` | Label |
|---|---|
| `data` | Data Science / 資料科學 |
| `dataviz` | Data Viz / 資料視覺化 |
| `web` | Web Development / 網頁開發 |
| `research` | Research / 研究 |
| `competition` | Competitions / 比賽 |

Minimal card structure:

```html
<div class="project-card" data-category="data">
  <div class="project-image">
    <img src="…" alt="…" loading="lazy">
    <div class="project-overlay">
      <span class="view-project">
        <span data-lang="en">View Project</span>
        <span data-lang="zh">查看專案</span>
      </span>
    </div>
  </div>
  <div class="project-content">
    <h3><span data-lang="en">Title</span><span data-lang="zh">標題</span></h3>
    <p>
      <span data-lang="en">Description.</span>
      <span data-lang="zh">說明。</span>
    </p>
    <div class="project-tags">
      <span class="tag">Python</span>
    </div>
    <div class="project-meta">
      <span class="project-date"><span data-lang="en">Jan 2026</span><span data-lang="zh">2026 年 1 月</span></span>
      <span class="project-type"><span data-lang="en">Personal Project</span><span data-lang="zh">個人專案</span></span>
    </div>
  </div>
</div>
```

For **Data Viz cards** with an embedded Tableau iframe add `onclick="toggleDashboard('your-id')"` to the card and a matching `<div id="your-id-dashboard" class="embedded-dashboard">` block — see existing examples in `projects/index.html`.

**Live demo links** — free hosting options:

| Platform | Best for |
|---|---|
| GitHub Pages (this repo) | Static HTML/JS/D3.js — add a `/demos/project-name/` folder |
| Vercel | React / Next.js / any frontend |
| Streamlit Community Cloud | Python data apps |
| Hugging Face Spaces | ML / AI demos (Gradio, Streamlit) |

---

### Home — `index.html`

- **Bio / hero copy** — edit the `data-lang` spans directly in `index.html`.
- **Timeline** — edit `timeline-data.js` at the repo root. Each entry: `{ year, role, org, desc, desc_zh }`.
- **Featured insights cards** — manually maintained under `<section id="insights">` in `index.html`.

---

## Bilingual rules

Every user-facing string needs a paired English and Chinese element.

```html
<!-- Inline -->
<span data-lang="en">English</span><span data-lang="zh">中文</span>

<!-- Page title -->
<title data-title-en="Page - Yuu" data-title-zh="頁面 - Yuu">Page - Yuu</title>
```

CSS in `css/site.css` handles visibility — never add `display:none` manually.
Language state lives in `localStorage["site-lang"]` and is set before paint by `/js/i18n.js` in `<head>`.

---

## Key files

| File | Purpose |
|---|---|
| `css/site.css` | Global design system — nav, cards, footer, project categories |
| `css/insights.css` | Card grid, search toolbar, post layout — shared by Insights and Photos |
| `css/about.css` | Timeline (Home page) |
| `js/i18n.js` | Bilingual controller |
| `js/site-ui.js` | Nav toggle, smooth anchors, contact form |
| `js/site-config.js` | Brand name, social links |
| `timeline-data.js` | Experience timeline data |
| `_layouts/insight.html` | Layout for Insights posts |
| `_layouts/photo.html` | Layout for Photos posts |
| `CLAUDE.md` | Instructions for Claude Code — i18n rules, conventions |
