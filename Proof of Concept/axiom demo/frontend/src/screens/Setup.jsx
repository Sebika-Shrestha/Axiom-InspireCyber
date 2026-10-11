import { useEffect, useState } from 'react'
import { api, formatClock } from '../api'
import { Icon, TopBar, ErrorNote } from '../components/ui'

/* ---------------------------------------------------------------- Landing */

export function Landing({ onStart, aiMode }) {
  const [name, setName] = useState('')

  const begin = () => onStart(name.trim() || 'Trainee')

  return (
    <div className="app">
      <TopBar aiMode={aiMode} />
      <div className="stage">
        <div className="stage-inner landing">
          <div className="landing-mark">AXIOM</div>
          <div className="landing-rule" />
          <p className="landing-lede">
            Attack and defend a simulated workplace where the AI tools are part
            of the attack surface. Two scenarios, two sides, one clock.
          </p>

          <div className="field">
            <label htmlFor="player">Your name</label>
            <input
              id="player"
              value={name}
              placeholder="Used on the leaderboard"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && begin()}
              maxLength={40}
            />
          </div>

          <button className="btn" onClick={begin}>
            Start training
          </button>

          <div className="notice">
            Everything here is simulated. The systems you attack are mock
            targets defined in the scenario files, and the credentials they
            protect are fake.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- Role selection */

const ROLES = [
  {
    team: 'red',
    name: 'Red Team',
    accent: 'var(--red)',
    line: 'You are trying to get something out of a system that was told not to give it to you.',
    duties: [
      'Find where the AI trusts its input',
      'Build a pretext and test it',
      'Reach the objective before the clock runs out',
    ],
  },
  {
    team: 'blue',
    name: 'Blue Team',
    accent: 'var(--blue)',
    line: 'Something already happened. You have the logs and a decision to make.',
    duties: [
      'Read the evidence the monitoring captured',
      'Work out which attack this was',
      'Choose the containment action that fits',
    ],
  },
]

export function RoleSelect({ player, onPick, onBack }) {
  return (
    <div className="app">
      <TopBar context={player} />
      <div className="stage">
        <div className="stage-inner">
          <h1 className="screen-title">Pick a side</h1>
          <p className="screen-sub">
            You can play the same scenario from either side. Running Red first
            makes the Blue evidence read very differently.
          </p>

          <div className="role-grid">
            {ROLES.map((role) => (
              <button
                key={role.team}
                className="role-card"
                style={{ '--accent': role.accent }}
                onClick={() => onPick(role.team)}
              >
                <h3>{role.name}</h3>
                <p>{role.line}</p>
                <ul>
                  {role.duties.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </button>
            ))}
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

/* ------------------------------------------------------- Scenario selection */

export function ScenarioSelect({ player, team, onPick, onBack, onLeaderboard }) {
  const [scenarios, setScenarios] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .scenarios()
      .then((data) => setScenarios(data.scenarios))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="app" data-team={team}>
      <TopBar context={player} team={team} />
      <div className="stage">
        <div className="stage-inner">
          <h1 className="screen-title">Choose a scenario</h1>
          <p className="screen-sub">
            Each one runs on a clock. Hints are available and cost points.
          </p>

          <ErrorNote message={error} />

          <div className="scenario-grid">
            {scenarios.map((s) => (
              <button
                key={s.id}
                className="scenario-card"
                onClick={() => onPick(s.id)}
              >
                <div className="scenario-head">
                  <Icon name={s.icon} size={20} />
                  <h3>{s.title}</h3>
                </div>
                <p>{s.subtitle}</p>
                <div className="meta-row">
                  <span>{s.difficulty}</span>
                  <span>{formatClock(s.duration_seconds)} limit</span>
                </div>
              </button>
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="btn btn-hud" onClick={onBack}>
              Change side
            </button>
            <button className="btn btn-hud" onClick={onLeaderboard}>
              Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
