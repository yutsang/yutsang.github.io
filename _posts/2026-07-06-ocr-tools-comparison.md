---
layout: insight
title: "MarkItDown, MinerU, or PaddleOCR? Choosing a Document-Parsing Stack in 2026"
title_zh: "MarkItDown、MinerU 還是 PaddleOCR？2026 年文件解析工具怎麼選"
date: 2026-07-06
tags: [AI, Tutorial, Engineering]
permalink: /insights/ocr-tools-comparison/
thumbnail: https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=2000&q=90&auto=format&fit=crop
excerpt: "Three popular open-source tools all promise to turn documents into clean Markdown — but they are three different species. A practical comparison of Microsoft's MarkItDown, OpenDataLab's MinerU, and Baidu's PaddleOCR: what each actually does, where each breaks, and how to pick."
excerpt_zh: "三個熱門開源工具都聲稱能把文件變成乾淨的 Markdown——但它們其實是三種完全不同的物種。實測比較微軟 MarkItDown、OpenDataLab MinerU 與百度 PaddleOCR：各自真正做什麼、在哪裡出問題、該怎麼選。"
---

<div data-lang="en" markdown="1">

## Why "OCR" doesn't mean what it used to

Ten years ago, OCR meant one thing: pixels in, characters out. Tesseract read a scanned page and gave you a text file, and you were happy if the word error rate stayed in the single digits.

In 2026 the job has changed. The consumer of your extracted text is usually not a human — it's an LLM pipeline: RAG indexing, agent tool calls, fine-tuning corpora, key-information extraction. That raises the bar in a specific way. The model doesn't just need the *characters*; it needs the **structure** — headings that are actually headings, tables that survive as tables, formulas as LaTeX instead of Unicode soup, multi-column layouts read in the right order, headers and footers stripped so they don't pollute every chunk.

"PDF to Markdown" has quietly become the real product category, and three open-source names come up constantly: **MarkItDown** (Microsoft), **MinerU** (OpenDataLab / Shanghai AI Lab), and **PaddleOCR** (Baidu). People compare them as if they were interchangeable. They are not — they sit at three different layers of the stack, and picking the wrong one is how you end up with a RAG index full of garbage.

Here's the one-line version before we go deep:

- **MarkItDown** is a *format converter*. It reads the digital structure a file already has and re-serializes it as Markdown. It does almost no OCR of its own.
- **PaddleOCR** is an *OCR engine and toolkit*. It's the layer that actually turns pixels into text, plus an optional document-parsing pipeline on top.
- **MinerU** is an *end-to-end document-parsing pipeline*. It chains layout detection, OCR, formula and table recognition into one opinionated PDF → Markdown machine.

## MarkItDown: the format converter

[MarkItDown](https://github.com/microsoft/markitdown) is a small Python library with a simple promise: feed it almost anything — DOCX, PPTX, XLSX, PDF, HTML, CSV, JSON, EPUB, images, even audio — and get Markdown back, tuned for LLM consumption rather than pixel-perfect fidelity.

```python
# pip install "markitdown[all]"
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("quarterly_report.docx")
print(result.text_content)
```

That's the whole API, and for digital-native files it is genuinely excellent. A DOCX keeps its heading hierarchy, an XLSX becomes readable tables, a PPTX becomes slide-by-slide sections. It's fast, it runs anywhere Python runs, it's MIT-licensed, and it ships an MCP server (`markitdown-mcp`) so agents can call it directly.

The catch is the word *digital-native*. For PDFs, MarkItDown extracts the **existing text layer**. Hand it a scanned contract — a PDF that is really just photographs of paper — and you get little or nothing back, because there is no text layer to extract. It also discards most positional information, so complex multi-column PDFs can come out in a shuffled reading order, and PDF tables usually degrade into flat text.

There are two escape hatches: you can plug in an LLM client so images get AI-generated captions, and you can point it at **Azure Document Intelligence** for real OCR — but at that point the heavy lifting has moved to a paid cloud service, and MarkItDown is back to being what it always was: a thin, well-designed converter.

**Use it when** your inputs are Office documents, HTML, or clean digital PDFs, and you want one dependency-light front door for an LLM pipeline.

**Don't use it** as your only tool when scans, photos, or complex PDF layouts are in the mix.

## PaddleOCR: the engine room

[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) is the opposite end of the spectrum: Baidu's industrial OCR toolkit, built on the PaddlePaddle framework, Apache-2.0 licensed, and probably the most widely deployed open-source OCR engine in production anywhere.

The 3.0 release (mid-2025) matters for this comparison because it sharpened both layers of the stack:

- **PP-OCRv5** — the core detection + recognition models. One model now covers Simplified Chinese, Traditional Chinese, English, Japanese, and handwriting, with mobile-sized variants that run comfortably on CPU and server variants for accuracy. Multilingual coverage extends to dozens of languages.
- **PP-StructureV3** — a document-parsing pipeline on top of the engine: layout analysis, table recognition, formula recognition, chart parsing, seal/stamp text — with Markdown and JSON export.
- **PP-ChatOCRv4** — key-information extraction that pairs the OCR output with an LLM.

Raw OCR is a few lines:

```python
# pip install paddlepaddle paddleocr
from paddleocr import PaddleOCR

ocr = PaddleOCR(lang="ch")          # detection + recognition
result = ocr.predict("scanned_invoice.png")
```

And the document-parsing pipeline is equally direct:

```python
from paddleocr import PPStructureV3

pipeline = PPStructureV3()
for res in pipeline.predict("annual_report.pdf"):
    res.save_to_markdown("out/")
```

PaddleOCR's strengths are engineering strengths. It runs on CPU when it must and GPU when it can; it has serving, C++, and on-device deployment paths; the models are small enough to embed in a product; and the Apache-2.0 license means you can ship it inside commercial software without lawyers getting involved. If your documents are Chinese — especially mixed Traditional/Simplified, or handwriting — it is the strongest open-source recognizer, full stop.

The cost is assembly. PaddleOCR gives you superb components and a capable pipeline, but *you* own the system: model selection, version pinning (the 2.x → 3.x API change broke plenty of scripts), pre-processing choices, and output post-processing. It is a toolkit with batteries included, not a product.

**Use it when** you're building OCR *into* something — a product, a service, an internal platform — and need control, permissive licensing, CJK excellence, or edge deployment.

**Don't use it** if you just want to drop a folder of PDFs into a tool and get beautiful Markdown out with zero decisions.

## MinerU: the document-parsing pipeline

[MinerU](https://github.com/opendatalab/MinerU) exists because of a very specific pain: the teams at Shanghai AI Lab needed to turn millions of messy, real-world PDFs — academic papers, textbooks, reports — into clean training data for LLMs. MinerU is that internal machinery, open-sourced.

It is unapologetically a *pipeline*, not an engine. In its classic pipeline mode, a document flows through layout detection (DocLayout-YOLO), OCR (PaddleOCR models — yes, MinerU literally runs PaddleOCR inside), formula recognition (UniMERNet-family models producing LaTeX), and table recognition (producing HTML), then gets stitched back together in correct reading order with headers, footers, and page numbers stripped. Since the 2.x releases there is also a **VLM backend** — a compact vision-language model that reads the page end-to-end — which on document-parsing benchmarks like OmniDocBench has been competitive with or better than general-purpose VLMs many times its size.

Usage is deliberately boring:

```bash
# pip install "mineru[core]"
mineru -p paper.pdf -o out/
```

Out comes Markdown with LaTeX formulas, HTML tables, extracted images in a folder, plus structured JSON if you want to build on top of it.

For the hardest inputs — a two-column scanned paper with display equations, footnotes, and floating figures — MinerU's output quality is the best of the three, and it isn't close. Reading order is right, formulas are real LaTeX, and tables survive.

The trade-offs are equally real. First, **weight**: the first run downloads several models, and while CPU inference works, you want a GPU for any volume. Second, **scope**: it does PDFs and images; it is not a universal file converter. Third — and most overlooked — **license**: MinerU is **AGPL-3.0**. If you embed it in a service you offer to others, you may be obliged to open your source. For a data-prep batch tool that's usually fine; for a commercial SaaS it's a conversation with your lawyers.

**Use it when** quality of PDF → Markdown is the point: RAG over technical documents, building corpora, digitizing papers and reports.

**Don't use it** as a lightweight library inside a proprietary product, or for Office-format documents it was never designed for.

## Side by side

| | **MarkItDown** | **PaddleOCR** | **MinerU** |
|---|---|---|---|
| What it really is | Format converter | OCR engine + toolkit | PDF-parsing pipeline |
| Made by | Microsoft | Baidu | OpenDataLab (Shanghai AI Lab) |
| Real OCR (scans) | ✗ (needs Azure DI plug-in) | ✓ core competency | ✓ (via PaddleOCR / VLM) |
| Input formats | Office, PDF, HTML, images, audio, EPUB… | Images, PDF | PDF, images |
| Tables | Good from Office; poor from PDF | ✓ PP-StructureV3 | ✓ HTML in Markdown |
| Formulas → LaTeX | ✗ | ✓ (formula module) | ✓ best of the three |
| Reading order on complex layouts | Weak for PDF | ✓ | ✓ strongest |
| Chinese / CJK | Pass-through only | Excellent (incl. Traditional, handwriting) | Very good (inherits PaddleOCR) |
| Hardware | Any laptop | CPU OK, GPU faster | GPU strongly recommended |
| License | MIT | Apache-2.0 | **AGPL-3.0** |
| Feels like | A utility | A toolkit | A product |

## How I'd actually choose

The honest answer is that these tools compose rather than compete:

1. **Mostly Office docs and clean digital PDFs, feeding an LLM?** MarkItDown alone. One `pip install`, done. Route the occasional scan to something else.
2. **Technical PDFs, scans, papers, anything with tables and math?** MinerU for the batch conversion. Accept the GPU and model downloads; the output quality pays for them.
3. **Building OCR into a product, or shipping to customers?** PaddleOCR. Apache-2.0, deployable from server to edge, and PP-StructureV3 gets you surprisingly close to MinerU-grade parsing without the AGPL question.
4. **A general-purpose ingestion service?** Use MarkItDown as the front door for everything digital-native, and route PDFs/scans to MinerU (internal tools) or PP-StructureV3 (commercial products). This two-tier setup — cheap converter first, heavy parser only when needed — is what most production RAG pipelines converge on anyway.

One closing caveat: whichever you pick, **evaluate on your own documents**. Every benchmark in this space is dominated by academic papers and clean reports; your invoices, forms, and 1990s fax-quality scans are a different distribution. Twenty representative files and an afternoon of eyeballing the Markdown will tell you more than any leaderboard.

</div>

<div data-lang="zh" markdown="1">

## 為什麼「OCR」已經不是以前的意思

十年前，OCR 只有一個意思：像素進、文字出。Tesseract 讀一頁掃描稿、吐一個文字檔，字元錯誤率壓在個位數就謝天謝地。

到了 2026 年，這件事的本質變了。讀你抽取結果的通常不是人，而是 LLM 管線：RAG 索引、agent 工具呼叫、微調語料、關鍵資訊抽取。這把門檻往一個特定方向抬高——模型要的不只是*字元*，而是**結構**：標題真的是標題、表格活著離開、公式是 LaTeX 而不是 Unicode 亂碼、多欄版面按正確順序閱讀、頁首頁尾被剝掉而不是污染每一個 chunk。

「PDF 轉 Markdown」悄悄變成了真正的產品類別，而三個開源名字反覆出現：**MarkItDown**（微軟）、**MinerU**（OpenDataLab／上海人工智能實驗室）、**PaddleOCR**（百度）。很多人把它們當成可互換的同類工具來比較——其實不是。它們位於技術棧的三個不同層次，選錯一個，你的 RAG 索引就會裝滿垃圾。

深入之前，先給一句話版本：

- **MarkItDown** 是*格式轉換器*：讀取檔案本來就有的數位結構，重新序列化成 Markdown，本身幾乎不做 OCR。
- **PaddleOCR** 是 *OCR 引擎與工具箱*：真正把像素變成文字的那一層，上面再加一條可選的文件解析管線。
- **MinerU** 是*端對端文件解析管線*：把版面偵測、OCR、公式與表格辨識串成一台立場鮮明的 PDF → Markdown 機器。

## MarkItDown：格式轉換器

[MarkItDown](https://github.com/microsoft/markitdown) 是一個小巧的 Python 函式庫，承諾很簡單：丟給它幾乎任何東西——DOCX、PPTX、XLSX、PDF、HTML、CSV、JSON、EPUB、圖片、甚至音訊——它還你 Markdown，而且是為 LLM 消化而調校，不是為了像素級還原。

```python
# pip install "markitdown[all]"
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("quarterly_report.docx")
print(result.text_content)
```

整個 API 就這樣。對數位原生檔案，它是真的好用：DOCX 保留標題層級、XLSX 變成可讀的表格、PPTX 逐頁變成小節。它很快、Python 能跑的地方都能跑、MIT 授權，還附帶 MCP 伺服器（`markitdown-mcp`），agent 可以直接呼叫。

問題出在「數位原生」四個字。對 PDF，MarkItDown 抽取的是**既有的文字層**。給它一份掃描合約——本質上只是紙張照片的 PDF——你會拿到很少甚至什麼都沒有，因為根本沒有文字層可抽。它也丟棄了大部分位置資訊，所以複雜的多欄 PDF 可能以錯亂的閱讀順序出來，PDF 表格通常退化成一團平面文字。

它留了兩條逃生通道：接上 LLM client 讓圖片得到 AI 生成的描述，或指向 **Azure Document Intelligence** 做真正的 OCR——但到那一步，重活已經搬去付費雲端服務，MarkItDown 回到它的本質：一個輕薄而設計良好的轉換器。

**適合**：輸入以 Office 文件、HTML、乾淨的數位 PDF 為主，想給 LLM 管線一個依賴極輕的統一入口。

**不適合**：掃描件、照片或複雜 PDF 版面混在輸入裡時，把它當唯一工具。

## PaddleOCR：機房裡的引擎

[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) 在光譜的另一端：百度的工業級 OCR 工具箱，建立在 PaddlePaddle 框架上，Apache-2.0 授權，大概是全世界生產環境部署最廣的開源 OCR 引擎。

3.0 版（2025 年中）對這個比較很關鍵，因為它把技術棧的兩層都磨利了：

- **PP-OCRv5**——核心偵測＋辨識模型。單一模型同時涵蓋簡體中文、繁體中文、英文、日文與手寫，行動端尺寸的模型在 CPU 上跑得動，伺服器版模型追求精度，多語言覆蓋數十種。
- **PP-StructureV3**——架在引擎上的文件解析管線：版面分析、表格辨識、公式辨識、圖表解析、印章文字，支援 Markdown 與 JSON 輸出。
- **PP-ChatOCRv4**——把 OCR 輸出與 LLM 配對的關鍵資訊抽取。

原始 OCR 幾行搞定：

```python
# pip install paddlepaddle paddleocr
from paddleocr import PaddleOCR

ocr = PaddleOCR(lang="ch")          # 偵測 + 辨識
result = ocr.predict("scanned_invoice.png")
```

文件解析管線同樣直接：

```python
from paddleocr import PPStructureV3

pipeline = PPStructureV3()
for res in pipeline.predict("annual_report.pdf"):
    res.save_to_markdown("out/")
```

PaddleOCR 的強項是工程上的強項：必要時跑 CPU、可以時跑 GPU；有 serving、C++、端側部署路徑；模型小到可以嵌進產品；Apache-2.0 授權意味著放進商業軟體不用先找律師。如果你的文件是中文——尤其繁簡混排或手寫——它是最強的開源辨識器，沒有之一。

代價是組裝。PaddleOCR 給你頂級的元件和一條能用的管線，但*系統*是你的：選模型、釘版本（2.x → 3.x 的 API 變動弄壞過不少腳本）、前處理決策、輸出後處理。它是一個電池齊全的工具箱，不是一個產品。

**適合**：你在把 OCR *做進*某個東西——產品、服務、內部平台——需要控制權、寬鬆授權、中日韓文精度或端側部署。

**不適合**：你只想把一資料夾 PDF 丟進工具、零決策拿到漂亮的 Markdown。

## MinerU：文件解析管線

[MinerU](https://github.com/opendatalab/MinerU) 的存在源於一個非常具體的痛點：上海人工智能實驗室的團隊需要把數以百萬計、亂七八糟的真實 PDF——論文、教科書、報告——變成乾淨的 LLM 訓練資料。MinerU 就是那套內部機器的開源版。

它毫不掩飾自己是*管線*而非引擎。經典 pipeline 模式下，文件依序流過版面偵測（DocLayout-YOLO）、OCR（PaddleOCR 模型——對，MinerU 裡面真的跑著 PaddleOCR）、公式辨識（UniMERNet 系列模型，輸出 LaTeX）、表格辨識（輸出 HTML），再按正確閱讀順序拼回來，同時剝掉頁首、頁尾與頁碼。2.x 之後還有 **VLM 後端**——一個小型視覺語言模型端對端讀整頁——在 OmniDocBench 這類文件解析基準上，表現與體積大它許多倍的通用 VLM 相當甚至更好。

用法刻意地無聊：

```bash
# pip install "mineru[core]"
mineru -p paper.pdf -o out/
```

出來的是帶 LaTeX 公式、HTML 表格的 Markdown，圖片抽取到資料夾，想在上面蓋東西還有結構化 JSON。

對最難的輸入——雙欄掃描論文，帶行間公式、腳註、浮動圖表——MinerU 的輸出品質是三者中最好的，而且差距不小：閱讀順序正確、公式是真的 LaTeX、表格活著。

取捨同樣真實。第一，**重量**：首次執行要下載好幾個模型，CPU 推論可行但有量就需要 GPU。第二，**範圍**：它做 PDF 和圖片，不是萬用檔案轉換器。第三——最常被忽略——**授權**：MinerU 是 **AGPL-3.0**。把它嵌進對外提供的服務，你可能有義務開源你的程式碼。批次資料準備工具通常沒問題；商業 SaaS 就是一場要跟律師開的會。

**適合**：PDF → Markdown 的品質就是重點：技術文件 RAG、建語料、論文與報告數位化。

**不適合**：當成專有產品裡的輕量函式庫，或處理它本來就不是為此設計的 Office 格式。

## 並排比較

| | **MarkItDown** | **PaddleOCR** | **MinerU** |
|---|---|---|---|
| 本質 | 格式轉換器 | OCR 引擎＋工具箱 | PDF 解析管線 |
| 出品方 | 微軟 | 百度 | OpenDataLab（上海 AI Lab） |
| 真 OCR（掃描件） | ✗（需外掛 Azure DI） | ✓ 核心能力 | ✓（經 PaddleOCR／VLM） |
| 輸入格式 | Office、PDF、HTML、圖片、音訊、EPUB… | 圖片、PDF | PDF、圖片 |
| 表格 | Office 佳；PDF 差 | ✓ PP-StructureV3 | ✓ Markdown 內嵌 HTML |
| 公式 → LaTeX | ✗ | ✓（公式模組） | ✓ 三者最強 |
| 複雜版面閱讀順序 | PDF 偏弱 | ✓ | ✓ 最強 |
| 中文／CJK | 只能透傳 | 優異（含繁體、手寫） | 很好（繼承 PaddleOCR） |
| 硬體 | 任何筆電 | CPU 可用，GPU 更快 | 強烈建議 GPU |
| 授權 | MIT | Apache-2.0 | **AGPL-3.0** |
| 用起來像 | 一個小工具 | 一個工具箱 | 一個產品 |

## 我實際上會怎麼選

誠實的答案是：這三個工具是互補多於競爭。

1. **主要是 Office 文件和乾淨的數位 PDF，餵給 LLM？** 只用 MarkItDown。一個 `pip install` 完事，偶爾出現的掃描件另外處理。
2. **技術 PDF、掃描件、論文、任何帶表格和數學的東西？** 用 MinerU 做批次轉換。接受 GPU 和模型下載——輸出品質對得起這個成本。
3. **在產品裡內建 OCR，或要出貨給客戶？** PaddleOCR。Apache-2.0、從伺服器到端側都能部署，PP-StructureV3 能讓你在沒有 AGPL 問題的前提下，逼近 MinerU 級的解析品質。
4. **通用的文件攝取服務？** MarkItDown 當所有數位原生檔案的前門，PDF／掃描件路由給 MinerU（內部工具）或 PP-StructureV3（商業產品）。這種兩層架構——便宜的轉換器先上、重型解析器按需出動——本來就是多數生產級 RAG 管線最後收斂到的形態。

最後一個提醒：無論選哪個，**用你自己的文件做評測**。這個領域的所有基準測試都被學術論文和乾淨報告主導；你的發票、表單和 1990 年代傳真畫質的掃描件是另一個分佈。挑二十份代表性檔案、花一個下午親眼看輸出的 Markdown，比任何排行榜都能告訴你更多。

</div>
