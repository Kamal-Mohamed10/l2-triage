import { useState, useEffect } from 'react'
import { PRIORITY_LEVELS } from '../utils/triageConfig'

const LEVEL_BY_ID = Object.fromEntries(PRIORITY_LEVELS.map((tier) => [tier.level, tier]))

// Records written by older versions have no `level`. Fall back to the legacy
// High/Medium/Low labels so a saved history never renders as blank.
function tierFor(item) {
  if (item.level) return LEVEL_BY_ID[item.level]
  if (item.urgency === 'High') return { level: 'P1', badgeClass: 'bg-orange-500 text-white' }
  if (item.urgency === 'Low') return { level: 'P3', badgeClass: 'bg-green-500 text-white' }
  return { level: 'P2', badgeClass: 'bg-yellow-400 text-yellow-900' }
}

function HistoryPage() {
  const [history, setHistory] = useState([])
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = () => {
    const savedHistory = JSON.parse(localStorage.getItem('triageHistory') || '[]')
    setHistory(savedHistory)
  }

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear all history?')) {
      localStorage.setItem('triageHistory', '[]')
      setHistory([])
    }
  }

  // Newest first - support agents want the most recent queue state, not
  // alphabetical order (the previous sort was by message text).
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  )

  const filteredHistory = filter === 'all'
    ? sortedHistory
    : sortedHistory.filter(item => item.category === filter)

  const categories = [...new Set(history.map(item => item.category))]

  const categoryLabel = (item) =>
    item.categoryLabel ||
    item.category?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) ||
    'Unknown'

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analysis History</h1>
              <p className="text-gray-600">View and manage past message analyses</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 font-semibold"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Filter Buttons */}
          {history.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({history.length})
              </button>
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setFilter(category)}
                  className={`px-4 py-2 rounded-lg font-semibold ${
                    filter === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category} ({history.filter(h => h.category === category).length})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* History List */}
        {filteredHistory.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <div className="text-xl text-gray-600 mb-2">No history yet</div>
            <p className="text-gray-500 mb-6">
              Analyzed messages will appear here
            </p>
            <a
              href="/analyze"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Analyze a Message
            </a>
          </div>
        )}

        <div className="space-y-4">
          {filteredHistory.map((item) => {
            const key = item.timestamp
            const tier = tierFor(item)
            return (
            <div
              key={key}
              className="bg-white rounded-lg shadow-md overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === key ? null : key)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                    <div className="text-gray-800 font-medium mb-2">
                      "{item.message.substring(0, 100)}{item.message.length > 100 ? '...' : ''}"
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                        {categoryLabel(item)}
                      </span>
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold ${tier.badgeClass}`}>
                        {tier.level} &middot; {item.urgency}
                      </span>
                      {item.queue && (
                        <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium">
                          {item.queueIcon} {item.queue}
                        </span>
                      )}
                      {item.escalate && (
                        <span className="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-semibold">
                          Escalate
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-400 ml-4">
                    {expandedId === key ? '▲' : '▼'}
                  </div>
                </div>
              </div>

              {expandedId === key && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Full Message</div>
                      <div className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200">
                        {item.message}
                      </div>
                    </div>
                    {item.priorityExplanation && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">Why this priority</div>
                        <div className="text-sm text-gray-700">{item.priorityExplanation}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Recommended Action</div>
                      <div className="text-sm text-gray-800 bg-purple-50 p-3 rounded border border-purple-200">
                        {item.recommendedAction}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Reasoning</div>
                      <div className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-200">
                        {item.reasoning}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default HistoryPage
