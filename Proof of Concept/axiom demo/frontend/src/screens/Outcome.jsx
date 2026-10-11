import { useEffect, useState } from 'react'
import { api, formatClock } from '../api'
import { TopBar, ErrorNote } from '../components/ui'

/* --------------------------------------------------------------- Results */

export function Results({ result, onRetry, onNext, onLeaderboard, onHome }) {
  return (
    <div className="app" data-team={result.team}>
      <TopBar context={result.player} team={result.team} />
      <div className="stage">
        <div className="stage-inner" style={{ maxWidth: 820 }}>
          <div className="result-card">
            <div className="result-head">
              <div className="result-score">{result.score}</div>
              <div className="result-scenario">
                {result.scenario_title} · finished in{' '}
                {formatClock(result.elapsed)}
              </div>
            </div>

            <div className="result-cols">
              <div className="result-col">
                <h4>How that was scored</h4>
                <table className="breakdown">
                  <tbody>
                    {result.breakdown.length === 0 && (
                      <tr>
                        <td colSpan={2}>
                          No points scored. The objective was not met.
                        </td>
                      </tr>
                    )}
                    {result.breakdown.map((line) => (
                      <tr
                        key={line.label}
                        className={line.points < 0 ? 'negative' : ''}
                      >
                        <td>{line.label}</td>
                        <td>
                          {line.points > 0 ? '+' : ''}
                          {line.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="result-col">
                <h4>Objectives</h4>
                <ul className="checks">
                  {result.checks.map((c) => (
                    <li key={c.label}>
                      <span className="check-mark" data-passed={c.passed}>
                        {c.passed ? '✓' : '·'}
                      </span>
                      {c.label}
                    </li>
                  ))}
                </ul>

                {result.techniques.length > 0 && (
                  <>
                    <h4 style={{ marginTop: 18 }}>Techniques you used</h4>
                    <ul className="checks">
                      {result.techniques.map((t) => (
                        <li key={t.id}>
                          <span className="check-mark">✓</span>
                          {t.label}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="learning">
              <h4>What this scenario was teaching</h4>
              <p>{result.learning_outcome}</p>
              {result.debrief_points?.length > 0 && (
                <ul>
                  {result.debrief_points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-actions">
              <button className="btn" onClick={onRetry}>
                Run it again
              </button>
              {result.next_scenario_id && (
                <button
                  className="btn btn-quiet"
                  onClick={() => onNext(result.next_scenario_id)}
                >
                  Next scenario
                </button>
              )}
              <button className="btn btn-quiet" onClick={onLeaderboard}>
                Leaderboard
              </button>
              <button className="btn btn-quiet" onClick={onHome}>
                Start over
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- Leaderboard */

export function Leaderboard({ player, team, onBack }) {
  const [entries, setEntries] = useState([])
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.leaderboard(), api.progress(player)])
      .then(([board, prog]) => {
        setEntries(board.entries)
        setProgress(prog)
      })
      .catch((e) => setError(e.message))
  }, [player])

  const pct = progress
    ? Math.round(
        (progress.scenarios_completed / Math.max(1, progress.scenarios_total)) *
          100,
      )
    : 0

  return (
    <div className="app" data-team={team || 'red'}>
      <TopBar context={player} team={team} />
      <div className="stage">
        <div className="stage-inner">
          <h1 className="screen-title">Standings</h1>
          <p className="screen-sub">
            Best run per player, per scenario, per side. Ties break on time.
          </p>

          <ErrorNote message={error} />

          <div className="board-layout">
            <div className="panel">
              <table className="board">
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    <th>Player</th>
                    <th>Scenario</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={`${e.player}-${e.scenario_id}-${e.team}`}
                      data-me={e.player.toLowerCase() === player.toLowerCase()}
                    >
                      <td className="rank">{e.rank}</td>
                      <td>
                        <span className="dot" data-team={e.team} />
                        {e.player}
                      </td>
                      <td>{e.scenario_title}</td>
                      <td className="score">{e.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {progress && (
              <div className="progress-card">
                <h4 style={{ marginBottom: 14 }}>Your progress</h4>
                <div className="stat">
                  <span>Scenarios completed</span>
                  <span>
                    {progress.scenarios_completed} / {progress.scenarios_total}
                  </span>
                </div>
                <div className="stat">
                  <span>Best Red Team score</span>
                  <span>{progress.red_best}</span>
                </div>
                <div className="stat">
                  <span>Best Blue Team score</span>
                  <span>{progress.blue_best}</span>
                </div>
                <div className="stat">
                  <span>Fastest completion</span>
                  <span>
                    {progress.best_time === null
                      ? '—'
                      : formatClock(progress.best_time)}
                  </span>
                </div>
                <div className="bar">
                  <div style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="btn btn-hud" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
