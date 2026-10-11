import { useState } from 'react'
import { api } from '../api'
import { Icon, TopBar, HintPanel, ErrorNote, useCountdown } from '../components/ui'

/* The rail is the "workplace". Only the assistant is interactive in the PoC;
   the rest establishes that this is an office, not a hacking terminal. */
const WORKPLACE = [
  { id: 'chatbot', label: 'Northwind Assistant', icon: 'chatbot', live: true },
  { id: 'laptop', label: 'My workstation', icon: 'laptop' },
  { id: 'email', label: 'Mail', icon: 'email' },
  { id: 'files', label: 'Shared drive', icon: 'files' },
]

export default function RedGameplay({ session, onFinish, onExit }) {
  const { session_id: sessionId, scenario, player, ai_mode } = session

  const [messages, setMessages] = useState([
    {
      from: 'target',
      text: 'Hi, I can help with leave, payroll and office questions. What do you need?',
    },
  ])
  const [draft, setDraft] = useState('')
  const [verdict, setVerdict] = useState(null)
  const [hints, setHints] = useState([])
  const [hintsLeft, setHintsLeft] = useState(scenario.hint_count)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aiMode, setAiMode] = useState(ai_mode)

  const [remaining] = useCountdown(scenario.duration_seconds, () =>
    onFinish(sessionId),
  )

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return

    setBusy(true)
    setError('')
    setMessages((m) => [...m, { from: 'user', text }])
    setDraft('')

    try {
      const result = await api.submitAttempt(sessionId, text)
      setMessages((m) => [...m, { from: 'target', text: result.reply }])
      setVerdict(result)
      setAiMode(result.ai_mode)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const reveal = async () => {
    setBusy(true)
    try {
      const hint = await api.revealHint(sessionId)
      setHints((h) => [...h, hint])
      setHintsLeft(hint.remaining_hints)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app" data-team="red">
      <TopBar
        context={`${scenario.title} · ${player}`}
        team="red"
        remaining={remaining}
        aiMode={aiMode}
        onExit={onExit}
      />

      <div className="work">
        <nav className="rail">
          <div className="rail-heading">Northwind Logistics</div>
          {WORKPLACE.map((item) => (
            <button
              key={item.id}
              className="rail-item"
              aria-current={item.live}
              data-static={!item.live}
              disabled={!item.live}
              title={item.live ? undefined : 'Not part of this scenario'}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
          <div className="rail-foot">
            Only the assistant is in scope for this exercise.
          </div>
        </nav>

        <main className="surface">
          <div className="objective">
            <strong>Objective</strong>
            {scenario.objective}
          </div>

          <div className="panel">
            <div className="panel-head">
              <Icon name="chatbot" />
              Northwind Assistant
            </div>

            <div className="chat">
              {messages.map((m, i) => (
                <div className="msg" data-from={m.from} key={i}>
                  <div className="msg-role">
                    {m.from === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="msg-body">{m.text}</div>
                </div>
              ))}
              {busy && (
                <div className="msg" data-from="target">
                  <div className="msg-role">Assistant</div>
                  <div className="msg-body">Typing…</div>
                </div>
              )}
            </div>

            <div className="composer">
              <textarea
                value={draft}
                placeholder="Write what you'd send the assistant."
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
                }}
                maxLength={4000}
                disabled={busy || remaining <= 0}
              />
              <div className="composer-foot">
                <span className="char-count">{draft.length} / 4000</span>
                <span className="spacer" />
                <button
                  className="btn"
                  onClick={send}
                  disabled={busy || !draft.trim() || remaining <= 0}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          <ErrorNote message={error} />

          {verdict && (
            <div
              className="verdict"
              style={{
                '--accent': verdict.succeeded ? 'var(--green)' : 'var(--amber)',
              }}
            >
              <div className="verdict-head">
                {verdict.succeeded
                  ? 'Objective reached'
                  : verdict.detected
                    ? 'Blocked and logged'
                    : 'No effect'}
              </div>
              <p>{verdict.rationale}</p>
              {verdict.techniques.length > 0 && (
                <div className="chips">
                  {verdict.techniques.map((t) => (
                    <span className="chip" key={t.id} title={t.note}>
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <HintPanel
            hints={hints}
            remainingHints={hintsLeft}
            onReveal={reveal}
            busy={busy}
          />

          <div className="btn-row">
            <button className="btn" onClick={() => onFinish(sessionId)}>
              Finish and score
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
