import { CATEGORIES } from './triageConfig'

/**
 * Rule-based categorization fallback.
 *
 * Used when no Groq key is configured, the API call fails, or the model
 * returns something unusable. This is what the old code called a "mock", but
 * it is deterministic - the same message always yields the same category and
 * explanation - so a fallback result is still trustworthy and auditable.
 */

const RULES = [
  {
    category: 'POSITIVE_FEEDBACK',
    patterns: [
      /\bthank(s| you)?\b/,
      /\bappreciat\w+\b/,
      /\bgrateful\b/,
      /\b(love|great|awesome|excellent|amazing) (the |your |this )?(product|app|tool|service|support|team|platform)\b/,
      /\bworks? (great|perfectly|well|flawlessly)\b/,
      /\bpositive (feedback|experience)\b/,
      /\bjust wanted to (say|share|compliment)\b/,
    ],
    summary: 'Customer is expressing thanks or praise.',
    reasoning:
      'The message contains gratitude or positive sentiment and does not describe a problem or a request.',
  },
  {
    category: 'FEATURE_REQUEST',
    patterns: [
      /\b(feature request|feature idea)\b/,
      /\bwould love (to see|it if|if|to have)\b/,
      /\bit would be (nice|great|cool|helpful) if\b/,
      /\bplease add\b/,
      /\b(could|can) you add\b/,
      /\bnice to have\b/,
      /\bin a future (release|update|version)\b/,
    ],
    summary: 'Customer is suggesting new or changed functionality.',
    reasoning:
      'The message asks for functionality that does not exist yet, which is a product request rather than a support issue.',
  },
  {
    category: 'SERVICE_OUTAGE',
    patterns: [
      /\boutage\b/,
      /\b(site|app|platform|service|server|api|production|checkout|dashboard) (is |are )?(fully |completely |totally )?down\b/,
      /\b(down|offline) for (everyone|all|every)\b/,
      /\bnobody can\b/,
      /\b(database|db) (connection )?(lost|dropped|down|failing|unreachable)\b/,
    ],
    summary: 'Customer reports the product is unavailable.',
    reasoning:
      'The message describes the product being down or unusable, which affects more than this one request.',
  },
  {
    category: 'BILLING_PAYMENTS',
    patterns: [
      /\b(bill|billing|invoice|payment|charge|charged|refund|subscription|plan)\b/,
      /\bcredit card\b/,
      /\b(pricing|price)\b/,
      /\b(double|doubled|twice) charg/,
      /\bupgrad\w+\b/,
    ],
    summary: 'Customer has a billing or payment question or problem.',
    reasoning:
      'The message references charges, invoices, subscriptions or payment methods, so it belongs with billing.',
  },
  {
    category: 'ACCOUNT_ACCESS',
    patterns: [
      /\b(locked out|lock ?out|can'?t log ?in|cannot log ?in|unable to log ?in|can'?t sign ?in)\b/,
      /\b(password|permission|role|admin|access)\b/,
      /\b(hacked|breach|unauthori[sz]ed|suspicious)\b/,
      /\b(two-?factor|2fa|reset (my )?password)\b/,
    ],
    summary: 'Customer cannot access their account, or has a security question.',
    reasoning:
      'The message is about signing in, permissions or account security, so it belongs with account and access.',
  },
  {
    category: 'TECHNICAL_PROBLEM',
    patterns: [
      /\b(error|bug|broken|crash\w*|not working|isn'?t working|won'?t (load|open|save|send))\b/,
      /\b(times? out|timed out|keeps? (failing|loading|spinning))\b/,
      /\b(slow|laggy|freez\w+)\b/,
      /\b(500 error|white screen|blank (page|screen))\b/,
      /\bstuck\b/,
    ],
    summary: 'Customer is reporting something broken or erroring.',
    reasoning:
      'The message describes product behaviour that is failing or erroring rather than a request or a question.',
  },
  {
    category: 'HOW_TO',
    patterns: [
      /\bhow (do|can|to|does)\b/,
      /\bwhat (is|are|does)\b/,
      /\bwhere (can|do)\b/,
      /\bwhen (is|are|does)\b/,
      /\bcan i\b/,
      /\bis there (a|any)\b/,
      /\b\?/,
    ],
    summary: 'Customer is asking a question about the product or service.',
    reasoning:
      'The message is an informational question and does not report a fault or request a change.',
  },
]

/**
 * Classify without the LLM. Deterministic and taxonomy-safe.
 *
 * @param {string} message
 * @returns {{
 *   category: string,
 *   categoryLabel: string,
 *   secondary: string|null,
 *   summary: string,
 *   reasoning: string,
 *   confidence: number,
 *   requiresHumanReview: boolean
 * }}
 */
export function getRuleBasedCategorization(message) {
  const text = (message || '').toLowerCase()

  // Collect every matching category so multi-intent messages can report a
  // secondary issue instead of depending on rule ordering.
  const matched = RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text))
  )

  if (matched.length === 0) {
    return {
      category: 'OTHER',
      categoryLabel: CATEGORIES.OTHER.label,
      secondary: null,
      summary: 'Message does not match a known support pattern.',
      reasoning:
        'No category pattern matched the text, so this needs a human to classify it correctly.',
      confidence: 0.3,
      requiresHumanReview: true,
    }
  }

  const [primary, ...rest] = matched
  const secondary = rest.length > 0 ? rest[0].category : null
  // Rule matches are weaker evidence than a model, so confidence is capped
  // below the 0.6 auto-approve threshold unless only one rule matched.
  const confidence = matched.length === 1 ? 0.65 : 0.55

  return {
    category: primary.category,
    categoryLabel: CATEGORIES[primary.category].label,
    secondary,
    summary: primary.summary,
    reasoning: primary.reasoning,
    confidence,
    requiresHumanReview: confidence < 0.6 || primary.category === 'OTHER',
  }
}
