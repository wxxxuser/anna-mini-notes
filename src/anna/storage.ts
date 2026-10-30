import { isRecord, unwrapHostResponse } from './rpc';
import type { AnnaRuntime, Note, Notebook } from './types';

export const STORAGE_KEY = 'notes';
export const MAX_NOTE_LENGTH = 2_000;
export const MAX_NOTES = 100;
const MAX_TOTAL_NOTE_LENGTH = 100_000;
const MAX_NOTEBOOK_BYTES = 200 * 1024;

export function emptyNotebook(): Notebook {
  return { version: 1, nextOrder: 1, notes: [] };
}

function isNote(value: unknown): value is Note {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.content === 'string' && value.content.trim().length > 0
    && value.content.length <= 4_000
    && typeof value.order === 'number' && Number.isSafeInteger(value.order) && value.order > 0
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
}

function parseNotebook(value: unknown): Notebook {
  if (value === null || value === undefined) return emptyNotebook();
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.notes)
    || !value.notes.every(isNote) || value.notes.length > MAX_NOTES
    || typeof value.nextOrder !== 'number' || !Number.isSafeInteger(value.nextOrder)
    || value.nextOrder <= 0) {
    throw new Error('保存的笔记格式不正确。为保护已有内容，已暂停写入。');
  }
  const notes = value.notes as Note[];
  if (new Set(notes.map((note) => note.id)).size !== notes.length
    || new Set(notes.map((note) => note.order)).size !== notes.length
    || notes.some((note) => note.order >= (value.nextOrder as number))) {
    throw new Error('笔记编号存在冲突。为保护已有内容，已暂停写入。');
  }
  return { version: 1, nextOrder: value.nextOrder, notes: [...notes].sort((a, b) => a.order - b.order) };
}

export async function readNotebook(anna: AnnaRuntime): Promise<Notebook> {
  const response = unwrapHostResponse(await anna.storage.get({ key: STORAGE_KEY }));
  if (!isRecord(response) || !('value' in response)) {
    throw new Error('Anna 返回了无法识别的笔记数据，请重试。');
  }
  return parseNotebook(response.value);
}

export async function saveNotebook(anna: AnnaRuntime, notebook: Notebook): Promise<void> {
  // Match the Executa's input limit so saved notes remain summarizable.
  const totalCharacters = notebook.notes.reduce((total, note) => total + note.content.length, 0);
  if (totalCharacters > MAX_TOTAL_NOTE_LENGTH) {
    throw new Error('笔记总内容最多 100,000 字符，请先删除一些笔记，或缩短本次内容。');
  }
  if (new TextEncoder().encode(JSON.stringify(notebook)).byteLength > MAX_NOTEBOOK_BYTES) {
    throw new Error('笔记空间已满，请先删除一些笔记，或缩短本次内容。');
  }
  unwrapHostResponse(await anna.storage.set({ key: STORAGE_KEY, value: notebook }));
}

export async function createNote(anna: AnnaRuntime, content: string): Promise<Notebook> {
  const text = content.trim();
  if (!text) throw new Error('请先写下一点内容。');
  if (text.length > MAX_NOTE_LENGTH) throw new Error(`每条笔记最多 ${MAX_NOTE_LENGTH} 字符。`);
  // Read first so every mutation starts with the host's current notes.
  const current = await readNotebook(anna);
  if (current.notes.length >= MAX_NOTES) throw new Error('最多保存 100 条笔记，请先删除一些笔记。');
  if (current.nextOrder >= Number.MAX_SAFE_INTEGER) throw new Error('笔记序号已达到上限。');
  const next: Notebook = {
    version: 1,
    nextOrder: current.nextOrder + 1,
    notes: [...current.notes, {
      id: crypto.randomUUID(),
      content: text,
      order: current.nextOrder,
      createdAt: new Date().toISOString(),
    }],
  };
  await saveNotebook(anna, next);
  return next;
}

export async function removeNote(anna: AnnaRuntime, id: string): Promise<Notebook> {
  const current = await readNotebook(anna);
  const next = { ...current, notes: current.notes.filter((note) => note.id !== id) };
  await saveNotebook(anna, next);
  return next;
}
