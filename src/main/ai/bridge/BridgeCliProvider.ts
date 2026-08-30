import type { Session } from '../../SessionController';
import type { AIAnalysisResult } from '../types';
import type { AnalysisProviderStatus } from '../../../shared/types';
import type { CliBridgeProvider } from '../../../shared/cliBridgeProtocol';
import type { AnalysisProviderAdapter } from '../providers/types';
import { CliBridgeClient, CliBridgeClientError } from './CliBridgeClient';

export const BRIDGE_CLI_PROVIDER_NAMES: Record<CliBridgeProvider, string> = {
  'codex-cli': 'Codex CLI',
  'claude-cli': 'Claude Code CLI',
  'opencode-cli': 'OpenCode',
  'cursor-cli': 'Cursor Agent CLI',
  'qwen-cli': 'Qwen Code',
  'goose-cli': 'Goose',
  'amp-cli': 'Amp',
  'kiro-cli': 'Kiro CLI',
  'aider-cli': 'Aider',
};

function diagnosticFor(error: unknown): string {
  if (error instanceof CliBridgeClientError) {
    if (error.code === 'BRIDGE_NOT_PAIRED' || error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_INVALID') {
      return 'Pair MarkuprPlus CLI Bridge in Advanced Settings.';
    }
    if (error.code === 'BRIDGE_OFFLINE') {
      return 'Start MarkuprPlus CLI Bridge, then scan again.';
    }
    if (error.code === 'BRIDGE_INCOMPATIBLE') {
      return 'Update MarkuprPlus CLI Bridge, then pair again.';
    }
    return error.message;
  }
  return 'MarkuprPlus CLI Bridge is unavailable.';
}

export class BridgeCliProvider implements AnalysisProviderAdapter {
  readonly connection = 'cli' as const;

  constructor(
    readonly id: CliBridgeProvider,
    readonly name: string,
    private readonly client: CliBridgeClient,
  ) {}

  async discover(forceRefresh = false): Promise<AnalysisProviderStatus> {
    try {
      if (forceRefresh) return await this.client.testProvider(this.id);
      const status = (await this.client.discoverProviders(false))
        .find((candidate) => candidate.id === this.id);
      if (!status) {
        throw new CliBridgeClientError(
          'BRIDGE_PROTOCOL_ERROR',
          `${this.name} was not returned by MarkuprPlus CLI Bridge.`,
        );
      }
      return status;
    } catch (error) {
      return {
        id: this.id,
        name: this.name,
        connection: 'cli',
        installed: false,
        authenticated: false,
        ready: false,
        models: [],
        diagnostic: diagnosticFor(error),
      };
    }
  }

  analyze(session: Session, modelId?: string): Promise<AIAnalysisResult> {
    return this.client.analyze(this.id, session, modelId);
  }
}
