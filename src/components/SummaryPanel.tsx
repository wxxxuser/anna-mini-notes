import type { Summary } from '../anna/types';
import { ArrowIcon, SparkIcon } from './Icons';

interface Props {
  count: number;
  disabled: boolean;
  busy: boolean;
  summary: Summary | null;
  error: string;
  onSummarize(): Promise<void>;
}

export function SummaryPanel({ count, disabled, busy, summary, error, onSummarize }: Props) {
  const noModel = /--no-llm|llm_disabled|LLM.*disabled|disabled.*LLM/i.test(error);
  return <aside className="summary-panel" aria-labelledby="summary-title">
    <div className="summary-heading"><span className="ai-mark"><SparkIcon /></span><span className="eyebrow">A LITTLE CLARITY</span></div>
    <h2 id="summary-title">把零散，变清晰。</h2>
    <p className="summary-intro">让 AI 帮你梳理笔记，<br />找到值得关注的重点。</p>
    <button className="button button-summary" type="button" disabled={disabled || count === 0} onClick={() => { void onSummarize(); }}>
      {busy ? <span className="spinner" aria-hidden="true" /> : <SparkIcon />}
      <span>{busy ? '正在梳理…' : '总结笔记'}</span>
      {!busy && <ArrowIcon className="button-arrow" />}
    </button>
    <div className="summary-output" aria-live="polite" aria-busy={busy}>
      {busy ? <div className="summary-placeholder"><span className="summary-line" /><span className="summary-line" /><span className="summary-line short" /><p>给想法一点整理的时间…</p></div>
        : error ? <div className="summary-error" role="alert">
          <span className="result-label">{noModel ? '当前环境未开启 AI 总结' : '这次总结没有完成'}</span>
          <p>{noModel ? '笔记仍可正常使用。当前开发环境关闭了模型调用，因此暂时无法生成总结。' : '你的笔记已保留，可以稍后再试。'}</p>
          <p className="error-detail">{error}</p>
        </div>
          : summary ? <div className="summary-result"><span className="result-label">来自 {summary.noteCount} 条笔记</span><p className="summary-text">{summary.text}</p></div>
            : <div className="summary-placeholder"><span className="placeholder-spark">✳</span><p>{count === 0 ? '先写下第一条笔记，\n总结会在这里等你。' : `已准备好 ${count} 条笔记，\n点击上方按钮，看看它们的重点。`}</p></div>}
    </div>
    <div className="summary-bottom"><span className="tiny-star">✦</span><span>小小记录，也值得认真整理。</span></div>
  </aside>;
}
