import { getPriorityForScore } from './triageConfig'

/**
 * Priority Engine - deterministic, explainable urgency scoring.
 *
 * Design rules (these replace the previous heuristic):
 *  1. Score IMPACT, not writing style. Business impact signals raise priority.
 *  2. Writing style is a weak secondary signal only. ALL CAPS is escalation
 *     (caps lock = the customer cannot get the shift), never a discount.
 *  3. Message LENGTH is never a penalty. A 4-word outage report is critical.
 *  4. No clock dependency. The same text always yields the same score, so the
 *     queue order is reproducible and auditable.
 *  5. Every point of score must be attributable to a named, matchable signal,
 *     which we return so a human can see why something was prioritised.
 */

const BASE_SCORE = 50

/**
 * Impact signals. `weight` is added to the base score; `patterns` are matched
 * against the lower-cased message.
 */
const IMPACT_SIGNALS = [
  {
    id: 'outage',
    label: 'Service outage or total unavailability',
    weight: 45,
    patterns: [
      /\boutage\b/,
      /\b(down|offline) for (everyone|all|every)\b/,
      /\b(everyone|all users|whole (team|company|org|organisation|organization))\b/,
      /\b(service|site|app|platform|server|api|production) (is|are|'s)? ?(fully |completely |totally )?down\b/,
      /\b(production|entire) (is )?down\b/,
      /\bnobody can\b/,
      /\bmajor incident\b/,
      /\b(database|db) (connection )?(lost|dropped|down|failing|unreachable|timed out)\b/,
      /\b(connection|connectivity) (lost|dropped|failing|keeps dropping)\b/,
    ],
  },
  {
    id: 'security',
    label: 'Security or privacy incident',
    weight: 50,
    patterns: [
      /\b(hacked|breach|breached|compromised)\b/,
      /\b(security|privacy) (incident|issue|breach|risk)\b/,
      /\bdata (leaked|leaking|exposed|exposing|stolen)\b/,
      /\b(unauthori[sz]ed|unannounced|unexpected) (access|charge|login|log ?in)\b/,
      /\b(suspicious|unrecogni[sz]ed) (activity|login|charge|transaction)\b/,
      /\b(phish|phishing|ransomware|malware)\b/,
    ],
  },
  {
    id: 'data_loss',
    label: 'Risk of data loss or corruption',
    weight: 45,
    patterns: [
      /\bdata (loss|lost|missing)\b/,
      /\b(lost|missing|deleted) (our|my|the) (data|records|files|history)\b/,
      /\b(permanently )?(deleted|corrupted|overwritten|erased|wiped)\b/,
      /\bcan'?t (recover|restore|get back)\b/,
      /\bwiped\b/,
    ],
  },
  {
    id: 'money_at_risk',
    label: 'Customer is losing money or being overcharged',
    weight: 26,
    patterns: [
      /\b(double|doubled|duplicate|twice|multiple) charg/,
      /\bovercharg/,
      /\bcharged (wrongly|incorrectly|twice|in error)\b/,
      /\bmoney (lost|missing|gone)\b/,
      /\b(unauthori[sz]ed|unknown|unrecogni[sz]ed) (charge|payment|transaction)/,
      /\bpaid (for|twice)\b/,
    ],
  },
  {
    id: 'blocked',
    label: 'Customer is blocked from completing a core task',
    weight: 22,
    patterns: [
      /\b(locked out|lock ?out|can'?t log ?in|cannot log ?in|unable to log ?in|can'?t sign ?in|unable to sign ?in)\b/,
      /\b(can'?t|cannot|unable to|not able to) (access|open|load|reach|get in|use|complete|submit|export|publish|invite)\b/,
      /\b(keeps? (failing|erroring|crashing|timing out|loading|spinning|buffering|hanging)|times? out|timed out)\b/,
      /\bstuck (on|at|in|loading)\b/,
      /\b(white screen|blank (page|screen)|500 error|internal server error)\b/,
      /\bfailed (to|again)\b/,
      /\b(isn'?t|is not|not) working\b/,
      /\b(won'?t|does not|doesn'?t) (load|open|save|send|sync)\b/,
    ],
  },

  {
    id: 'deadline',
    label: 'Hard external deadline',
    weight: 25,
    patterns: [
      /\b(deadline|due) (is |today|tomorrow|this (week|afternoon|morning)|in \d+ (hour|day))\b/,
      /\bby (end of (day|eod)|eod|close of business|cob|noon)\b/,
      /\b(board|investor|client|customer|conference|launch|presentation) (meeting|call|demo|review|today|tomorrow)\b/,
      /\bwe (have to|need to|must) (ship|launch|go live|present)\b/,
      /\bgo-?live (date|is)\b/,
      /\bpayroll\b/,
    ],
  },
  {
    id: 'repeat_contact',
    label: 'Repeat contact - already chasing us',
    weight: 22,
    patterns: [
      /\b(third|fourth|fifth|2nd|second|3rd|4th) time\b/,
      /\b(again|still) (waiting|not (fixed|resolved|answered)|no (reply|response|answer))\b/,
      /\b(no|haven'?t had|have not had|without) (a |any )?(reply|response|answer|heard back)\b/,
      /\b\d+ (days?|weeks?) (ago|and (no|without))\b/,
      /\bescalat\w+\b/,
      /\b(going to|about to) (cancel|leave|churn|close our account)\b/,
      /\b(already|previously) (told|reported|contacted|emailed|logged)\b/,
      /\bignored\b/,
    ],
  },
  {
    id: 'angry',
    label: 'Escalating / angry customer',
    weight: 18,
    patterns: [
      /\b(unacceptable|ridiculous|outrageous|appalling)\b/,
      /\b(very |extremely |really )?(angry|furious|livid|frustrated|frustrating)\b/,
      /\bworst (support|experience|company|service)\b/,
      /\bdisgusting\b/,
      /\bcomplaint (about|regarding)\b/,
    ],
  },
  {
    id: 'explicit_urgency',
    label: 'Customer explicitly marked it urgent',
    weight: 14,
    patterns: [
      /\burgent(ly)?\b/,
      /\basap\b/,
      /\bimmediately\b/,
      /\bcritical\b/,
      /\bemergency\b/,
      /\b(high|top) priority\b/,
      /\bpage (the )?(on-?call|team)\b/,
    ],
  },
  {
    id: 'scope',
    label: 'Affects multiple people, not just the sender',
    weight: 16,
    patterns: [
      /\b(our|the|my) (whole|entire) (team|company|org|organisation|organization|business|agency)\b/,
      /\b(all|every) (of )?(our|my|the) (users|customers|clients|staff|employees|people)\b/,
      /\b(multiple|several|many) (users|customers|clients|people|accounts) (are|have|cannot|can'?t)\b/,
      /\bteam (can'?t|cannot|is unable)\b/,
    ],
  },
]

/**
 * De-prioritising signals. These CAP the score rather than adding to it,
 * because a compliment or a feature idea is never urgent on its own.
 */
const DEPRIORITISING_SIGNALS = [
  {
    id: 'praise',
    label: 'Praise / gratitude - no support action needed',
    weight: 40,
    patterns: [
      /\bthank(s| you)?\b/,
      /\bappreciat\w+\b/,
      /\bgrateful\b/,
      /\b(love|adore) (the |your |this )?(product|app|tool|service|support|team|platform)\b/,
      /\b(awesome|amazing|fantastic|excellent|great|wonderful|brilliant) (product|app|tool|service|support|team|platform)\b/,
      /\bworks? (great|perfectly|well|flawlessly)\b/,
      /\bpositive (feedback|experience)\b/,
      /\bjust wanted to (say|share|compliment)\b/,
      /\bhappy (customer|client)\b/,
    ],
  },
  {
    id: 'feature_request',
    label: 'Feature suggestion - belongs in the backlog',
    weight: 30,
    patterns: [
      /\b(feature request|feature idea)\b/,
      /\bwould love (to see|it if|if|to have)\b/,
      /\bit would be (nice|great|cool|helpful) if\b/,
      /\bplease add\b/,
      /\b(could|can) you add\b/,
      /\bany (way|chance|plans?) to add\b/,
      /\b(suggestion|idea|improvement)\b/,
      /\bnice to have\b/,
      /\bwould be (really )?(useful|helpful|nice)\b/,
      /\bin a future (release|update|version)\b/,
    ],
  },
  {
    id: 'low_commitment',
    label: 'Customer explicitly said it is not urgent',
    weight: 45,
    // Evaluated together with IMPACT_SIGNALS: an explicit "no rush" only wins
    // when there is no impact signal, so "no rush, our site is down" is
    // still correctly treated as an outage.
    patterns: [
      /\bno rush\b/,
      /\bnot urgent\b/,
      /\bwhenever (you|you get a chance|possible|it'?s|works)\b/,
      /\bno (need|need) to (reply|respond|answer) (right away|immediately|now|quickly|soon)\b/,
      /\bjust (a|one) (question|thought|idea)\b/,
      /\bwhen (is )?(sometime|soon) (convenient|possible)\b/,
      /\bnot a (rush|big deal|dealbreaker)\b/,
      /\bif (you get|you have) (a )?(chance|minute)\b/,
    ],
  },
]

/** Weak style signals - deliberately small, and only ever positive. */
const STYLE_SIGNALS = [
  {
    id: 'shouting',
    label: 'Written in all caps (caps lock - customer cannot stop typing)',
    weight: 8,
    // Evaluated by isShouting() rather than a literal pattern.
    patterns: [],
  },
]


function matches(message, patterns) {
  return patterns.some((pattern) => pattern.test(message))
}

/**
 * True when a meaningful share of the alphabetic characters are uppercase.
 * "OK" is not shouting; "OUR SYSTEM IS DOWN AND EVERYONE IS AFFECTED" is.
 */
function isShouting(message) {
  const letters = message.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 12) return false
  const upper = letters.replace(/[^A-Z]/g, '').length
  return upper / letters.length > 0.7
}

function collectSignals(text, rawMessage, signalList) {
  return signalList
    .filter((signal) =>
      // Case-sensitive signals must see the original casing; the rest match
      // against the lower-cased text.
      signal.id === 'shouting'
        ? isShouting(rawMessage)
        : matches(text, signal.patterns)
    )
    .map((signal) => ({ id: signal.id, label: signal.label, weight: signal.weight }))
}

/**
 * Score a customer message and explain the score.
 *
 * Pure and clock-free: the same input always produces the same output, so
 * the queue order is reproducible and auditable.
 *
 * @param {string} message - Raw customer message
 * @returns {{
 *   score: number,
 *   level: string,
 *   label: string,
 *   sla: string,
 *   signals: Array<{id: string, label: string, weight: number}>,
 *   suppressed: Array<{id: string, label: string, weight: number}>,
 *   explanation: string
 * }}
 */
export function scorePriority(message) {
  const raw = message || ''
  const text = raw.toLowerCase()

  const signals = collectSignals(text, raw, IMPACT_SIGNALS)
  const styleSignals = collectSignals(text, raw, STYLE_SIGNALS)
  let suppressed = collectSignals(text, raw, DEPRIORITISING_SIGNALS)

  // An explicit "no rush" / "not urgent" is only credible when the customer
  // has not also described a real outage, breach or block. When impact
  // signals are present we ignore the de-prioritising ones entirely, so
  // "no rush, our checkout is down for everyone" stays an outage.
  if (signals.length > 0) {
    suppressed = suppressed.filter((signal) => signal.id !== 'low_commitment')
  }

  let score = BASE_SCORE
  for (const signal of [...signals, ...styleSignals]) score += signal.weight
  for (const signal of suppressed) score -= signal.weight

  // Hard ceiling: a message that is purely praise, a feature idea or an
  // explicitly-not-urgent note must never reach the top of the queue, even
  // if it is long or shouty. Impact signals disable this cap, because
  // "no rush, our payments are down" is still an outage.
  const onlyDepr = suppressed.length > 0 && signals.length === 0
  if (onlyDepr) score = Math.min(score, 30)

  score = Math.max(0, Math.min(100, Math.round(score)))
  const priority = getPriorityForScore(score)

  return {
    score,
    level: priority.level,
    label: priority.label,
    sla: priority.sla,
    signals: [...signals, ...styleSignals],
    suppressed,
    explanation: buildExplanation(score, signals, styleSignals, suppressed),
  }
}

/**
 * Human-readable justification shown to the agent, so the queue order is
 * auditable rather than a black box.
 */
function buildExplanation(score, signals, styleSignals, suppressed) {
  const parts = [`Scored ${score}/100.`]

  if (signals.length > 0) {
    parts.push(`Raised by: ${signals.map((s) => `${s.label} (+${s.weight})`).join(', ')}.`)
  }
  if (styleSignals.length > 0) {
    parts.push(`${styleSignals[0].label} (+${styleSignals[0].weight}).`)
  }
  if (suppressed.length > 0) {
    parts.push(`Reduced by: ${suppressed.map((s) => `${s.label} (-${s.weight})`).join(', ')}.`)
  }
  if (signals.length === 0 && suppressed.length === 0) {
    parts.push('No impact or de-prioritising signals found; treated as a standard request.')
  }

  return parts.join(' ')
}

/**
 * Backwards-compatible helper used by the UI and the history log.
 * Returns just the tier label, e.g. "Critical".
 *
 * @param {string} message
 * @returns {string}
 */
export function calculateUrgency(message) {
  return scorePriority(message).label
}

/**
 * Numeric score only.
 *
 * @param {string} message
 * @returns {number} 0-100
 */
export function calculateUrgencyScore(message) {
  return scorePriority(message).score
}
