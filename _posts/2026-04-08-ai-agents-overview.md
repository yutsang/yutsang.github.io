---
layout: insight
title: "AI Agents: An Overview of the Current Landscape"
title_zh: "AI Agent：目前生態的全景"
date: 2026-04-08
tags: [News, AI]
permalink: /insights/ai-agents-overview/
thumbnail: https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1677442136019-21780ecad995?w=2000&q=90&auto=format&fit=crop
excerpt: "A grounded look at AI agents in 2026 — what they actually are, the frameworks that matter, the architectures that work in production, and where the hype still outpaces reality."
excerpt_zh: "一份踏實看待 2026 年 AI agent 的整理：它們到底是什麼、哪些框架真的重要、哪些架構在生產環境能跑、哪些部分炒作仍超過現實。"
---

<div data-lang="en" markdown="1">

## What people actually mean by "AI agent"

"Agent" is one of the most overloaded words in AI right now. Depending on who's talking, it means anything from a chatbot with a calculator tool to a fully autonomous system that writes and deploys code with no supervision. That makes most discussions nearly useless, so let me start with a definition I'll defend:

> An **AI agent** is a system where a language model drives a loop of plan → act → observe → revise, using tools to interact with the world instead of just producing text, and where the model itself decides what to do next.

Three pieces matter:

1. **A loop.** One shot of tool use is not an agent — it's a function call. Agents keep going until the task is done or they give up.
2. **Tools.** The model can do things other than emit tokens. It can read files, run code, query a database, hit an API, talk to another agent.
3. **The model decides.** If a human or hardcoded state machine picks the next step, it's a workflow, not an agent. The autonomy is the whole point.

By this definition, today's coding assistants like Claude Code and Cursor's Agent mode are agents. A retrieval chain with a fixed sequence isn't. A chatbot with function calling is borderline — one call doesn't really make a loop.

Anthropic's essay [Building effective agents](https://www.anthropic.com/research/building-effective-agents) is the clearest recent framing I've seen, and the headline insight is: *the simple composable patterns usually beat the elaborate multi-agent orchestrations.* Fancy doesn't scale; simple does.

## The architectural patterns that actually work

From Anthropic's post, three years of watching other people ship agents, and my own prototypes, here's what actually survives contact with production:

### 1. Augmented LLM

The simplest pattern. One LLM, a handful of tools, a loop that runs until the model stops calling tools. No multi-agent gymnastics. This covers the vast majority of useful "agentic" behaviour.

```
while True:
    response = llm.call(messages, tools=tools)
    if not response.tool_calls:
        return response.text
    for call in response.tool_calls:
        result = run_tool(call)
        messages.append({"role": "tool", "content": result})
```

That's it. Claude Code, Cursor, and most internal company agents are variants of this pattern with a carefully curated tool set.

### 2. Prompt chaining

Decompose a task into a fixed sequence of LLM calls, each one building on the previous. Not really an agent — more of a workflow — but it's the right answer to a surprising number of problems that look like they need agents. "Extract → validate → summarise → format" is a chain, and it's easier to debug and cheaper to run than an autonomous agent.

### 3. Routing

An LLM picks which specialised handler to call, then that handler (which can be another LLM, a classical ML model, or a database lookup) does the work. Customer-support triage is the canonical example.

### 4. Parallelisation

Run the same task N times with different prompts and take a vote, or split a task into independent sub-tasks and run them in parallel. Cheaper than it sounds, especially with small reasoning models.

### 5. Orchestrator–worker

One "planner" LLM decomposes the task and delegates to worker LLMs. This is where things get genuinely agentic and also where most production systems break. Use it when the sub-tasks are truly unknown at plan time. Don't use it when a prompt chain would work.

### 6. Evaluator–optimiser

One LLM produces a draft, another critiques it, the first revises. This feels wasteful but measurably improves quality on writing, code generation, and research tasks. The [Reflexion paper](https://arxiv.org/abs/2303.11366) is the canonical reference.

My rule of thumb: **reach for the simplest pattern that works, and only add complexity when you can prove the simpler one is failing.** Most teams skip straight to multi-agent orchestration because it sounds impressive. They usually end up with a slower, more expensive, and less reliable version of the augmented LLM pattern.

## The frameworks worth knowing in 2026

The agent framework space is loud. Here's the short list of what's actually worth your time:

| Framework | Maintainer | Strengths | When to use |
| --- | --- | --- | --- |
| [LangGraph](https://www.langchain.com/langgraph) | LangChain | Explicit state graphs, good observability | Production agents where you need to debug every transition |
| [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) | Anthropic | Same harness as Claude Code, built-in file/bash/web tools | Coding agents, dev workflows, anything Claude-first |
| [OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents) | OpenAI | Handoffs, guardrails, built-in tracing, small footprint | OpenAI ecosystem, production with compliance needs |
| [CrewAI](https://www.crewai.com/) | CrewAI | Role-based multi-agent, fast prototyping | Content pipelines, research, when multi-agent genuinely helps |
| [AutoGen](https://microsoft.github.io/autogen/) | Microsoft Research | Multi-agent conversation, good async core in v0.4+ | Research, experimentation |
| [Pydantic AI](https://ai.pydantic.dev/) | Pydantic | Type-safe agents, first-class Pydantic models | Python shops that already use Pydantic |
| [smolagents](https://huggingface.co/docs/smolagents/index) | Hugging Face | Tiny, minimalist, code-as-action | When you want to actually read your agent's source code |

A few observations:

- **LangChain/LangGraph's positioning is now "observability."** Since LangSmith, the main reason to use LangGraph isn't abstractions — it's the tracing.
- **The agent SDKs from the labs are winning.** OpenAI, Anthropic, and Google all ship first-party agent SDKs now, and they're competitive with or better than third-party frameworks for their own models. If you're single-vendor, start there.
- **"No framework" is still a valid answer.** The augmented-LLM pattern above is 20 lines of Python. For simple use cases, a framework is strictly overhead.

## A closer look at Claude Agent SDK

The [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) (launched as "Claude Code SDK" and renamed in late 2025) is the cleanest example of what a modern agent harness looks like, because it's the *same* harness that powers Claude Code — the coding agent Anthropic ships to end users. That means it's battle-tested at scale on one specific workload, and the abstractions reflect real scars.

A few things make it interesting:

**1. Tools are the interface, not the abstraction.** The SDK ships with a small, sharp set of built-in tools: `Bash`, `Edit`, `Read`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, and `Task` (spawn a sub-agent). Every serious coding task Claude Code does is expressed as some combination of these. The whole point is that *you don't need 50 tools.* You need 10 good ones that cover a domain, then let the model compose them.

**2. File-based permissions and sandboxes.** The SDK assumes the agent runs in an environment where the user granted specific tool permissions, possibly per-directory, and where destructive actions can be blocked. This is what the harness layer is actually for — the model is the brain, the harness is the hands *and* the spinal cord that refuses to move the hands into fire.

**3. Subagents as first-class.** The `Task` tool lets the main agent spawn a fully independent Claude instance with its own context window, a specific job, and a bounded report-back. This is the only form of multi-agent orchestration I've seen consistently work in production: subagents for expensive searches or long tool chains that would otherwise pollute the parent's context.

**4. Memory and skills.** Later SDK versions added a file-based memory system (Claude writes markdown memories to disk across sessions) and "skills" — reusable prompt fragments invoked by name. Both are sensible defaults that remove a whole category of home-grown glue code.

If you're building anything Claude-first, reading the SDK source is the fastest way to internalise what a good agent loop looks like in practice. It's a masterclass in what to leave out.

## OpenHands: the open-source general agent

Where Claude Code / Claude Agent SDK is a domain-focused coding agent, [OpenHands](https://github.com/All-Hands-AI/OpenHands) (formerly OpenDevin) is the leading *open-source* attempt at a general software-engineering agent. It's the project you should study if you want to understand what building a Devin-class agent actually involves when you can't just lean on a proprietary tool suite.

What stands out:

- **Runtime isolation by default.** OpenHands runs the agent's actions inside a Docker sandbox with a dedicated filesystem and shell. This is the right answer — you do *not* want an autonomous agent running arbitrary shell commands on your host — and it's still surprisingly rare among open agents.
- **Model-agnostic.** It can drive Claude, GPT-4.x, Gemini, DeepSeek, Qwen, Llama, Hermes, or anything else with tool-use support through [LiteLLM](https://github.com/BerriAI/litellm). This makes it one of the best places to benchmark how the latest open models hold up on real agent work.
- **A browser as a first-class tool.** OpenHands bundles Playwright so the agent can actually read and interact with web pages, not just fetch HTML. This unlocks a whole category of tasks — form filling, documentation lookups, authenticated portals — that a pure bash+edit agent cannot do.
- **Public leaderboard participation.** OpenHands has been a consistent top-10 open-source entry on [SWE-bench Verified](https://www.swebench.com/) and [SWE-Lancer](https://arxiv.org/abs/2502.12115). That's a concrete signal that the harness is doing something right.

The trade-off is complexity: OpenHands does a lot, which means more moving parts, more configuration, and a steeper learning curve than "write a loop yourself." But if you want to study a real production agent harness end-to-end without an NDA, it's the best source material available.

Two honorable mentions in the same space: [Aider](https://aider.chat/) — much simpler, pair-programming focused, works beautifully on small-to-medium edits — and [Cline](https://github.com/cline/cline), a popular VS Code agent that follows a similar philosophy to Claude Code but inside the editor.

## Agent chaining in depth (and where open models like Hermes fit)

"Agent chaining" is a fuzzy term that tends to mean one of three distinct things, and conflating them is a classic source of confusion:

### 1. Tool-call chaining inside a single agent

The model calls tool A, gets a result, decides to call tool B with that result, and so on. This is just the agent loop — no "chaining" abstraction is required. The quality of this chain depends almost entirely on three things: (a) whether the model can hold the plan in its head across turns, (b) whether the tool outputs are clean and parseable, and (c) whether the context window stays coherent as it grows. Reasoning models (Claude Opus 4.x, GPT-5 / o-series, Gemini 2.x Thinking) are much better at long chains than their non-reasoning siblings, often by a factor of 2–3× on tasks requiring 10+ tool calls.

### 2. Prompt / workflow chaining across multiple LLM calls

Fixed sequence: extract → validate → summarise → translate. Each step is a separate LLM call, each with its own prompt. This isn't agentic — the control flow is hardcoded — but it's the right solution when you know the steps in advance. It's cheaper, faster, and dramatically easier to debug than letting an agent "figure it out." LangChain's `RunnableSequence`, LangGraph's deterministic edges, and plain Python functions all express the same pattern.

### 3. Multi-agent handoffs

Agent A finishes its work, hands the state to agent B, which continues with a different role, prompt, and possibly tools. OpenAI Agents SDK made this a first-class primitive with its `handoffs` feature; CrewAI's entire model is role-based agents passing work between each other. This is the pattern that most frequently backfires in production — the handoff boundary is where information gets lost, responsibilities get confused, and latency compounds. Use it sparingly, and only when the agents genuinely need different roles or tools that can't coexist in one context.

### Where open models fit: the Nous Hermes line

If you want to build agents on *open* models — for cost, privacy, or customisation — the question is which open models actually handle tool use and chaining well. [Nous Research's Hermes series](https://nousresearch.com/) has been the most consistent answer for the last two years. Hermes 3 (built on Llama 3.1) and the newer [Hermes 4](https://nousresearch.com/hermes-4/) (built on Llama 3.3 and Qwen) are specifically fine-tuned for function calling, structured output, and long, coherent agent chains, with an XML-based tool-call format similar to Claude's. On open-weight agent benchmarks they're typically at the top of the non-proprietary pack.

Practical notes on Hermes for agents:

- **Function calling is native and reliable.** You get a JSON schema in, you get a well-formed tool call out. Most fine-tuned Llama variants are much less consistent about this.
- **It handles the system prompt seriously.** Hermes was explicitly trained to follow system-prompt constraints in agent settings, which matters more than people expect on open models.
- **Run it behind [vLLM](https://github.com/vllm-project/vllm) or [SGLang](https://github.com/sgl-project/sglang) for throughput.** These inference engines support the tool-call grammar properly and give you 5–10× the tokens/sec of naive Hugging Face `transformers`.
- **It still lags the frontier on hard multi-step tool use.** For a real agent that has to close a SWE-bench ticket, Claude and GPT-5 are still comfortably ahead. Hermes shines in the "I need a capable open model for in-house agents" slot, not the "I need the best agent in the world" slot.

If Hermes doesn't fit, the other open models worth benchmarking for agent work in April 2026 are [Qwen 3](https://github.com/QwenLM/Qwen3) (especially the 72B and the MoE variants), [DeepSeek V3.1](https://api-docs.deepseek.com/news/news250821), and [Llama 3.3 / 4](https://www.llama.com/) with the Meta-provided function-calling adapters. The field moves fast, so re-benchmark quarterly.

## Where agents are actually being used (April 2026)

Stripping out the demos and the LinkedIn hype, here's where agents are doing real work:

### Software engineering

By a wide margin, the most mature agent category. [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), [Cursor](https://www.cursor.com/) Agent mode, [Aider](https://aider.chat/), [Devin](https://devin.ai/), [OpenHands](https://github.com/All-Hands-AI/OpenHands), and a dozen others now close real tickets end-to-end — reading the repo, editing files, running tests, and opening PRs. The [SWE-bench](https://www.swebench.com/) leaderboard has gone from ~2% pass rate in late 2023 to consistently >70% on Verified in 2026. This is the one domain where agents have unambiguously crossed the "useful in production" line.

### Deep research

Agents that browse, read, and synthesise long-form reports over tens of minutes. OpenAI's Deep Research, Google's Gemini Deep Research, and Anthropic's equivalent are genuinely useful for market scans, literature reviews, and due diligence. The output is rarely "final" but it replaces 4–8 hours of manual work with ~20 minutes of supervision.

### Customer support triage

First-line support, refund eligibility checks, knowledge-base lookups. Not full autonomy — there's almost always a human in the loop — but the agent handles the search, drafts the response, and hands the human a ready-to-send message. The economics are excellent when the ticket volume is high enough.

### Data workflows

Agents that write SQL, run it, inspect the result, iterate. This is where text-to-SQL has finally become useful, because the agent can recover from wrong schemas and misread columns instead of giving up on the first error.

### Not really working yet

- **"Agent does my job end-to-end."** Demos exist, production deployments don't.
- **Long-horizon autonomous planning.** Anything beyond a few hours of autonomous action drifts badly.
- **Open-ended browsing for non-research tasks.** Fine for deep research, unreliable for anything that needs a specific outcome.

## The honest caveats

A few things that don't get said enough:

### Latency and cost compound

An agent that calls the model 20 times costs 20× a single call. Naive agents easily burn $5–$50 per task. Plan for this at the prompt design stage: cache aggressively, prune context, use smaller models for intermediate steps.

### Evaluation is still a mess

Unit tests for agents are hard because the "correct" trajectory is usually not unique. The main tools right now are [LangSmith](https://smith.langchain.com/), [Braintrust](https://www.braintrust.dev/), [Arize Phoenix](https://phoenix.arize.com/), and [Langfuse](https://langfuse.com/). All are young; none have solved the problem. You still need human-graded evaluation sets.

### Security is an underrated problem

Every tool an agent can call is an attack surface. Prompt injection via retrieved documents is a real, shipped-exploit category. [Simon Willison's writing on prompt injection](https://simonwillison.net/tags/prompt-injection/) is required reading before you let an agent touch anything important.

### Multi-agent orchestration is almost always premature

If a single well-prompted agent with good tools can't do the job, a "team of agents" usually can't either — and if it can, it will be slower, more expensive, and harder to debug. Single agent first, always. Only split when you have specific evidence that specialisation helps.

## Where this is going

Two things I'd bet on for the next 12 months:

1. **Agents become "just how you use LLMs."** The distinction between "chat" and "agent" will blur because every serious LLM UI now has tools. The interesting design question moves from "should this be an agent?" to "what tools should it have?"
2. **The evaluation gap closes, slowly.** Proper agent benchmarks, better tracing tools, and the first generation of "agent-native" QA tools arrive. This is what will separate the teams that ship from the teams that demo.

The things I would *not* bet on: fully autonomous long-horizon agents replacing knowledge workers, swarms of specialised agents solving general problems, or any single "one framework to rule them all." The shape of useful agents in April 2026 is narrow, well-scoped, tightly-tooled systems that replace specific workflows. That's where the wins are.

## Further reading

- [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents) — the best recent framing
- [OpenAI — A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [A Survey on LLM-based Autonomous Agents](https://arxiv.org/abs/2308.11432)
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)
- [SWE-bench](https://www.swebench.com/) — the benchmark driving coding agents
- [Simon Willison — prompt injection archive](https://simonwillison.net/tags/prompt-injection/)

</div>

<div data-lang="zh" markdown="1">

## 大家說「AI agent」到底在說什麼

「Agent」是目前 AI 圈最被濫用的詞。依照說話的人不同，它可能指一個有計算機工具的聊天機械人，也可能是一個完全自主、會自己寫程式、自己部署的系統。這讓大多數相關討論幾乎毫無意義，所以先給一個我能辯護的定義：

> **AI agent** 是一種系統：由語言模型驅動「規劃 → 行動 → 觀察 → 修正」的循環，使用工具和世界互動而不只是輸出文字，且**由模型自己決定下一步做什麼**。

三個重點：

1. **一個循環。** 只呼叫一次工具不算 agent，那是 function call。Agent 會一直跑到任務完成或放棄。
2. **工具。** 模型能做「輸出文字」以外的事——讀檔、執行程式、查詢資料庫、呼叫 API、和另一個 agent 對話。
3. **模型決定。** 如果下一步是由人類或寫死的 state machine 選的，那是 workflow，不是 agent。自主性才是重點。

照這個定義，今天的 coding 助手（Claude Code、Cursor Agent 模式）是 agent；固定序列的檢索鏈不是；有 function calling 的聊天機械人處於邊緣——呼叫一次算不上循環。

Anthropic 的 [Building effective agents](https://www.anthropic.com/research/building-effective-agents) 是我看過最清楚的近期整理，核心洞察是：*簡單、可組合的模式通常勝過複雜的多 agent 編排。* 複雜的東西無法規模化，簡單的可以。

## 在實戰中真正有效的架構模式

綜合 Anthropic 的文章、過去三年看別人出 agent 的經驗，以及我自己的原型，以下是真正能在生產環境存活的模式：

### 1. 強化型 LLM（Augmented LLM）

最簡單的模式。一個 LLM、一些工具、一個跑到模型不再呼叫工具為止的循環。沒有多 agent 雜耍。絕大部分有用的「agentic」行為都屬於這一類。

```
while True:
    response = llm.call(messages, tools=tools)
    if not response.tool_calls:
        return response.text
    for call in response.tool_calls:
        result = run_tool(call)
        messages.append({"role": "tool", "content": result})
```

就這樣。Claude Code、Cursor，以及大多數公司內部的 agent 都是這個模式的變體，再配上精心挑選的工具集。

### 2. 提示鏈（Prompt chaining）

把任務分解成固定的 LLM 呼叫序列，每一步建立在前一步之上。嚴格來說不算 agent，比較像 workflow——但它是很多看起來需要 agent 的問題的正確答案。「抽取 → 驗證 → 摘要 → 格式化」就是一條鏈，比自主 agent 好除錯、也便宜。

### 3. 路由（Routing）

由 LLM 選擇要呼叫哪個專用 handler，handler 可以是另一個 LLM、傳統 ML 模型或資料庫查詢。客服分流是經典例子。

### 4. 平行化（Parallelisation）

同一個任務跑 N 次、投票；或把任務拆成獨立子任務並行執行。配合小型推理模型，成本比想像中低。

### 5. 編排者–工作者（Orchestrator–Worker）

一個「規劃者」LLM 拆解任務並分派給工作者 LLM。這是真正的 agentic 模式，也是大多數生產系統崩潰的地方。只有在規劃時真的無法預知子任務時才用。用 prompt chain 能解的就別用這個。

### 6. 評估者–優化者（Evaluator–Optimiser）

一個 LLM 寫草稿，另一個批評，第一個再改。聽起來浪費，但對寫作、程式生成和研究類任務有可量測的品質提升。[Reflexion 論文](https://arxiv.org/abs/2303.11366) 是經典文獻。

我的經驗法則是：**先用最簡單能 work 的模式，只有在能證明簡單模式失敗時才加複雜度。** 多數團隊直接跳到多 agent 編排，因為聽起來很酷，結果做出更慢、更貴、更不可靠的強化型 LLM。

## 2026 年值得認識的框架

Agent 框架圈很吵，以下是真正值得花時間的短名單：

| 框架 | 維護者 | 強項 | 何時使用 |
| --- | --- | --- | --- |
| [LangGraph](https://www.langchain.com/langgraph) | LangChain | 明確的狀態圖、良好的可觀測性 | 生產級 agent、需要除錯每一步 |
| [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) | Anthropic | 跟 Claude Code 同一套框架、內建檔案/bash/web 工具 | Coding agent、開發流程、Claude 優先 |
| [OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents) | OpenAI | handoffs、guardrails、內建 tracing、體積小 | OpenAI 生態、需要合規的生產環境 |
| [CrewAI](https://www.crewai.com/) | CrewAI | 角色式多 agent、原型做得快 | 內容流程、研究、多 agent 確實有用時 |
| [AutoGen](https://microsoft.github.io/autogen/) | Microsoft Research | 多 agent 對話，0.4 版起 async 核心不錯 | 研究與實驗 |
| [Pydantic AI](https://ai.pydantic.dev/) | Pydantic | 型別安全、一等 Pydantic 模型 | 已在用 Pydantic 的 Python 團隊 |
| [smolagents](https://huggingface.co/docs/smolagents/index) | Hugging Face | 極簡、code-as-action | 想親手讀完 agent 原始碼的人 |

幾個觀察：

- **LangChain/LangGraph 的定位已經變成「可觀測性」。** LangSmith 出現後，用 LangGraph 的主要理由不再是抽象，而是 tracing。
- **各實驗室自家的 agent SDK 在勝出。** OpenAI、Anthropic、Google 現在都推自家 agent SDK，對自家模型而言通常與第三方框架打平甚至更強。單一供應商的話，直接從官方 SDK 開始。
- **「不用框架」依然是有效答案。** 上面那個強化型 LLM 模式只有 20 行 Python。簡單場景用框架純粹是負擔。

## 深入看 Claude Agent SDK

[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview)（最早叫 Claude Code SDK，2025 年底改名）是目前最乾淨的現代 agent harness 範例，因為它就是 Anthropic 自家 Claude Code 在用的同一套 harness——一個實際出貨給終端使用者的 coding agent。意思是它在一個明確的工作負載上被大量實戰磨過，留下的抽象全是真實的傷痕。

幾個有趣的重點：

**1. 工具本身就是介面，不是抽象層。** SDK 內建的工具集很小但很利：`Bash`、`Edit`、`Read`、`Write`、`Glob`、`Grep`、`WebFetch`、`WebSearch`、`Task`（開一個子 agent）。Claude Code 做過的每一個正經 coding 任務都只是這些工具的組合。重點是——你**不需要 50 個工具**，你需要 10 個把某個領域覆蓋乾淨的好工具，然後讓模型去組合它們。

**2. 基於檔案的權限與沙盒。** SDK 預設 agent 跑在一個使用者已經授權特定工具權限的環境，可能是逐目錄的，並且可以阻擋破壞性操作。這就是 harness 層真正存在的理由——**模型是大腦，harness 是手腳，同時也是那條拒絕把手伸進火裡的脊椎**。

**3. 子 agent 是一等公民。** `Task` 工具可以讓主 agent 開出一個完全獨立的 Claude 實例，有自己的脈絡視窗、專屬任務與受限的回報。這也是我在生產環境看過**唯一穩定 work 的多 agent 編排**——把昂貴的搜尋或會污染主脈絡的長工具鏈交給子 agent。

**4. 記憶與技能（skills）。** 後期版本加入了基於檔案的記憶系統（Claude 把 markdown 記憶寫進磁碟、跨 session 保留），還有「skills」——可被名稱呼叫的可重用提示片段。這兩個預設行為都很合理，把一整類本來會自己重寫的黏合程式幹掉。

如果你在建 Claude-first 的東西，讀 SDK 的原始碼是最快搞懂「一個好 agent loop 在實戰中長什麼樣子」的方法，這是一份「該砍掉什麼」的大師級示範。

## OpenHands：開源的通用 agent

Claude Code / Claude Agent SDK 是一個領域聚焦的 coding agent；[OpenHands](https://github.com/All-Hands-AI/OpenHands)（前身 OpenDevin）則是目前最具代表性的**開源**通用軟體工程 agent。如果你想知道在不能仰賴專有工具套件的情況下，建一個 Devin 等級 agent 到底需要什麼，這是你該研究的專案。

它的亮點：

- **預設 runtime 隔離。** OpenHands 會把 agent 的動作跑在 Docker 沙盒裡，有自己的檔案系統和 shell。這是正確答案——你**絕對不**想讓自主 agent 在主機上跑任意 shell——而開源 agent 裡有做到這點的還出乎意料地少。
- **模型無關。** 可以驅動 Claude、GPT-4.x、Gemini、DeepSeek、Qwen、Llama、Hermes 或任何有 tool use 的模型，透過 [LiteLLM](https://github.com/BerriAI/litellm) 串接。這讓它成為 benchmark 最新開源模型在真實 agent 任務上表現的最佳場所之一。
- **瀏覽器是一等工具。** OpenHands 內建 Playwright，agent 能真正讀網頁、與網頁互動，而不只是抓 HTML。這打開一整類純 bash+edit agent 做不到的任務——表單填寫、文件查詢、登入後的後台介面。
- **公開榜單常客。** OpenHands 長期穩定在 [SWE-bench Verified](https://www.swebench.com/) 和 [SWE-Lancer](https://arxiv.org/abs/2502.12115) 的開源前十名。這是 harness 確實有料的具體證據。

代價是複雜度：OpenHands 做的事很多，意味著更多活動零件、更多設定、比「自己寫個 loop」更陡的學習曲線。但如果你想**不簽 NDA**就能端到端研究一個真實的生產 agent harness，它是目前最好的教材。

同個領域另外兩個值得一提：[Aider](https://aider.chat/)——更簡單，聚焦於結對程式設計，處理中小型編輯特別順——以及 [Cline](https://github.com/cline/cline)，一個在 VS Code 裡運作的熱門 agent，哲學跟 Claude Code 相似但嵌在編輯器中。

## Agent 鏈結（chaining）的深度剖析，以及開源模型 Hermes 的位置

「Agent chaining」是個模糊詞，通常會指向三件截然不同的事，把它們混在一起是經典的困惑來源：

### 1. 單一 agent 內部的 tool call 鏈結

模型呼叫工具 A、拿到結果、決定把結果餵給工具 B、再繼續——這就是 agent loop 本身，不需要「chaining」這個抽象。這條鏈的品質幾乎完全取決於三件事：(a) 模型能不能跨輪次把計畫保留在腦袋裡、(b) 工具輸出是否乾淨易解析、(c) 脈絡視窗在膨脹時是否還保持連貫。推理模型（Claude Opus 4.x、GPT-5 / o 系列、Gemini 2.x Thinking）處理長鏈的能力通常比非推理模型強 2–3 倍，特別是需要 10 次以上工具呼叫的任務。

### 2. 跨多次 LLM 呼叫的 prompt / workflow chaining

固定序列：抽取 → 驗證 → 摘要 → 翻譯。每一步都是獨立的 LLM 呼叫，各自有自己的提示詞。這不算 agentic——控制流是寫死的——但當你事先知道步驟時，這才是**正確解法**：更便宜、更快，而且比讓 agent「自己想辦法」好除錯太多。LangChain 的 `RunnableSequence`、LangGraph 的固定邊，或普通 Python 函式，表達的都是同一個模式。

### 3. 多 agent 之間的 handoff

Agent A 完成工作，把狀態交給 agent B，agent B 用不同的角色、提示詞、可能不同的工具繼續。OpenAI Agents SDK 把這變成一等原語，叫 `handoffs`；CrewAI 的整個模型就是角色式 agent 互相傳遞工作。這是在生產環境**最常翻車**的模式——交接邊界就是資訊消失、責任混淆、延遲疊加的地方。少用，且只有在 agent 真的需要不能共存於同一脈絡的不同角色或工具時才用。

### 開源模型的位置：Nous Hermes 系列

如果你要在**開源**模型上建 agent——為了成本、隱私或客製化——問題就變成：哪些開源模型對 tool use 和 chaining 真的夠穩？過去兩年最一致的答案是 [Nous Research 的 Hermes 系列](https://nousresearch.com/)。Hermes 3（基於 Llama 3.1）和比較新的 [Hermes 4](https://nousresearch.com/hermes-4/)（基於 Llama 3.3 與 Qwen）都針對 function calling、結構化輸出、長而連貫的 agent chaining 做了特別微調，使用類似 Claude 的 XML 風格工具呼叫格式。在非專有的 agent 基準裡，它通常穩居開源第一梯隊。

用 Hermes 做 agent 的幾個實務重點：

- **Function calling 是原生且可靠的。** 你給一個 JSON schema 進去，拿到一個格式良好的工具呼叫出來。大多數微調過的 Llama 變體對這件事遠遠不夠穩定。
- **它會認真看待 system prompt。** Hermes 被明確訓練過要在 agent 情境下遵守 system prompt 的限制，這點在開源模型上比想像中重要。
- **用 [vLLM](https://github.com/vllm-project/vllm) 或 [SGLang](https://github.com/sgl-project/sglang) 做推論。** 這兩個推論引擎正確支援工具呼叫的 grammar，吞吐量是原生 Hugging Face `transformers` 的 5–10 倍。
- **在硬多步工具使用上仍落後前沿。** 如果你要一個能關 SWE-bench ticket 的真 agent，Claude 和 GPT-5 還是穩穩領先。Hermes 的位置是「我需要一個有能力的開源模型來做公司內部 agent」，不是「我要全世界最強的 agent」。

如果 Hermes 不合，2026 年 4 月其他值得拉出來 benchmark 的開源模型是：[Qwen 3](https://github.com/QwenLM/Qwen3)（特別是 72B 以及 MoE 變體）、[DeepSeek V3.1](https://api-docs.deepseek.com/news/news250821)，以及配上 Meta 官方 function calling adapter 的 [Llama 3.3 / 4](https://www.llama.com/)。這個領域變化很快，建議每一季重新 benchmark。

## Agent 真正被用在哪裡（2026 年 4 月）

扣掉 demo 和 LinkedIn 炒作，以下是 agent 真正做事的地方：

### 軟體工程

目前最成熟的一類。[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)、[Cursor](https://www.cursor.com/) Agent 模式、[Aider](https://aider.chat/)、[Devin](https://devin.ai/)、[OpenHands](https://github.com/All-Hands-AI/OpenHands) 和一打類似產品，已經能端對端關閉真實 ticket——讀 repo、改檔案、跑測試、開 PR。[SWE-bench](https://www.swebench.com/) 排行榜從 2023 年底的 ~2% 通過率，一路跑到 2026 年 Verified 題組的 70%+。這是 agent 明確越過「在生產環境可用」那條線的領域。

### 深度研究（Deep Research）

可以瀏覽、閱讀、整合，花幾十分鐘產出長篇報告的 agent。OpenAI Deep Research、Google Gemini Deep Research、Anthropic 的等效產品對市場掃描、文獻整理、盡職調查真的有用。輸出很少是「最終版」，但能把 4–8 小時的人工作業壓縮成 ~20 分鐘的監督。

### 客服分流

第一線支援、退款資格檢查、知識庫查詢。不是完全自主——幾乎一定有 human in the loop——但 agent 做搜尋、起草回覆，人類按下送出。ticket 量夠大時經濟效益很好。

### 資料工作流

會寫 SQL、執行、檢查結果、再迭代的 agent。這是 text-to-SQL 終於變有用的原因——agent 能從錯誤的 schema 和誤讀的欄位中自我恢復，而不是第一個錯誤就放棄。

### 還沒真正 work 的方向

- **「Agent 端對端把我的工作做完」** ——demo 很多，生產部署沒有。
- **長時程自主規劃** ——超過幾小時的自主行動會嚴重飄移。
- **非研究型的開放式瀏覽** ——做深度研究還行，要求特定結果就不行。

## 誠實的附註

一些少被提及但重要的事：

### 延遲和成本會疊加

呼叫模型 20 次的 agent 要付 20 倍的錢。粗心實作的 agent 很容易一個任務 5–50 美元。在提示設計階段就要規劃：積極快取、裁剪脈絡、中間步驟用小模型。

### 評估還是一團亂

Agent 的單元測試很難，因為「正確軌跡」通常不只一條。目前主要工具有 [LangSmith](https://smith.langchain.com/)、[Braintrust](https://www.braintrust.dev/)、[Arize Phoenix](https://phoenix.arize.com/) 和 [Langfuse](https://langfuse.com/)。全部都還年輕，沒人真正解決問題。你還是需要人工標記的評估集。

### 安全是被低估的問題

Agent 能呼叫的每個工具都是攻擊面。透過檢索到的文件進行 prompt injection 已經是真實發生過的攻擊類型。在讓 agent 碰任何重要系統之前，[Simon Willison 關於 prompt injection 的文章](https://simonwillison.net/tags/prompt-injection/) 是必讀材料。

### 多 agent 編排幾乎總是太早做

如果一個提示得當、工具齊全的單一 agent 都做不了，一群 agent 通常也做不了；就算能做，也會更慢、更貴、更難除錯。永遠**先單一 agent**。只有在有具體證據顯示專業化有幫助時才拆。

## 接下來會走向哪裡

未來 12 個月我願意下注的兩件事：

1. **Agent 變成「就是 LLM 的用法」。** 聊天和 agent 的界線會模糊，因為每個正經的 LLM 介面都有工具了。有趣的設計問題從「這要不要做成 agent？」變成「它應該有什麼工具？」
2. **評估落差會慢慢收斂。** 像樣的 agent benchmark、更好的 tracing、第一代「agent 原生」的 QA 工具會出現。這會決定誰出得了貨、誰只能 demo。

我**不會**下注的事：完全自主、長時程的 agent 取代知識工作者；一群特化 agent 解決通用問題；或是「一個框架統一所有 agent」。2026 年 4 月真正有用的 agent 長這樣：範圍明確、工具精心設計、取代特定工作流的系統。真正的收穫都在這裡。

## 延伸閱讀

- [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents) — 近期最清楚的整理
- [OpenAI — A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [A Survey on LLM-based Autonomous Agents](https://arxiv.org/abs/2308.11432)
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)
- [SWE-bench](https://www.swebench.com/) — 驅動 coding agent 的基準測試
- [Simon Willison — prompt injection 專欄](https://simonwillison.net/tags/prompt-injection/)

</div>
