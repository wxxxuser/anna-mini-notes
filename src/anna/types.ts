export interface Note {
  id: string;
  content: string;
  order: number;
  createdAt: string;
}

export interface Notebook {
  version: 1;
  nextOrder: number;
  notes: Note[];
}

export interface Summary {
  text: string;
  noteCount: number;
}

/** The small Host API surface required by this app. The host owns its SDK. */
export interface AnnaRuntime {
  storage: {
    get(args: { key: string }): Promise<unknown>;
    set(args: { key: string; value: Notebook }): Promise<unknown>;
  };
  tools: {
    invoke(args: {
      tool_id: string;
      method: string;
      args: { notes: Note[] };
      timeoutMs?: number;
    }): Promise<unknown>;
  };
}
