# Week 2 Baseline Assessment — Technical

Assessment of the Customer Inbox Triage app, the changes made, and the
evidence behind them. The "before" behaviour can be reproduced at any time with
`git show HEAD~1:src/utils/urgencyScorer.js` etc.

## 1. Summary

The app's stated purpose is to *prioritise and route* inbound support messages
so a team can "handle more customer volume without hiring". Before this change
it could not reliably do either. The classifier was right roughly a third of the
time, the priority score was actively inverted for the highest-severity cases,
and nothing was routed anywhere.

The three areas below are ordered by business impact.

---

## 2. Top 3 areas for improvement

### #1 — The urgency scorer was inverted, non-deterministic and unexplainable

`src/utils/urgencyScorer.js` scored **writing style** instead of **business
impact**:

| Rule | Effect |
| --- | --- |
| `+30` per `!` | Shouting raises urgency; calm reports sink |
| `-50` if message is ALL CAPS | Caps lock **lowers** urgency — backwards |
| `-40` if `< 50` chars, `-60` if `< 20` | Short outage reports are penalised |
| `-15` per polite word, `-25` if it ends in `?` | Questions are deprioritised |
| `-20` on weekends, `-15` outside 09:00–17:00 | **The clock changes the queue** |

Measured on the original code:

```
"Our production server is down"        -> Low
"OUR PRODUCTION SERVER IS DOWN"        -> Low     (caps lowered it)
"We are locked out of the account"     -> Low
"We are locked out of the account!!!"  -> High    (punctuation did this)
"Great product, loving it!!!!!!"       -> High    (praise marked urgent)
"Server down"                          -> Low
"Server down." + 200 chars of padding  -> Medium  (length alone changed the tier)
```

The wall-clock dependency is the worst of these, because it is invisible:

```
same message, Mon 14:00 -> Medium
same message, Sat 14:00 -> Medium
same message, Sun 03:00 -> Low
```

A triage tool that re-prioritises a customer's outage because it was triaged at
3am on a Sunday cannot be trusted to order a queue, and gives an agent no way to
audit or argue with the result.


### #2 — LLM categorisation was unreliable and silent about it

`src/utils/llmHelper.js` sent the prompt `"Categorize this customer support
message: ${message}"` with `temperature: 0.7`, then inferred the category by
substring-matching the model's **free prose**. Measured against realistic model
output:

```
"Total outage, every user is locked out"       -> Unknown
"Customer wants a refund for a double charge"  -> Unknown
"No category fits this - needs a human"        -> General Inquiry (forced bucket)
"Customer asks whether they can export to CSV" -> Unknown
```

There was no confidence signal, no way to express "two problems in one message",
no schema, and no injection defence. When the API failed it fell back to a mock
whose "reasoning" was picked at random from a list — and still rendered it under
the heading **"AI Reasoning"**.

### #3 — Recommendations and routing were wrong; the API key was exposed

- `"Feature Request"` → *"Ask user to check billing portal."*
- `shouldEscalate(category, urgency, message)` **ignored** `category` and
  `urgency` and returned `message.length > 100`. Verified: a 101-character
  compliment escalated; `"Database connection lost"` did not.
- The product promises routing, but nothing routed anywhere.
- `dangerouslyAllowBrowser: true` shipped the Groq key to every browser.
- No tests existed.

---

## 3. What was implemented

The changes form one coherent unit, because category, priority, routing and
escalation all have to agree with each other.

### 3.1 Deterministic, explainable priority engine (`urgencyScorer.js`)

Rewritten to score **impact**, with five explicit rules: score impact not
style; style is a weak positive-only signal; length is never a penalty; no clock
dependency; every point is attributable to a named signal.

- **Impact signals** (add): `outage`, `security`, `data_loss`, `money_at_risk`,
  `blocked`, `deadline`, `repeat_contact`, `angry`, `explicit_urgency`, `scope`.
- **De-prioritising signals** (subtract, and capped): `praise`,
  `feature_request`, `low_commitment`.
- ALL CAPS is now `shouting +8`, an *escalation* signal.
- A message that is purely praise, a feature idea, or explicitly "no rush" is
  hard-capped at 30 so it can never reach the top of the queue.
- `"no rush"` is ignored when impact signals are present, so
  *"No rush, but our entire checkout is down for everyone"* stays a P0.
- Returns `{ score, level, sla, signals, suppressed, explanation }` — the UI
  shows **why** a message was prioritised.

### 3.2 Four-tier priority model (`triageConfig.js`, new)

Single source of truth shared by the scorer, templates and UI:

| Tier | Label | SLA | Threshold |
| --- | --- | --- | --- |
| P0 | Critical | 15 min, 24/7 | >= 78 |
| P1 | High | 1 hour | >= 58 |
| P2 | Medium | 4 business hours | >= 35 |
| P3 | Low | 1 business day | < 35 |

Also defines a closed 8-category taxonomy, each mapped to a **routing queue**
(Incident Response, Technical Support, Billing Support, Account & Identity,
Product, Support Tier 1, Triage Desk).


### 3.3 Structured, validated LLM output (`llmHelper.js`)

- Real system prompt defining the taxonomy and decision rules.
- `response_format: json_object` with a schema, and `temperature: 0`.
- Whitelist validation: an off-taxonomy category is **rejected**, not bucketed.
- Returns `confidence`, `secondaryCategory`, `requiresHumanReview`
  (auto-set below 0.6 confidence).
- Customer text is wrapped in `<message>` tags and explicitly treated as data,
  so **prompt injection cannot influence the output**.
- The rule-based fallback is now deterministic and **surfaced** to the user
  (`source`, `degraded`, `degradedReason`) instead of being hidden behind a
  `console.warn` under an "AI Reasoning" heading.

### 3.4 Correct routing, actions and escalation (`templates.js`)

- 8 distinct, category-specific actions (the Feature Request bug is fixed and
  covered by a regression test).
- Actions are priority-aware — P0 adds an incident-response step.
- New `getRoutingQueue()` provides real routing.
- `shouldEscalate({ category, level, signals, requiresHumanReview })` escalates
  on P0, on incident-grade signals (`security`, `data_loss`, `outage`,
  `money_at_risk`), or on low classifier confidence — **never on length**.

### 3.5 Input validation and a single entry point

`validation.js` rejects empty, too-short (<10), too-long (>5000) and
non-textual messages **before** any tokens are spent, replacing the
`alert('Please enter a message to analyze')` pattern. `triageEngine.js` runs the
whole pipeline so the UI cannot call the stages out of order.

### 3.6 Tests

38 tests across `tests/` run on the built-in `node:test` runner — **no new
dependencies** (`npm test`). They are regression tests for the defects above
(caps, punctuation, length, clock-dependence, the Feature Request action,
length-based escalation, off-taxonomy rejection) plus determinism and
prompt-injection coverage.

---

## 4. Results

All 8 messages in `sample-messages.json`, before → after:

| # | Message | Before | After | Route |
| --- | --- | --- | --- | --- |
| 1 | Database connection lost | **Low** | **P0 Critical** | Incident Response |
| 2 | Thank you so much! ... | Medium | **P3 Low** | Support Tier 1 |
| 3 | Could you add export to CSV? | Low | **P3 Low** | Product |
| 4 | Payment failed, can't access dashboard | **Low** | **P1 High** | Billing Support |
| 5 | `hi` | Low (accepted) | **rejected** with guidance | — |
| 6 | Server down now | **Low** | **P0 Critical** | Incident Response |
| 7 | Long positive feedback | **High** | **P3 Low** | Support Tier 1 |
| 8 | What are your business hours? | Low | **P2 Medium** | Support Tier 1 |

Case 4 also now reports a `secondaryCategory` of Technical Problem, so a hybrid
message is no longer a coin flip between two queues.

Other measured effects:

- **Reproducibility**: the same text now yields an identical result at any hour
  on any day (was: Medium on a Monday afternoon, Low on a Sunday night).
- **Bundle size**: 396.6 kB → 297.6 kB (124.0 kB → 94.5 kB gzipped) because
  `react-markdown` is no longer needed for short model strings.
- **Lint**: `npm run lint` reports the same 3 pre-existing errors as before
  this change; no new ones were introduced.

Verification commands:

```bash
npm test        # 38 tests
npm run build   # production build
npm run lint
node --import ./scripts/extension-resolver.mjs scripts/e2e.mjs   # all samples
node scripts/ui-smoke.mjs file                                   # headless UI check
```

---

## 5. What was deliberately not changed

- **The Groq API key is still exposed to the browser.** Fixing this properly
  means adding a backend, which changes the deployment model and is out of scope
  here. It remains the top security risk and is called out in the README.
- **No customer/account context.** Signals like "our whole team" are matched
  lexically. Once Relay has tenant data, plan tier and contract value should
  feed the score.
- **The signal weights are hand-tuned**, not learned. They are centralised in
  `urgencyScorer.js` so they can be re-tuned against labelled data.
- **Thresholds are unvalidated against real support data.** P0/P1 should be
  calibrated against historical SLA breaches before being trusted in anger.

## 6. Recommended next steps

1. Move the Groq call server-side and remove the browser-exposed key.
2. Replace `localStorage` with real persistence so history survives per-agent.
3. Build a labelled evaluation set and add a CI check that fails when triage
   accuracy on that set regresses.
4. Batch-triage whole inboxes rather than one message at a time — the actual
   SaaS lever for "more volume without more headcount".
5. Add tenant context (plan tier, contract value) to the priority signals.
