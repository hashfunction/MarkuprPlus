import type {
  AnalysisProvider,
  AnalysisProviderStatus,
  ModelAnalysisProvider,
} from '../../../shared/types';
import { PUBLIC_BRAND_NAME } from '../../../shared/publicBrand';

export type ModelControlMode = 'none' | 'default-or-custom' | 'discovered-only';

export interface AnalysisProviderOption {
  id: AnalysisProvider;
  title: string;
  description: string;
  connectionBadge: 'Local' | 'CLI' | 'Cloud';
  recommended?: boolean;
}

export const PROVIDER_OPTIONS: AnalysisProviderOption[] = [
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

export function getModelControlMode(provider: AnalysisProvider): ModelControlMode {
  if (provider === 'rules') return 'none';
  if (provider === 'ollama' || provider === 'lmstudio') return 'discovered-only';
  return 'default-or-custom';
}

export function getModelDefaultLabel(provider: ModelAnalysisProvider): string {
  switch (provider) {
    case 'codex-cli': return 'Codex default';
    case 'claude-cli': return 'Claude Code default';
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
