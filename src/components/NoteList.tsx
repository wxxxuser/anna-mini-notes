import type { Note } from '../anna/types';
import { NoteIcon, TrashIcon } from './Icons';

interface Props {
  notes: Note[];
  disabled: boolean;
  loading: boolean;
  onDelete(id: string): Promise<void>;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

export function NoteList({ notes, disabled, loading, onDelete }: Props) {
  return <section className="notes-section" aria-labelledby="notes-title" aria-busy={loading}>
    <div className="section-heading">
      <h2 id="notes-title">我的笔记 <span className="count-badge">{notes.length}</span></h2>
      <span className="sort-label">按添加顺序</span>
    </div>
    {loading && notes.length === 0 ? <div className="empty-state" role="status">
      <span className="spinner spinner-large" aria-hidden="true" />
      <p>正在读取笔记…</p>
    </div> : notes.length === 0 ? <div className="empty-state">
      <div className="empty-icon"><NoteIcon /></div>
      <h3>想法，从第一笔开始</h3>
      <p>把脑海里的小事写下来，<br />给新的想法留一点空间。</p>
    </div> : <ol className="note-list">
      {notes.map((note) => <li className="note-card" key={note.id} value={note.order}>
        <div className="note-topline">
          <span className="note-order" aria-label={`第 ${note.order} 条笔记`}>#{String(note.order).padStart(2, '0')}</span>
          <time dateTime={note.createdAt}>{formatTime(note.createdAt)}</time>
          <button className="icon-button delete-button" type="button" aria-label={`删除第 ${note.order} 条笔记`} title="删除笔记" disabled={disabled} onClick={() => { void onDelete(note.id); }}><TrashIcon /></button>
        </div>
        <p className="note-content">{note.content}</p>
      </li>)}
    </ol>}
  </section>;
}
