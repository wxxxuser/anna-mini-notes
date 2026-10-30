export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class AnnaError extends Error {
  code: string | number | undefined;

  constructor(message: string, code?: string | number) {
    super(message);
    this.name = 'AnnaError';
    this.code = code;
  }
}

/** Preserve the host's diagnostic rather than replacing a failure with data. */
export function errorText(error: unknown): string {
  if (isRecord(error)) {
    const message = typeof error.message === 'string' ? error.message : '请求未能完成，请重试。';
    const code = typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined;
    return code !== undefined && !message.includes(`[${code}]`) ? `[${code}] ${message}` : message;
  }
  if (typeof error === 'string') return error;
  return '请求未能完成，请重试。';
}

export function asAnnaError(value: unknown): AnnaError {
  if (isRecord(value)) {
    const code = typeof value.code === 'string' || typeof value.code === 'number' ? value.code : undefined;
    return new AnnaError(typeof value.message === 'string' ? value.message : errorText(value), code);
  }
  return new AnnaError(errorText(value));
}

/** SDK methods normally return their payload. Also accept the documented envelope. */
export function unwrapHostResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.ok === false) throw asAnnaError(value.error);
  if (value.ok === true && 'result' in value) return value.result;
  return value;
}
