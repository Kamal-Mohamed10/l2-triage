import { CATEGORIES, PRIORITY_LEVELS } from './triageConfig'

/**
 * Recommendation Templates - maps (category, priority) to a concrete next step,
 * plus the routing queue the message belongs to.
 *
 * The previous version keyed actions off category only, ignored its own
 * `urgency` argument, routed a Feature Request to the billing portal, and
 * decided escalation with `message.length > 100`. Actions are now specific,
 * urgency-aware, and escalation is evidence-based.
 */

/** Default action per category. */
const categoryActions = {
  SERVICE_OUTAGE:
    'Page Incident Response now. Open an incident, check the status page for blast radius and post an update to the affected customers.',
  TECHNICAL_PROBLEM:
    'Send to Technical Support. Ask for the browser console output and the exact steps to reproduce, then link the matching known issues.',
  BILLING_PAYMENTS:
    'Send to Billing Support. Ask which invoice and card are affected and confirm the subscription plan before adjusting anything.',
  ACCOUNT_ACCESS:
    'Send to Account & Identity. Verify the customer, then check for lockout, MFA enrolment or an active session before resetting access.',
  FEATURE_REQUEST:
    'Log against the Product backlog and thank the customer. No support action is required - reply with a link to the public roadmap.',
  HOW_TO:
    'Reply from the knowledge base with the matching help article. If no article exists, flag it as a docs gap for the support team.',
  POSITIVE_FEEDBACK:
    'Send a short thank-you reply. Optional: tag the message for a customer advocate or case study.',
  OTHER:
    'Route to the triage desk for a human to classify. Do not auto-reply until someone has read it.',
}

/** Extra steps layered on for high-severity tiers. */
const urgencyOverrides = {
  P0: 'Treat as an incident: acknowledge within 15 minutes and give the customer a next update time.',
  P1: 'Acknowledge within the hour with a concrete next step and a time estimate.',
  P3: 'No individual response needed - batch these with other low-priority messages.',
}

/**
 * Signal ids that mean "a human should see this now", regardless of score.
 */
const ESCALATION_SIGNALS = new Set([
  'security',
  'data_loss',
  'outage',
  'money_at_risk',
])

/**
 * Get recommended action for a category at a given priority.
 *
 * @param {string} category - Category id from triageConfig.CATEGORIES
 * @param {string} level - Priority tier, e.g. "P0"
 * @returns {string} - Recommended next step
 */
export function getRecommendedAction(category, level = 'P2') {
  const base = categoryActions[category]
  if (!base) return categoryActions.OTHER

  const override = urgencyOverrides[level]
  return override ? `${base} ${override}` : base
}

/**
 * All available categories.
 *
 * @returns {string[]}
 */
export function getAvailableCategories() {
  return Object.keys(CATEGORIES)
}

/**
 * The routing queue a message should be assigned to.
 *
 * @param {string} category - Category id
 * @returns {{queue: string, icon: string}}
 */
export function getRoutingQueue(category) {
  const config = CATEGORIES[category] || CATEGORIES.OTHER
  return { queue: config.queue, icon: config.queueIcon }
}

/**
 * Determine whether a message must be escalated to a human.
 *
 * Escalation is driven by impact signals, priority tier and classifier
 * confidence - not by how many characters the customer typed.
 *
 * @param {object} params
 * @param {string} params.category - Category id
 * @param {string} params.level - Priority tier
 * @param {Array<{id: string}>} params.signals - Impact signals from scorePriority
 * @param {boolean} [params.requiresHumanReview] - Classifier confidence flag
 * @returns {boolean}
 */
export function shouldEscalate({ category, level, signals = [], requiresHumanReview = false }) {
  const signalIds = signals.map((signal) => signal.id)

  // Critical tier, or any incident-grade signal, always escalates.
  if (level === 'P0') return true
  if (signalIds.some((id) => ESCALATION_SIGNALS.has(id))) return true

  // High priority with a second issue attached is not safe to auto-handle.
  if (level === 'P1' && category === 'OTHER') return true

  // The model was not confident, or explicitly asked for review. P3 items are
  // batch-processed by design, so a slightly low confidence there is fine.
  if (requiresHumanReview && level !== 'P3') return true

  return false
}

/**
 * All priority tiers, for the UI.
 *
 * @returns {Array<{level: string, label: string, sla: string}>}
 */
export function getPriorityLevels() {
  return PRIORITY_LEVELS
}
