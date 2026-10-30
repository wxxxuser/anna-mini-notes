import { asAnnaError, isRecord, unwrapHostResponse } from './rpc';
import type { AnnaRuntime, Note } from './types';

export const TOOL_ID = 'tool-dev-mini-notes';
export const TOOL_METHOD = 'summarize';

export function summaryFromToolResponse(response: unknown): string {
  let result = unwrapHostResponse(response);
  // Current core returns the payload directly. Older/documented paths may
  // retain {result}, plus the transport and Executa {success, data} envelopes.
  if (isRecord(result) && 'result' in result) result = result.result;
  for (let layer = 0; layer < 2 && isRecord(result); layer += 1) {
    if ('error' in result && result.error) throw asAnnaError(result.error);
    if (result.success === false) throw asAnnaError('总结未能完成，请重试。');
    if (result.success === true && isRecord(result.data)) result = result.data;
    else break;
  }
  if (!isRecord(result)) throw new Error('总结工具返回了无法识别的结果。');
  if ('error' in result && result.error) throw asAnnaError(result.error);
  if (typeof result.summary !== 'string' || !result.summary.trim()) {
    throw new Error('模型未返回总结内容，请重试。');
  }
  // Render exactly the text from the tool's sampling result. No local fallback.
  return result.summary;
}

export async function summarizeNotes(anna: AnnaRuntime, notes: Note[]): Promise<string> {
  if (notes.length === 0) throw new Error('先添加一条笔记，再试试总结。');
  return summaryFromToolResponse(await anna.tools.invoke({
    tool_id: TOOL_ID,
    method: TOOL_METHOD,
    args: { notes },
    timeoutMs: 65_000,
  }));
}
