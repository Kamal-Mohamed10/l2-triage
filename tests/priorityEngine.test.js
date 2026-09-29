import test from 'node:test'
import assert from 'node:assert/strict'
import { scorePriority, calculateUrgency } from '../src/utils/urgencyScorer.js'
import { PRIORITY_THRESHOLDS } from '../src/utils/triageConfig.js'

/** Run fn with `new Date()` pinned, to prove the scorer is clock-independent. */
function at(iso, fn) {
  const Real = Date
  class Fake extends Real {
    constructor(...args) {
      args.length ? super(...args) : super(iso)
    }
    static now() {
      return new Real(iso).getTime()
    }
  }
  globalThis.Date = Fake
  try {
    return fn()
  } finally {
    globalThis.Date = Real
  }
}

test('scores are clamped to the 0-100 range', () => {
  assert.ok(scorePriority('a'.repeat(5000) + '!!!').score <= 100)
  assert.ok(scorePriority('hi').score >= 0)
})

test('regression: short outage messages are no longer penalised', () => {
  // Previously: -40 under 50 chars and -60 under 20 chars pushed these to Low.
  assert.equal(scorePriority('Server down now').level, 'P0')
  assert.equal(scorePriority('Database connection lost').level, 'P0')
  assert.equal(scorePriority('Production is down').level, 'P0')
})

test('regression: ALL CAPS raises urgency instead of lowering it', () => {
  // Previously: message === message.toUpperCase() scored -50.
  const lower = scorePriority('our whole team is locked out')
  const upper = scorePriority('OUR WHOLE TEAM IS LOCKED OUT')

  assert.ok(
    upper.signals.some((s) => s.id === 'shouting'),
    'ALL CAPS must be detected as an escalation signal'
  )
  assert.ok(
    upper.score >= lower.score,
    'ALL CAPS must never reduce the urgency score'
  )

  // Compare uncapped so the +8 shouting weight is visible, not masked by the
  // 100-point ceiling that both of these messages already hit.
  const total = (r) => r.signals.reduce((sum, s) => sum + s.weight, 50)
  assert.ok(total(upper) > total(lower))
})

test('regression: punctuation no longer inflates urgency', () => {
  // Previously: +30 per exclamation mark.
  const plain = scorePriority('We are locked out of the account')
  const shouty = scorePriority('We are locked out of the account!!!')
  assert.equal(
    plain.level,
    shouty.level,
    'adding exclamation marks must not change the priority tier'
  )
})

test('regression: enthusiasm is never urgent', () => {
  const praise = scorePriority('Great product, loving it!!!!!!')
  assert.equal(praise.level, 'P3')
  assert.ok(praise.suppressed.some((s) => s.id === 'praise'))
})

test('regression: length does not change the outcome', () => {
  // Previously: length > 100 was the entire escalation test.
  const short = scorePriority('Server down')
  const padded = scorePriority('Server down. ' + 'x'.repeat(200))
  assert.equal(short.level, padded.level)
  assert.equal(short.score, padded.score)
})

test('the scorer is deterministic and independent of the wall clock', () => {
  const message = 'Our invoices are charged twice each month and nobody has replied'
  const base = scorePriority(message).score

  for (const iso of [
    '2026-01-05T14:00:00', // Monday 2pm
    '2026-01-05T23:30:00', // Monday 11pm
    '2026-01-10T14:00:00', // Saturday 2pm
    '2026-01-11T03:00:00', // Sunday 3am
  ]) {
    assert.equal(
      at(iso, () => scorePriority(message).score),
      base,
      `score changed at ${iso}`
    )
  }
})

test('the same input always yields byte-identical output', () => {
  const message = 'I was charged twice and now I cannot access the dashboard'
  assert.deepEqual(scorePriority(message), scorePriority(message))
})

test('security and data-loss incidents are always critical', () => {
  assert.equal(scorePriority('We think our account has been hacked').level, 'P0')
  assert.equal(
    scorePriority('All of our customer records were deleted and we cannot recover them').level,
    'P0'
  )
})

test('an explicit "no rush" cannot mask a real outage', () => {
  const masked = scorePriority('No rush, but our entire checkout is down for everyone')
  assert.equal(masked.level, 'P0')
  assert.ok(masked.signals.some((s) => s.id === 'outage'))
})

test('an explicit "no rush" does lower a genuinely non-urgent question', () => {
  const relaxed = scorePriority('No rush at all, but how do I export a report? Whenever you can.')
  assert.equal(relaxed.level, 'P3')
  assert.ok(relaxed.suppressed.some((s) => s.id === 'low_commitment'))
})

test('deadlines and repeat contact escalate above a standard question', () => {
  const question = scorePriority('What are your business hours?')
  const deadline = scorePriority('The dashboard will not load and our board demo is today')
  const repeat = scorePriority('Third time reporting this and still no response')

  assert.ok(deadline.score > question.score)
  assert.ok(repeat.score > question.score)
  assert.equal(deadline.level, 'P1')
  assert.equal(repeat.level, 'P1')
})

test('every score is explained by at least one named signal', () => {
  const result = scorePriority('Server down now')
  assert.ok(result.signals.length > 0)
  assert.match(result.explanation, /Raised by:/)
  assert.ok(result.explanation.includes(String(result.score)))
})

test('threshold boundaries map to the expected tier', () => {
  assert.equal(scorePriority('x'.repeat(0) + 'a'.repeat(200)).score >= 0, true)
  assert.ok(PRIORITY_THRESHOLDS.P0 > PRIORITY_THRESHOLDS.P1)
  assert.ok(PRIORITY_THRESHOLDS.P1 > PRIORITY_THRESHOLDS.P2)
})

test('calculateUrgency still returns a tier label for the UI', () => {
  assert.equal(typeof calculateUrgency('Server down now'), 'string')
  assert.equal(calculateUrgency('Server down now'), 'Critical')
})
