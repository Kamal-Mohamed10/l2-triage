import { categorizeMessage } from './llmHelper'
import { scorePriority } from './urgencyScorer'
import { getRecommendedAction, getRoutingQueue, shouldEscalate } from './templates'
import { validateMessage } from './validation'
import { CATEGORIES } from './triageConfig'

/**
 * Triage Engine - single entry point that runs the full pipeline.
 *
 * Replaces the three ad-hoc calls in AnalyzePage, and guarantees the
 * recommendation, routing and escalation always agree with the category
 * and priority that were just computed.
 */

/**
 * Triage a customer message end to end.
 *
 * @param {string} message - Raw customer message
 * @returns {Promise<{
 *   ok: boolean,
 *   error: string|null,
 *   result: object|null
 * }>}
 */
export async function triageMessage(message) {
  const validation = validateMessage(message)

  if (!validation.valid) {
    return { ok: false, error: validation.error, result: null }
  }

  const cleaned = validation.cleaned

  // Category first: an outage classification changes how we read the rest.
  const classification = await categorizeMessage(cleaned)

  // Priority is computed locally from impact signals - never from the LLM,
  // so a hallucinated or injected response cannot reorder the queue.
  const priority = scorePriority(cleaned)

  const recommendedAction = getRecommendedAction(classification.category, priority.level)
  const routing = getRoutingQueue(classification.category)

  const escalate = shouldEscalate({
    category: classification.category,
    level: priority.level,
    signals: priority.signals,
    requiresHumanReview: classification.requiresHumanReview,
  })

  const categoryLabel =
    classification.categoryLabel || CATEGORIES[classification.category].label

  const secondaryLabel = classification.secondary
    ? CATEGORIES[classification.secondary].label
    : null

  return {
    ok: true,
    error: null,
    result: {
      message: cleaned,
      category: classification.category,
      categoryLabel,
      secondaryCategory: classification.secondary,
      secondaryLabel,
      summary: classification.summary,
      reasoning: classification.reasoning,
      confidence: classification.confidence,
      requiresHumanReview: classification.requiresHumanReview,
      source: classification.source,
      degraded: classification.degraded,
      ...(classification.error ? { degradedReason: classification.error } : {}),

      score: priority.score,
      level: priority.level,
      urgency: priority.label,
      sla: priority.sla,
      signals: priority.signals,
      suppressed: priority.suppressed,
      priorityExplanation: priority.explanation,

      recommendedAction,
      queue: routing.queue,
      queueIcon: routing.icon,
      escalate,

      timestamp: new Date().toISOString(),
    },
  }
}
