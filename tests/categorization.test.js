import test from 'node:test'
import assert from 'node:assert/strict'
import { validateClassification, categorizeMessage } from '../src/utils/llmHelper.js'
import { getRuleBasedCategorization } from '../src/utils/ruleBasedFallback.js'
import { CATEGORY_IDS } from '../src/utils/triageConfig.js'

test('valid classifications pass through unchanged', () => {
  const result = validateClassification({
    category: 'BILLING_PAYMENTS',
    secondaryCategory: 'NONE',
    summary: 'Double charge',
    reasoning: 'Mentions "charged twice".',
    confidence: 0.9,
    requiresHumanReview: false,
  })
  assert.equal(result.category, 'BILLING_PAYMENTS')
  assert.equal(result.confidence, 0.9)
  assert.equal(result.requiresHumanReview, false)
})

test('off-taxonomy categories are rejected instead of silently bucketed', () => {
  // The old parser turned unknown model output into "General Inquiry",
  // which looked like a confident answer but was a guess.
  assert.equal(validateClassification({ category: 'Rocket Science' }), null)
  assert.equal(validateClassification({ category: 'Unknown' }), null)
  assert.equal(validateClassification({ summary: 'no category' }), null)
  assert.equal(validateClassification(null), null)
  assert.equal(validateClassification('a string'), null)
})

test('low confidence forces human review', () => {
  const result = validateClassification({
    category: 'TECHNICAL_PROBLEM',
    summary: 's',
    reasoning: 'r',
    confidence: 0.3,
    requiresHumanReview: false,
  })
  assert.equal(result.requiresHumanReview, true)
})

test('the OTHER category always forces human review', () => {
  const result = validateClassification({
    category: 'OTHER',
    summary: 's',
    reasoning: 'r',
    confidence: 0.99,
    requiresHumanReview: false,
  })
  assert.equal(result.requiresHumanReview, true)
})

test('confidence and text length are clamped', () => {
  const high = validateClassification({ category: 'HOW_TO', confidence: 9, summary: 's', reasoning: 'r' })
  assert.equal(high.confidence, 1)
  const low = validateClassification({ category: 'HOW_TO', confidence: -5, summary: 's', reasoning: 'r' })
  assert.equal(low.confidence, 0)
  const missing = validateClassification({ category: 'HOW_TO' })
  assert.equal(missing.summary, 'No summary returned.')
})

test('an invalid secondary category is dropped, not fatal', () => {
  const result = validateClassification({
    category: 'HOW_TO',
    secondaryCategory: 'NOT_A_CATEGORY',
    summary: 's',
    reasoning: 'r',
    confidence: 0.8,
  })
  assert.equal(result.secondary, null)
})

test('categorizeMessage degrades transparently when no API key is set', async () => {
  const original = process.env.GROQ_API_KEY
  const originalVite = process.env.VITE_GROQ_API_KEY
  delete process.env.GROQ_API_KEY
  delete process.env.VITE_GROQ_API_KEY

  try {
    const result = await categorizeMessage('My payment failed and I cannot access the dashboard')
    assert.equal(result.source, 'rules')
    assert.equal(result.degraded, true)
    assert.ok(result.error, 'the fallback reason must be surfaced, not swallowed')
    assert.ok(CATEGORY_IDS.includes(result.category))
  } finally {
    if (original !== undefined) process.env.GROQ_API_KEY = original
    if (originalVite !== undefined) process.env.VITE_GROQ_API_KEY = originalVite
  }
})

test('the rule-based fallback is deterministic', () => {
  const message = 'My payment failed and I cannot access the dashboard'
  assert.deepEqual(getRuleBasedCategorization(message), getRuleBasedCategorization(message))
})

test('the rule-based fallback reports multi-intent messages', () => {
  const result = getRuleBasedCategorization('I was charged twice AND the app is very slow')
  assert.equal(result.category, 'BILLING_PAYMENTS')
  assert.equal(result.secondary, 'TECHNICAL_PROBLEM')
  assert.equal(result.requiresHumanReview, true, 'multi-intent should be reviewed')
})

test('the rule-based fallback never returns a category outside the taxonomy', () => {
  const messages = [
    'Server down now',
    'Thank you so much!',
    'Could you add an export to CSV feature?',
    'zzzz qqqq',
    'My password reset email never arrived',
  ]
  for (const message of messages) {
    const result = getRuleBasedCategorization(message)
    assert.ok(CATEGORY_IDS.includes(result.category), `bad category for: ${message}`)
    if (result.secondary !== null) assert.ok(CATEGORY_IDS.includes(result.secondary))
  }
})

test('the rule-based fallback flags unclassifiable messages for review', () => {
  const result = getRuleBasedCategorization('zzzz qqqq')
  assert.equal(result.category, 'OTHER')
  assert.equal(result.requiresHumanReview, true)
})
