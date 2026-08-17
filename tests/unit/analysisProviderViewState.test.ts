import { describe, expect, it } from 'vitest';
import type { AnalysisProviderStatus } from '../../src/shared/types';
import { getAnalysisProviderViewState } from '../../src/renderer/components/settings/analysisProviderViewState';

function status(
  id: AnalysisProviderStatus['id'],
  overrides: Partial<AnalysisProviderStatus> = {},
): AnalysisProviderStatus {
  return {
    id,
    name: id,
    installed: true,
    authenticated: true,
    ready: true,
    ...overrides,
  };
}

describe('getAnalysisProviderViewState', () => {
  it('includes the selected model in a ready CLI provider detail', () => {
    expect(getAnalysisProviderViewState(
      'codex-cli',
      [status('codex-cli', { name: 'Codex CLI', connection: 'cli' })],
      { 'codex-cli': 'gpt-5.6-terra' },
    )).toEqual({
      ready: true,
      title: 'Codex CLI ready',
      detail: 'Reports will use Codex CLI with gpt-5.6-terra.',
    });
  });

  it('requires a selected LM Studio model even when the server is ready', () => {
    expect(getAnalysisProviderViewState(
      'lmstudio',
      [status('lmstudio', { name: 'LM Studio', connection: 'local' })],
      {},
    )).toEqual({
      ready: false,
      title: 'LM Studio model required',
      detail: 'Select an installed LM Studio model before generating a report.',
      actionLabel: 'Open Report Settings',
    });
  });

  it('surfaces provider diagnostics without generic Anthropic copy', () => {
    expect(getAnalysisProviderViewState(
      'claude-cli',
      [status('claude-cli', {
        name: 'Claude Code CLI',
        ready: false,
        diagnostic: 'Claude Code CLI is installed but not signed in.',
      })],
      {},
    )).toEqual({
      ready: false,
      title: 'Claude Code CLI needs attention',
      detail: 'Claude Code CLI is installed but not signed in.',
      actionLabel: 'Open Report Settings',
    });
  });

  it('treats Local Rules as always ready', () => {
    expect(getAnalysisProviderViewState('rules', [], {})).toEqual({
      ready: true,
      title: 'Local Rules ready',
      detail: "Reports will use MarkuprPlus's built-in local rules.",
    });
  });

  it('returns provider-specific checking copy before discovery completes', () => {
    expect(getAnalysisProviderViewState('ollama', [], { ollama: 'qwen2.5:7b' })).toEqual({
      ready: false,
      title: 'Checking Ollama',
      detail: 'Checking the local Ollama service and installed models.',
      actionLabel: 'Open Report Settings',
    });
  });
});
