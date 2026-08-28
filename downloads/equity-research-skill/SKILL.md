---
name: equity-research
description: Build a local, point-in-time equity research report for a public company from free public sources only — deterministic code does every forecast/DCF/valuation calculation, this skill only researches, cites, drafts prose, and orchestrates. No paid data, no MCP, no API key required. Use when the user gives a stock ticker or company name and asks for equity research, a stock analysis, a DCF valuation, or an investment thesis to be generated for it.
---

# Equity Research

This is the methodology, not a ready-to-run tool. It describes a workflow
and a set of file contracts; the deterministic calculation engine it hands
off to (Step 5) is something you build once and reuse — see
"Fail-Closed Equity Research: Teaching Claude Code Not to Do the Math" at
ytsang.com/insights/fail-closed-equity-research/ for the reasoning and a
worked example of what that engine looks like (forecasting, DCF, sensitivity
tables, and event-to-valuation deltas as plain functions with no model calls
inside them). Wire this skill's Step 5 to your own equivalent before it's
useful end to end.

## Non-negotiables — read before doing anything

1. **Free and public sources only.** Official investor-relations pages,
   regulatory filings (SEC EDGAR, local exchange filings, company websites),
   central-bank/statistics-office data, and a market-price snapshot (Google
   Finance / Yahoo Finance). **Never** assume access to Bloomberg, FactSet,
   S&P Kensho, Daloopa, or any other paid feed — if the user hasn't said
   they have one, they don't. Discovery sources (news aggregators,
   market-data pages) can supply the price snapshot but can never become an
   "audited financial fact" — label them `tier: 3`,
   `license_class: "discovery_only"`.
2. **You never calculate a total, a forecast, or a DCF value.** Every
   number in the report comes out of deterministic code. Your job is
   research (find facts, cite them), judgment (set assumptions, write
   prose), and orchestration (run the pipeline, read its output). If you
   catch yourself doing arithmetic to produce a figure that ends up in the
   report — stop, that number belongs in an assumptions file as an input,
   not typed into prose.
3. **No source, no claim.** Every figure carries a `source_id` pointing at
   an entry in `sources`, with `published_at`, `retrieved_at`, and
   `document_status` (`preliminary` / `preliminary_unaudited` / `audited` /
   `company_disclosure` / etc. — never invent a status, use what the filing
   actually says).
4. **A candidate event is not an approved assumption.** If your research
   turns up a plausible catalyst, add it to `assumptions.json`'s `events`
   list with an honest `probability` — but don't let it silently reshape
   the base-case scenario without the user seeing it first (Step 3).
5. **Preliminary data always trips a review warning; the validator is not
   negotiable.** If validation flags something, that goes in the report as
   a warning — it does not get filtered out to make the report look
   cleaner.

## Process

### Step 0 — Resolve the company and check for existing work

Confirm the ticker, exchange, and reporting currency (ask if the company
name is ambiguous — e.g. multiple listings). If you already have a recent
snapshot for this ticker, tell the user and ask whether to refresh or reuse
it rather than redoing everything. A new or revised filing gets a **new
dated folder** — never overwrite an existing point-in-time snapshot.

### Step 1 — Gather sources

Search for and fetch (web search / fetch — no paid API):
- Most recent 1–2 quarterly/annual results releases from the company's own
  IR site.
- The matching regulatory filing if one exists — read the exact figures off
  the filing itself, don't paraphrase from a news summary.
- A share-count / ownership disclosure (needed for per-share valuation —
  prefer the company's own disclosure over a data provider's implied
  count; if they disagree, keep the company-disclosed count and note the
  mismatch).
- A current market price snapshot (a discovery-tier source is fine for this
  one field).
- Read the releases for explicit **management claims** (guidance, ramp
  plans, customer agreements) — capture them verbatim with a confidence
  level, don't editorialize them into facts.

### Step 2 — Write a source pack

One JSON file per point-in-time snapshot:

```json
{
  "as_of": "YYYY-MM-DDT23:59:59+TZ",
  "issuer": {"name": "...", "ticker": "...", "exchange": "...", "currency": "..."},
  "sources": [
    {"source_id": "...", "tier": 0, "title": "...", "published_at": "...",
     "retrieved_at": "...", "url": "...", "document_status": "...",
     "language": "en", "license_class": "public_company_release"}
  ],
  "reported_periods": [
    {"period": "2Q2026", "period_end": "...", "period_type": "quarter",
     "currency": "...", "unit": "trillion", "consolidated": true,
     "document_status": "preliminary_unaudited", "revenue": 0.0,
     "operating_profit": 0.0, "net_income": 0.0, "cash": 0.0, "debt": 0.0,
     "source_id": "...", "evidence": "which table/section this came from"}
  ],
  "market_snapshot": {"date": "...", "close": 0, "currency": "...",
    "shares_outstanding": 0, "shares_as_of": "...",
    "market_price_source_id": "...", "share_count_source_id": "..."},
  "management_claims": [
    {"claim_id": "...", "claim_type": "management_claim", "text": "...",
     "source_id": "...", "evidence": "...", "confidence": "medium"}
  ]
}
```

List `reported_periods` **oldest to newest** — a QoQ-anomaly check should
diff the last two entries in list order, not by hardcoded period labels.

### Step 3 — Write assumptions, then checkpoint with the user

An assumptions file needs bear/base/bull scenarios (each with a
`probability` — the three must sum to 1 — plus a `wacc` and
`terminal_growth` where `wacc > terminal_growth`), an `events` list (each
with a `probability`, sourced where possible), and a sensitivity grid
(`wacc` / `terminal_growth` combinations). Base every multiplier and margin
assumption on what the sources actually said; where public data can't
support a segment split, say so explicitly rather than inventing precision.

**Show the user the scenario table and event list before running the
pipeline.** This is the one deliberate pause in an otherwise automatic
flow — bad assumptions produce a confident-looking wrong report, and the
whole point of this design is not doing that.

### Step 4 — Write the narrative

Thesis, business drivers, catalyst calendar, risks — none of this should
be hardcoded into your report-rendering code. Keep it in its own file per
company, so the code that assembles a report has no company-specific text
of its own and works unmodified for the next ticker. Every claim here
should trace back to something gathered in Step 1 — this is drafting, not
inventing.

### Step 5 — Run the deterministic pipeline

This is where you hand off to code that isn't an LLM call — your own
implementation of forecasting, DCF, sensitivity, and event-replay logic,
reading the files from Steps 2–4 and writing back a validation result and
a rendered report. If it raises an error about a missing or invalid input,
fix the input file it names; don't work around it by loosening the
validator.

### Step 6 — Surface validation honestly

If the validation status isn't "passed," say so plainly in your summary to
the user — don't let a flagged run read as a clean report.

### Step 7 — Self-score

Scoring "is the thesis falsifiable," "is the evidence strong" is a
judgment call, not arithmetic — a reasonable rubric: business/competitive
evidence, differentiated & falsifiable thesis, financial model & earnings
quality, valuation & internal consistency, catalysts & risks, source
traceability, readability & disclosures. Score honestly and write down, in
plain language, what a paid data source or another quarter of history
would actually add. A low score is a fine outcome — don't grade on a curve
because you wrote it.

### Step 8 — Report back

Tell the user: where the report landed, the validation status, the
headline value-per-share numbers, the quality score, and — explicitly —
what this run couldn't source for free (so they can decide whether it's
worth paying for later, which is a budget decision for them, not something
you solve by picking a different tool).

## Disclosure this skill should carry into every report it produces

State plainly, every time: this is educational output describing a
methodology, not investment advice, and forecast segment splits built on
public data alone are analyst estimates, not company-reported figures.
