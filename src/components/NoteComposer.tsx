import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { MAX_NOTE_LENGTH } from '../anna/storage';
import { PlusIcon } from './Icons';

interface Props {
  disabled: boolean;
  saving: boolean;
  onSave(content: string): Promise<boolean>;
}

export function NoteComposer({ disabled, saving, onSave }: Props) {
  const [draft, setDraft] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (disabled || !draft.trim()) return;
    if (await onSave(draft)) {
      setDraft('');
      textarea.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  return <form className="composer" onSubmit={(event) => { void save(event); }}>
    <label className="section-label" htmlFor="note-input">记下一点什么</label>
    <textarea
      ref={textarea}
      id="note-input"
      placeholder="一个待办、一个灵感，或今天值得记住的小事…"
      value={draft}
      onChange={(event) => { setDraft(event.target.value); }}
      onKeyDown={onKeyDown}
      maxLength={MAX_NOTE_LENGTH}
      rows={4}
      disabled={saving}
      aria-describedby="note-input-hint"
    />
    <div className="composer-footer">
      <span className="input-hint" id="note-input-hint">
        {draft.length > 0 ? `${draft.length} / ${MAX_NOTE_LENGTH}` : 'Ctrl / ⌘ + Enter 保存'}
      </span>
      <button className="button button-primary" type="submit" disabled={disabled || !draft.trim()}>
        {saving ? <span className="spinner" aria-hidden="true" /> : <PlusIcon />}
        {saving ? '保存中…' : '保存笔记'}
      </button>
    </div>
  </form>;
}
