import type { AnalysisProvider, AnalysisProviderStatus } from '../../../shared/types';

export interface AnalysisProviderViewState {
  ready: boolean;
  title: string;
  detail: string;
  actionLabel?: string;
}

export function getAnalysisProviderViewState(
  provider: AnalysisProvider,
  statuses: AnalysisProviderStatus[],
): AnalysisProviderViewState {
  if (provider === 'rules') {
    return {
      ready: true,
      title: 'Local analysis ready',
      detail: "Reports will use markupR's built-in local analysis.",
    };
  }

  const status = statuses.find((candidate) => candidate.id === provider);
  if (!status) {
    return {
      ready: false,
      title: provider === 'codex-cli' ? 'Checking Codex CLI' : 'Checking Anthropic setup',
      detail: provider === 'codex-cli'
        ? 'Scanning for an installed and authenticated Codex CLI.'
        : 'Checking for a saved Anthropic API key.',
      actionLabel: 'Open AI Settings',
    };
  }

  if (status.ready) {
    return provider === 'codex-cli'
      ? {
          ready: true,
          title: 'Codex CLI ready',
          detail: 'Reports will be analyzed with your installed Codex CLI.',
        }
      : {
          ready: true,
          title: 'Anthropic analysis ready',
          detail: 'Reports will be analyzed with Anthropic API.',
        };
  }

  return {
    ready: false,
    title: provider === 'codex-cli' ? 'Codex needs attention' : 'Anthropic setup required',
    detail: status.diagnostic ?? (
      provider === 'codex-cli'
        ? 'Install Codex CLI and sign in before selecting it for analysis.'
        : 'Add an Anthropic API key to use Anthropic analysis.'
    ),
    actionLabel: 'Open AI Settings',
  };
}
