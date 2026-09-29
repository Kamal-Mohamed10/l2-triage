# Customer Inbox Triage App

> **Note:** this fork contains a substantial rework of the classification and
> prioritisation logic. See [ASSESSMENT.md](./ASSESSMENT.md) for the findings,
> the evidence, and the before/after comparison.

## Overview

The Customer Inbox Triage app is a lightweight AI-powered tool that helps classify customer support messages and recommend actions. It uses Groq AI to categorize messages, applies deterministic impact-based urgency scoring, and routes each message to a team queue with a concrete next step.

## Problem Statement

Support teams waste time manually reading and triaging customer messages. This tool provides an automated first pass at classification to help prioritize and route messages more efficiently.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **AI**: Groq API (Llama 3.3 70B - Free tier), with a deterministic rule-based fallback
- **Runtime**: Browser-based (local development only)
- **Tests**: `node:test` (built into Node, no extra dependencies)

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher; `node --test` is used)
- npm or yarn
- Groq API key (FREE - get from https://console.groq.com) — optional, see below

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd l2assessment
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Groq API Key (optional)**

   Create a `.env.local` file in the root directory:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your Groq API key:
   ```
   VITE_GROQ_API_KEY=gsk_your-actual-key-here
   ```

   **The app works without a key.** Without one, categories come from
   deterministic keyword rules instead of the model, and the UI shows a
   "Rule-based mode" banner so nobody mistakes a rule result for an AI one.
   Priority scoring is always local and is unaffected either way.

   Get your FREE API key from: https://console.groq.com/keys

   **Why Groq?** Groq offers a generous free tier with fast inference and no credit card required!

4. **Run the application**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:5173`

5. **Run the tests**
   ```bash
   npm test
   ```

## How It Works

1. **Paste Message**: User pastes a customer support message into the text area
2. **Validate**: Messages that are empty, too short, too long, or contain no text are rejected up front — before any tokens are spent
3. **Classify**: The app calls `triageMessage()`, which runs:
   - **Category Classification** (LLM): Groq AI (Llama 3.3 70B) returns structured JSON with a confidence score and an optional secondary category. Output is validated against a closed 8-category taxonomy; anything off-taxonomy is rejected rather than guessed. Falls back to deterministic rules if the API is unavailable, and says so in the UI.
   - **Priority Scoring** (local, deterministic): Impact signals such as outages, security incidents, data loss, money at risk, hard deadlines and repeat contact raise the score; praise, feature requests and an explicit "no rush" lower it. The score is **never** derived from the model, so a hallucinated or injected response cannot reorder the queue.
   - **Routing & Action** (template-based): Each category maps to a team queue and a priority-specific next step.
4. **Display Results**: Shows priority tier and SLA, the score, the signals that drove it, the routing queue, the escalation flag, the recommended action and the reasoning
5. **History**: Analyses are saved to localStorage and shown newest-first, with the reasoning behind each priority

### Priority tiers

| Tier | Label | SLA | Meaning |
| --- | --- | --- | --- |
| P0 | Critical | 15 min, 24/7 | Outage, security incident or data loss |
| P1 | High | 1 hour | Customer is blocked or losing money |
| P2 | Medium | 4 business hours | A real question or problem, not blocking |
| P3 | Low | 1 business day | Feedback, feature idea, batchable |

Scoring is deterministic: the same message always produces the same result, at any hour on any day.


## Example Test Messages

Try analyzing these messages to see how the triage system works. The tier each
one is expected to land on is noted.

### Example 1: Production Outage (P0)
```
Our production server is down and nobody can log in
```

### Example 2: Customer Feedback (P3)
```
Hi there! I just wanted to say thank you for your amazing customer service. I've been using your product for three years now and I'm really happy with it.
```

### Example 3: Feature Request (P3)
```
I would love to see a dark mode option in the app. It would be much easier on my eyes during night time usage.
```

### Example 4: Billing Blocked (P1)
```
My payment failed and now I can't access the dashboard. Is there a bug or do I need to update my credit card?
```

### Example 5: Billing Escalation (P1)
```
We've been charged twice this month and nobody has replied to our last four emails.
```

### Example 6: Not Urgent (P3)
```
No rush at all — just wondering how to export a report whenever you have a chance.
```

### Example 7: Security Incident (P0)
```
I think our account has been hacked, there are unrecognized logins from another country.
```

## Project structure

```
src/utils/
  triageConfig.js       Taxonomy, routing queues, priority tiers, thresholds
  triageEngine.js       Single entry point: triageMessage()
  llmHelper.js          Structured, validated Groq calls
  ruleBasedFallback.js  Deterministic classification when the API is unavailable
  urgencyScorer.js      Deterministic impact-based priority scoring
  templates.js          Recommended actions, routing, escalation rules
  validation.js         Input validation
tests/                  node:test regression suite
scripts/                e2e run + optional headless UI smoke test
```

## Security Note

⚠️ **Warning**: This application still exposes the Groq API key in the browser (using `dangerouslyAllowBrowser: true`). This is acceptable for local development only but should **NEVER** be done in production. In a real application, API calls should be made from a secure backend server.

This remains the highest-priority outstanding technical debt — see "Recommended next steps" in [ASSESSMENT.md](./ASSESSMENT.md).

### Prompt injection

Customer messages are untrusted input. Two defences are in place:

1. The message is wrapped in `<message>` tags and explicitly described as data to
   classify, not instructions to follow.
2. **Priority is computed locally from deterministic signals, never from the
   model.** Even a fully successful injection cannot change the priority tier,
   because the model has no input into the score.

Category output is still validated against the taxonomy, and anything
off-taxonomy or low-confidence is routed to a human.

## Why Groq?

- ✅ **Completely Free** - No credit card required
- ✅ **Fast Inference** - Groq's LPU technology is incredibly fast
- ✅ **Generous Limits** - ~14,400 requests/day on free tier
- ✅ **High Quality** - Llama 3.3 70B performs excellently
- ✅ **Easy Signup** - Get started in minutes at https://console.groq.com

## License

This project is for educational purposes only.
