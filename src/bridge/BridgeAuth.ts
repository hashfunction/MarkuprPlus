import { randomBytes, timingSafeEqual } from 'node:crypto';

export function generateBridgeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isAuthorized(header: string | undefined, configuredToken: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const candidate = header.slice('Bearer '.length);
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const configuredBytes = Buffer.from(configuredToken, 'utf8');
  if (candidateBytes.length !== configuredBytes.length) return false;
  return timingSafeEqual(candidateBytes, configuredBytes);
}
