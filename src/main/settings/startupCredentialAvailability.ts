interface CredentialPresenceSource {
  hasApiKey: (service: string) => Promise<boolean>;
}

export interface StartupCredentialAvailability {
  hasOpenAiKey: boolean;
  hasAnthropicKey: boolean;
}

/**
 * Credential discovery is advisory during startup. Secure reads remain
 * fail-closed for every actual provider operation, but an unavailable OS
 * credential backend must not prevent local-only desktop startup.
 */
export async function discoverStartupCredentialAvailability(
  settings: CredentialPresenceSource,
  warn: (message: string) => void = console.warn,
): Promise<StartupCredentialAvailability> {
  const available = async (service: 'openai' | 'anthropic', label: string): Promise<boolean> => {
    try {
      return await settings.hasApiKey(service);
    } catch {
      warn(`[Main] ${label} credential availability could not be checked; continuing without it.`);
      return false;
    }
  };

  const [hasOpenAiKey, hasAnthropicKey] = await Promise.all([
    available('openai', 'OpenAI'),
    available('anthropic', 'Anthropic'),
  ]);
  return { hasOpenAiKey, hasAnthropicKey };
}
