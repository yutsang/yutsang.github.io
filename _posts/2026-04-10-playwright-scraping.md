---
layout: insight
title: "Web Scraping in 2026: How Playwright Changed Everything"
title_zh: "2026 年的網頁爬蟲：Playwright 如何改變了一切"
date: 2026-04-10
tags: [Tutorial, Engineering]
permalink: /insights/playwright-scraping/
thumbnail: https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=2000&q=90&auto=format&fit=crop
excerpt: "A deep, practical look at modern web scraping — why requests + BeautifulSoup stopped being enough, how Playwright turned browser automation into the default, and what it means for data collection, research, and AI agents."
excerpt_zh: "深入務實地聊聊現代網頁爬蟲——為什麼 requests + BeautifulSoup 已經不夠用、Playwright 如何把瀏覽器自動化變成預設選項，以及這對資料蒐集、研究與 AI agent 的意義。"
---

<div data-lang="en" markdown="1">

## The era when scraping meant `requests.get`

For about fifteen years, web scraping in Python had a canonical shape. You imported `requests`, sent a GET, handed the HTML to BeautifulSoup, looped over the tags, and pulled out the fields. Every intro tutorial ever written looks like this:

```python
import requests
from bs4 import BeautifulSoup

r = requests.get("https://example.com/listings")
soup = BeautifulSoup(r.text, "html.parser")
for card in soup.select(".listing-card"):
    print(card.select_one(".title").text, card.select_one(".price").text)
```

It worked because the early web was basically templated HTML rendered server-side. The bytes you got back from the socket were the bytes you saw in a browser. Scraping was a static text-extraction problem.

That web barely exists anymore in 2026. Three things broke the old recipe:

1. **JavaScript-rendered content.** The HTML `requests` gets back is often an empty shell — `<div id="root"></div>` and a bundle — and the real data is fetched over XHR or drawn by a client-side framework after the page loads.
2. **Serious bot protection.** Cloudflare, Akamai, DataDome, PerimeterX, and hCaptcha now sit in front of most commercial sites. They fingerprint your TLS handshake, your TCP stack, your HTTP/2 frame ordering, your headers, your mouse movements, and your JavaScript runtime *before* they decide whether to serve you a real page.
3. **Infinite scroll, hidden APIs, and hydration.** The "click to load more" button replaced pagination. Data loads lazily as you scroll. Some of it lives in a hydration JSON blob, some in a GraphQL call, some in a server component stream.

You can still scrape a Wikipedia page with `requests`. You cannot scrape most of the modern web that way.

## Enter Playwright

[Playwright](https://playwright.dev/) is Microsoft's browser automation library, forked in spirit from Puppeteer but redesigned by the same core team. In the Python world, [`playwright`](https://playwright.dev/python/) has quietly become the default for anything beyond trivial scraping. The reason is that it inverts the old problem: instead of trying to pretend to be a browser (headers, cookies, TLS fingerprints, JS execution — good luck), you *use* a real browser, drive it programmatically, and read what the user would see.

A working Playwright scrape looks like this:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://example.com/listings", wait_until="networkidle")
    page.get_by_role("button", name="Accept cookies").click()

    for _ in range(5):
        page.keyboard.press("End")
        page.wait_for_timeout(600)

    cards = page.locator(".listing-card")
    for i in range(cards.count()):
        title = cards.nth(i).locator(".title").inner_text()
        price = cards.nth(i).locator(".price").inner_text()
        print(title, price)

    browser.close()
```

Everything that broke with `requests` just… works. The JavaScript runs. Cookies are handled. The scroll-to-load-more is a real scroll. The content that appears after hydration is visible because it actually hydrated. The locator API is built around what the user sees (text, role, label) rather than brittle CSS selectors that break every redesign.

## What Playwright actually changed

You can build most of this with Selenium too, and people did for years. So what made Playwright the default? A few things, all practical:

### 1. Auto-waiting

The #1 source of flakiness in Selenium was `time.sleep(3)` hacks waiting for elements to appear. Playwright's locators auto-wait: `page.locator(".price").inner_text()` blocks until the element is attached to the DOM, visible, stable, and enabled. This single design decision eliminates ~80% of the "works on my machine" failures that plagued old-school browser automation.

### 2. A locator API designed for reality

Playwright's [user-facing locators](https://playwright.dev/python/docs/locators) (`get_by_role`, `get_by_label`, `get_by_text`, `get_by_placeholder`) are built on accessibility attributes instead of CSS selectors. In practice this means your scraper survives a redesign that changes `div.price-v2-new` to `span.listing__price`, because the text and role didn't change. For long-running scrapers, the maintenance difference is enormous.

### 3. Native request interception

You can intercept every network request the page makes — read the JSON responses of XHRs directly, block images and trackers to save bandwidth, replay requests with modified headers:

```python
page.route("**/api/listings*", lambda route: route.continue_())
page.on("response", lambda r: print(r.url) if "api/listings" in r.url else None)
```

This is often the *real* win. Instead of parsing rendered HTML, you can watch the exact API calls the page makes to its own backend and read the JSON straight from the response. Most modern sites are, underneath, a single-page app calling a REST or GraphQL backend — and Playwright hands you that backend on a plate.

### 4. Cross-browser, same API

The same Python code runs against Chromium, Firefox, and WebKit. WebKit support in particular is unusually good, which matters when a site's bot detector treats Chromium differently from Safari. Being able to say `p.webkit.launch()` and retry is sometimes the entire solution.

### 5. Codegen and trace viewer

`playwright codegen https://example.com` launches a real browser, records your clicks, and emits the Python code. It's a genuinely good way to prototype a scraper: click the thing, read the generated code, refactor. The [trace viewer](https://playwright.dev/python/docs/trace-viewer) then gives you a timeline of every action, network call, console message, and DOM snapshot when something breaks — essentially a debugger for scrapers.

## The bot-protection arms race

Playwright makes scraping *possible* again. It does not make it *undetectable*. As soon as you start scraping anything commercial, you run into bot protection, and you need to know what's actually happening.

Modern bot protection stacks fingerprint three layers:

1. **Network layer.** TLS fingerprint (JA3/JA4), HTTP/2 frame order, TCP quirks. Plain `requests` is obvious because its TLS fingerprint is uniquely Python. Curl-impersonate ([`curl_cffi`](https://github.com/lexiforest/curl_cffi)) solves this at the HTTP level without a browser.
2. **Browser layer.** Does `navigator.webdriver` return true? Is `window.chrome` defined? Are there weird plugin arrays? Is the canvas/WebGL fingerprint consistent with a real Chrome install? Default Playwright fails several of these unless you patch them.
3. **Behaviour layer.** Mouse movement patterns, timing between clicks, scroll smoothness, typing cadence, whether you focus inputs before filling them. This is where the really adversarial detectors live.

The practical toolkit in 2026 for getting past these layers:

- **[playwright-stealth](https://github.com/AtuboDad/playwright_stealth) / [rebrowser-patches](https://github.com/rebrowser/rebrowser-patches)** — patches for Playwright that hide the most obvious automation tells. Rebrowser is the more actively maintained of the two.
- **[undetected-chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver)** — Selenium-specific, but the patches it applies are instructive if you want to understand what "stealth" means.
- **[curl_cffi](https://github.com/lexiforest/curl_cffi)** — impersonates Chrome's TLS fingerprint from plain Python, no browser needed. Useful for the large category of sites that fingerprint the network layer but don't actually need JS.
- **Residential proxies.** [Bright Data](https://brightdata.com/), [Oxylabs](https://oxylabs.io/), [Smartproxy](https://smartproxy.com/), [IPRoyal](https://iproyal.com/). Expensive but unavoidable at scale — datacentre IPs get blocked instantly on any protected site.
- **CAPTCHA solvers.** [2Captcha](https://2captcha.com/), [Anti-Captcha](https://anti-captcha.com/), [CapSolver](https://www.capsolver.com/). For the cases where a real human solving the CAPTCHA via API is the cheapest path.

I want to be honest about the ethics here: bypassing bot protection can be legal or illegal depending on jurisdiction, terms of service, what you do with the data, and whether you're accessing a public or authenticated surface. In many places, scraping public data is fine. Scraping behind a login you don't have is not. Scraping at a rate that damages the target is not. In general: **scrape politely, respect `robots.txt` where it's genuinely meaningful, rate-limit yourself, identify your bot honestly when you can, and don't scrape anything you couldn't defend in front of a judge.**

## Playwright-codec and the new tooling on top

One of the more interesting 2025–26 developments is that people stopped writing raw Playwright and started building higher layers on top of it. A few worth knowing:

### Crawl4AI

[Crawl4AI](https://github.com/unclecode/crawl4ai) is explicitly designed for LLM pipelines. It uses Playwright under the hood but outputs clean Markdown optimised for feeding into language models, handles JavaScript-heavy pages, supports extraction strategies based on CSS, XPath, or LLM-as-extractor, and batches pages efficiently. If your end goal is "get the content of these 500 URLs into an LLM," it eliminates a lot of boilerplate.

### Firecrawl

[Firecrawl](https://www.firecrawl.dev/) is a hosted service that takes a URL and returns Markdown or structured data. Under the hood it's essentially managed Playwright + cleaning + rate limiting. It's the right choice when you don't want to run browsers yourself. Its API is clean enough that it has become the default scraping backend for many LLM agents.

### ScrapeGraphAI

[ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) lets you describe what you want to scrape in natural language and uses an LLM to work out the selectors and extraction logic. Sometimes magical, sometimes expensive, and rarely the cheapest solution at scale — but for one-off research scrapes it's the fastest path from "I want this data" to "I have this data."

### Browser-use and agent-driven scraping

[browser-use](https://github.com/browser-use/browser-use), [Steel](https://www.steel.dev/), and [Browserbase](https://www.browserbase.com/) are the new class: they combine Playwright with an LLM that *decides what to click*. You describe the task ("find the price of this product on each of these five retailers") and the agent drives the browser itself. This is the category that turns scraping from a coding task into a prompting task, and it's the direct frontier where scraping and agents converge.

## How this changes my workflow

Here's what my actual scraping playbook looks like in April 2026:

1. **Inspect the site first.** Open DevTools, watch the Network tab, find the XHR/GraphQL calls. If the data is already flowing as JSON, don't touch the rendered HTML — just hit the API directly. This is still the fastest, most reliable approach when it works.
2. **If the API is guarded or obfuscated, reach for Playwright.** Use `playwright codegen` to get started, then clean it up. Prefer request interception over HTML parsing when you can.
3. **Measure bot defences before investing.** A two-minute check with default Playwright tells you whether the site blocks you immediately. If yes, decide whether it's worth the stealth/proxy investment or whether to find another source.
4. **For structured "get content into LLM" tasks, skip Playwright and use Crawl4AI or Firecrawl.** The abstraction savings are worth it. I use raw Playwright only when I need fine control.
5. **Cache aggressively.** Every scrape should write raw HTML to disk before parsing. Changing the parser shouldn't mean re-hitting the site. Your logs, their bandwidth.
6. **Write the parser as a pure function.** `parse_listing(html) -> Listing`. Test it with the cached HTML. This is the single biggest reliability improvement over ad-hoc scraping scripts.
7. **Monitor in production.** Real scrapers rot. Add alerts for "zero results returned", "parse error rate > 1%", and "average fields per record dropped". Sites redesign; your scraper will silently start returning empty records if you don't notice.

## Where this goes next

Two things I'd bet on for the next 12 months:

**The browser becomes the agent's universal tool.** Every serious agent framework now ships a Playwright-backed browser tool. This is because the browser is the one universal interface to the web that doesn't require an API, a partnership, or a reverse-engineered protocol. As agents get better at following instructions, "find this information for me" becomes the default way to interact with any website that doesn't have a proper API — and that's most of them.

**Bot protection gets an order of magnitude harder, but LLM-driven scrapers quietly win anyway.** The detectors are getting very good at spotting deterministic automation. They are less good at spotting something that thinks and pauses and clicks like a human because it's being told what to do in natural language by a frontier model. Ironically, the same developments that made deterministic Playwright scripts harder to hide also made non-deterministic agent-driven ones easier.

The classic `requests + BeautifulSoup` workflow will persist for documentation, Wikipedia, arXiv, government data, and anything else with static HTML. For everything else, the default answer is now Playwright, with higher layers on top when your goal is "content into an LLM" rather than "exact structured extraction."

## Further reading

- [Playwright for Python — official docs](https://playwright.dev/python/docs/intro) — the only tutorial you actually need
- [Playwright best practices](https://playwright.dev/python/docs/best-practices) — locator design, auto-waiting, trace viewer
- [ZenRows — The State of Web Scraping 2025](https://www.zenrows.com/blog/web-scraping-trends) — vendor-branded but a good snapshot of the bot-detection landscape
- [Crawl4AI](https://github.com/unclecode/crawl4ai) — LLM-optimised scraping on top of Playwright
- [Firecrawl](https://www.firecrawl.dev/) — managed crawl-to-Markdown service
- [browser-use](https://github.com/browser-use/browser-use) — agent-driven browser automation

</div>

<div data-lang="zh" markdown="1">

## 「爬蟲就是 `requests.get`」的那個時代

大約有十五年的時間，Python 寫爬蟲有一個固定長相：匯入 `requests`、發個 GET、把 HTML 丟給 BeautifulSoup、迴圈跑過標籤、把欄位挖出來。所有入門教學看起來都是這樣：

```python
import requests
from bs4 import BeautifulSoup

r = requests.get("https://example.com/listings")
soup = BeautifulSoup(r.text, "html.parser")
for card in soup.select(".listing-card"):
    print(card.select_one(".title").text, card.select_one(".price").text)
```

它能 work 是因為早期的 web 基本上就是在伺服器端 render 好的 HTML 模板。你從 socket 拿到的 bytes，就是你在瀏覽器裡看到的 bytes。爬蟲是個**靜態文字抽取問題**。

這個世界在 2026 年幾乎已經不存在了。三件事把舊配方打破：

1. **JavaScript 動態 render 的內容。** `requests` 拿回來的 HTML 多半只是一個空殼——`<div id="root"></div>` 加一包 bundle——真正的資料要等 XHR 抓回來或由 client side 的框架渲染。
2. **認真做的反爬蟲防護。** Cloudflare、Akamai、DataDome、PerimeterX、hCaptcha 現在擋在大多數商業網站前面。它們會在決定是否給你真頁面之前，**先**指紋你的 TLS handshake、TCP 堆疊、HTTP/2 frame 順序、headers、滑鼠動作和 JavaScript runtime。
3. **無限滾動、隱藏 API、hydration。**「點擊載入更多」取代了分頁；資料在你滾動時懶載入；一部分資料活在 hydration JSON 裡、一部分在 GraphQL 呼叫裡、一部分在 server component stream 裡。

你還是可以用 `requests` 爬 Wikipedia。但現代 web 的大部分，你無法那樣爬。

## Playwright 登場

[Playwright](https://playwright.dev/) 是 Microsoft 的瀏覽器自動化函式庫，精神上從 Puppeteer fork 而來、但由同一群核心人重新設計。在 Python 生態裡，[`playwright`](https://playwright.dev/python/) 已經悄悄成為任何超出玩具等級爬蟲的預設選擇。原因是它把舊問題翻面了：以前你試著**假裝**是瀏覽器（headers、cookies、TLS 指紋、JS 執行——祝你好運），現在你直接**用**一個真的瀏覽器，用程式驅動它，讀使用者會看到的畫面。

一段能跑的 Playwright 爬蟲像這樣：

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://example.com/listings", wait_until="networkidle")
    page.get_by_role("button", name="Accept cookies").click()

    for _ in range(5):
        page.keyboard.press("End")
        page.wait_for_timeout(600)

    cards = page.locator(".listing-card")
    for i in range(cards.count()):
        title = cards.nth(i).locator(".title").inner_text()
        price = cards.nth(i).locator(".price").inner_text()
        print(title, price)

    browser.close()
```

所有在 `requests` 上壞掉的東西都……就能 work 了。JavaScript 會跑。Cookie 自動處理。往下滾載入更多是真的往下滾。hydration 之後出現的內容看得到，因為它真的 hydrate 了。Locator API 是圍繞**使用者看到的東西**（文字、role、label）設計的，而不是每次改版就壞的脆 CSS selector。

## Playwright 真正改變了什麼

這些事情 Selenium 也能做，而且大家做了很多年。那為什麼 Playwright 變成預設？幾個原因，都很實務：

### 1. 自動等待（auto-waiting）

以前 Selenium 最大的不穩定來源就是 `time.sleep(3)` 等元素出現的 hack。Playwright 的 locator 會自動等：`page.locator(".price").inner_text()` 會阻塞，直到元素被 attach 到 DOM、可見、穩定、可操作為止。這一個設計決策就把「在我機器上跑得好好的」那類老派自動化的約 80% 失敗消掉。

### 2. 面向真實使用者的 locator API

Playwright 的 [使用者導向 locator](https://playwright.dev/python/docs/locators)（`get_by_role`、`get_by_label`、`get_by_text`、`get_by_placeholder`）建立在無障礙屬性上，而不是 CSS selector。實務上意味著當網站把 `div.price-v2-new` 改成 `span.listing__price` 時，你的爬蟲仍然活著——因為文字和 role 沒變。對長期維護的爬蟲來說，維運差距非常大。

### 3. 原生請求攔截

你可以攔截頁面發出的每一個 network request——直接讀 XHR 的 JSON 回應、封鎖圖片和追蹤器節省頻寬、改 header 重放請求：

```python
page.route("**/api/listings*", lambda route: route.continue_())
page.on("response", lambda r: print(r.url) if "api/listings" in r.url else None)
```

這常常才是**真正**的贏點。與其解析 render 過的 HTML，不如觀察頁面呼叫自家後端的 API，然後直接從 response 讀 JSON。多數現代網站底下其實就是一個單頁 app 在呼叫 REST 或 GraphQL 後端——Playwright 把那個後端端到你面前。

### 4. 跨瀏覽器、同一套 API

同一段 Python 程式可以跑在 Chromium、Firefox、WebKit 上。WebKit 支援特別好，這件事在網站的反爬蟲對 Chromium 和 Safari 有不同行為時很重要。能寫一句 `p.webkit.launch()` 再試一次，有時候整個問題就解了。

### 5. Codegen 和 trace viewer

`playwright codegen https://example.com` 會開一個真瀏覽器、錄下你的點擊，然後輸出 Python 程式碼。這是原型爬蟲的好方法：點想點的東西、讀生成出來的程式、重構。接著 [trace viewer](https://playwright.dev/python/docs/trace-viewer) 會給你每一個動作、網路呼叫、console 訊息、DOM 快照的時間軸——本質上就是爬蟲的 debugger。

## 反爬蟲的軍備競賽

Playwright 讓爬蟲**變得可能**。但它沒有讓你**不被偵測**。只要你開始爬任何商業網站，就會遇到反爬蟲機制，而你需要知道底下到底發生什麼事。

現代反爬蟲在三層做指紋辨識：

1. **網路層。** TLS 指紋（JA3/JA4）、HTTP/2 frame 順序、TCP 小細節。純 `requests` 很顯眼，因為它的 TLS 指紋就是 Python 獨有的。[`curl_cffi`](https://github.com/lexiforest/curl_cffi)（curl-impersonate 的 Python 綁定）在 HTTP 層就解掉這件事，不需要瀏覽器。
2. **瀏覽器層。** `navigator.webdriver` 回 true 嗎？`window.chrome` 有沒有定義？plugin 陣列是不是怪怪的？canvas / WebGL 指紋是不是一個真實 Chrome 安裝該有的？預設的 Playwright 在不打 patch 的情況下會在好幾項上露餡。
3. **行為層。** 滑鼠軌跡、點擊之間的時間、滾動的平滑度、打字節奏、你有沒有在填 input 之前先 focus。這一層才是真正對抗性最強的偵測器所在。

2026 年繞過這些層級的實務工具箱：

- **[playwright-stealth](https://github.com/AtuboDad/playwright_stealth) / [rebrowser-patches](https://github.com/rebrowser/rebrowser-patches)**——Playwright 的 patch，隱藏最明顯的自動化特徵。兩者中 rebrowser 更新更積極。
- **[undetected-chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver)**——Selenium 專用，但如果你想搞懂「stealth」到底在做什麼，它打的 patch 是很好的教材。
- **[curl_cffi](https://github.com/lexiforest/curl_cffi)**——從純 Python 模擬 Chrome 的 TLS 指紋，不需要瀏覽器。對於「網路層指紋嚴、但其實不需要 JS」的那一大類網站很有用。
- **住宅代理（Residential proxies）。** [Bright Data](https://brightdata.com/)、[Oxylabs](https://oxylabs.io/)、[Smartproxy](https://smartproxy.com/)、[IPRoyal](https://iproyal.com/)。貴，但在有反爬蟲的網站上規模化時躲不掉——datacentre IP 秒被擋。
- **CAPTCHA 解題服務。** [2Captcha](https://2captcha.com/)、[Anti-Captcha](https://anti-captcha.com/)、[CapSolver](https://www.capsolver.com/)。當最便宜的做法就是讓真人透過 API 幫你解 CAPTCHA 時，它們是答案。

這裡我想誠實地提一下道德與法律問題：繞過反爬蟲在不同司法管轄區、不同的服務條款、不同的資料用途、以及你存取的是公開還是登入後的介面下，可能合法也可能不合法。很多地方爬公開資料是沒問題的；爬你沒有權限的登入後介面不行；以破壞對方服務的速率爬也不行。原則上：**禮貌地爬、真有意義時尊重 `robots.txt`、自我限速、能坦白說自己是 bot 時就坦白、不要爬你在法官面前辯護不了的東西。**

## 長在 Playwright 之上的新工具

2025–26 一個比較有意思的發展是：大家不再寫原始 Playwright，而是在它上面疊更高的抽象。幾個值得認識：

### Crawl4AI

[Crawl4AI](https://github.com/unclecode/crawl4ai) 是明確為 LLM 管線設計的。底下用 Playwright，輸出的是乾淨、為餵進語言模型最佳化過的 Markdown，能處理 JS 重的頁面，支援以 CSS、XPath 或 LLM 為 extractor 的抽取策略，並且能高效批次處理頁面。如果你最終目標是「把這 500 個 URL 的內容弄進 LLM」，它能省掉大量樣板程式。

### Firecrawl

[Firecrawl](https://www.firecrawl.dev/) 是一個託管服務，吃一個 URL，吐回 Markdown 或結構化資料。底下本質上就是託管的 Playwright + 清理 + 限速。當你**不想自己跑瀏覽器**時它是正解。它的 API 夠乾淨，所以已經成為許多 LLM agent 預設的爬蟲後端。

### ScrapeGraphAI

[ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) 讓你用自然語言描述想爬的東西，再用 LLM 來想 selector 和抽取邏輯。有時候很神奇、有時候很貴、而且幾乎從不是規模化下最便宜的選項——但對於一次性的研究爬蟲，它是「我想要這個資料」到「我有這個資料」最快的路。

### Browser-use 與 agent 驅動的爬蟲

[browser-use](https://github.com/browser-use/browser-use)、[Steel](https://www.steel.dev/)、[Browserbase](https://www.browserbase.com/) 是新一代：它們把 Playwright 和一個**決定要點哪裡的 LLM** 接在一起。你描述任務（「在這五家零售商各找到這個商品的價格」），agent 自己驅動瀏覽器。這個類別把爬蟲從「寫程式的任務」變成「寫提示的任務」，也是爬蟲與 agent 直接會合的前沿。

## 這怎麼改變我的工作流程

以下是我 2026 年 4 月實際的爬蟲 playbook：

1. **先檢查網站。** 打開 DevTools、盯著 Network 頁籤、找到 XHR / GraphQL 呼叫。如果資料已經以 JSON 在流，就**不要碰 render 後的 HTML**——直接打 API。這還是最快、最可靠的做法，只要它能用。
2. **如果 API 被保護或混淆，再動 Playwright。** 先用 `playwright codegen` 起一版，再清理。能用請求攔截就不要硬解 HTML。
3. **投入前先量反爬蟲強度。** 用預設 Playwright 試兩分鐘就能知道會不會秒被擋。會的話，決定這個網站值不值得投 stealth / proxy 的資源，或乾脆換資料來源。
4. **如果目的是「把內容餵進 LLM」，直接用 Crawl4AI 或 Firecrawl，不用自己寫 Playwright。** 這個抽象的時間省下來值得。我只在需要精細控制時才用原始 Playwright。
5. **積極快取。** 每一次爬都該先把原始 HTML 寫到磁碟再解析。改 parser 不該意味著要再打對方網站一次。你的 log，他們的頻寬。
6. **把 parser 寫成純函式。** `parse_listing(html) -> Listing`。用快取的 HTML 做測試。這一點是比起 ad-hoc 爬蟲腳本最大的可靠度提升。
7. **在生產環境監控。** 真的爬蟲會腐爛。加上「回傳零筆結果」、「解析錯誤率 > 1%」、「每筆紀錄平均欄位數下降」的告警。網站會改版，你的爬蟲會默默開始回空資料，不監控就不會發現。

## 接下來會走向哪裡

未來 12 個月我願意下注的兩件事：

**瀏覽器會變成 agent 的通用工具。** 每個正經的 agent 框架現在都內建一個由 Playwright 驅動的瀏覽器工具。原因是**瀏覽器是唯一通用、不需要 API、不需要合作夥伴關係、不需要逆向協議**的 web 介面。隨著 agent 越來越擅長照指令辦事，「幫我找這個資訊」會變成和任何沒有 API 的網站互動的預設方式——而多數網站就是沒有 API。

**反爬蟲會變得難上一個數量級，但 LLM 驅動的爬蟲會悄悄勝出。** 偵測器很擅長抓確定性的自動化；它們沒那麼擅長抓一個會思考、會停頓、會像人類一樣點擊的東西——因為它是被前沿模型用自然語言**臨場**告訴該做什麼。諷刺的是，同一波讓確定性 Playwright 腳本更難藏的發展，也讓非確定性的 agent 驅動爬蟲更容易藏。

經典的 `requests + BeautifulSoup` 工作流依然會在文件、Wikipedia、arXiv、政府開放資料、以及其他任何靜態 HTML 上長期存在。但對於其他一切，預設答案現在是 Playwright——當目標是「內容進 LLM」而不是「精確結構化抽取」時，再在它上面疊更高層的抽象。

## 延伸閱讀

- [Playwright for Python — 官方文件](https://playwright.dev/python/docs/intro) — 你真正需要的唯一教學
- [Playwright best practices](https://playwright.dev/python/docs/best-practices) — locator 設計、自動等待、trace viewer
- [ZenRows — The State of Web Scraping 2025](https://www.zenrows.com/blog/web-scraping-trends) — 帶廠牌，但對反爬蟲現況的快照很好
- [Crawl4AI](https://github.com/unclecode/crawl4ai) — 在 Playwright 之上為 LLM 優化的爬蟲
- [Firecrawl](https://www.firecrawl.dev/) — 託管式的 crawl-to-Markdown 服務
- [browser-use](https://github.com/browser-use/browser-use) — agent 驅動的瀏覽器自動化

</div>
