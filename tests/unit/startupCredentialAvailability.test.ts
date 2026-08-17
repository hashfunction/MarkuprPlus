import { describe, expect, it, vi } from 'vitest';
import { discoverStartupCredentialAvailability } from '../../src/main/settings/startupCredentialAvailability';

describe('startup credential availability', () => {
  it('keeps startup available while treating unreadable credentials as absent', async () => {
    const settings = {
      hasApiKey: vi.fn(async (service: string) => {
        if (service === 'openai') throw new Error('temporary keychain failure with secret detail');
        return true;
      }),
    };
    const warn = vi.fn();

    const availability = await discoverStartupCredentialAvailability(settings, warn);

    expect(availability).toEqual({ hasOpenAiKey: false, hasAnthropicKey: true });
    expect(settings.hasApiKey).toHaveBeenCalledWith('openai');
    expect(settings.hasApiKey).toHaveBeenCalledWith('anthropic');
    expect(warn).toHaveBeenCalledWith(
      '[Main] OpenAI credential availability could not be checked; continuing without it.',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret detail');
  });
});
