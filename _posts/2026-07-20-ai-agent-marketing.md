---
layout: insight
title: "Marketing with AI Agents: The Claude Way vs the Hermes Way"
title_zh: "用 AI Agent 做行銷：Claude 路線 vs Hermes 路線"
date: 2026-07-20
tags: [AI, Agents, Marketing]
permalink: /insights/ai-agent-marketing/
thumbnail: https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=2000&q=90&auto=format&fit=crop
excerpt: "Two very different ways to put AI agents to work on a marketing campaign: rent a managed frontier agent (the Claude way) or own a steerable open-weight model (the Hermes way). A working comparison — grounded in a live campaign for Worange × 橙 — of what each buys you and what each costs you."
excerpt_zh: "把 AI agent 投入行銷戰役有兩條截然不同的路：租用託管的前沿模型 agent（Claude 路線），或自己擁有一個高度可控的開源權重模型（Hermes 路線）。以 Worange × 橙 的實際 campaign 為推導案例，比較兩條路各自買到什麼、又各自付出什麼。"
---

<div data-lang="en" markdown="1">

> **A living write-up.** This article runs alongside a real campaign — **Worange × 橙** — and the case-study sections below are being filled in and corrected as the campaign produces data. Sections marked *[in progress]* will change. See the revision log at the end.

## Marketing is agent-shaped work

Strip a marketing campaign down to its verbs and you get: research the audience, watch the conversation, draft many variants, localize them, schedule them, measure what happened, and adjust. It's repetitive, multi-tool, deadline-driven, and every step either produces text or reads text.

That is almost a textbook definition of work suited to LLM agents — not a chatbot you paste briefs into, but agents with tools: one that queries your analytics, one that drafts and revises copy against a brand guide, one that watches mentions and drafts responses, one that assembles the Monday report nobody wants to write.

The interesting question in 2026 is no longer *whether* to do this. It's an architecture choice most teams stumble into without noticing they're making it: **do you rent a managed frontier agent, or own a steerable open model?** I'll call these the **Claude way** and the **Hermes way**, after the tools that best embody each philosophy.

## The Claude way: rent the frontier

The Claude approach means building on a managed frontier model through its agent tooling — the Claude Agent SDK, MCP connectors into your marketing stack (CMS, analytics, ad platforms, social schedulers), and, where needed, computer use for tools that have no API.

```python
# pip install claude-agent-sdk
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(
    system_prompt=open("brand_voice.md").read(),
    mcp_servers={"analytics": analytics_server, "cms": cms_server},
    allowed_tools=["mcp__analytics__*", "mcp__cms__draft_post"],
)

async for message in query(
    prompt="Pull last week's engagement by channel, then draft three "
           "Instagram variants for the July drop, HK bilingual.",
    options=options,
):
    ...
```

What you're buying:

- **Frontier judgment.** Long-horizon, multi-step campaign work — "analyze, then decide, then draft, then check against the brand guide" — is where frontier models are simply more reliable. Fewer dropped steps, fewer tool-call fumbles, better instruction-following over long contexts.
- **Writing quality.** For the copy itself — especially nuanced bilingual work where tone has to survive translation — the frontier gap is still visible in blind tests.
- **Turnkey plumbing.** MCP means the connectors to your analytics, CMS, and ad platforms are configuration, not engineering. No GPUs, no serving stack, no model ops.
- **Brand safety by default.** The model's own guardrails catch most of the embarrassing failure modes before a human ever sees the draft.

What it costs you:

- **Per-token economics.** Bursty creative work is cheap. Always-on work — social listening, comment triage running 24/7 — meters up fast.
- **Data residency.** Briefs, performance data, and unreleased product details go to a vendor API. Enterprise agreements mitigate this; they don't make it disappear.
- **Bounded persona.** Safety training flattens edgy voices. If the campaign calls for irreverent, borderline-chaotic brand energy, you will feel the model gently pulling copy back toward polite.
- **Dependency.** Rate limits, model deprecations, price changes — someone else's roadmap is load-bearing for your stack.

## The Hermes way: own the model

The Hermes approach means running an open-weight, deliberately steerable model — Nous Research's Hermes line being the archetype — on your own hardware, wrapped in your own agent scaffolding.

```bash
# Serve an open-weight Hermes model locally
vllm serve NousResearch/Hermes-4-70B --max-model-len 32768
```

```python
# The system prompt is law — persona lives entirely in your hands
messages = [
    {"role": "system", "content": BRAND_PERSONA + TOOL_SPEC},
    {"role": "user", "content": "Draft five tweet variants for the drop. "
                                "Keep the chaotic-orange energy."},
]
```

What you're buying:

- **Total persona control.** Hermes-family models are trained to treat the system prompt as law. The brand voice you write is the brand voice you get — including registers a safety-tuned frontier model resists. Fine-tune on your own copy archive and the voice becomes *yours* in the weights.
- **Data sovereignty.** Nothing leaves your infrastructure. For campaigns with unannounced products or client NDAs, this can be the deciding constraint, full stop.
- **Flat-rate economics.** A rented GPU box costs the same at 3 a.m. as at noon. Always-on listening and high-volume variant generation get dramatically cheaper at sustained load.
- **Version stability.** The model never changes under you mid-campaign. Reproducibility is a `sha256`, not a changelog.

What it costs you:

- **You are the platform team.** Serving, monitoring, context management, tool-calling glue — assembled from open components, maintained by you.
- **A reasoning gap.** On single drafts you'll often struggle to tell the difference. On long multi-step agent runs, the smaller open model drops more balls: skipped steps, malformed tool calls, confident wrong summaries. You compensate with tighter scaffolding — smaller steps, more validation, more retries.
- **You own the guardrails.** A maximally obedient model will follow a bad prompt off a cliff, in public, in your brand's name. The safety layer a frontier vendor bundles is now a system *you* must design: content filters, human gates, audit logs.

## Head to head

| | **Claude way** | **Hermes way** |
|---|---|---|
| Model quality (long agentic runs) | Strongest | Good, needs scaffolding |
| Copy quality ceiling | Frontier | High with fine-tuning |
| Persona steerability | Bounded by safety training | Near-total |
| Data residency | Vendor API (enterprise terms) | Fully on-prem |
| Cost shape | Per token — cheap bursts, pricey always-on | Fixed infra — pricey idle, cheap at volume |
| Plumbing | MCP / Agent SDK, mostly config | DIY from open components |
| Brand safety | Built-in | Your responsibility |
| Ops burden | ~None | Real MLOps |
| Best at | Strategy, analysis, complex multi-step work | Voice-heavy volume work, sensitive data, 24/7 listening |

## Case study: Worange × 橙 *[in progress]*

This is the live part of the article. **Worange × 橙** is a real campaign we're running agents against right now; numbers and verdicts land here as they firm up.

**Setup.** The campaign is bilingual (EN / 中文) social-first marketing with a distinctive, playful brand voice. The working hypothesis is a split pipeline that plays each approach to its strength:

- **Claude side** — campaign strategy, audience analysis, weekly performance reads, and the long multi-tool runs (pull numbers → interpret → recommend → draft the report).
- **Hermes side** — high-volume voice-locked variant generation and always-on social listening, where persona fidelity and flat-rate economics matter most.

**What we're measuring.** Draft acceptance rate by human editors, voice-consistency scores across languages, tool-call failure rates per agent run, cost per accepted asset, and turnaround time from brief to scheduled post.

**Early observations.** *[To be filled in as the campaign runs — first results expected within the first two sprint cycles.]*

**Corrections to the framework above.** *[Reserved. Where the campaign contradicts the theory, the theory gets edited — and the change is logged below.]*

## The decision framework, for now

Pending real numbers from the campaign, the working rules:

1. **Default to the Claude way** if your bottleneck is judgment: strategy, analysis, complex multi-step automation, and you'd rather ship this quarter than build a platform.
2. **Go the Hermes way** when the constraint is voice, volume, or data: an edgy persona that must not be flattened, always-on workloads where token pricing bites, or briefs that legally cannot leave the building.
3. **The split pipeline is not a compromise — it's probably the answer.** Frontier judgment where reasoning is scarce; owned weights where voice and volume are. The Worange × 橙 numbers will test exactly this.

## Revision log

- **2026-07-20** — Initial framework published. Case study opened, awaiting first campaign data.

</div>

<div data-lang="zh" markdown="1">

> **這是一篇「活」的文章。** 本文與一場真實 campaign——**Worange × 橙**——同步進行，下方案例研究的部分會隨著數據產出持續填入與修正。標示 *〔進行中〕* 的章節將會更新，文末附修訂紀錄。

## 行銷本來就是 agent 形狀的工作

把一場行銷 campaign 拆到只剩動詞，會得到：研究受眾、監聽輿論、量產文案變體、在地化、排程、量度成效、再調整。它重複、跨工具、被死線驅動，而且每一步不是在產生文字、就是在讀文字。

這幾乎是「適合 LLM agent 的工作」的教科書定義——不是那種把 brief 貼進去的聊天機器人，而是配備工具的 agent：一個查你的分析數據、一個對著品牌指南寫稿改稿、一個盯著提及並草擬回應、一個負責組出星期一那份沒人想寫的週報。

2026 年有趣的問題已經不是*要不要*做，而是一個大多數團隊不知不覺就做掉了的架構決定：**租用託管的前沿模型 agent，還是自己擁有一個可控的開源模型？** 我把兩者稱為 **Claude 路線**與 **Hermes 路線**——以最能代表各自哲學的工具命名。

## Claude 路線：租用前沿

Claude 路線的意思，是建立在託管的前沿模型與它的 agent 工具鏈之上——Claude Agent SDK、接進你行銷技術棧的 MCP 連接器（CMS、分析平台、廣告平台、社群排程工具），必要時再用 computer use 操作那些沒有 API 的工具。

```python
# pip install claude-agent-sdk
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(
    system_prompt=open("brand_voice.md").read(),
    mcp_servers={"analytics": analytics_server, "cms": cms_server},
    allowed_tools=["mcp__analytics__*", "mcp__cms__draft_post"],
)

async for message in query(
    prompt="Pull last week's engagement by channel, then draft three "
           "Instagram variants for the July drop, HK bilingual.",
    options=options,
):
    ...
```

你買到的是：

- **前沿級判斷力。** 長程、多步驟的 campaign 工作——「分析、然後決策、然後起稿、然後對照品牌指南檢查」——正是前沿模型明顯更可靠的地方：漏步驟更少、工具呼叫失手更少、長上下文的指令遵循更好。
- **文案品質。** 就文案本身——尤其語氣要在翻譯後存活的雙語工作——盲測裡前沿模型的差距仍然看得見。
- **現成的管線。** MCP 讓分析、CMS、廣告平台的接口變成設定問題而非工程問題。不用 GPU、不用 serving、不用模型維運。
- **預設的品牌安全。** 模型自帶的護欄，會在人類看到稿之前就攔下大部分令人尷尬的失敗模式。

你付出的是：

- **按 token 計費的經濟學。** 爆發式的創意工作很便宜；常駐式的工作——24/7 的社群監聽、留言分流——錶跳得很快。
- **資料去向。** Brief、成效數據、未發佈的產品細節都會送進供應商的 API。企業級協議能緩解，但不會讓問題消失。
- **有邊界的人設。** 安全訓練會把尖銳的聲線磨平。如果 campaign 需要的是玩世不恭、近乎失控的品牌能量，你會感覺到模型溫柔地把文案拉回禮貌。
- **依賴。** 速率限制、模型退役、價格調整——別人的 roadmap 成了你技術棧的承重牆。

## Hermes 路線：擁有模型

Hermes 路線的意思，是在自己的硬體上跑一個開源權重、刻意設計成高度可控的模型——Nous Research 的 Hermes 系列是原型——外面包你自己的 agent 鷹架。

```bash
# 在本地服務一個開源權重的 Hermes 模型
vllm serve NousResearch/Hermes-4-70B --max-model-len 32768
```

```python
# System prompt 就是法律——人設完全掌握在你手上
messages = [
    {"role": "system", "content": BRAND_PERSONA + TOOL_SPEC},
    {"role": "user", "content": "Draft five tweet variants for the drop. "
                                "Keep the chaotic-orange energy."},
]
```

你買到的是：

- **人設的完全控制權。** Hermes 系列模型的訓練哲學是把 system prompt 當法律。你寫下什麼品牌聲線，就得到什麼品牌聲線——包括安全調校過的前沿模型會抗拒的語域。再用自己的文案庫微調，聲線就直接長進權重裡，變成*你的*。
- **資料主權。** 什麼都不離開你的基礎設施。對有未公佈產品或客戶 NDA 的 campaign，這一條可以直接定案。
- **固定費率的經濟學。** 租來的 GPU 機器凌晨三點和中午十二點一樣價錢。常駐監聽和高量變體生成，在持續負載下便宜得戲劇性。
- **版本穩定。** 模型不會在 campaign 中途在你腳下換掉。可重現性是一個 `sha256`，不是一份 changelog。

你付出的是：

- **你就是平台團隊。** Serving、監控、上下文管理、工具呼叫的黏合層——用開源元件組裝，由你維護。
- **推理差距。** 單篇稿件你常常分不出差別；但長程多步驟的 agent run 裡，較小的開源模型掉的球更多：跳過步驟、格式錯誤的工具呼叫、自信的錯誤總結。你得用更緊的鷹架補償——更小的步驟、更多驗證、更多重試。
- **護欄自負。** 一個絕對服從的模型，會跟著一個爛 prompt 一路衝下懸崖——公開地、以你品牌的名義。前沿供應商附送的安全層，現在是*你*要設計的系統：內容過濾、人工閘門、稽核紀錄。

## 並排比較

| | **Claude 路線** | **Hermes 路線** |
|---|---|---|
| 模型品質（長程 agent run） | 最強 | 好，但需要鷹架 |
| 文案品質上限 | 前沿級 | 微調後可以很高 |
| 人設可控性 | 受安全訓練約束 | 近乎完全 |
| 資料去向 | 供應商 API（企業條款） | 完全自有 |
| 成本形狀 | 按 token——爆發便宜、常駐貴 | 固定基建——閒置貴、大量便宜 |
| 管線 | MCP／Agent SDK，多半是設定 | 開源元件自行組裝 |
| 品牌安全 | 內建 | 你的責任 |
| 維運負擔 | 幾乎為零 | 真實的 MLOps |
| 最擅長 | 策略、分析、複雜多步驟工作 | 聲線密集的量產、敏感資料、24/7 監聽 |

## 案例研究：Worange × 橙 *〔進行中〕*

這是文章「活」的部分。**Worange × 橙** 是我們此刻正在用 agent 執行的真實 campaign，數字與結論會隨著明朗化陸續落在這裡。

**設定。** 這是一場雙語（英文／中文）、社群優先、品牌聲線鮮明而俏皮的 campaign。工作假設是一條分流管線，讓兩條路線各展所長：

- **Claude 端**——campaign 策略、受眾分析、每週成效解讀，以及長程多工具的 run（拉數據 → 解讀 → 建議 → 寫報告）。
- **Hermes 端**——鎖定聲線的高量變體生成與常駐社群監聽：人設保真度與固定費率經濟學最重要的地方。

**量度什麼。** 人類編輯的採稿率、跨語言聲線一致性評分、每次 agent run 的工具呼叫失敗率、每篇採用素材的成本，以及從 brief 到排程貼文的周轉時間。

**初步觀察。** *〔隨 campaign 進行填入——預計頭兩個 sprint 內有第一批結果。〕*

**對上述框架的修正。** *〔保留欄位。當 campaign 的事實與理論相矛盾，改的是理論——改動記錄在下方。〕*

## 目前的選擇框架

在 campaign 的真實數字到位之前，暫行的規則是：

1. **預設走 Claude 路線**，如果你的瓶頸是判斷力：策略、分析、複雜的多步驟自動化，而且你想這一季就出貨，而不是先蓋一個平台。
2. **走 Hermes 路線**，當約束是聲線、量或資料：不容磨平的尖銳人設、token 計價咬人的常駐工作負載，或法律上不能離開公司的 brief。
3. **分流管線不是妥協——它很可能就是答案。** 推理稀缺的地方用前沿判斷力；聲線與量說話的地方用自有權重。Worange × 橙 的數字要驗證的正是這一點。

## 修訂紀錄

- **2026-07-20**——初版框架發佈。案例研究開欄，等待第一批 campaign 數據。

</div>
