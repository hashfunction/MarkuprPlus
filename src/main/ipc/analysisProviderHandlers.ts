import { ipcMain } from 'electron';
import { codexCliDiscovery } from '../ai/CodexCliDiscovery';
import type { CodexCliDiscovery } from '../ai/CodexCliDiscovery';
import { IPC_CHANNELS, type AnalysisProviderStatus } from '../../shared/types';
import type { IpcContext } from './types';

export function registerAnalysisProviderHandlers(
  ctx: IpcContext,
  discovery: Pick<CodexCliDiscovery, 'discover'> = codexCliDiscovery,
): void {
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER,
    async (_, forceRefresh: unknown = false): Promise<AnalysisProviderStatus[]> => {
      const hasAnthropicKey = await ctx.getSettingsManager()?.hasApiKey('anthropic') ?? false;
      const codexStatus = await discovery.discover(forceRefresh === true);

      return [
        {
          id: 'rules',
          name: 'Local rules',
          installed: true,
          authenticated: true,
          ready: true,
        },
        {
          id: 'anthropic-api',
          name: 'Anthropic API',
          installed: true,
          authenticated: hasAnthropicKey,
          ready: hasAnthropicKey,
          ...(!hasAnthropicKey
            ? { diagnostic: 'Add an Anthropic API key to use Anthropic analysis.' }
            : {}),
        },
        codexStatus,
      ];
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PROVIDER_TEST,
    async (_, provider: unknown): Promise<AnalysisProviderStatus> => {
      if (provider !== 'codex-cli') {
        throw new Error('Unsupported analysis provider');
      }
      return discovery.discover(true);
    },
  );
}
