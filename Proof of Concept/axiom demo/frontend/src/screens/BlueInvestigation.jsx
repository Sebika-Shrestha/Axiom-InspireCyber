import { useState } from 'react'
import { api } from '../api'
import { Icon, TopBar, HintPanel, ErrorNote, useCountdown } from '../components/ui'

export default function BlueInvestigation({ session, onFinish, onExit }) {
  const { session_id: sessionId, scenario, player, ai_mode } = session
  const evidence = scenario.evidence

  const [openId, setOpenId] = useState(evidence[0].id)
  const [reviewed, setReviewed] = useState(new Set([evidence[0].id]))
  const [classification, setClassification] = useState(null)
  const [responseAction, setResponseAction] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [hints, setHints] = useState([])
  const [hintsLeft, setHintsLeft] = useState(scenario.hint_count)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [remaining] = useCountdown(scenario.duration_seconds, () =>
    onFinish(sessionId),
  )

  const open = evidence.find((e) => e.id === openId)

  const view = (id) => {
    setOpenId(id)
    setReviewed((prev) => new Set(prev).add(id))
  }

  const submit = async () => {
    if (!classification || !responseAction) return
    setBusy(true)
    setError('')
    try {
      const result = await api.submitInvestigation(
        sessionId,
        classification,
        responseAction,
      )
      setFeedback(result)
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
    <div className="app" data-team="blue">
      <TopBar
        context={`${scenario.title} · ${player}`}
        team="blue"
        remaining={remaining}
        aiMode={ai_mode}
        onExit={onExit}
      />

      <div className="work">
        <nav className="rail">
          <div className="rail-heading">Evidence</div>
          {evidence.map((item) => (
            <button
              key={item.id}
              className="rail-item"
              aria-current={item.id === openId}
              onClick={() => view(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
          <div className="rail-foot">
            {reviewed.size} of {evidence.length} artifacts opened
          </div>
        </nav>

        <main className="surface">
          <div className="objective">
            <strong>Incident</strong>
            {scenario.briefing}
          </div>

          <div className="panel">
            <div className="panel-head">
              <Icon name={open.icon} />
              {open.label}
            </div>
            <div className="panel-body log mono">{open.body}</div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <Icon name="shield" />
              Your findings
            </div>
            <div className="panel-body">
              <div className="field-label">What happened here?</div>
              <div className="choice-group">
                {scenario.classification_options.map((opt) => (
                  <button
                    key={opt}
                    className="choice"
                    aria-pressed={classification === opt}
                    disabled={!!feedback}
                    onClick={() => setClassification(opt)}
                  >
                    <span className="choice-marker" />
                    {opt}
                  </button>
                ))}
              </div>

              <div className="field-label" style={{ marginTop: 22 }}>
                What do you do first?
              </div>
              <div className="choice-group">
                {scenario.response_options.map((opt) => (
                  <button
                    key={opt}
                    className="choice"
                    aria-pressed={responseAction === opt}
                    disabled={!!feedback}
                    onClick={() => setResponseAction(opt)}
                  >
                    <span className="choice-marker" />
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ErrorNote message={error} />

          {feedback && (
            <div
              className="verdict"
              style={{
                '--accent':
                  feedback.classification_correct && feedback.response_correct
                    ? 'var(--green)'
                    : 'var(--amber)',
              }}
            >
              <div className="verdict-head">
                {feedback.classification_correct
                  ? 'Correct classification'
                  : `Not quite — this was ${feedback.correct_classification.toLowerCase()}`}
              </div>
              <p>
                {feedback.response_correct
                  ? 'Your containment action addresses the control that actually failed.'
                  : `The stronger first move was: ${feedback.correct_response.toLowerCase()}.`}
              </p>
            </div>
          )}

          <HintPanel
            hints={hints}
            remainingHints={hintsLeft}
            onReveal={reveal}
            busy={busy}
          />

          <div className="btn-row">
            {!feedback ? (
              <button
                className="btn"
                onClick={submit}
                disabled={busy || !classification || !responseAction}
              >
                Submit findings
              </button>
            ) : (
              <button className="btn" onClick={() => onFinish(sessionId)}>
                See results
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
