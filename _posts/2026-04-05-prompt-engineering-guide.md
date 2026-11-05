---
layout: insight
title: "Prompt Engineering Best Practices"
title_zh: "提示工程的最佳實踐"
date: 2026-04-05
tags: [Tutorial, AI]
permalink: /insights/prompt-engineering-guide/
thumbnail: https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=2000&q=90&auto=format&fit=crop
excerpt: "A practical, opinionated guide to prompt engineering in 2026 — what still matters, what the reasoning models changed, and the patterns that consistently ship in production."
excerpt_zh: "一份有觀點的 2026 年提示工程實戰指南——什麼依然重要、推理模型改變了什麼，以及在生產環境真正行得通的模式。"
---

<div data-lang="en" markdown="1">

## Does prompt engineering still matter in 2026?

Every few months someone declares prompt engineering dead. "The models are so smart now, you just ask them what you want." That argument gets better with every model release, and it's still wrong.

What *has* changed is that the tricks have moved. "Let's think step by step" was a magic phrase in 2022; today's reasoning models already think step by step internally and the phrase is redundant. But the core question — *how do I describe a task so that a model understands it the way I intend?* — is exactly as important as ever. Prompts are the API surface for LLMs. Like any API, tiny changes in how you call it cause large changes in output quality.

The good news: the principles are stable, the techniques compose, and almost all of them are intuitive once you see them written down. What follows is what I actually reach for when a prompt isn't working, organised from "always do this" to "use when needed."

All three major labs publish good official guides that are worth bookmarking:

- [Anthropic — Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [OpenAI — Prompt engineering guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Google — Prompting with Gemini](https://ai.google.dev/gemini-api/docs/prompting-intro)

## Prompts, context, and harness: the three things you actually control

The most useful reframing of "prompt engineering" I've read recently comes from Anthropic's applied AI team, in posts like [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) and their [applied AI blog posts on building Claude Code](https://www.anthropic.com/engineering/claude-code-best-practices). The core idea is simple: when you're building anything more than a single-shot prompt, you are not tuning *one* thing — you are tuning three, and they pull against each other.

### 1. The prompt

What we've traditionally called "prompt engineering": the instructions, role, examples, and output format you write as text. This is the first thing everyone focuses on and the last thing that saves a broken system. A perfect prompt around broken context or a broken harness is still a broken system.

### 2. The context

*Everything else* the model sees at the moment of generation: retrieved documents, tool outputs from previous turns, conversation history, memory files, file contents the agent has opened. In an agent loop this grows turn by turn, and most real failures happen here — not in the prompt.

Context engineering is the practice of being deliberate about what ends up in the window. The heuristics I actually use:

- **Budget the context like RAM.** Frontier models have 200k–2M token windows, but quality degrades long before you fill them (see [Lost in the Middle](https://arxiv.org/abs/2307.03172)). Treat the first ~30k tokens as the "hot zone" and put the most decision-critical material there.
- **Prune aggressively between turns.** Old tool outputs, stale search results, and resolved sub-tasks should be summarised or dropped. If you keep everything forever, the agent's attention dilutes and it starts hallucinating based on a now-stale fact from ten turns ago.
- **Order matters.** Claude and GPT attend more strongly to material at the start and end of the window than the middle. Put the current task at the end; put durable instructions at the start; put noisy intermediate tool outputs in the middle where their weaker attention won't hurt.
- **Use structured delimiters.** `<document index="3" source="policy.pdf">...</document>` is much easier for the model to reason over than raw concatenation, and lets it refer back by tag or index.
- **Separate facts from opinions.** If the context contains both source documents and the agent's own notes, label them. Otherwise the agent starts treating its own speculation as canonical.

Anthropic's post on [building effective agents](https://www.anthropic.com/engineering/building-effective-agents) frames this bluntly: *the longer an agent runs, the more context engineering dominates outcomes.* For single-shot tasks, the prompt is the whole game. For 20-turn agents, the prompt is 10% of it.

### 3. The harness

The code that wraps the model call — the loop, the tool definitions, the tool permissions, the context trimming strategy, the retry logic, the streaming and cancellation handling, the memory I/O. This is the part that people who have shipped real agents obsess over and the part that gets zero blog posts because it's "just engineering."

A good harness does things the model cannot do for itself:

- **Enforces invariants.** The model is told "don't delete files outside the project directory" in the prompt; the harness actually blocks the `rm` call at the tool layer. Two defences are better than one, and the hard defence is the one in code.
- **Shapes the context.** The harness decides what counts as "conversation history," what gets truncated, what gets summarised, what gets dropped. The model never sees the full raw history.
- **Recovers from errors.** Tool timeouts, malformed tool calls, rate limits — the harness handles these before the model has to reason about them. Don't make the model debug your HTTP client.
- **Gates the dangerous actions.** Every destructive, external, or user-visible tool call should pass through a permission layer. Claude Code's "ask before running" default is a good template.
- **Gives the model a way to give up.** If the agent detects it's stuck, it should be able to call a `report_blocked` tool (or similar) instead of flailing for another 15 turns burning your API budget.

### How the three interact

A concrete example: you're building a code-review agent. You try to make it more cautious with a longer, stricter prompt. Nothing changes. You add more rules. Still nothing. The problem isn't the prompt at all — the harness is stuffing the diff, the old review comments, *and* the full file contents into context every turn, so by turn 5 the model is drowning in 40k tokens of mostly-irrelevant noise and ignoring your careful instructions. The fix is in the harness (trim the context) or in the context shape (put the task *last*), not in the prompt.

The takeaway: when something isn't working, ask which of the three layers is failing before you start rewriting instructions. Prompt problems usually look like the model not understanding what you want. Context problems usually look like the model drifting, forgetting, or contradicting itself. Harness problems usually look like the model doing impossible things because your guardrails are only in prose.

## The core: specificity beats cleverness

If I could teach one thing about prompting it would be this: models are not mind-readers. They will happily produce a plausible-looking answer to a vague question, and that answer will usually be *close* to what you wanted but not quite. The fix is almost never a cleverer prompt — it's a more specific one.

Compare these two prompts:

> "Write a summary of this report."

> "Write a 150-word summary of this report for a finance director who has 30 seconds. Focus on the three biggest risks, quantify them, and end with a recommendation."

The second prompt has a target audience, a length budget, a focus, a concrete structure, and a forcing function on the ending. The output will be better not because the model tried harder but because the constraints narrow the space of plausible answers.

When a prompt isn't working, the first question should always be: *what did I leave implicit?* Usually it's the audience, the format, the length, the tone, or what to do in the ambiguous case.

## Few-shot examples: still the highest-leverage technique

Introduced in the [GPT-3 paper](https://arxiv.org/abs/2005.14165) and still underused. Showing 2–5 worked examples before the real query calibrates the model on format, tone, and edge cases more reliably than any description could.

```
Classify each customer message as: BILLING, TECHNICAL, ACCOUNT, or OTHER.

Message: "Why was I charged twice this month?"
Category: BILLING

Message: "The app crashes whenever I open the settings screen."
Category: TECHNICAL

Message: "How do I change the email on my account?"
Category: ACCOUNT

Message: "{user_message}"
Category:
```

A few things to notice:

- The examples cover the categories you care about.
- They include edge cases worth demonstrating.
- The format is consistent — the model will copy it.

Rules of thumb: 3 examples usually beats 1 by a lot; 5 usually beats 3 by a little; 10 usually doesn't beat 5. Diversity matters more than count.

## Structured output: always ask for it explicitly

If the downstream is code, never parse prose. Ask for JSON, XML, or a delimited format, and specify the schema. Both [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) and [Anthropic tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) enforce a JSON schema at the API level, which turns "parse the response and hope" into "get a typed object."

When you can't use a schema API, you can still guide the model:

```
Respond in JSON with exactly these keys:
{
  "summary": string,       // 1-2 sentences
  "risks": string[],       // 3 items, ranked
  "recommendation": string // one clear action
}
Do not include any text outside the JSON object.
```

For Claude specifically, XML tags work extraordinarily well. Anthropic recommends them in their [XML tags guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags) and they're my default for anything complex:

```
<instructions>
Analyse the document in <document> and produce a report in <output_format>.
</instructions>

<document>
{document}
</document>

<output_format>
<summary>...</summary>
<risks>...</risks>
<recommendation>...</recommendation>
</output_format>
```

The reason this works so well is that Claude's training data is full of XML-like tagged structures, so the model has a very strong prior about what each tag means.

## Role and system prompts

The system prompt is where you set *durable* behaviour — the persona, the rules, the non-negotiables. The user prompt is where the actual task goes. Mixing them is the most common mistake I see.

A good system prompt is:

- **Short and concrete.** "You are a cautious financial analyst writing for a CFO. Favour specific numbers over adjectives. Refuse to speculate beyond the data provided."
- **Free of contradictions.** "Be concise but thorough" gives the model permission to do neither.
- **Free of vague adjectives.** "Professional" means nothing; "use formal English, no contractions, no emoji" is actionable.

Don't put the actual user data in the system prompt — that wastes cache-friendly tokens and confuses the model about what's instruction versus input.

## Chain-of-thought: what reasoning models changed

"Let's think step by step" — [Kojima et al. (2022)](https://arxiv.org/abs/2205.11916) — was the single most famous prompting trick of the first LLM era. In 2025–26, reasoning models like OpenAI's o-series, Claude Opus 4.x, and Gemini 2.x Thinking do this internally. You no longer need to ask.

But the *principle* still applies. For non-reasoning models, explicit step-by-step instructions still help. And for all models, asking them to work through their reasoning *before* committing to an answer still dramatically improves accuracy on anything with multiple steps:

```
Before answering, first write out:
- What is actually being asked?
- What information is available?
- What are the relevant rules or constraints?
- What's the chain of reasoning?

Then give your final answer inside <answer> tags.
```

The forced reflection step is the useful part, not the magic phrase.

## Prefilling the response

A trick that's somewhat Claude-specific but extremely powerful: you can start the model's response for it. If you want JSON, start the response with `{`. If you want to force a specific format, write the first few tokens. Anthropic's [prefill docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response) have more.

## The XML + examples + reflection stack

The pattern I reach for on any non-trivial task is a stack:

1. **System prompt:** role, rules, non-negotiables.
2. **User prompt in XML tags:** `<context>`, `<examples>`, `<task>`.
3. **A reflection step:** "Before answering, write down your reasoning inside `<thinking>`."
4. **A structured output tag:** `<answer>` or JSON.

Five minutes of stacking these usually beats hours of fiddling with phrasing.

## A mental checklist before you ship

1. **Specificity** — does the model have all the context it needs, or am I assuming knowledge it doesn't have?
2. **Examples** — have I shown at least one example of the exact output I want?
3. **Constraints** — is the task bounded (length, format, audience), or am I asking for something open-ended that will drift?
4. **Escape hatches** — what do I want the model to do when it doesn't know? Say so explicitly.
5. **Failure mode** — if the output is wrong, will I be able to tell *why*? Structured output makes this much easier.
6. **Variability** — does the same prompt give different answers on identical inputs? Lower temperature, or add a tie-breaking rule.
7. **Token budget** — am I wasting the first 2000 tokens on boilerplate that never changes? Put it in the system prompt so it gets cached.

## Common anti-patterns

- **Negative instructions that boomerang.** "Don't mention pricing" often leads to the model mentioning pricing. State what you *do* want instead.
- **Over-long system prompts.** 5000 tokens of rules means the model ignores most of them. Prune to the 10 rules that actually matter.
- **Using temperature > 0 for structured tasks.** Classification, extraction, and parsing should run at temperature 0. Creative writing needs variance; parsing does not.
- **Ignoring the model's real failure modes.** Before you blame the prompt, look at where the model is actually failing — is it misreading the input, hallucinating, or choosing the wrong format? The fix is different in each case.
- **Testing on one example.** A prompt that works on one input and fails on the next isn't "almost working" — it's a lucky coincidence. Always test on a diverse set.

## Further reading

- [Prompt Engineering Guide](https://www.promptingguide.ai/) — the most complete community reference
- [Learn Prompting](https://learnprompting.org/) — free course from basics to advanced
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — runnable Claude examples
- [OpenAI Cookbook](https://cookbook.openai.com/) — runnable GPT examples
- [The Prompt Report](https://arxiv.org/abs/2406.06608) — a systematic survey of 200+ prompting techniques

</div>

<div data-lang="zh" markdown="1">

## 2026 年還需要提示工程嗎

每隔幾個月就有人宣告提示工程已死：「模型那麼聰明了，直接問就好。」每次新模型發布這個說法都更有說服力，但它依然是錯的。

**真正改變的**是技巧本身。「Let's think step by step」在 2022 年是神咒，今天的推理模型已經內建這個步驟，寫出來反而多餘。但最核心的問題——*怎麼把任務描述清楚，讓模型照我的意圖理解*——跟以前一樣重要。提示詞就是 LLM 的 API；就像任何 API 一樣，呼叫方式的微小改動會造成輸出品質的巨大差異。

好消息是：原則很穩定、技巧可以疊加、而且寫下來之後幾乎都是直覺可以接受的。以下內容按照「一定要做」到「必要時才用」排序。

三個主要實驗室都有值得收藏的官方指南：

- [Anthropic — Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [OpenAI — Prompt engineering guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Google — Prompting with Gemini](https://ai.google.dev/gemini-api/docs/prompting-intro)

## Prompt、Context、Harness：你真正能控制的三件事

最近我讀過最有用的一次「提示工程」重新定義，來自 Anthropic 的 applied AI 團隊，例如 [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) 和他們 [關於 Claude Code 的 applied AI 部落格](https://www.anthropic.com/engineering/claude-code-best-practices)。核心想法很簡單：當你在建比「一次性提示」更複雜的東西時，你調的不是**一件**東西，而是**三件**，而且它們會互相拉扯。

### 1. Prompt（提示詞）

就是我們傳統上說的「prompt engineering」——你寫進文字的指令、角色、範例、輸出格式。這是所有人第一個關注、也是**最後一個能救回一個壞掉系統**的層。脈絡壞了或 harness 壞了，再完美的 prompt 也救不了。

### 2. Context（脈絡）

模型在生成當下看到的**所有其他東西**：檢索回來的文件、前幾輪的工具輸出、對話歷史、記憶檔、agent 開過的檔案內容。在 agent loop 裡，它會一輪一輪膨脹，而**大部分真正的失敗都發生在這裡**，不是在提示詞裡。

脈絡工程（context engineering）就是刻意控制「什麼東西最後會進到 context window 裡」的實踐。我實際用的經驗法則：

- **把 context 當成 RAM 分配。** 前沿模型有 20 萬到 200 萬 token 的視窗，但**品質會在視窗滿之前就先下降**（參見 [Lost in the Middle](https://arxiv.org/abs/2307.03172)）。把最前面的 ~30k token 當成「熱區」，把對決策最關鍵的材料放進去。
- **每一輪積極裁剪。** 舊的工具輸出、過期的搜尋結果、已解決的子任務，都應該被摘要或丟掉。什麼都永遠留著，agent 的注意力會被稀釋，然後根據十輪前早已過期的事實開始幻覺。
- **順序有差。** Claude 和 GPT 對視窗頭尾的關注都比中間強。把當下任務放在結尾、把長期指令放在開頭、把雜訊較多的中間步驟工具輸出放中間，讓它較弱的注意力剛好落在不痛的地方。
- **用結構化分隔符。** `<document index="3" source="policy.pdf">...</document>` 比一坨串在一起的文字好推理太多，而且可以讓模型用 tag 或 index 回指。
- **事實與意見分開。** 如果脈絡同時包含原始文件與 agent 自己的筆記，**請標示清楚**；否則 agent 會把自己的猜測當成權威。

Anthropic 的 [building effective agents](https://www.anthropic.com/engineering/building-effective-agents) 直接把話講白：**agent 跑得越久，結果就越由 context engineering 主導。** 單次任務中 prompt 是全部；20 輪的 agent 裡，prompt 只佔 10%。

### 3. Harness

包在模型呼叫外面的那層程式碼——loop、工具定義、工具權限、裁剪脈絡的策略、重試邏輯、串流與取消處理、記憶 I/O。這是真正出過 agent 的人最在意、也是最沒人寫部落格的部分，因為「它就是工程」。

好的 harness 做的是模型自己做不到的事：

- **強制不變量。** 提示詞裡寫「不要刪除專案目錄以外的檔案」；harness 在工具層**真的**擋掉 `rm` 呼叫。兩層防禦比一層好，而且**程式碼那層是真正能擋住的那一層**。
- **塑形脈絡。** 什麼算「對話歷史」、什麼要截掉、什麼要摘要、什麼要丟——這些決定全部由 harness 做，模型**從來不會**看到原始的完整歷史。
- **從錯誤恢復。** 工具逾時、格式錯的工具呼叫、rate limit——這些在模型需要思考之前就由 harness 處理掉。不要讓模型替你 debug HTTP client。
- **為危險動作設置閘門。** 每個會破壞、會外連、會被使用者看到的工具呼叫，都應該通過一層權限層。Claude Code 預設「執行前先問」就是很好的模板。
- **給模型一條放棄的路。** 如果 agent 偵測到自己卡住了，它應該能呼叫一個 `report_blocked`（或類似）工具，而不是再亂揮 15 輪把你的 API 預算燒光。

### 三層是怎麼互相拉扯的

一個具體例子：你在做一個 code review agent。你想讓它更謹慎，於是把提示詞寫得更長、更嚴格。沒反應。你加更多規則。還是沒反應。問題根本不在 prompt——**是 harness 每一輪都把 diff、舊的 review 留言、整個檔案內容一起塞進 context**，所以到第 5 輪的時候，模型已經淹沒在 40k token 的無關雜訊裡，乾脆無視你寫的所有細緻指令。解法在 harness（裁剪脈絡）或 context shape（把任務放在**最後**），不在 prompt。

要點：東西不 work 時，先問**三層的哪一層壞了**，再動手改指令。Prompt 問題看起來通常是模型不懂你要什麼；context 問題看起來通常是模型漂移、遺忘、自相矛盾；harness 問題看起來通常是模型做出「不可能」的事，因為你的護欄只寫在散文裡。

## 核心：具體勝過聰明

如果只能教一件事，我會教：模型不會讀心。問題模糊，它就會很自然地生出一個看起來合理、但和你想要的*差一點*的答案。解法幾乎從來不是「更聰明的提示」，而是「更具體的提示」。

比較以下兩種寫法：

> 「幫我把這份報告做個摘要。」

> 「用 150 字以內幫我摘要這份報告，對象是只有 30 秒時間的財務總監。聚焦於最大的三個風險，用數字量化，最後以一項建議結尾。」

第二版指定了對象、字數、焦點、結構和結尾的強制條件。輸出會更好，不是因為模型更努力，而是因為限制把可行答案的空間收窄了。

提示詞不 work 時，第一個要問的永遠是：*我有什麼沒明講？* 通常是對象、格式、長度、語氣，或模稜兩可情境的處理方式。

## 少樣本示例：依然是最高回報的技巧

[GPT-3 論文](https://arxiv.org/abs/2005.14165) 提出，至今仍被低估。在真正的問題前示範 2 到 5 個完整例子，比任何描述都能更可靠地校準模型的格式、語氣和邊界情況。

```
請把每則客戶訊息分類為：BILLING、TECHNICAL、ACCOUNT、OTHER。

訊息：「為什麼我這個月被扣款兩次？」
類別：BILLING

訊息：「每次我打開設定頁 app 就閃退。」
類別：TECHNICAL

訊息：「我要怎麼改帳號的 email？」
類別：ACCOUNT

訊息：「{user_message}」
類別：
```

注意幾點：

- 例子涵蓋了你關心的類別。
- 包含值得示範的邊界情況。
- 格式一致——模型會照抄。

經驗法則：3 個例子通常比 1 個好很多；5 個通常比 3 個好一點；10 個通常沒比 5 個好。多樣性比數量重要。

## 結構化輸出：一定要明確要求

如果下游是程式，永遠不要去解析散文。要求 JSON、XML 或有分隔符的格式，並指定 schema。[OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) 和 [Anthropic tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) 都能在 API 層強制 JSON schema，把「解析後祈禱」變成「直接拿到有型別的物件」。

如果沒法用 schema API，還是可以引導模型：

```
請以下列 JSON 格式回答，鍵值完全如下：
{
  "summary": string,       // 1 至 2 句
  "risks": string[],       // 3 項，由高到低排序
  "recommendation": string // 一條明確的行動
}
JSON 物件以外不要輸出任何文字。
```

對 Claude 來說，XML 標籤的效果特別好。Anthropic 在 [XML tags 指南](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags) 中推薦這種做法，我處理複雜任務時也會預設使用：

```
<instructions>
請分析 <document> 中的內容，並依 <output_format> 產出報告。
</instructions>

<document>
{document}
</document>

<output_format>
<summary>...</summary>
<risks>...</risks>
<recommendation>...</recommendation>
</output_format>
```

效果好的原因，是 Claude 的訓練資料裡充滿類似 XML 的標籤結構，模型對每個標籤的意義有很強的先驗。

## 角色與系統提示

系統提示（system prompt）放**長期行為**——角色、規則、底線。使用者提示（user prompt）放真正的任務。把兩者混在一起是我最常看到的錯誤。

好的系統提示應該：

- **簡短、具體。**「你是一位謹慎的金融分析師，對象是 CFO。用具體數字取代形容詞，不要超出提供的資料作推論。」
- **沒有自相矛盾。**「簡潔但完整」等於放任模型兩者都不做。
- **沒有模糊形容詞。**「專業」沒有意義；「使用正式英文、不用縮寫、不用 emoji」才可執行。

不要把真正的使用者資料寫進 system prompt——那會浪費可快取的 token，還會模糊「哪個是指令、哪個是輸入」。

## 思維鏈：推理模型改變了什麼

[Kojima 等人（2022）](https://arxiv.org/abs/2205.11916) 的「Let's think step by step」是 LLM 第一代最出名的技巧。2025–26 年的推理模型——OpenAI o 系列、Claude Opus 4.x、Gemini 2.x Thinking——已經內建這一步，不用再寫。

但**原則**仍然適用。對非推理模型，明確要求逐步思考還是有效；對所有模型，讓它在**下結論之前**先寫出思路，仍能大幅提升多步驟任務的準確率：

```
回答之前，請先寫出：
- 實際被問的是什麼？
- 有哪些可用資訊？
- 相關的規則或限制是什麼？
- 推理鏈是什麼？

然後在 <answer> 標籤內給出最終答案。
```

有用的是「被迫反思」這個步驟本身，不是那句神咒。

## 預填模型回應（Prefill）

這個技巧對 Claude 特別適用、也特別強：你可以**替模型開頭**。想要 JSON？把回應的第一個字元設成 `{`。想要強制特定格式？把開頭幾個 token 先寫好。詳見 Anthropic 的 [prefill 文件](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response)。

## XML + 範例 + 反思的堆疊

任何不平凡的任務，我會用的組合拳是：

1. **System prompt**：角色、規則、底線。
2. **User prompt 用 XML 包起來**：`<context>`、`<examples>`、`<task>`。
3. **反思步驟**：「回答前請在 `<thinking>` 標籤內寫下你的推理。」
4. **結構化輸出標籤**：`<answer>` 或 JSON。

花五分鐘堆這個結構，通常勝過花幾小時微調用字。

## 上線前的心智檢查表

1. **具體度**——模型是否拿到所有需要的脈絡？有沒有被我假設它已知的知識？
2. **範例**——我有沒有示範至少一個期望輸出？
3. **限制**——任務是否有明確邊界（長度、格式、對象）？還是會因為太開放而跑題？
4. **逃生門**——模型不知道時該怎麼辦？請明確告訴它。
5. **失敗模式**——輸出錯了我能不能看出**為什麼**錯？結構化輸出能讓這件事簡單很多。
6. **穩定性**——相同輸入下同一個提示會給出不同答案嗎？降溫度，或加破除平手的規則。
7. **Token 預算**——前 2000 個 token 是不是都浪費在不會變的樣板上？放到 system prompt 才能被快取。

## 常見反模式

- **反向指令反彈。**「不要提到價格」經常讓模型反而提到價格。請改講你**要**什麼。
- **系統提示過長。** 5000 token 的規則等於叫模型忽略大多數。只保留真正重要的 10 條。
- **結構化任務用 temperature > 0。** 分類、抽取、解析都該用 temperature 0。創意寫作需要變異，解析不需要。
- **忽略模型真正的失敗模式。** 怪提示之前，先看模型在哪裡失敗——是讀錯輸入、幻覺、還是選錯格式？解法完全不同。
- **只測一個例子。** 只過一個輸入、下個就掛掉的提示不是「快好了」，是運氣好。永遠在多樣化的資料上測試。

## 延伸閱讀

- [Prompt Engineering Guide](https://www.promptingguide.ai/) — 最完整的社群資源
- [Learn Prompting](https://learnprompting.org/) — 由淺入深的免費課程
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — 可直接執行的 Claude 範例
- [OpenAI Cookbook](https://cookbook.openai.com/) — 可直接執行的 GPT 範例
- [The Prompt Report](https://arxiv.org/abs/2406.06608) — 系統性整理了 200+ 種提示技巧

</div>
