// Every backend call lives here. Vite proxies /api to FastAPI on :8000,
// so no host or port appears anywhere in the components.

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body.detail) detail = body.detail
    } catch {
      // Response had no JSON body. Keep the status message.
    }
    throw new Error(detail)
  }

  return res.json()
}

export const api = {
  health: () => request('/health'),

  scenarios: () => request('/scenarios'),

  startSession: (player, team, scenarioId) =>
    request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ player, team, scenario_id: scenarioId }),
    }),

  submitAttempt: (sessionId, text) =>
    request(`/sessions/${sessionId}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  submitInvestigation: (sessionId, classification, responseAction) =>
    request(`/sessions/${sessionId}/investigation`, {
      method: 'POST',
      body: JSON.stringify({
        classification,
        response_action: responseAction,
      }),
    }),

  revealHint: (sessionId) =>
    request(`/sessions/${sessionId}/hints`, { method: 'POST' }),

  complete: (sessionId) =>
    request(`/sessions/${sessionId}/complete`, { method: 'POST' }),

  leaderboard: () => request('/leaderboard'),

  progress: (player) => request(`/progress/${encodeURIComponent(player)}`),
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const m = String(Math.floor(safe / 60)).padStart(2, '0')
  const s = String(safe % 60).padStart(2, '0')
  return `${m}:${s}`
}
