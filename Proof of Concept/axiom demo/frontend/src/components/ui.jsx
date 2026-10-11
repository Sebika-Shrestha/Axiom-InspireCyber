import { useEffect, useState } from 'react'
import { formatClock } from '../api'

/* Inline SVG so the PoC has no icon dependency to install. */
const PATHS = {
  chatbot: 'M4 5h16v10H8l-4 4V5z',
  email: 'M3 6h18v12H3V6zm0 1l9 6 9-6',
  system: 'M4 5h16v11H4V5zm4 15h8M12 16v4',
  files: 'M4 5h6l2 2h8v11H4V5z',
  laptop: 'M5 6h14v9H5V6zM3 18h18',
  shield: 'M12 3l7 3v6c0 4-3 6.5-7 9-4-2.5-7-5-7-9V6l7-3z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
}

export function Icon({ name, size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.system} />
    </svg>
  )
}

export function TopBar({ context, team, remaining, aiMode, onExit }) {
  return (
    <header className="topbar">
      <span className="wordmark">AXIOM</span>
      {context && <span className="topbar-context">{context}</span>}

      <div className="topbar-right">
        {aiMode && (
          <span className="mode-pill" data-mode={aiMode}>
            {aiMode === 'live' ? 'Claude evaluation' : 'Offline evaluation'}
          </span>
        )}
        {team && (
          <span className="team-tag">
            {team === 'red' ? 'Red Team' : 'Blue Team'}
          </span>
        )}
        {typeof remaining === 'number' && (
          <span className="timer" data-low={remaining <= 60}>
            {formatClock(remaining)}
          </span>
        )}
        {onExit && (
          <button className="btn btn-hud" onClick={onExit}>
            End exercise
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * Counts down from `duration`. Calls onExpire once when it hits zero.
 * The server holds the authoritative clock; this is the visible one.
 */
export function useCountdown(duration, onExpire) {
  const [remaining, setRemaining] = useState(duration)

  useEffect(() => setRemaining(duration), [duration])

  useEffect(() => {
    if (remaining <= 0) return undefined
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id)
          onExpire?.()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining > 0])

  return [remaining, setRemaining]
}

export function HintPanel({ hints, remainingHints, onReveal, busy }) {
  return (
    <>
      {hints.map((hint, i) => (
        <div className="hint" key={i}>
          <div className="hint-label">
            Hint {i + 1} · costs {hint.cost} points
          </div>
          {hint.text}
        </div>
      ))}

      {remainingHints > 0 && (
        <button className="btn btn-quiet" onClick={onReveal} disabled={busy}>
          Show a hint ({remainingHints} left)
        </button>
      )}
    </>
  )
}

export function ErrorNote({ message }) {
  if (!message) return null
  return <div className="error">{message}</div>
}
