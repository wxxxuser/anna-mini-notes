import { useCallback, useEffect, useRef, useState } from 'react';
import { connectAnna } from '../anna/runtime';
import { errorText } from '../anna/rpc';
import { createNote, emptyNotebook, readNotebook, removeNote } from '../anna/storage';
import { summarizeNotes } from '../anna/tools';
import type { AnnaRuntime, Summary } from '../anna/types';

type Operation = 'idle' | 'loading' | 'saving' | 'deleting' | 'summarizing';

export function useNotebook() {
  const [notebook, setNotebook] = useState(emptyNotebook);
  const [connected, setConnected] = useState(false);
  const [operation, setOperation] = useState<Operation>('loading');
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const runtime = useRef<AnnaRuntime | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setOperation('loading');
    setError('');
    try {
      const anna = await connectAnna();
      const data = await readNotebook(anna);
      if (!mounted.current) return;
      runtime.current = anna;
      setNotebook(data);
      setConnected(true);
      setSummary(null);
      setSummaryError('');
    } catch (cause) {
      if (!mounted.current) return;
      setConnected(false);
      setError(errorText(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setOperation('idle');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => { mounted.current = false; };
  }, [reload]);

  async function add(content: string): Promise<boolean> {
    if (busy.current || !runtime.current || !content.trim()) return false;
    busy.current = true;
    setOperation('saving');
    setError('');
    try {
      const next = await createNote(runtime.current, content);
      if (!mounted.current) return false;
      setNotebook(next);
      setSummary(null);
      setSummaryError('');
      setAnnouncement(`第 ${next.nextOrder - 1} 条笔记已保存。`);
      return true;
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setOperation('idle');
    }
  }

  async function remove(id: string): Promise<void> {
    if (busy.current || !runtime.current) return;
    busy.current = true;
    setOperation('deleting');
    setError('');
    try {
      const next = await removeNote(runtime.current, id);
      if (!mounted.current) return;
      setNotebook(next);
      setSummary(null);
      setSummaryError('');
      setAnnouncement('笔记已删除。');
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setOperation('idle');
    }
  }

  async function summarize(): Promise<void> {
    if (busy.current || !runtime.current) return;
    busy.current = true;
    setOperation('summarizing');
    setSummaryError('');
    setSummary(null);
    try {
      const current = await readNotebook(runtime.current);
      if (mounted.current) setNotebook(current);
      const text = await summarizeNotes(runtime.current, current.notes);
      if (!mounted.current) return;
      setSummary({ text, noteCount: current.notes.length });
      setAnnouncement('笔记总结已生成。');
    } catch (cause) {
      if (mounted.current) setSummaryError(errorText(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setOperation('idle');
    }
  }

  return { notebook, connected, operation, error, summaryError, summary, announcement, add, remove, summarize, reload };
}
