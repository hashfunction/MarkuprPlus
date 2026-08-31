import type { CliBridgeErrorCode } from '../shared/cliBridgeProtocol';

export class BridgeHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: CliBridgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeHttpError';
  }
}

export function sanitizeBridgeMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback;
  const withoutControls = Array.from(raw, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
  }).join('');
  const sanitized = withoutControls
    .replace(/\b(?:sk|gh[opusr]|github_pat)_[A-Za-z0-9_-]{8,}\b/gi, '[redacted]')
    .replace(/\b(Bearer|api[_ -]?key|token)\s*[:=]\s*\S+/gi, '$1: [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return sanitized || fallback;
}
