import type {
  AnalysisModelSelections,
  AnalysisProvider,
  AnalysisProviderStatus,
  ModelAnalysisProvider,
} from '../../../shared/types';

export interface AnalysisProviderViewState {
  ready: boolean;
  title: string;
  detail: string;
  actionLabel?: string;
}

const PROVIDER_NAMES: Record<AnalysisProvider, string> = {
  rules: 'Local Rules',
  'anthropic-api': 'Anthropic API',
  'codex-cli': 'Codex CLI',
  'claude-cli': 'Claude Code CLI',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
};

function checkingDetail(provider: Exclude<AnalysisProvider, 'rules'>): string {
  switch (provider) {
    case 'codex-cli': return 'Scanning for an installed and authenticated Codex CLI.';
    case 'claude-cli': return 'Scanning for an installed and authenticated Claude Code CLI.';
    case 'ollama': return 'Checking the local Ollama service and installed models.';
    case 'lmstudio': return 'Checking the local LM Studio service and loaded models.';
    case 'anthropic-api': return 'Checking for a saved Anthropic API key.';
  }
}

export function getAnalysisProviderViewState(
  provider: AnalysisProvider,
  statuses: AnalysisProviderStatus[],
  modelSelections: AnalysisModelSelections = {},
): AnalysisProviderViewState {
  if (provider === 'rules') {
    return {
      ready: true,
      title: 'Local Rules ready',
      detail: "Reports will use markupR's built-in local rules.",
    };
  }

  const providerName = PROVIDER_NAMES[provider];
  const status = statuses.find((candidate) => candidate.id === provider);
  if (!status) {
    return {
      ready: false,
      title: `Checking ${providerName}`,
      detail: checkingDetail(provider),
      actionLabel: 'Open Report Settings',
    };
  }

  const selectedModel = modelSelections[provider as ModelAnalysisProvider]?.trim();
  if ((provider === 'ollama' || provider === 'lmstudio') && !selectedModel) {
    return {
      ready: false,
      title: `${providerName} model required`,
      detail: `Select an installed ${providerName} model before generating a report.`,
      actionLabel: 'Open Report Settings',
    };
  }

  if (status.ready) {
    return {
      ready: true,
      title: `${providerName} ready`,
      detail: selectedModel
        ? `Reports will use ${providerName} with ${selectedModel}.`
        : `Reports will use ${providerName} with its default model.`,
    };
  }

  return {
    ready: false,
    title: provider === 'anthropic-api'
      ? 'Anthropic setup required'
      : `${providerName} needs attention`,
    detail: status.diagnostic ?? `${providerName} is not ready to generate reports.`,
    actionLabel: 'Open Report Settings',
  };
}
