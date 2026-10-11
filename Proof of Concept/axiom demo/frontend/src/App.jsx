import { useEffect, useState } from 'react'
import { api } from './api'
import { Landing, RoleSelect, ScenarioSelect } from './screens/Setup'
import RedGameplay from './screens/RedGameplay'
import BlueInvestigation from './screens/BlueInvestigation'
import { Results, Leaderboard } from './screens/Outcome'
import { ErrorNote } from './components/ui'

/*
 * The whole flow from the brief, as one state machine:
 *
 *   landing → role → scenario → play → results → leaderboard
 *
 * `play` branches to Red or Blue on the session's team.
 */

export default function App() {
  const [screen, setScreen] = useState('landing')
  const [player, setPlayer] = useState('')
  const [team, setTeam] = useState(null)
  const [session, setSession] = useState(null)
  const [result, setResult] = useState(null)
  const [aiMode, setAiMode] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .health()
      .then((h) => setAiMode(h.ai_mode))
      .catch(() =>
        setError(
          'Cannot reach the Axiom API. Start the backend, then reload this page.',
        ),
      )
  }, [])

  const startScenario = async (scenarioId, forTeam = team) => {
    setError('')
    try {
      const s = await api.startSession(player, forTeam, scenarioId)
      setTeam(forTeam)
      setSession(s)
      setScreen('play')
    } catch (e) {
      setError(e.message)
    }
  }

  const finish = async (sessionId) => {
    try {
      const r = await api.complete(sessionId)
      setResult(r)
      setScreen('results')
    } catch (e) {
      setError(e.message)
    }
  }

  const home = () => {
    setSession(null)
    setResult(null)
    setTeam(null)
    setScreen('landing')
  }

  if (screen === 'landing') {
    return (
      <>
        <Landing
          aiMode={aiMode}
          onStart={(name) => {
            setPlayer(name)
            setScreen('role')
          }}
        />
        {error && (
          <div style={{ padding: 24 }}>
            <ErrorNote message={error} />
          </div>
        )}
      </>
    )
  }

  if (screen === 'role') {
    return (
      <RoleSelect
        player={player}
        onBack={home}
        onPick={(t) => {
          setTeam(t)
          setScreen('scenario')
        }}
      />
    )
  }

  if (screen === 'scenario') {
    return (
      <ScenarioSelect
        player={player}
        team={team}
        onPick={startScenario}
        onBack={() => setScreen('role')}
        onLeaderboard={() => setScreen('leaderboard')}
      />
    )
  }

  if (screen === 'play' && session) {
    const props = {
      session,
      onFinish: finish,
      onExit: () => setScreen('scenario'),
    }
    return session.team === 'red' ? (
      <RedGameplay {...props} />
    ) : (
      <BlueInvestigation {...props} />
    )
  }

  if (screen === 'results' && result) {
    return (
      <Results
        result={result}
        onRetry={() => startScenario(session.scenario.id, result.team)}
        onNext={(id) => startScenario(id, result.team)}
        onLeaderboard={() => setScreen('leaderboard')}
        onHome={home}
      />
    )
  }

  if (screen === 'leaderboard') {
    return (
      <Leaderboard
        player={player}
        team={team}
        onBack={() => setScreen(result ? 'results' : 'scenario')}
      />
    )
  }

  return null
}
