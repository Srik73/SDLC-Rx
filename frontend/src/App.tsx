import { FormEvent, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EXAMPLE_PROMPT = `Help me make the requirements for a teleconsultation and e-prescription module for a private clinic in India. Registered medical practitioners consult patients by video, audio or chat, record consent, and issue digital prescriptions following the Telemedicine Practice Guidelines (medicine lists, prohibited drugs, prescription format), with patient data handled under the DPDP Rules 2025 (notice, consent, security safeguards, breach intimation, retention) and the CDSCO guidance on medical device software where applicable.`;

const API_BASE_URL = (import.meta.env.VITE_MASTRA_API_BASE_URL || '/api').replace(/\/$/, '');
const WORKFLOW_URL = `${API_BASE_URL}/workflows/requirements-then-sdlc/start-async`;

type RunState = 'idle' | 'running' | 'success' | 'error';

type WorkflowOutput = {
  requirements: string;
  sdlc: string;
  document?: string;
  markdownPath?: string;
  htmlPath?: string;
};

function ensureMarkdownTitle(text: string): string {
  const normalized = text.trim();
  if (!normalized) return normalized;
  if (/^#{1,6}\s/.test(normalized)) return normalized;

  const [firstLine, ...remainingLines] = normalized.split('\n');
  if (/^\s*(?:[-*+]\s|\d+[.)]\s|>\s)/.test(firstLine)) return normalized;
  return `# ${firstLine.trim()}\n\n${remainingLines.join('\n').trimStart()}`;
}

function App() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);
  const [runState, setRunState] = useState<RunState>('idle');
  const [output, setOutput] = useState<WorkflowOutput | null>(null);
  const [error, setError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (runState !== 'running') {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runState]);

  const activeRunningStep = elapsedSeconds >= 62 ? 2 : 1;
  const timeLabel = useMemo(() => {
    if (elapsedSeconds < 10) return 'Starting the workflow';
    if (elapsedSeconds < 62) return 'The requirements agent is drafting the specification';
    return 'The SDLC agent is reviewing the generated specification';
  }, [elapsedSeconds]);

  async function runWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || runState === 'running') return;

    setRunState('running');
    setOutput(null);
    setError('');

    try {
      const response = await fetch(WORKFLOW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputData: { prompt: trimmedPrompt } }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage = payload?.error?.message || payload?.message || `Request failed with status ${response.status}`;
        throw new Error(serverMessage);
      }
      if (payload?.status && payload.status !== 'success') {
        throw new Error(payload?.error?.message || `Workflow ended with status: ${payload.status}`);
      }
      const result = payload?.result || payload;
      if (!result?.requirements || !result?.sdlc) {
        throw new Error('The workflow returned an unexpected response. Confirm that the Mastra workflow is running.');
      }
      setOutput(result as WorkflowOutput);
      setRunState('success');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'The workflow could not be completed.';
      setError(message);
      setRunState('error');
    }
  }

  function startNewRun() {
    setOutput(null);
    setError('');
    setRunState('idle');
    window.setTimeout(() => document.getElementById('prompt')?.focus(), 0);
  }

  function downloadMarkdown() {
    if (!output) return;
    const documentText = output.document || `${output.requirements.trim()}\n\n---\n\n${output.sdlc.trim()}`;
    const file = new Blob([`${documentText.trim()}\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sdlc-rx-output.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">Rx</div>
          <div>
            <div className="brand-overline">Healthcare product planning</div>
            <div className="brand-name">SDLC Rx</div>
          </div>
        </div>
      </header>

      <main className="page-grid">
        <aside className="workflow-rail" aria-label="Workflow steps">
          <div className="rail-label">Workflow map</div>
          <div className={`rail-step ${runState !== 'idle' ? 'rail-step-done' : 'rail-step-active'}`}>
            <span className="step-index">01</span>
            <span className="step-copy"><strong>Requirements</strong><small>Translate the brief into a structured specification.</small></span>
          </div>
          <div className="rail-connector" />
          <div className={`rail-step ${runState === 'success' ? 'rail-step-active' : ''}`}>
            <span className="step-index">02</span>
            <span className="step-copy"><strong>SDLC recommendation</strong><small>Choose and justify a delivery lifecycle.</small></span>
          </div>
          <div className="rail-note">
            <span className="note-icon">i</span>
            <div><strong>Keep it de-identified</strong><p>This demonstration is for software planning. Do not enter real patient-identifying information.</p></div>
          </div>
        </aside>

        <section className="workspace">
          <div className="hero-copy">
            <div className="section-kicker"><span className="kicker-line" /> Requirements to recommendation</div>
            <h1>Turn a clinical idea into a <em>buildable plan.</em></h1>
            <p>Describe the healthcare product or module in plain language. SDLC Rx will first shape the requirements, then recommend a suitable software lifecycle.</p>
          </div>

          <form className="input-card" onSubmit={runWorkflow}>
            <div className="input-card-topline">
              <label htmlFor="prompt">Describe the healthcare product or module</label>
              <span className="character-count">{prompt.length.toLocaleString()} characters</span>
            </div>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="For example: Help me define requirements for a patient appointment and follow-up module..."
              rows={9}
              disabled={runState === 'running'}
            />
            <div className="input-card-footer">
              <span className="input-hint"><span className="hint-dot" /> Natural language input · India/US corpus is managed separately</span>
              <button className="primary-button" type="submit" disabled={!prompt.trim() || runState === 'running'}>
                {runState === 'running' ? <><span className="button-spinner" /> Running workflow</> : <>Generate plan <span aria-hidden="true">→</span></>}
              </button>
            </div>
          </form>

          {runState === 'running' && (
            <section className="progress-card" aria-live="polite">
              <div className="progress-card-heading"><span className="loading-orbit" /><div><strong>{timeLabel}</strong><span>One request, two sequential agents · {elapsedSeconds}s elapsed</span></div></div>
              <div className="progress-steps">
                <div className={`progress-step ${activeRunningStep > 1 ? 'progress-complete' : 'progress-current'}`}><span>{activeRunningStep > 1 ? '✓' : '01'}</span><div><strong>Requirements agent</strong><small>{activeRunningStep > 1 ? 'Specification returned' : 'Drafting structured requirements'}</small></div></div>
                <div className="progress-arrow" aria-hidden="true">→</div>
                <div className={`progress-step ${activeRunningStep === 2 ? 'progress-current' : ''}`}><span>02</span><div><strong>SDLC recommendation</strong><small>{activeRunningStep === 2 ? 'Reviewing the specification' : 'Waiting for requirements'}</small></div></div>
              </div>
            </section>
          )}

          {runState === 'error' && (
            <section className="error-card" role="alert">
              <div className="error-icon">!</div>
              <div><strong>We could not complete this run.</strong><p>{error}</p><small>Check that the Mastra development server is running and that VITE_MASTRA_API_BASE_URL points to its API.</small></div>
            </section>
          )}

          {output && runState === 'success' && (
            <section className="results-section" aria-live="polite">
              <div className="results-heading">
                <div><div className="section-kicker"><span className="kicker-line" /> Workflow complete</div><h2>Your planning outputs</h2></div>
                <div className="results-actions">
                  <button className="secondary-button download-button" type="button" onClick={downloadMarkdown}>Download .md <span aria-hidden="true">↓</span></button>
                  <button className="secondary-button" type="button" onClick={startNewRun}>Start a new run <span aria-hidden="true">↗</span></button>
                </div>
              </div>
              <div className="output-grid">
                <article className="result-card requirements-card">
                  <div className="result-card-header"><div className="result-label"><span className="result-number">01</span><div><span className="result-eyebrow">Requirements agent</span><h3>Healthcare requirements</h3></div></div><span className="complete-badge">Complete</span></div>
                  <div className="result-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{ensureMarkdownTitle(output.requirements)}</ReactMarkdown></div>
                </article>
                <article className="result-card sdlc-card">
                  <div className="result-card-header"><div className="result-label"><span className="result-number">02</span><div><span className="result-eyebrow">SDLC selection agent</span><h3>Recommended lifecycle</h3></div></div><span className="complete-badge">Complete</span></div>
                  <div className="result-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{output.sdlc}</ReactMarkdown></div>
                </article>
              </div>
              <div className="result-footnote"><span className="footnote-mark">↳</span><span>The recommendation is generated from the requirements output above. Review it with your clinical, regulatory, security, and engineering stakeholders before using it for delivery decisions.</span></div>
            </section>
          )}

          <footer className="page-footer"><span>SDLC Rx</span></footer>
        </section>
      </main>
    </div>
  );
}

export default App;
