import type {
  AnalysisProvider,
  AnalysisProviderStatus,
  ModelAnalysisProvider,
} from '../../../shared/types';
import { PUBLIC_BRAND_NAME } from '../../../shared/publicBrand';
import {
  currentDistribution,
  type DistributionKind,
} from '../../../shared/distribution';

export type ModelControlMode = 'none' | 'default-or-custom' | 'discovered-only';

export interface AnalysisProviderOption {
  id: AnalysisProvider;
  title: string;
  description: string;
  connectionBadge: 'Local' | 'CLI' | 'Cloud';
  recommended?: boolean;
}

const ALL_PROVIDER_OPTIONS: AnalysisProviderOption[] = [
  {
    id: 'codex-cli',
    title: 'Codex CLI',
    description: 'Use your installed Codex CLI and existing ChatGPT login.',
    connectionBadge: 'CLI',
    recommended: true,
  },
  {
    id: 'claude-cli',
    title: 'Claude Code CLI',
    description: 'Use your installed and signed-in Claude Code CLI.',
    connectionBadge: 'CLI',
  },
  {
    id: 'github-copilot-cli',
    title: 'GitHub Copilot CLI',
    description: 'Use your installed GitHub Copilot CLI and GitHub login.',
    connectionBadge: 'CLI',
  },
  {
    id: 'opencode-cli',
    title: 'OpenCode',
    description: 'Generate reports with your configured OpenCode providers.',
    connectionBadge: 'CLI',
  },
  {
    id: 'gemini-cli',
    title: 'Gemini CLI',
    description: 'Use your installed and authenticated Google Gemini CLI.',
    connectionBadge: 'CLI',
  },
  {
    id: 'cursor-cli',
    title: 'Cursor Agent CLI',
    description: 'Generate reports with Cursor Agent in read-only Ask mode.',
    connectionBadge: 'CLI',
  },
  {
    id: 'qwen-cli',
    title: 'Qwen Code',
    description: 'Use Qwen Code in safe, non-interactive mode.',
    connectionBadge: 'CLI',
  },
  {
    id: 'goose-cli',
    title: 'Goose',
    description: 'Generate reports with your configured Goose CLI model.',
    connectionBadge: 'CLI',
  },
  {
    id: 'amp-cli',
    title: 'Amp',
    description: 'Use your installed and signed-in Amp CLI.',
    connectionBadge: 'CLI',
  },
  {
    id: 'kiro-cli',
    title: 'Kiro CLI',
    description: 'Generate reports with Kiro in non-interactive mode.',
    connectionBadge: 'CLI',
  },
  {
    id: 'aider-cli',
    title: 'Aider',
    description: 'Use Aider in dry-run mode without modifying your files.',
    connectionBadge: 'CLI',
  },
  {
    id: 'ollama',
    title: 'Ollama',
    description: 'Generate reports with a model served locally by Ollama.',
    connectionBadge: 'Local',
  },
  {
    id: 'lmstudio',
    title: 'LM Studio',
    description: 'Generate reports with an LM Studio local server model.',
    connectionBadge: 'Local',
  },
  {
    id: 'anthropic-api',
    title: 'Anthropic API',
    description: `Use an Anthropic API key stored securely by ${PUBLIC_BRAND_NAME}.`,
    connectionBadge: 'Cloud',
  },
  {
    id: 'rules',
    title: 'Local Rules',
    description: 'Build a report locally without an AI provider.',
    connectionBadge: 'Local',
  },
];

export function providerOptionsForDistribution(
  distribution: DistributionKind,
): AnalysisProviderOption[] {
  return ALL_PROVIDER_OPTIONS.filter((option) =>
    distribution === 'direct' || option.connectionBadge !== 'CLI');
}

export const PROVIDER_OPTIONS = providerOptionsForDistribution(currentDistribution());

export function getModelControlMode(provider: AnalysisProvider): ModelControlMode {
  if (provider === 'rules' || provider === 'amp-cli' || provider === 'kiro-cli') return 'none';
  if (provider === 'ollama' || provider === 'lmstudio') return 'discovered-only';
  return 'default-or-custom';
}

export function getModelDefaultLabel(provider: ModelAnalysisProvider): string {
  switch (provider) {
    case 'codex-cli': return 'Codex default';
    case 'claude-cli': return 'Claude Code default';
    case 'github-copilot-cli': return 'GitHub Copilot default';
    case 'opencode-cli': return 'OpenCode default';
    case 'gemini-cli': return 'Gemini default';
    case 'cursor-cli': return 'Cursor default';
    case 'qwen-cli': return 'Qwen default';
    case 'goose-cli': return 'Goose default';
    case 'amp-cli': return 'Amp default';
    case 'kiro-cli': return 'Kiro default';
    case 'aider-cli': return 'Aider default';
    case 'anthropic-api': return 'Anthropic default';
    case 'ollama': return 'Select an installed Ollama model';
    case 'lmstudio': return 'Select an installed LM Studio model';
  }
}

export function normalizeSavedModel(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function getSelectedModelLabel(
  provider: ModelAnalysisProvider,
  status: AnalysisProviderStatus | undefined,
  savedModel: string | undefined,
): string {
  const selected = normalizeSavedModel(savedModel);
  if (!selected) return getModelDefaultLabel(provider);
  const discovered = status?.models?.find(({ id }) => id === selected);
  return discovered?.name || `${selected} (custom)`;
}
