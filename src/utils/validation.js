/**
 * Input Validation - rejects messages that cannot produce a useful triage.
 *
 * Previously any non-empty string was accepted, so "hi" produced a confident
 * "General Inquiry / Low" result that looked identical to a real analysis.
 * Now bad input is refused up front, before any tokens are spent.
 */

/** Below this, a message is too short to classify meaningfully. */
export const MIN_MESSAGE_LENGTH = 10

/** Above this, it is almost certainly a paste of the wrong thing. */
export const MAX_MESSAGE_LENGTH = 5000

/**
 * Validate a raw customer message.
 *
 * @param {string} message
 * @returns {{valid: boolean, error: string|null, cleaned: string}}
 */
export function validateMessage(message) {
  const cleaned = (message || '').trim()

  if (cleaned.length === 0) {
    return { valid: false, error: 'Please enter a message to analyze.', cleaned }
  }

  if (cleaned.length < MIN_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message is too short to triage (${cleaned.length} characters, minimum ${MIN_MESSAGE_LENGTH}). Please include what happened.`,
      cleaned,
    }
  }

  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message is too long (${cleaned.length} characters, maximum ${MAX_MESSAGE_LENGTH}). Please send only the relevant part.`,
      cleaned,
    }
  }

  // A message with no letters or digits is not a support message.
  if (!/[\p{L}\p{N}]/u.test(cleaned)) {
    return {
      valid: false,
      error: 'Message contains no readable text.',
      cleaned,
    }
  }

  return { valid: true, error: null, cleaned }
}
