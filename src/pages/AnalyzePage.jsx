import { useState, useEffect } from 'react'
import { triageMessage } from '../utils/triageEngine'
import { isLlmConfigured } from '../utils/llmHelper'
import { PRIORITY_LEVELS } from '../utils/triageConfig'
import { MIN_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH } from '../utils/validation'

const LEVEL_BY_ID = Object.fromEntries(PRIORITY_LEVELS.map((tier) => [tier.level, tier]))

function AnalyzePage() {
  const [message, setMessage] = useState('')
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const llmReady = isLlmConfigured()

  useEffect(() => {
    // Check for example message from home page
    const exampleMessage = localStorage.getItem('exampleMessage')
    if (exampleMessage) {
      setMessage(exampleMessage)
      localStorage.removeItem('exampleMessage')
    }
  }, [])

  const handleAnalyze = async () => {
    setError(null)

    setIsLoading(true)
    setResults(null)

    try {
      const { ok, error: validationError, result } = await triageMessage(message)

      if (!ok) {
        setError(validationError)
        return
      }

      setResults(result)

      // Save to history
      const history = JSON.parse(localStorage.getItem('triageHistory') || '[]')
      history.push(result)
      localStorage.setItem('triageHistory', JSON.stringify(history))
    } catch (err) {
      console.error('Error analyzing message:', err)
      setError('Something went wrong while analyzing this message. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setMessage('')
    setResults(null)
    setError(null)
    setCopied(false)
  }

  const tier = results ? LEVEL_BY_ID[results.level] : null
  const tooShort = message.trim().length > 0 && message.trim().length < MIN_MESSAGE_LENGTH
  const tooLong = message.length > MAX_MESSAGE_LENGTH
  const canSubmit = message.trim().length >= MIN_MESSAGE_LENGTH && !tooLong && !isLoading

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Analyze Customer Message</h1>
          <p className="text-gray-600 mb-6">
            Paste a customer support message below to automatically categorize and prioritize.
          </p>

          {!llmReady && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
              <strong>Rule-based mode.</strong> No Groq API key configured, so categories come
              from deterministic keyword rules instead of the model. Priority is always
              computed locally and is unaffected. Add <code>VITE_GROQ_API_KEY</code> to
              <code>.env.local</code> to enable LLM classification.
            </div>
          )}

          {/* Input Section */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Customer Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Paste customer message here..."
              className="w-full border border-gray-300 rounded-lg p-3 h-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
            <div className={`text-sm mt-1 ${tooShort || tooLong ? 'text-red-600' : 'text-gray-500'}`}>
              {message.length} characters
              {tooShort && ` — needs at least ${MIN_MESSAGE_LENGTH}`}
              {tooLong && ` — maximum is ${MAX_MESSAGE_LENGTH}`}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleAnalyze}
              disabled={!canSubmit}
              className={`flex-1 py-3 rounded-lg font-semibold ${
                !canSubmit
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                'Analyze Message'
              )}
            </button>
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Results Section */}
        {results && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Analysis Results</h2>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  results.source === 'llm'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {results.source === 'llm' ? 'AI classified' : 'Rule-based classified'}
              </span>
            </div>

            {results.degraded && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
                <strong>Degraded mode:</strong> {results.degradedReason}. The category below came
                from deterministic rules rather than the model. Priority is always computed locally.
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-1">Priority</div>
                  <div className={`inline-block px-4 py-2 rounded-lg font-semibold ${tier?.badgeClass}`}>
                    {results.level} &middot; {results.urgency}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{results.sla}</div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-1">Route To</div>
                  <div className="inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold">
                    {results.queueIcon} {results.queue}
                  </div>
                  {results.escalate && (
                    <div className="text-xs text-red-600 mt-1 font-semibold">
                      Escalate to a human
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">
                  Priority Score <span className="font-normal text-gray-400">({results.score}/100)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className={`h-3 rounded-full ${tier?.badgeClass}`} style={{ width: `${results.score}%` }} />
                </div>
                <p className="text-xs text-gray-600 mt-2">{results.priorityExplanation}</p>
              </div>

              {results.signals.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-2">Impact Signals</div>
                  <div className="flex flex-wrap gap-2">
                    {results.signals.map((signal) => (
                      <span
                        key={signal.id}
                        className="text-xs bg-orange-100 text-orange-900 px-3 py-1 rounded-full font-medium"
                      >
                        {signal.label} <span className="font-bold">+{signal.weight}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {results.suppressed.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-2">Deprioritised By</div>
                  <div className="flex flex-wrap gap-2">
                    {results.suppressed.map((signal) => (
                      <span
                        key={signal.id}
                        className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium"
                      >
                        {signal.label} <span className="font-bold">-{signal.weight}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Category</div>
                <div className="inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold">
                  {results.categoryLabel}
                </div>
                {results.secondaryLabel && (
                  <div className="text-sm text-gray-600 mt-2">
                    Also mentions: <span className="font-medium">{results.secondaryLabel}</span>
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  Confidence {(results.confidence * 100).toFixed(0)}%
                  {results.requiresHumanReview && ' · flagged for human review'}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Summary</div>
                <p className="text-gray-800">{results.summary}</p>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Recommended Action</div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-gray-800">{results.recommendedAction}</p>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">
                  {results.source === 'llm' ? 'AI Reasoning' : 'Rule Reasoning'}
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-700 text-sm">{results.reasoning}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={async () => {
                  const text = [
                    `Priority: ${results.level} (${results.urgency}) - score ${results.score}/100`,
                    `Category: ${results.categoryLabel}`,
                    results.secondaryLabel ? `Also mentions: ${results.secondaryLabel}` : null,
                    `Route to: ${results.queue}${results.escalate ? ' (ESCALATE)' : ''}`,
                    `SLA: ${results.sla}`,
                    `Why: ${results.priorityExplanation}`,
                    `Action: ${results.recommendedAction}`,
                    `Summary: ${results.summary}`,
                  ]
                    .filter(Boolean)
                    .join('\n')
                  try {
                    await navigator.clipboard.writeText(text)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch {
                    setError('Could not copy to clipboard.')
                  }
                }}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-semibold"
              >
                {copied ? '✓ Copied' : '📋 Copy Results'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalyzePage
