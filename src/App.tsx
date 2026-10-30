import { NoteIcon } from './components/Icons';
import { NoteComposer } from './components/NoteComposer';
import { NoteList } from './components/NoteList';
import { SummaryPanel } from './components/SummaryPanel';
import { useNotebook } from './hooks/useNotebook';

export default function App() {
  const state = useNotebook();
  const busy = state.operation !== 'idle';

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="#main" aria-label="Mini Notes，转到笔记"><span className="brand-icon"><NoteIcon /></span><span>mini notes<span className="brand-period">.</span></span></a>
      <span className={`connection ${state.connected ? 'connection-ready' : ''}`} role="status"><span />{state.operation === 'loading' ? '正在连接' : state.connected ? '已连接 Anna' : '连接未完成'}</span>
    </header>
    <main id="main">
      <div className="page-heading"><span className="eyebrow">YOUR EVERYDAY NOTEBOOK</span><h1>留住想法，<span>轻一点生活。</span></h1><p>随手记下，慢慢理清。</p></div>
      <div className="workspace">
        <div className="notes-workspace">
          <NoteComposer disabled={!state.connected || busy} saving={state.operation === 'saving'} onSave={state.add} />
          {state.error && <div className="error-banner" role="alert"><div><strong>{state.connected ? '操作未完成' : '暂时无法读取笔记'}</strong><p>{state.error}</p>{!state.connected && <p>请在 Anna 开发环境中打开此应用。</p>}</div><button className="text-button" type="button" disabled={busy} onClick={() => { void state.reload(); }}>重新读取</button></div>}
          <NoteList notes={state.notebook.notes} loading={state.operation === 'loading'} disabled={!state.connected || busy} onDelete={state.remove} />
        </div>
        <SummaryPanel count={state.notebook.notes.length} disabled={!state.connected || busy} busy={state.operation === 'summarizing'} summary={state.summary} error={state.summaryError} onSummarize={state.summarize} />
      </div>
    </main>
    <footer className="app-footer"><span>留一点空间，给下一次灵感。</span><span>MINI NOTES <span className="footer-dot">·</span> MADE FOR ANNA</span></footer>
    <div className="sr-only" role="status" aria-live="polite">{state.announcement}</div>
  </div>;
}
