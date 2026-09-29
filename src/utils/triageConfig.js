/**
 * Triage Configuration - Single source of truth for the triage engine.
 *
 * Categories, routing queues, priority tiers, SLA targets and score
 * thresholds all live here so that the scorer, the recommendation layer
 * and the UI can never drift apart.
 */

/**
 * Score thresholds that map a numeric score to a priority tier.
 * Tuned against tests/triage.test.js and sample-messages.json.
 */
export const PRIORITY_THRESHOLDS = {
  P0: 78, // Critical - service down / security / data loss
  P1: 58, // High     - customer is blocked
  P2: 35, // Medium   - needs a reply, not urgent
  // below P2 -> P3 Low
}

export const PRIORITY_LEVELS = [
  {
    level: 'P0',
    label: 'Critical',
    description: 'Service-wide outage, security incident or data loss. Page the on-call.',
    sla: 'Respond within 15 minutes, 24/7',
    badgeClass: 'bg-red-600 text-white',
  },
  {
    level: 'P1',
    label: 'High',
    description: 'Customer cannot complete a core task, or is losing money / blocked.',
    sla: 'Respond within 1 hour',
    badgeClass: 'bg-orange-500 text-white',
  },
  {
    level: 'P2',
    label: 'Medium',
    description: 'Real question or problem, but the customer is not blocked.',
    sla: 'Respond within 4 business hours',
    badgeClass: 'bg-yellow-400 text-yellow-900',
  },
  {
    level: 'P3',
    label: 'Low',
    description: 'Feedback, feature idea, or a question we can answer in a batch.',
    sla: 'Respond within 1 business day',
    badgeClass: 'bg-green-500 text-white',
  },
]

/**
 * The closed taxonomy. The LLM is constrained to these ids and every
 * parsed response is validated against them - anything else is rejected
 * rather than silently bucketed.
 */
export const CATEGORIES = {
  SERVICE_OUTAGE: {
    id: 'SERVICE_OUTAGE',
    label: 'Service Outage',
    description: 'The product is unavailable or degraded for many or all users.',
    queue: 'Incident Response',
    queueIcon: '\u{1F6A8}',
  },
  TECHNICAL_PROBLEM: {
    id: 'TECHNICAL_PROBLEM',
    label: 'Technical Problem',
    description: 'Something is broken, erroring, or behaving incorrectly for this customer.',
    queue: 'Technical Support',
    queueIcon: '\u{1F41B}',
  },
  BILLING_PAYMENTS: {
    id: 'BILLING_PAYMENTS',
    label: 'Billing & Payments',
    description: 'Charges, invoices, refunds, subscriptions, payment methods.',
    queue: 'Billing Support',
    queueIcon: '\u{1F4B3}',
  },
  ACCOUNT_ACCESS: {
    id: 'ACCOUNT_ACCESS',
    label: 'Account & Access',
    description: 'Login, permissions, lockouts, security and identity questions.',
    queue: 'Account & Identity',
    queueIcon: '\u{1F510}',
  },
  FEATURE_REQUEST: {
    id: 'FEATURE_REQUEST',
    label: 'Feature Request',
    description: 'A suggestion for new or changed functionality.',
    queue: 'Product',
    queueIcon: '\u{1F4A1}',
  },
  HOW_TO: {
    id: 'HOW_TO',
    label: 'How-To / General Inquiry',
    description: 'Question about how to use the product, pricing, or the business.',
    queue: 'Support - Tier 1',
    queueIcon: '\u{1F4D8}',
  },
  POSITIVE_FEEDBACK: {
    id: 'POSITIVE_FEEDBACK',
    label: 'Positive Feedback',
    description: 'Thanks or praise. No action required beyond acknowledgement.',
    queue: 'Support - Tier 1',
    queueIcon: '\u{1F389}',
  },
  OTHER: {
    id: 'OTHER',
    label: 'Other / Needs Human Review',
    description: 'Did not match the taxonomy. A human should look at this.',
    queue: 'Triage Desk (human)',
    queueIcon: '\u{1F50D}',
  },
}

export const CATEGORY_IDS = Object.keys(CATEGORIES)

/** Every queue, for the dashboard's routing breakdown. */
export function getQueues() {
  return [...new Set(Object.values(CATEGORIES).map((c) => c.queue))]
}

/**
 * Look up a priority tier by score.
 *
 * @param {number} score - Urgency score (0-100)
 * @returns {{level: string, label: string, sla: string, badgeClass: string}}
 */
export function getPriorityForScore(score) {
  const bounded = Math.max(0, Math.min(100, score))
  let matched = PRIORITY_LEVELS[PRIORITY_LEVELS.length - 1]
  for (const tier of PRIORITY_LEVELS) {
    if (bounded >= PRIORITY_THRESHOLDS[tier.level]) {
      matched = tier
      break
    }
  }
  return matched
}
