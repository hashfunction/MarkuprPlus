import { describe, expect, it } from 'vitest';
import type { AnalysisProviderStatus } from '../../src/shared/types';
import { getAnalysisProviderViewState } from '../../src/renderer/components/settings/analysisProviderViewState';

const statuses = (overrides: Partial<Record<'rules' | 'anthropic' | 'codex', Partial<AnalysisProviderStatus>>> = {}): AnalysisProviderStatus[] => [
  { id: 'rules', name: 'Local rules', installed: true, authenticated: true, ready: true, ...overrides.rules },
  { id: 'anthropic', name: 'Anthropic API', installed: true, authenticated: false, ready: false, diagnostic: 'Add an Anthropic API key.', ...overrides.anthropic },
  { id: 'codex', name: 'Codex CLI', installed: false, authenticated: false, ready: false, diagnostic: 'Codex CLI was not found.', ...overrides.codex },
];

describe('getAnalysisProviderViewState', () => {
  it('reports an installed and authenticated Codex CLI as ready', () => {
    expect(getAnalysisProviderViewState('codex', statuses({ codex: { installed: true, authenticated: true, ready: true, diagnostic: undefined } }))).toEqual({
      ready: true,
      title: 'Codex CLI ready',
      detail: 'Reports will be analyzed with your installed Codex CLI.',
    });
  });

  it('surfaces the Codex diagnostic when it needs attention', () => {
    expect(getAnalysisProviderViewState('codex', statuses({ codex: { installed: true, diagnostic: 'Codex CLI is installed but not logged in.' } }))).toEqual({
      ready: false,
      title: 'Codex needs attention',
      detail: 'Codex CLI is installed but not logged in.',
      actionLabel: 'Open AI Settings',
    });
  });

  it('treats local rules as always ready', () => {
    expect(getAnalysisProviderViewState('rules', [])).toEqual({
      ready: true,
      title: 'Local analysis ready',
      detail: "Reports will use markupR's built-in local analysis.",
    });
  });

  it('requires an Anthropic key only when Anthropic is selected', () => {
    expect(getAnalysisProviderViewState('anthropic', statuses()).ready).toBe(false);
    expect(getAnalysisProviderViewState('anthropic', statuses({ anthropic: { authenticated: true, ready: true, diagnostic: undefined } }))).toEqual({
      ready: true,
      title: 'Anthropic analysis ready',
      detail: 'Reports will be analyzed with Anthropic API.',
    });
  });

  it('returns a useful scanning state before discovery completes', () => {
    expect(getAnalysisProviderViewState('codex', [])).toEqual({
      ready: false,
      title: 'Checking Codex CLI',
      detail: 'Scanning for an installed and authenticated Codex CLI.',
      actionLabel: 'Open AI Settings',
    });
  });
});
