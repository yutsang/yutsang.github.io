---
layout: insight
title: "Understanding RAG: Retrieval-Augmented Generation"
title_zh: "認識 RAG：檢索增強生成"
date: 2026-04-01
tags: [Tutorial, AI]
permalink: /insights/understanding-rag/
thumbnail: https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1600&q=90&auto=format&fit=crop
hero_image: https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=2000&q=90&auto=format&fit=crop
excerpt: "A deep dive into Retrieval-Augmented Generation — how it works, why it beats pure fine-tuning for most knowledge tasks, how to build a production pipeline, and how to evaluate it properly."
excerpt_zh: "深入理解檢索增強生成（RAG）：它為什麼有效、為何對大多數知識型任務勝過純微調、如何打造生產級流程，以及如何正確評估。"
---

<div data-lang="en" markdown="1">

## Why RAG exists

Large language models are astonishingly good at language, and astonishingly bad at facts you didn't write into their training data. Ask GPT-4 or Claude about a document your company wrote last week and you'll get a confident guess. Ask about a library version released after training cut-off and you'll get an answer that looks right but references functions that don't exist.

Retrieval-Augmented Generation, introduced by [Lewis et al. (2020)](https://arxiv.org/abs/2005.11401), is the dominant fix. Instead of asking the model to remember everything, you give it an **open book**: at query time, the system searches an external knowledge store, pulls back the most relevant passages, and hands them to the model as part of the prompt. The model's job is no longer recall — it's reading comprehension.

This small architectural change has huge consequences:

- **You can update knowledge in seconds** by re-indexing a document. No retraining.
- **Answers can cite sources.** The exact chunks fed to the model are known.
- **Smaller models suddenly get competitive.** A 7B model with excellent retrieval often beats a 70B model guessing from memory.
- **Private data stays private.** Your proprietary documents live in your own vector database rather than being baked into model weights that might leak.

For the last three years, RAG has been the backbone of essentially every enterprise LLM deployment I've seen — customer support, legal research, internal knowledge bases, medical Q&A, code assistance over private repos. Anthropic's own [introduction to RAG in Claude](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview) makes the same point: for knowledge-intensive tasks, retrieval almost always beats pure fine-tuning.

## The standard pipeline, end to end

A production RAG system has more moving parts than the "vector DB + LLM" cartoon suggests. Here's the full flow:

### 1. Ingestion

You start with raw documents — PDFs, HTML pages, Slack exports, Notion pages, Markdown files. Each has to be:

- **Parsed** into plain text (tools: [Unstructured](https://unstructured.io/), [Apache Tika](https://tika.apache.org/), [pdfplumber](https://github.com/jsvine/pdfplumber), [Docling](https://github.com/docling-project/docling)).
- **Cleaned** of boilerplate, nav chrome, repeated headers.
- **Chunked** into passages small enough that the embedding model can handle them and focused enough that each chunk is about one thing.

Chunking is where most RAG systems quietly bleed quality. A fixed 512-token window that splits mid-sentence is the default, but smarter approaches — semantic chunking, recursive splitting on headers, or sentence-window retrieval — typically improve recall by 10–30%. [LlamaIndex's chunking guide](https://docs.llamaindex.ai/en/stable/optimizing/basic_strategies/basic_strategies/) is a good starting point.

### 2. Embedding and indexing

Each chunk is passed through an embedding model that turns it into a fixed-size vector — usually 384 to 3072 dimensions. This is probably the single most important choice in the entire pipeline, and the one most people make by copy-pasting whatever their tutorial used. Here's a more detailed comparison of what's actually in play in 2026:

#### Paid / hosted embedding APIs

| Model | Dim | Context | Price (per 1M tokens) | MTEB rank (approx) | When to pick it |
| --- | --- | --- | --- | --- | --- |
| [OpenAI `text-embedding-3-large`](https://platform.openai.com/docs/guides/embeddings) | 3072 (Matryoshka) | 8,191 | $0.13 | Top 10–15 | Strong English all-rounder; the boring safe default |
| [OpenAI `text-embedding-3-small`](https://platform.openai.com/docs/guides/embeddings) | 1536 (Matryoshka) | 8,191 | $0.02 | Solid | 80% of the quality at ~15% of the cost |
| [Cohere `embed-multilingual-v3`](https://cohere.com/blog/introducing-embed-v3) | 1024 | 512 | $0.10 | Top for multilingual | The best option if your corpus isn't mostly English |
| [Voyage `voyage-3-large`](https://blog.voyageai.com/2025/01/07/voyage-3-large/) | 1024 (Matryoshka) | 32k | $0.18 | Top 5 | Best-in-class on retrieval; long context; the right choice when quality matters more than cost |
| [Voyage `voyage-code-3`](https://blog.voyageai.com/2024/12/04/voyage-code-3/) | 1024 (Matryoshka) | 32k | $0.18 | SOTA on code retrieval | Source code, documentation, and tech docs |
| [Jina `jina-embeddings-v3`](https://jina.ai/news/jina-embeddings-v3-a-frontier-multilingual-embedding-model/) | 1024 | 8,192 | $0.05 | Competitive multilingual | Good quality/price mix for multilingual and also available open |

"Matryoshka" means you can truncate the vector to a smaller dimension (e.g. 3072 → 512) with graceful quality loss — handy when storage is tight.

#### Free / self-hostable embedding models

If you can run a GPU (or even a decent CPU for the smaller ones), the open-source embedding ecosystem is *extremely* strong in 2026 and often beats paid APIs on specific domains. All of these are one `pip install sentence-transformers` away:

| Model | Dim | Context | Size | Notes |
| --- | --- | --- | --- | --- |
| [`BAAI/bge-m3`](https://huggingface.co/BAAI/bge-m3) | 1024 | 8,192 | 2.3 GB | Multilingual (100+ languages), dense + sparse + multi-vector in one — the open-source default |
| [`BAAI/bge-large-en-v1.5`](https://huggingface.co/BAAI/bge-large-en-v1.5) | 1024 | 512 | 1.3 GB | English, competitive with paid APIs, proven |
| [`intfloat/e5-mistral-7b-instruct`](https://huggingface.co/intfloat/e5-mistral-7b-instruct) | 4096 | 32k | 14 GB | Instruction-tuned, near-SOTA on MTEB; needs a GPU |
| [`nomic-embed-text-v2`](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe) | 768 | 8,192 | 1.3 GB | MoE, fully open training data, Apache 2.0 |
| [`mixedbread-ai/mxbai-embed-large-v1`](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1) | 1024 (Matryoshka) | 512 | 1.3 GB | Strong English retrieval with binary/int8 quantisation support |
| [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | 384 | 256 | 90 MB | The classic fast/cheap baseline — runs on a phone, weak on hard queries |
| [`Alibaba-NLP/gte-Qwen2-7B-instruct`](https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct) | 3584 | 32k | 14 GB | Top open MTEB scores, instruction-tuned |
| [`jinaai/jina-embeddings-v3`](https://huggingface.co/jinaai/jina-embeddings-v3) | 1024 | 8,192 | 2.2 GB | Open weights of Jina's v3, multilingual |

For the vast majority of use cases, `bge-m3` is the most pragmatic free starting point — it's multilingual, handles long chunks, and supports dense + sparse retrieval from the same model. If you're English-only and want the absolute cheapest thing that works, `bge-large-en-v1.5` is still excellent.

The [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) is the standard reference; check it before committing to a model, because rankings shift every few months. But **don't just pick the #1** — the top models are often 7B+ parameters and painfully slow, and the practical winners for production are usually the 300M–1.5B models three or four places down.

#### Practical notes that tutorials skip

- **Never mix embedding models in a single index.** Changing models means re-embedding everything from scratch — plan for this day one.
- **Quantise the vectors.** Most embedding models tolerate int8 or even binary quantisation with <2% recall loss. [Mixedbread's binary quantisation post](https://www.mixedbread.com/blog/binary-mrl) is a great primer; you can cut your storage bill by 32× almost for free.
- **Test on your own data.** The MTEB numbers are averages across diverse tasks. A model that ranks 10th on MTEB can easily rank 1st on your specific domain. Build a small eval set from your real queries before you commit.
- **For code, use a code-specific model.** General text embeddings are mediocre at code search. [Voyage code-3](https://blog.voyageai.com/2024/12/04/voyage-code-3/) and [`Alibaba-NLP/gte-large-en-v1.5`](https://huggingface.co/Alibaba-NLP/gte-large-en-v1.5) fine-tuned on code data are dramatically better.

The vectors then go into a specialised vector database. The main ones as of 2026:

- **[Pinecone](https://www.pinecone.io/)** — fully managed, very low-latency, expensive at scale.
- **[Weaviate](https://weaviate.io/)** — open source, strong hybrid search and built-in ML modules.
- **[Qdrant](https://qdrant.tech/)** — open source, Rust, very fast, good filtering.
- **[Milvus](https://milvus.io/)** — open source, handles billions of vectors, used by Zilliz.
- **[pgvector](https://github.com/pgvector/pgvector)** — Postgres extension. Boring, integrates with everything, usually the right default for <10M documents.

### 3. Retrieval

At query time:

```python
query = "How do we handle refund requests older than 90 days?"
query_vector = embed(query)
results = index.search(query_vector, top_k=20, filter={"doc_type": "policy"})
```

Two things matter here that most tutorials skim over:

**Hybrid search.** Pure vector search misses exact matches on product names, error codes, and SKU numbers. Combining dense retrieval with sparse/BM25 and fusing the scores with [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) reliably beats either alone. Weaviate, Qdrant, and Elasticsearch all support it natively.

**Reranking.** After retrieving, say, 20 candidates with vector search, run them through a cross-encoder reranker ([Cohere Rerank](https://cohere.com/rerank), [BGE reranker](https://huggingface.co/BAAI/bge-reranker-large), [Voyage rerank-2](https://docs.voyageai.com/docs/reranker)) that scores each (query, chunk) pair directly. The top 3–5 after reranking are what you actually send to the LLM. This one step routinely adds 10–20 points to end-to-end accuracy and is worth the latency.

### 4. Generation

The retrieved chunks are stitched into a prompt like:

```
You are a policy assistant. Answer the question using ONLY the context below.
If the context doesn't contain the answer, say "I don't know."

<context>
[chunk 1]
[chunk 2]
[chunk 3]
</context>

Question: {user_query}
```

The phrasing matters more than beginners expect. "Using ONLY the context" and explicit "I don't know" escape hatches materially reduce hallucination. Anthropic's [long context tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips) recommend putting the question *after* the context for the strongest grounding.

## Advanced patterns worth knowing

### Contextual retrieval

Anthropic's [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) (September 2024) is the single biggest quality improvement I've seen in RAG in years. Before embedding each chunk, you first prepend 50–100 tokens of context explaining where the chunk sits in the document. The paper reports a 49% reduction in retrieval failures when combined with reranking. It's cheap, easy to add, and should probably be default.

### HyDE (Hypothetical Document Embeddings)

From [Gao et al. (2022)](https://arxiv.org/abs/2212.10496): instead of embedding the user's question, ask the LLM to *hallucinate* a plausible answer, then embed that answer and search with it. Sounds backwards, works surprisingly well for queries phrased very differently from the source documents.

### Query decomposition

For complex questions ("What changed in our refund policy between Q1 and Q3, and which rule caused the most tickets?"), decompose into sub-questions, retrieve for each, and synthesise. LangChain's [MultiQueryRetriever](https://python.langchain.com/docs/how_to/MultiQueryRetriever/) and LlamaIndex's [SubQuestionQueryEngine](https://docs.llamaindex.ai/en/stable/examples/query_engine/sub_question_query_engine/) both do this out of the box.

### Agentic RAG

The newer frontier: let the LLM *decide* when and how to retrieve, rather than retrieving eagerly for every query. This turns retrieval into a tool call. Works beautifully with [Claude's tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) and [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling). Latency goes up but quality on multi-hop questions goes up more.

## Evaluation: the part everyone skips

Most RAG systems in production are never properly evaluated, which is why they quietly rot. At minimum you need three metrics:

1. **Context relevance** — are the retrieved chunks actually about the query?
2. **Faithfulness** — does the generated answer stick to what's in the context (no hallucination)?
3. **Answer correctness** — is the final answer actually right (requires ground truth)?

Both [Ragas](https://github.com/explodinggradients/ragas) and [TruLens](https://www.trulens.org/) implement these as LLM-as-judge metrics. You run them against a labelled evaluation set — even 50 hand-labelled (query, good answer) pairs is enough to catch major regressions. Run evaluation on every change: new chunker, new embedding model, new prompt.

## Common pitfalls

From watching far too many RAG prototypes fail in production:

- **Too much retrieved context.** More isn't better. 3–5 high-quality chunks beats 20 noisy ones. Long context models can handle more but accuracy still degrades (see [Lost in the Middle](https://arxiv.org/abs/2307.03172)).
- **No chunk overlap.** Information straddling chunk boundaries disappears. 10–20% overlap fixes this.
- **Treating retrieval as static.** Documents change. Rebuild the index on a schedule, not just when something breaks.
- **Ignoring the metadata.** Filter by `doc_type`, `date`, `author`, `version` before the vector search. It's free accuracy.
- **No fallback.** If retrieval finds nothing, your LLM will cheerfully make something up. Return "I don't know" explicitly.
- **Skipping evaluation because it's hard.** It is hard. It's still mandatory.

## Free learning resources worth your time

Before paid courses or fancy frameworks, there is a surprisingly high-quality free stack that will take you from "I've heard of embeddings" to "I can build and debug a production RAG system." In rough order of how I'd progress through it:

### Start with the fundamentals

- **[Andrej Karpathy — Neural Networks: Zero to Hero](https://karpathy.ai/zero-to-hero.html)** — nine long-form video lectures that build GPT from scratch in PyTorch. If you don't deeply understand *why* transformers and embeddings work, everything in RAG feels like folklore. This series fixes that, for free, and it's genuinely the best ML teaching material on the internet. Start with `micrograd` and go through `makemore` → `nanoGPT` → `GPT-2` → `Let's reproduce GPT-2` → [`Deep Dive into LLMs like ChatGPT`](https://www.youtube.com/watch?v=7xTGNNLPyMI) (the ~3.5-hour primer he released in early 2025).
- **[Karpathy — Let's build the GPT Tokenizer](https://www.youtube.com/watch?v=zduSFxRajkE)** — an underrated standalone 2-hour video that makes tokenisation and BPE click. Essential because most "weird" embedding bugs are actually tokenisation bugs.
- **[Karpathy — nanoGPT](https://github.com/karpathy/nanoGPT)** — minimal GPT implementation (~300 lines) that you can train end-to-end on a laptop. Best way to stop seeing LLMs as magic.
- **[Karpathy — llm.c](https://github.com/karpathy/llm.c)** — the same thing in pure C/CUDA. For people who want to see every byte.

### Then move to embeddings and retrieval specifically

- **[Cohere — LLM University: Embeddings & Semantic Search](https://cohere.com/llmu)** — free, well-structured, code-heavy. Vendor-branded but the concepts transfer to any stack.
- **[Hugging Face — NLP Course, chapter on embeddings](https://huggingface.co/learn/nlp-course/)** — free, practical, uses sentence-transformers.
- **[Sebastian Raschka — Build a Large Language Model (From Scratch) — free GitHub repo](https://github.com/rasbt/LLMs-from-scratch)** — companion code to his book; the embedding and attention chapters are particularly good.
- **[Pinecone Learning Center](https://www.pinecone.io/learn/)** — the best practical hub on vector search, hybrid retrieval, and production RAG patterns. Vendor-branded again but genuinely vendor-neutral in content.
- **[Vespa — RAG blog series](https://blog.vespa.ai/)** — the deepest writing on production-scale retrieval I know of, especially the hybrid-search and ColBERT posts.

### Reference material to keep open in a tab

- **[MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard)** — check before picking any embedding model.
- **[sentence-transformers documentation](https://www.sbert.net/)** — the practical Python library for every open embedding model above.
- **[LlamaIndex documentation](https://docs.llamaindex.ai/)** — the most opinionated, production-oriented RAG framework.
- **[RAGatouille](https://github.com/AnswerDotAI/RAGatouille)** — the easiest way to run ColBERT-style late-interaction retrieval; shockingly effective on hard queries.

If you only have time for one thing: watch Karpathy's [Deep Dive into LLMs](https://www.youtube.com/watch?v=7xTGNNLPyMI) end-to-end. It won't teach you RAG specifically, but it will give you the mental model you need to reason about *why* a retrieval pipeline behaves the way it does. Every other RAG resource becomes ~3× more useful after that.

## Further reading

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — the original paper
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — the biggest practical improvement in years
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — why "just use a longer context window" isn't a fix
- [ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT](https://arxiv.org/abs/2004.12832) — late interaction, still one of the strongest retrievers on hard queries
- [Text Embeddings by Weakly-Supervised Contrastive Pre-training (E5)](https://arxiv.org/abs/2212.03533) — the paper behind most modern open embedding models
- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147) — the trick that lets you truncate vectors without retraining

</div>

<div data-lang="zh" markdown="1">

## 為什麼需要 RAG

大型語言模型在語言上令人驚嘆，但對於沒有寫進訓練資料的事實，表現可以說慘不忍睹。你問 GPT-4 或 Claude 一份公司上星期寫的文件，它會自信地猜答案；問它訓練截止日之後才發布的函式庫版本，你會得到一個看起來對、但函式根本不存在的回覆。

[Lewis 等人（2020）](https://arxiv.org/abs/2005.11401) 提出的檢索增強生成（Retrieval-Augmented Generation，RAG）就是解決這件事的主流方法。你不再要求模型把所有東西記在腦袋裡，而是給它一本**打開的參考書**：在查詢時，系統會到外部知識庫搜尋最相關的段落，然後把這些內容放進提示詞。模型的工作從「回憶」變成「閱讀理解」。

這個小小的架構改變帶來巨大影響：

- **知識可以秒級更新**——只要重建索引即可，不用重新訓練。
- **回答可以附上來源**——送進模型的 chunk 都是已知的。
- **小模型突然具競爭力**——7B 模型配上優秀的檢索，常勝過 70B 模型單靠記憶。
- **私有資料能真正留在公司內部**——專有文件放在自己的向量資料庫，而不是被寫進可能洩漏的模型權重。

過去三年，我看過的幾乎每一個企業 LLM 部署都以 RAG 為核心：客服、法律研究、內部知識庫、醫療問答、私有程式庫的程式協助。Anthropic 自己的 [Claude RAG 文件](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview) 也指出相同結論：對於知識密集型任務，檢索幾乎永遠勝過純微調。

## 完整的 RAG 流程

真實的 RAG 系統比「向量庫 + LLM」的卡通圖要複雜得多。完整流程如下：

### 1. 資料攝取（Ingestion）

原始文件可能是 PDF、HTML、Slack 匯出、Notion 頁面、Markdown。每一份都要：

- **解析**成純文字（工具：[Unstructured](https://unstructured.io/)、[Apache Tika](https://tika.apache.org/)、[pdfplumber](https://github.com/jsvine/pdfplumber)、[Docling](https://github.com/docling-project/docling)）。
- **清理**掉樣板、導覽列、重複的頁首。
- **切片（Chunking）**成嵌入模型能吃得下、且每一塊只講一件事的段落。

大多數 RAG 系統在切片這一步就默默漏水了。預設的 512 token 固定視窗會在句子中間切斷；更聰明的做法——語意切片、按標題遞迴切分、句子視窗檢索——通常能把召回率提高 10–30%。[LlamaIndex 的切片指南](https://docs.llamaindex.ai/en/stable/optimizing/basic_strategies/basic_strategies/) 是很好的起點。

### 2. 嵌入與索引

每一塊 chunk 透過嵌入模型轉為固定長度的向量——通常是 384 到 3072 維。這大概是整條流程裡**最關鍵的一個選擇**，也是多數人從教學範例直接複製貼上的那一步。2026 年實際在檯面上的選項，詳細比較如下：

#### 付費 / 託管嵌入 API

| 模型 | 維度 | 脈絡 | 價格（每百萬 token） | MTEB 排名 | 何時選它 |
| --- | --- | --- | --- | --- | --- |
| [OpenAI `text-embedding-3-large`](https://platform.openai.com/docs/guides/embeddings) | 3072（Matryoshka） | 8,191 | $0.13 | 前 10–15 | 英文全能型、保守的預設選項 |
| [OpenAI `text-embedding-3-small`](https://platform.openai.com/docs/guides/embeddings) | 1536（Matryoshka） | 8,191 | $0.02 | 扎實 | 約 80% 品質、約 15% 成本 |
| [Cohere `embed-multilingual-v3`](https://cohere.com/blog/introducing-embed-v3) | 1024 | 512 | $0.10 | 多語第一梯隊 | 若語料不是以英文為主，這是首選 |
| [Voyage `voyage-3-large`](https://blog.voyageai.com/2025/01/07/voyage-3-large/) | 1024（Matryoshka） | 32k | $0.18 | 前 5 | 檢索品質最頂、長脈絡；品質比成本重要時就選它 |
| [Voyage `voyage-code-3`](https://blog.voyageai.com/2024/12/04/voyage-code-3/) | 1024（Matryoshka） | 32k | $0.18 | 程式檢索 SOTA | 原始碼、文件、技術說明 |
| [Jina `jina-embeddings-v3`](https://jina.ai/news/jina-embeddings-v3-a-frontier-multilingual-embedding-model/) | 1024 | 8,192 | $0.05 | 多語有競爭力 | 多語且性價比佳，也有開源版本 |

「Matryoshka」代表向量可以被截短（例如 3072 → 512）並以優雅的方式損失品質——儲存緊張時特別好用。

#### 免費 / 可自架的嵌入模型

如果你能跑 GPU（甚至小一點的模型用一般 CPU 也行），2026 年開源嵌入生態**極強**，在特定領域經常打敗付費 API。以下全部都是 `pip install sentence-transformers` 就能用：

| 模型 | 維度 | 脈絡 | 體積 | 備註 |
| --- | --- | --- | --- | --- |
| [`BAAI/bge-m3`](https://huggingface.co/BAAI/bge-m3) | 1024 | 8,192 | 2.3 GB | 多語（100+）、單一模型同時提供 dense + sparse + multi-vector——開源預設選項 |
| [`BAAI/bge-large-en-v1.5`](https://huggingface.co/BAAI/bge-large-en-v1.5) | 1024 | 512 | 1.3 GB | 英文、品質媲美付費 API、歷經考驗 |
| [`intfloat/e5-mistral-7b-instruct`](https://huggingface.co/intfloat/e5-mistral-7b-instruct) | 4096 | 32k | 14 GB | 指令微調、MTEB 接近 SOTA；需 GPU |
| [`nomic-embed-text-v2`](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe) | 768 | 8,192 | 1.3 GB | MoE、訓練資料完全開源、Apache 2.0 |
| [`mixedbread-ai/mxbai-embed-large-v1`](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1) | 1024（Matryoshka） | 512 | 1.3 GB | 英文檢索強、支援二值 / int8 量化 |
| [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | 384 | 256 | 90 MB | 經典快又便宜的 baseline——手機上都能跑，難題會輸 |
| [`Alibaba-NLP/gte-Qwen2-7B-instruct`](https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct) | 3584 | 32k | 14 GB | 開源 MTEB 頂尖、指令微調 |
| [`jinaai/jina-embeddings-v3`](https://huggingface.co/jinaai/jina-embeddings-v3) | 1024 | 8,192 | 2.2 GB | Jina v3 的開源權重、多語 |

絕大多數情境下，**`bge-m3` 是最務實的免費起點**——多語、能吃長 chunk，單一模型就能同時做 dense + sparse 檢索。如果只做英文、想要絕對最便宜又能用的選項，`bge-large-en-v1.5` 至今依然優秀。

[MTEB 排行榜](https://huggingface.co/spaces/mteb/leaderboard) 是標準參考，選模型之前務必先看。但**不要只看榜首**——頂尖模型常常是 7B+ 參數、速度慢到令人痛苦，生產環境真正的贏家通常是往下三四名的 300M–1.5B 模型。

#### 教學不會講的實戰細節

- **永遠不要在單一索引內混用嵌入模型。** 換模型就得從零重新 embed，這件事要從第一天就規劃。
- **把向量量化。** 多數嵌入模型容忍 int8 甚至二值量化，且 recall 損失 <2%。[Mixedbread 的二值量化部落格](https://www.mixedbread.com/blog/binary-mrl) 是不錯的入門；儲存費用可以幾乎免費砍掉 32 倍。
- **在自己的資料上測。** MTEB 的數字是跨多樣任務的平均。在你的特定領域，MTEB 排第 10 的模型很可能比第 1 還好。動手前先用真實查詢做一組小評估集。
- **程式碼用專用模型。** 通用文字嵌入處理程式碼檢索的能力相當平庸。在程式碼上微調過的 [Voyage code-3](https://blog.voyageai.com/2024/12/04/voyage-code-3/) 和 [`Alibaba-NLP/gte-large-en-v1.5`](https://huggingface.co/Alibaba-NLP/gte-large-en-v1.5) 明顯好得多。

向量會存進專用的向量資料庫，2026 年主流選擇：

- **[Pinecone](https://www.pinecone.io/)**——全託管、延遲極低、大規模成本高。
- **[Weaviate](https://weaviate.io/)**——開源，混合搜尋強、內建 ML 模組。
- **[Qdrant](https://qdrant.tech/)**——開源、Rust 實作、速度快、filter 功能好。
- **[Milvus](https://milvus.io/)**——開源，能處理上億向量。
- **[pgvector](https://github.com/pgvector/pgvector)**——Postgres 擴充，與既有系統整合簡單，一千萬文件以下通常選它就對了。

### 3. 檢索（Retrieval）

查詢時：

```python
query = "如何處理超過 90 天的退款申請？"
query_vector = embed(query)
results = index.search(query_vector, top_k=20, filter={"doc_type": "policy"})
```

兩個教學裡常略過、但極其重要的細節：

**混合搜尋。** 純向量搜尋對商品名、錯誤碼、SKU 這類精確比對會漏。把 dense 檢索和 sparse/BM25 結合，用 [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) 融合分數，穩定比兩者單獨表現都好。Weaviate、Qdrant、Elasticsearch 都原生支援。

**重排（Reranking）。** 用向量搜尋拿到 20 個候選後，丟進 cross-encoder 重排器（[Cohere Rerank](https://cohere.com/rerank)、[BGE reranker](https://huggingface.co/BAAI/bge-reranker-large)、[Voyage rerank-2](https://docs.voyageai.com/docs/reranker)）重新打分，只把最終前 3–5 名送進 LLM。這一步能讓端對端準確率提高 10–20 分，絕對值得那點延遲。

### 4. 生成（Generation）

把檢索到的 chunk 組進提示詞，例如：

```
你是一位政策助理，只能根據以下脈絡回答問題。
如果脈絡裡沒有答案，請回答「我不知道」。

<context>
[chunk 1]
[chunk 2]
[chunk 3]
</context>

問題：{user_query}
```

措辭的影響比新手想像中大：「只能根據脈絡」和明確的「我不知道」後路能顯著降低幻覺。Anthropic 的 [長脈絡提示建議](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips) 指出把問題放在脈絡**之後**效果最佳。

## 值得認識的進階技巧

### Contextual Retrieval

Anthropic 於 2024 年 9 月發表的 [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) 是我這幾年看到 RAG 品質最大的一次提升。嵌入每個 chunk 之前，先加上 50–100 個 token 的脈絡，說明這塊 chunk 在文件中的位置與背景。配合重排後，檢索失敗率降低 49%。做法簡單，應該成為預設。

### HyDE（假設文件嵌入）

[Gao 等人（2022）](https://arxiv.org/abs/2212.10496) 提出：不要直接嵌入使用者的問題，而是讓 LLM 先「幻想」一個可能的答案，再把這個答案拿去嵌入與搜尋。聽起來反直覺，但對措辭與原文差距很大的查詢效果意外地好。

### 查詢分解（Query decomposition）

面對複雜問題（「退款政策在 Q1 到 Q3 之間改了什麼？哪一條規則造成最多客訴？」），把問題拆成子問題、分別檢索、再整合。LangChain 的 [MultiQueryRetriever](https://python.langchain.com/docs/how_to/MultiQueryRetriever/) 和 LlamaIndex 的 [SubQuestionQueryEngine](https://docs.llamaindex.ai/en/stable/examples/query_engine/sub_question_query_engine/) 都有現成實作。

### Agentic RAG

新一代做法：讓 LLM 自己決定何時、如何檢索，而不是對每個查詢都盲目搜尋。檢索變成一個工具呼叫。這與 [Claude 的 tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) 和 [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling) 配合得很好。延遲會增加，但多跳推理題的品質上升更多。

## 評估：大家都跳過的部分

實務上大多數 RAG 系統從未被好好評估，所以它們會悄悄腐爛。至少要三個指標：

1. **脈絡相關性** — 檢索回來的 chunk 真的和查詢相關嗎？
2. **忠實度（Faithfulness）** — 生成的答案是否只用了脈絡裡的資訊（沒有幻覺）？
3. **答案正確性** — 最終答案是否真的對（需要 ground truth）？

[Ragas](https://github.com/explodinggradients/ragas) 和 [TruLens](https://www.trulens.org/) 都以 LLM-as-judge 的方式實作這些指標。只要有一組標記過的評估資料——哪怕只有 50 對（查詢、正確答案）——就足以在每次改動時抓出明顯退步。每次更換 chunker、嵌入模型、提示詞，都應該重跑一次。

## 常見陷阱

看過太多 RAG 原型在生產環境倒掉，整理出以下清單：

- **塞太多脈絡**——越多不等於越好。3–5 個高品質 chunk 勝過 20 個雜訊。長脈絡模型能吞更多，但準確率依然會下降（見 [Lost in the Middle](https://arxiv.org/abs/2307.03172)）。
- **切片不重疊**——跨越切點的資訊會消失。10–20% 的重疊就能解決。
- **把檢索當成一次性的**——文件會變。索引要定期重建，而不是出事才重建。
- **忽略 metadata**——先用 `doc_type`、`date`、`author`、`version` 過濾，再向量搜尋，這是免費的準確率。
- **沒有 fallback**——檢索找不到東西時，LLM 會很開心地編造。請明確回「我不知道」。
- **因為麻煩就跳過評估**——它確實麻煩，但依然是必修。

## 值得投入時間的免費學習資源

在付費課程和花俏框架之前，其實有一整套免費資源足以把你從「聽過 embeddings」帶到「能打造並除錯一個生產級 RAG 系統」。以我會走的順序排列：

### 從基礎開始

- **[Andrej Karpathy — Neural Networks: Zero to Hero](https://karpathy.ai/zero-to-hero.html)**——九場長影片，從零在 PyTorch 裡把 GPT 蓋出來。如果你沒有真正理解 transformer 和 embedding **為什麼**能 work，RAG 的一切都會像民俗傳說。這個系列免費修正這一點，而且是我看過最好的 ML 教材。從 `micrograd` 開始，依序 `makemore` → `nanoGPT` → `GPT-2` → `Let's reproduce GPT-2` → [`Deep Dive into LLMs like ChatGPT`](https://www.youtube.com/watch?v=7xTGNNLPyMI)（他 2025 年初釋出的約 3.5 小時入門）。
- **[Karpathy — Let's build the GPT Tokenizer](https://www.youtube.com/watch?v=zduSFxRajkE)**——一個被低估的獨立 2 小時影片，會讓你把 tokenisation 和 BPE 一次搞通。必看，因為「怪怪的」embedding bug 多半其實是 tokenisation bug。
- **[Karpathy — nanoGPT](https://github.com/karpathy/nanoGPT)**——極簡的 GPT 實作（約 300 行），筆電就能端對端訓練。把 LLM 從魔法變回工程的最快途徑。
- **[Karpathy — llm.c](https://github.com/karpathy/llm.c)**——同一件事用純 C/CUDA 再寫一次。給想看每一個 byte 的人。

### 再進到嵌入與檢索

- **[Cohere — LLM University：Embeddings & Semantic Search](https://cohere.com/llmu)**——免費、結構清楚、大量程式碼。雖然帶廠牌，但概念可以轉到任何技術棧。
- **[Hugging Face — NLP Course，嵌入章節](https://huggingface.co/learn/nlp-course/)**——免費、實戰、以 sentence-transformers 為基礎。
- **[Sebastian Raschka — Build a Large Language Model (From Scratch) 免費 GitHub repo](https://github.com/rasbt/LLMs-from-scratch)**——他著作的配套程式碼，嵌入與 attention 章節特別值得一讀。
- **[Pinecone Learning Center](https://www.pinecone.io/learn/)**——我知道最好的向量搜尋、混合檢索、生產 RAG 模式實務資源中心。雖然掛著廠牌，內容本身是中立的。
- **[Vespa — RAG 部落格系列](https://blog.vespa.ai/)**——我看過對生產級大規模檢索寫得最深的內容，特別是混合搜尋和 ColBERT 的幾篇。

### 一直開在分頁的參考資料

- **[MTEB 排行榜](https://huggingface.co/spaces/mteb/leaderboard)**——選嵌入模型前一定要看。
- **[sentence-transformers 官方文件](https://www.sbert.net/)**——上面那張表裡所有開源模型的實務 Python 函式庫。
- **[LlamaIndex 官方文件](https://docs.llamaindex.ai/)**——最有主張、最偏向生產環境的 RAG 框架。
- **[RAGatouille](https://github.com/AnswerDotAI/RAGatouille)**——跑 ColBERT 式 late-interaction 檢索最簡單的方式；對難題有驚人的效果。

如果只能選一個：把 Karpathy 的 [Deep Dive into LLMs](https://www.youtube.com/watch?v=7xTGNNLPyMI) 完整看完。它不會教你 RAG 本身，但會給你一個必要的心智模型，讓你能推理**為什麼**一條檢索流程會有那樣的行為。看完之後，其他 RAG 資源的效率大約會變成 3 倍。

## 延伸閱讀

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — 原始論文
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — 幾年來 RAG 最大的實務進展
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — 為什麼「直接用更長的 context」不是解法
- [ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT](https://arxiv.org/abs/2004.12832) — late interaction，至今仍是難題上最強的檢索器之一
- [Text Embeddings by Weakly-Supervised Contrastive Pre-training (E5)](https://arxiv.org/abs/2212.03533) — 多數現代開源嵌入模型背後的論文
- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147) — 不用重訓就能截短向量的關鍵技巧

</div>
