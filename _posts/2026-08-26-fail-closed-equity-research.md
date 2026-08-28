---
layout: insight
title: "Fail-Closed Equity Research: Teaching Claude Code Not to Do the Math"
title_zh: "Fail-Closed 股票研究：教 Claude Code 不要自行計算"
date: 2026-08-26
tags: [AI, Agents, Engineering]
permalink: /insights/fail-closed-equity-research/
thumbnail: https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=2000&q=90&auto=format&fit=crop
excerpt: "Most \"AI does equity research\" demos have the model eyeball a filing and state a number, with no way to check it. This one works differently: deterministic Python does every calculation, the LLM only drafts prose from numbers it didn't compute, and the pipeline refuses to publish when something looks wrong. Packaged as a Claude Code skill, shown with a real SK hynix run."
excerpt_zh: "大部分「AI 做股票分析」的示範，做法是讓模型看一眼 filing、給出一個數字，卻無法查證。這篇文章講一個不同的設計：所有計算由 deterministic Python 負責，LLM 只用已經算好的數字撰寫 prose，一旦發現數據有問題就寧願不發佈報告。包裝成一個 Claude Code skill，以一次真實的 SK hynix run 作示範。"
---

<div data-lang="en" markdown="1">

## The problem with "AI does equity research" demos

Paste a filing into a chat window, ask for a DCF, and most tools hand back a
confident number. There's no way to check it. You can't tell whether the
model multiplied the right cells, quietly smoothed over an accounting
anomaly, or picked a plausible-sounding price target out of thin air.

I wanted to try building the opposite: a pipeline where the LLM literally
cannot state a number it didn't get from deterministic code, and where the
system would rather ship nothing than ship something wrong. I built it as a
local tool, tried it on one real company, SK hynix (KRX 000660), and
packaged the workflow as a Claude Code skill so it can point at any ticker.

This post is about the engineering. Every SK hynix figure below illustrates
how the system behaves, comes from public filings, and none of it is
investment advice — see the disclosure at the end.

## The one rule

Everything else follows from a single constraint, lifted almost word for
word into the skill's own instructions:

> If you catch yourself doing arithmetic to produce a figure that ends up in
> the report — stop. That number belongs in an assumptions file as an input,
> not typed into prose.

Forecasting, discounted cash flow, sensitivity tables, and event-to-valuation
deltas are pure Python functions; none of them call a model. The LLM sits
upstream of that math, researching filings and deciding on a reasonable
WACC, and downstream of it, turning already-computed numbers into prose.
What it doesn't do is anything in between.

## Five modules, one direction

```text
sources.py     normalize reported facts, build a source ledger
model.py       six-quarter forecast, short- and long-term DCF
events.py      replay named catalysts through the valuation model
validation.py  fail-closed gates on the normalized data
report.py      assemble a Markdown report from computed numbers + narrative
```

Every financial figure enters through `sources.py` carrying a source ID, a
retrieval timestamp, and a document status: `preliminary`,
`preliminary_unaudited`, `filed_preliminary`, whatever the filing itself
actually says. Anything without a source doesn't reach the model.

```json
{
  "period": "2Q2026",
  "revenue": 79.3187,
  "operating_profit": 60.5426,
  "net_income": 93.9226,
  "source_id": "skh_ir_q2_26",
  "cross_check_source_id": "sec_6k_q2_26",
  "evidence": "2Q26 release table; SEC 6-K investment-asset note and cross-check"
}
```

## A real anomaly, caught closed

SK hynix's 2Q26 release makes a good stress test. Net income (₩93.92T) came
in higher than revenue (₩79.32T), driven by a large one-time
investment-asset gain. Taken at face value, recurring earnings power looks
badly overstated. `validate_normalized` catches it without knowing anything
about SK hynix specifically:

```python
if net_margin > 1:
    warnings.append({
        "code": "NET_INCOME_GT_REVENUE",
        "period": name,
        "message": "Net income exceeds revenue; isolate non-operating and fair-value items.",
    })
```

This quarter's run came back `status: review_required`,
`publication_allowed: false`, and five warnings in total, two of them
flagging that FY2025 and 1Q2026 data are still preliminary. The report still
gets written. Every warning is printed into it verbatim, and nothing
downstream is allowed to treat a flagged figure as clean.

## Point-in-time

Each research date writes into its own folder,
`data/equities/{ticker}/raw/{date}/`. A new filing creates a new dated
snapshot instead of editing the old one. If a company later restates a
number, you can still compare what the model said before the restatement
against what it says after. A `manifest.json` per run hashes every input
and output file, so a report can be checked against the exact bytes that
produced it, months later.

## What the DCF actually returns

Feed the base-case inputs in: free cash flow tapering from ₩105T to ₩85T
across 2027–2031, 9% WACC, 3% terminal growth. The function discounts each
year, computes a terminal value, and returns ₩1,940,801 per share. Swap in
the bear or bull inputs and the same function returns ₩847,792 or
₩4,765,361. The spread is wide on purpose: at this point in the cycle, peak
margin and HBM share carry almost all the weight, and the arithmetic
underneath them barely matters.

| Scenario | WACC | Terminal growth | Value / share |
|---|---:|---:|---:|
| Bear | 10.5% | 2% | ₩847,792 |
| Base | 9.0% | 3% | ₩1,940,801 |
| Bull | 8.0% | 4% | ₩4,765,361 |

The full sensitivity grid, holding the cash-flow forecast fixed and varying
only WACC and terminal growth:

| WACC \ g | 2% | 3% | 4% |
|---|---:|---:|---:|
| 8% | ₩2,003,039 | ₩2,295,249 | ₩2,733,563 |
| 9% | ₩1,739,634 | ₩1,940,801 | ₩2,222,434 |
| 10% | ₩1,541,843 | ₩1,687,306 | ₩1,881,257 |

I didn't just trust the code. I rebuilt the same DCF as live formulas in a
separate spreadsheet tool, ran a formula-evaluation library against it
independent of the Python, and checked all nine cells above against the
pipeline's own output. They matched to the rounding digit.

## Packaging it as a skill

The pipeline was never the hard part. Deterministic finance math is a
solved problem; the actual work sits in the layer around it: given a
company name, find the filings, decide what to trust, write the assumptions
somewhere a person can see them before they become model input, then hand
off to the code. The skill encodes that as a sequence.

1. Research comes first: official IR releases, the matching regulatory
   filing, a share-count disclosure, a market-price snapshot. All free and
   public — the skill's instructions rule out assuming access to Bloomberg,
   FactSet, or any paid feed.
2. Write the source pack. Every fact gets a citation, a timestamp, a status
   tag.
3. Write the assumptions, then stop and show them to the user before
   running anything. It's the one deliberate pause in an otherwise
   automatic flow — a plausible catalyst turned up during research doesn't
   get to reshape the base case unseen.
4. Draft the narrative next: thesis, drivers, catalysts, risks, all
   grounded in what step 1 actually turned up.
5. Run the deterministic pipeline — the only step that produces a number.
6. Report validation honestly. A `review_required` run gets reported as
   exactly that.
7. Self-score against a fixed 100-point rubric, and write down what a paid
   data source or another quarter of history would actually add.

The instructions above, as an actual `SKILL.md` you can drop into
`.claude/skills/equity-research/`: **[download it](/downloads/equity-research-skill/SKILL.md)**.
It's the methodology, without the calculation engine — step 5 still needs
wiring to a deterministic pipeline of your own, shaped like the one
described above.

## What free data can't do

Broker consensus, licensed shipment data, contract pricing. None of it
shows up for free, and no amount of clever prompting produces it. It's a
subscription decision someone has to make on purpose, and the skill says so
plainly instead of padding the report to look complete. The SK hynix run
scored itself 76 out of 100 and named the four things standing between it
and something a professional desk would publish. A polished-looking report
doesn't prove forecasting skill. Beating a seasonal-naive baseline over
enough quarters would, and that comparison doesn't exist yet with only one
vintage on file.

## Disclosure

Every number above comes from SK hynix's own public releases and its SEC
6-K filing, retrieved and cited the way the pipeline requires. This
describes a research methodology. It isn't a recommendation to buy, hold,
or sell anything, and neither is the pipeline's own report — both carry the
same line: educational, not investment advice.

</div>

<div data-lang="zh" markdown="1">

## 「AI 做股票分析」的示範有什麼問題

把一份 filing 貼進聊天視窗，叫它算一個 DCF，很多工具都會很有信心地給出一
個數字。但這個數字沒辦法查證。你不知道模型是不是乘對了正確的儲存格，也
不知道它有沒有悄悄抹平一個會計異常，更不知道那個「目標價」是真的算出來
的，還是隨口報一個聽起來合理的數字。

我想試着做相反的事：讓 LLM 在結構上根本沒辦法講一個不是由 deterministic
code 算出來的數字，而且整個系統寧願什麼都不輸出，也不願意輸出錯的東西。
我做了一個本地工具，在一間真實公司身上試過，SK hynix（KRX 000660），再
把整套流程包裝成一個 Claude Code skill，換成任何一隻股票都能用。

這篇文章講的是工程設計。下面所有 SK hynix 的數字，都只是用來說明系統怎
麼運作，全部來自公開 filing，不是投資建議，詳細的 disclosure 放在文末。

## 唯一的規則

整個設計只有一條核心規則，其他一切都由它推導出來，幾乎逐字寫進了 skill
自己的指示：

> 如果你發現自己在算一個會出現在報告裡的數字，停手。這個數字應該是
> assumptions 檔案裡的一項輸入，不是寫進 prose 裡的內容。

預測、discounted cash flow、sensitivity table、event-to-valuation delta，
全部是純 Python function，沒有一個會呼叫 model。LLM 只做兩件事：計算之
前，負責研究 filing、決定合理的 WACC；計算之後，負責把已經算好的數字寫
成可讀的 prose。中間那段運算，它從來沒碰過。

## 五個 module，一個方向

```text
sources.py     標準化已申報事實，建立 source ledger
model.py       六季預測、短期及長期 DCF
events.py      將指定的催化劑重演於估值模型
validation.py  對標準化數據執行 fail-closed 把關
report.py      由已計算數字 + narrative 組成一份 Markdown 報告
```

每個財務數字進入 `sources.py` 時，都帶着 source ID、retrieval 時間戳，以
及 document status，例如 `preliminary`、`preliminary_unaudited`、
`filed_preliminary`，一律照 filing 本身的寫法。沒有來源的數字，進不了模
型。

```json
{
  "period": "2Q2026",
  "revenue": 79.3187,
  "operating_profit": 60.5426,
  "net_income": 93.9226,
  "source_id": "skh_ir_q2_26",
  "cross_check_source_id": "sec_6k_q2_26",
  "evidence": "2Q26 release table; SEC 6-K investment-asset note and cross-check"
}
```

## 一個真的異常，當場攔下

SK hynix 的 2Q26 release 是個很好的壓力測試。這一季 net income
（₩93.92T）比 revenue（₩79.32T）還高，原因是一筆龐大的一次性
investment-asset gain。照單全收這個數字，會嚴重高估經常性盈利能力。
`validate_normalized` 不知道任何 SK hynix 專屬的內容，一樣捉到這個問題：

```python
if net_margin > 1:
    warnings.append({
        "code": "NET_INCOME_GT_REVENUE",
        "period": name,
        "message": "Net income exceeds revenue; isolate non-operating and fair-value items.",
    })
```

這一季的 run 結果是 `status: review_required`、
`publication_allowed: false`，加上五條 warning，其中兩條指出 FY2025 與
1Q2026 的數據還是 preliminary。報告照樣寫出來，每條 warning 都逐字印在
裡面，下游沒有任何地方會把標記過的數字當成乾淨數字使用。

## Point-in-time

每一個研究日期都寫進自己的資料夾，`data/equities/{ticker}/raw/{date}/`。
有新的 filing，就開一個新的日期快照，不會去改舊的那個。之後如果公司
restate 一個數字，還是能比較 restate 前後模型分別說了什麼。每次 run 都
有一個 `manifest.json`，把所有輸入輸出檔案 hash 起來，幾個月後也能拿確
實的位元組核對這份報告。

## 這個 DCF 實際算出什麼

把 base case 的輸入餵進去：2027 到 2031 的 free cash flow，由 ₩105T 逐步
降到 ₩85T，WACC 9%，terminal growth 3%。function 逐年折現、算出 terminal
value，回傳每股 ₩1,940,801。換成 bear 或 bull 的輸入，同一個 function 就
回傳 ₩847,792 或 ₩4,765,361。幅度這麼大是刻意的：這個周期位置，真正重要
的是 peak margin 和 HBM share 這些 assumption，底下的算法本身反而沒那麼
重要。

| 情境 | WACC | Terminal growth | 每股價值 |
|---|---:|---:|---:|
| Bear | 10.5% | 2% | ₩847,792 |
| Base | 9.0% | 3% | ₩1,940,801 |
| Bull | 8.0% | 4% | ₩4,765,361 |

完整的 sensitivity grid，固定現金流預測，只調動 WACC 和 terminal growth：

| WACC＼g | 2% | 3% | 4% |
|---|---:|---:|---:|
| 8% | ₩2,003,039 | ₩2,295,249 | ₩2,733,563 |
| 9% | ₩1,739,634 | ₩1,940,801 | ₩2,222,434 |
| 10% | ₩1,541,843 | ₩1,687,306 | ₩1,881,257 |

我沒有只是相信這段代碼寫得對。我在另一個獨立的試算表工具裡，用即時公式
重新做了一次同一個 DCF，再用一個 formula-evaluation library 執行，跟
Python 完全分開運算，把上面九格逐一對照 pipeline 自己的輸出，全部吻合到
小數點最後一位。

## 包裝成一個 skill

這個 pipeline 本身從來都不難。財務數學要做成 deterministic，本來就是已
經解決的問題。真正花工夫的是它周圍那一層：給一個公司名字，去找相關的
filing、判斷該信哪個來源、把 assumptions 寫在人看得見的地方，然後才變成
模型的輸入，之後才交給代碼。Skill 把這整套過程寫成一個明確的順序。

1. 先研究：官方 IR release、對應的監管 filing、股數 disclosure、市價快
   照，全部只能用免費而且公開的來源。Skill 的指示明確排除了 Bloomberg、
   FactSet 或任何付費數據源。
2. 寫 source pack。每一項事實都要有引用、有時間戳、有 status 標記。
3. 寫 assumptions，然後停下來，先讓使用者看過才繼續。這是整套自動流程
   裡唯一刻意留下的停頓點，研究時發現一個聽起來合理的催化劑，不能在沒
   人看過之前就改動 base case。
4. 草擬 narrative：thesis、drivers、catalysts、風險，全部根據第一步真
   正找到的東西來寫。
5. 執行 deterministic pipeline，這是唯一會產出數字的一步。
6. 老實報告 validation 的結果，一個 `review_required` 的 run 就照直說。
7. 對照一個固定的 100 分 rubric 自評，寫下如果有付費數據源，或者多一季
   的歷史，實際上能多加什麼。

以上這些步驟寫成了一份真正的 `SKILL.md`，放進
`.claude/skills/equity-research/` 就能用：
**[下載](/downloads/equity-research-skill/SKILL.md)**。這份文件是方法
論，沒有附帶計算引擎，第五步仍然要接上自己的 deterministic pipeline，形
狀跟上面講的差不多。

## 免費數據做不到什麼

Broker consensus、licensed 出貨數據、contract pricing，這些東西免費一律
找不到，再會 prompt 都變不出來。這是要有人特意去付錢訂閱的決定，skill
也老實這樣講，不會為了看起來齊全就把報告誇大。SK hynix 這次的 run 自評
76 分（滿分 100），還具體列出四項讓它跟專業 desk 有落差的地方。報告好
看，不代表預測能力好，真正算數的是能不能在夠多季度裡跑贏
seasonal-naive baseline，而這個比較現在只有一個 vintage，做不到。

## Disclosure

以上所有數字都來自 SK hynix 自己的公開 release 和 SEC 6-K filing，按
pipeline 要求的方式取用和引用。這篇文章講的是一套研究方法論，不是叫你
買、持有或賣出任何東西。pipeline 自己的報告也寫着同一句：純屬教育用途，
不構成投資建議。

</div>
