# Site experience (single place to adjust your portfolio)

This file is the **map** for how the site looks and reads. The live site reads values from **`js/site-config.js`** and **`css/site.css`**. When you change copy or colors, update those files (and keep this doc in sync if you use it as notes).

---

## Quick edits

| What you want to change | Where to edit |
|-------------------------|---------------|
| Your name, hero tagline, bio, monogram initials | `js/site-config.js` → `brand`, `initials`, `home.role`, `home.bio` |
| Email & social URLs | `js/site-config.js` → `contact` |
| Colors, spacing, shadows, max content width | `css/site.css` → `:root { ... }` at the top |
| Timeline / CaseCom / certificates **content** | `timeline-data.js` (see also [`TIMELINE_UPDATE_GUIDE.md`](TIMELINE_UPDATE_GUIDE.md)) |
| About page **layout** (timeline styles) | `css/about.css` |
| **Insights posts** (write-ups, articles) | `_posts/*.md` only — see **Insights** below |

Home page hero text is injected into elements with ids `site-brand-name`, `site-hero-role`, `site-hero-bio`, and `site-initials` in `index.html`. Change the HTML if you prefer static text without JavaScript.

---

## Insights (`_posts/` + `insights/`)

**Create and manage posts only by adding or editing Markdown files under `_posts/`.** Do not duplicate post content in standalone HTML pages.

1. **Filename:** `YYYY-MM-DD-short-title.md` (Jekyll requires this date prefix).
2. **Front matter** (YAML between `---` lines at the top):

```yaml
---
layout: post
title: "Your post title"
date: YYYY-MM-DD HH:MM:SS +0800
tags: [TagOne, TagTwo]
comments: true
---
```

3. **Body:** Markdown + HTML below the second `---`.

4. **URLs:** With `permalink: /:title/` in `_config.yml`, the post URL is `https://<your-domain>/<slugified-title>/`. Listing pages: **`/insights/`** (`insights/index.html`), **`/archive/`**, **`/tags/`**. Legacy **`/blog/`** redirects to **`/insights/`**.

5. **Navigation:** The portfolio nav uses **Insights** → `/insights/`. Jekyll sidebar links come from `_config.yml` → `navigation`.

6. **Styling:** Insights and archive pages use Jekyll-compiled **`/style.css`**. The standalone portfolio uses **`css/site.css`**.

7. **Folder map:** See **`TAB_LAYOUT.md`** in the repo root.

---

## Design tokens (`css/site.css`)

These CSS variables control the overall look:

- **`--color-bg`** — Page background.
- **`--color-surface`** — Cards and panels.
- **`--color-text`** / **`--color-text-muted`** — Body copy.
- **`--color-accent`** / **`--color-accent-bright`** — Primary brand / link color (nav uses dark `--color-accent` tones via `--nav-bg` and `--gradient-hero`).
- **`--color-study`** — Education items on the timeline.
- **`--container`** — Max width of main content (default `72rem`).
- **`--shadow-sm`** / **`--shadow-md`** — Card elevation.

Tweak a token, refresh the browser, repeat until it feels right.

---

## Content config (`js/site-config.js`)

Structure:

```js
window.SITE_CONFIG = {
  brand: "Your Name",
  initials: "AB",
  titleSuffix: "Your Name", // used if you wire document.title in the future
  home: {
    role: "Your headline",
    bio: "Short paragraph for the home hero.",
  },
  contact: {
    email: "you@example.com",
    github: "https://github.com/...",
    linkedin: "https://linkedin.com/in/...",
  },
};
```

Contact page links: update the `href` attributes in `contact.html` to match, or keep them aligned with `SITE_CONFIG.contact`.

---

## Pages and assets

- **Global styles:** `css/site.css`
- **About timeline:** `css/about.css` (loaded only on `about.html`)
- **UI behavior:** `js/site-ui.js` (mobile nav, smooth `#` links, demo contact form)
- **Entry URL:** `index.html` is the main home. `preview.html` redirects to it for old links.

---

## Optional: document title per page

Each HTML file sets `<title>...</title>` manually. If you rename the brand globally, search and replace `Yu Tsang` in the HTML titles or add a small script to set `document.title` from `SITE_CONFIG`.

---

## GitHub Pages

GitHub Actions builds the site with **Jekyll** (see `.github/workflows/jekyll-gh-pages.yml`): Markdown posts, layouts, and `style.scss` are compiled to `_site/` and deployed. Static HTML files (e.g. `index.html`, `about.html`) are copied through as-is. Push to `main` to publish.
