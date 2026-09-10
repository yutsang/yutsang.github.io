---
layout: insight
title: "The Agent Can't Grade Its Own Work"
title_zh: "Agent 沒辦法給自己評分"
date: 2026-09-10
tags: [AI, Agents, Engineering]
permalink: /insights/agent-cant-grade-itself/
thumbnail: https://images.unsplash.com/photo-1564457461758-8ff96e439e83?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1564457461758-8ff96e439e83?w=2000&q=90&auto=format&fit=crop
excerpt: "This year's agent-trust debate keeps reaching for the same fix: have one LLM grade another's output. A 2026 paper tested that at scale and found the best LLM judge barely beats a coin flip, beaten easily by a decades-old text-similarity script. A look at what Anthropic, OpenAI, AWS, and one production team are actually converging on instead, and how a pipeline already built here fits the same pattern."
excerpt_zh: "今年關於 agent 信任問題的討論，常常導向同一個解法：找另一個 LLM 去審查前一個的輸出。一篇 2026 年的論文大規模測試過這個做法，發現表現最好的 LLM judge 只是勉強贏過擲硬幣，還輸給一個幾十年前已經存在的文字相似度演算法。整理 Anthropic、OpenAI、AWS，與一個 production 團隊實際收斂到的方向，並對照已經跑在這裡的一套 pipeline。"
---

<div data-lang="en" markdown="1">

## Trust became this year's actual bottleneck

Gartner published its first standalone Hype Cycle for Agentic AI on April 2, 2026, breaking it out from the general AI hype cycle for the first time. Twenty-seven agentic technologies made the list. Most sit at the Peak of Inflated Expectations, on their way down.

The adoption numbers back that up. Gartner's own CIO survey found 17% of organizations had actually deployed an AI agent, 42% planning to within a year, and 22% more within two. Gartner is forecasting that 40% of agentic AI projects get canceled by the end of 2027, for three reasons that keep recurring: cost overruns, unclear ROI, governance failures.

The failures behind that forecast are concrete. Agents hallucinating approvals inside procurement workflows. A single multi-agent loop burning through a five-figure API bill overnight. Write operations against a production system going out with no human ever in the loop.

## The obvious fix doesn't hold up

The instinctive answer to "how do we know the agent's output is right" is to have a second model check the first one's work. It's cheap to build, and it scales the way the rest of the system does. It also feels like verification, which is exactly the problem.

A 2026 paper out of the University of Colorado, submitted to an ICML workshop, tested that instinct at scale. The authors ran 9,876 tau2-bench trajectories and 1,879 AppWorld trajectories through five LLM judges, each tried with five prompting strategies. The best combination scored an AUROC of 0.65 on tau2-bench and 0.54 on AppWorld — on the harder benchmark, barely better than a coin flip.

Buried in the same paper: a plain TF-IDF text-similarity detector, no LLM involved, scored 0.83 to 0.95 AUROC across both benchmarks, running 3,300 times faster than any of the judges tested. A method from the 1970s, just counting overlapping words, beat every judge built on a frontier model.

## A number worth being suspicious of

A "37% gap between benchmark scores and real-world performance" figure has been circulating in agent-reliability writing all year. Tracing it back, the primary source is a Kili Technology blog post introducing their own in-house evaluation framework. It's a real number from a real company, but a vendor blog with an undisclosed methodology, not a peer-reviewed result. A second site citing the same "roughly 37%" doesn't show independent methodology either, and reads more like a re-citation than a second measurement.

The same source's other number is more usable precisely because it's disclosed: 56.6% task success across 6,259 real agent trajectories, a stated sample against a stated outcome.

Numbers that get repeated often enough start to feel verified without ever being checked. I've caught myself doing exactly that, more than once.

## What's actually converging

Anthropic's own "Building Effective Agents" guide recommends running guardrails as a separate model instance from the one producing the output, plus a distinct reflection step where a second pass evaluates the first against explicit criteria.

OpenAI's 2026 Agents SDK reframes the whole problem: not "call a model," but "safely run a loop," with sandboxed execution, permission boundaries, durable resumable state, and human approval gates in front of anything sensitive. OpenAI is also shutting down its own static Evals platform this year, read-only from October 31, gone by November 30. It's a quiet admission that a fixed benchmark harness isn't the long-term answer either.

AWS shipped something more structural in August: Dogwood, a runtime policy layer built on their Cedar authorization language, extended with temporal logic so a rule can reference a sequence of past actions rather than just the current one. A rule can block a tool once an agent has touched sensitive data, evaluated deny-by-default, and the agent never sees the policy logic, so no amount of clever prompting routes around a rule it can't read.

And from an actual production team: Replit has written about deliberately moving away from a single agent handling many tools, specifically because that raised the error rate, toward many agents each scoped to the smallest task that makes sense.

## What this already looks like, built

None of this is hypothetical for me. The [equity-research pipeline](/insights/fail-closed-equity-research/) I wrote up last month does a version of every pattern above, without having read any of these papers first. The validation module the model can't see or influence borrows directly from Dogwood's policy separation. Before the pipeline runs at all, a human sees the assumptions, the one deliberate pause in an otherwise automatic process, and about as close to staged autonomy as a personal project gets. Every run also leaves behind a point-in-time, immutable snapshot, which is what a durable checkpoint looks like without the enterprise tooling around it.

## The actual question

"How capable is this agent" is the wrong first question. The one worth asking is narrower: what, other than another copy of the same model, is checking its work? Every source here disagrees with the others on plenty. Different architecture, different vendor, different idea of what problem they're even solving. All the same, they land on the same answer. Something outside the model. Something the model can't argue with.

</div>

<div data-lang="zh" markdown="1">

## 信任成為今年真正的瓶頸

Gartner 今年4月2日發表首份獨立的《Hype Cycle for Agentic AI》，第一次將 agentic AI 從整體 AI hype cycle 中分拆出來。榜上27項 agentic 技術，大部分處於 Peak of Inflated Expectations，即將步入下跌段。

採用數字印證了這個判斷。Gartner 自己的 CIO 調查發現，只有17%機構已經部署 AI agent，42%打算一年內部署，另外22%打算兩年內部署。Gartner 預測到2027年底，40%的 agentic AI 項目會被取消，原因離不開三個：成本超支、ROI 不明、治理出事。

背後的具體失敗例子並不抽象。Agent 在 procurement workflow 中幻覺出批核；一個 multi-agent loop 一晚燒掉五位數美元的 API 費用；write operation 直接送到 production 系統，全程沒有人手審批。

## 直覺的解法經不起考驗

如何確認 agent 的輸出正確？最直覺的答案，是找第二個 model 去審查第一個的輸出。這個做法便宜，容易搭建，擴展方式同系統其餘部分一樣。感覺上也像驗證，其實只是樣子像。

University of Colorado 今年一篇提交 ICML workshop 的論文，實際大規模測試了這個做法。作者用五個不同的 LLM judge，每個再配五種 prompt 策略，跑過9,876條 tau2-bench 軌跡與1,879條 AppWorld 軌跡。最好的組合，在 tau2-bench 拿到 AUROC 0.65，在 AppWorld 只有0.54，後者跟擲硬幣的機率已經相差無幾。

同一篇論文裡面，一個純粹計算文字相似度的 TF-IDF 檢測器，沒用到任何 LLM，分數卻拿到0.83至0.95 AUROC，速度快3,300倍。一個1970年代已經存在的方法，只計算字面重疊多少，贏過每一個用前沿 model 做的 judge。

## 一個值得懷疑的數字

「benchmark 分數與真實表現相差37%」這個數字，今年在討論 agent 可靠度的文章裡到處出現。追查下去，一手來源是 Kili Technology 自己發表的 blog post，介紹自家建立的一套評估框架。這是一個真實公司給出的真實數字，但方法論沒有公開，不是 peer-reviewed 的結果。另一個網站引用同一個「約37%」，同樣沒有展示獨立方法論，讀起來更像轉載，不算一次獨立的測量。

同一個來源另一個數字反而更值得用，正正因為它公開了細節：6,259條真實 agent 軌跡裡面，任務成功率56.6%，樣本數與結果都寫得清楚。

一個講法足夠合理，被重複得足夠多次，就會開始讓人感覺已經查證過，其實從來沒有人查過。這件事自己都做過不止一次。

## 業界正在收斂的方向

Anthropic 自己發表的《Building Effective Agents》指引，建議 guardrail 交由另一個獨立的 model instance 負責，不要讓同一個負責輸出的 model 自己審查自己，再加一個獨立的 reflection 步驟，讓第二次檢視根據明確準則審查第一次的結果。

OpenAI 2026年推出的 Agents SDK，重新定義了整個問題：不是「call 一個 model」，而是「安全地跑一個 loop」，包括 sandbox 隔離執行、permission boundary、可恢復的 durable state，以及敏感動作前面的人手批准。OpenAI 今年同時關閉自己的靜態 Evals 平台，10月31日轉做 read-only，11月30日徹底下線，某程度上等於承認，固定的 benchmark harness 也不是長遠答案。

AWS 在8月推出一樣更根本的東西：Dogwood。這是一個 runtime policy 層，建基於他們自己的 Cedar authorization language。加上 temporal logic 之後，政策可以參照一連串過去的動作，不止當下這一步。一條規則可以要求「agent 一旦碰過敏感資料，就封鎖某個 tool」，全部 deny-by-default 執行，Agent 本身看不到政策邏輯，再聰明的 prompt 都繞不過一條讀不到的規則。

再有一個真實 production 團隊的說法：Replit 寫過他們刻意由一個負責眾多 tool 的單一 agent，轉去多個各自負責最小任務的獨立 agent，原因很直接：單一 agent 管太多 tool，error rate 會上升。

## 這套設計已經跑緊

這一切對我來說都不是假設。上個月寫過的[equity-research pipeline](/insights/fail-closed-equity-research/)，在讀到這批論文之前，已經實現了上面提到的每一種做法。model 摸不到、看不到的驗證模組，直接借用了 Dogwood 那種 policy 分離的思路。Pipeline 執行之前，一定會停一停，等人看過 assumptions——這是整個流程裡唯一刻意留下的停頓，大概就是 staged autonomy 落地的樣子。每一次 run 也留下一個 point-in-time、不可更改的快照，等於一個沒有企業級工具支撐的 durable checkpoint。

## 真正值得問的問題

「這個 agent 有幾強」是錯的第一條問題。真正值得問的更窄：除了同一個 model 的另一個副本之外，還有什麼在檢查它的工作？這裡引用的每一個來源，架構不同，廠商不同，甚至連自己在解決什麼問題都講法不一，卻全部落在同一個答案上。Model 以外的東西。一種連 model 自己都駁不倒的東西。

</div>
