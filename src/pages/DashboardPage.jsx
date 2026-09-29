import { useState, useEffect } from 'react'
import { PRIORITY_LEVELS } from '../utils/triageConfig'

const LEVEL_BY_ID = Object.fromEntries(PRIORITY_LEVELS.map((tier) => [tier.level, tier]))

// Older history records stored only High/Medium/Low. Map them onto the
// current P0-P3 tiers so the charts stay consistent across versions.
function levelOf(item) {
  if (item.level) return item.level
  if (item.urgency === 'High') return 'P1'
  if (item.urgency === 'Low') return 'P3'
  return 'P2'
}

function DashboardPage() {
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    criticalPercent: 0,
    avgPerDay: 0,
    escalate: 0
  })
  const [categoryData, setCategoryData] = useState([])
  const [queueData, setQueueData] = useState([])
  const [levelData, setLevelData] = useState({ P0: 0, P1: 0, P2: 0, P3: 0 })

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = () => {
    const history = JSON.parse(localStorage.getItem('triageHistory') || '[]')
    const today = new Date().toDateString()
    const todayMessages = history.filter(item =>
      new Date(item.timestamp).toDateString() === today
    )

    // Average over the actual number of days represented, not a fixed 7.
    const days = new Set(history.map(item => new Date(item.timestamp).toDateString()))
    const totalDays = Math.max(days.size, 1)

    const levelCounts = { P0: 0, P1: 0, P2: 0, P3: 0 }
    history.forEach(item => {
      const level = levelOf(item)
      if (levelCounts[level] !== undefined) levelCounts[level] += 1
    })

    const categories = {}
    const queues = {}
    history.forEach(item => {
      const category = item.categoryLabel || item.category || 'Unknown'
      categories[category] = (categories[category] || 0) + 1
      const queue = item.queue || 'Unrouted'
      queues[queue] = (queues[queue] || 0) + 1
    })

    setStats({
      total: history.length,
      today: todayMessages.length,
      criticalPercent:
        history.length > 0 ? Math.round(((levelCounts.P0 + levelCounts.P1) / history.length) * 100) : 0,
      avgPerDay: Math.round(history.length / totalDays),
      escalate: history.filter(item => item.escalate).length
    })

    setCategoryData(
      Object.entries(categories).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    )
    setQueueData(
      Object.entries(queues).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    )
    setLevelData(levelCounts)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Overview of message triage analytics</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Messages</div>
            <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Today</div>
            <div className="text-3xl font-bold text-green-600">{stats.today}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">P0 + P1</div>
            <div className="text-3xl font-bold text-red-600">{stats.criticalPercent}%</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Escalated</div>
            <div className="text-3xl font-bold text-orange-600">{stats.escalate}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Avg Per Day</div>
            <div className="text-3xl font-bold text-purple-600">{stats.avgPerDay}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Category Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Category Distribution</h2>
            {categoryData.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No data yet</div>
            ) : (
              <div className="space-y-3">
                {categoryData.map((cat) => {
                  const percentage = stats.total > 0 ? (cat.count / stats.total) * 100 : 0
                  return (
                    <div key={cat.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{cat.name}</span>
                        <span className="text-gray-600">{cat.count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Priority Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Priority Breakdown</h2>
            {stats.total === 0 ? (
              <div className="text-center text-gray-500 py-8">No data yet</div>
            ) : (
              <div className="space-y-4">
                {PRIORITY_LEVELS.map((tier) => (
                  <div key={tier.level} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-4 h-4 rounded mr-2 ${tier.badgeClass}`}></div>
                      <div>
                        <span className="text-gray-700 font-medium">{tier.level} · {tier.label}</span>
                        <div className="text-xs text-gray-500">{tier.sla}</div>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-gray-700">{levelData[tier.level]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Routing Breakdown */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Routing Breakdown</h2>
          {queueData.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No data yet</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {queueData.map((queue) => (
                <div key={queue.name} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                  <span className="text-gray-700">{queue.name}</span>
                  <span className="font-bold text-blue-600">{queue.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insights Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-bold text-blue-900 mb-2">💡 Insights</h2>
          <div className="space-y-2 text-sm text-blue-800">
            {stats.criticalPercent > 30 && (
              <p>⚠️ P0 and P1 messages are {stats.criticalPercent}% of total volume - consider additional support resources</p>
            )}
            {stats.today > 10 && (
              <p>📈 High activity today with {stats.today} messages analyzed</p>
            )}
            {stats.total === 0 && (
              <p>👋 Start by analyzing some messages to see insights here</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
