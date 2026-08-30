import { ipcMain } from 'electron';
import { CliBridgeClient, CliBridgeClientError } from '../ai/bridge/CliBridgeClient';
import { currentDistribution, type DistributionKind } from '../../shared/distribution';
import { CLI_BRIDGE_PROVIDER_IDS } from '../../shared/cliBridgeProtocol';
import {
  IPC_CHANNELS,
  type CliBridgeConnectionStatus,
  type CliBridgePairResult,
} from '../../shared/types';
import type { ISettingsManager } from '../settings/SettingsManager';
import type { IpcContext } from './types';

const BRIDGE_SECRET_SERVICE = 'cli-bridge';
const BRIDGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface PairingBridgeClient {
  discoverProviders(forceRefresh?: boolean, tokenOverride?: string): ReturnType<CliBridgeClient['discoverProviders']>;
}

export interface CliBridgeHandlerDependencies {
  distribution(): DistributionKind;
  createClient(settingsManager: ISettingsManager): PairingBridgeClient;
}

const DEFAULT_DEPENDENCIES: CliBridgeHandlerDependencies = {
  distribution: currentDistribution,
  createClient: (settingsManager) => new CliBridgeClient({
    getToken: () => settingsManager.getApiKey(BRIDGE_SECRET_SERVICE),
  }),
};

function settingsFrom(ctx: IpcContext): ISettingsManager {
  const settingsManager = ctx.getSettingsManager();
  if (!settingsManager) throw new Error('Settings manager is unavailable');
  return settingsManager;
}

function notApplicableStatus(): CliBridgeConnectionStatus {
  return {
    state: 'not-applicable',
    paired: false,
    diagnostic: 'CLI providers run directly in this build.',
  };
}

function notPairedStatus(paired = false, diagnostic = 'Pair MarkuprPlus CLI Bridge.'):
CliBridgeConnectionStatus {
  return { state: 'not-paired', paired, diagnostic };
}

function statusFromError(error: unknown, paired: boolean): CliBridgeConnectionStatus {
  if (error instanceof CliBridgeClientError) {
    if (error.code === 'BRIDGE_INCOMPATIBLE') {
      return { state: 'incompatible', paired, diagnostic: error.message };
    }
    if (error.code === 'AUTH_INVALID' || error.code === 'AUTH_REQUIRED') {
      return notPairedStatus(paired, error.message);
    }
    return { state: 'offline', paired, diagnostic: error.message };
  }
  return {
    state: 'offline',
    paired,
    diagnostic: 'Start MarkuprPlus CLI Bridge.',
  };
}

function isCliProvider(value: unknown): boolean {
  return typeof value === 'string'
    && (CLI_BRIDGE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function registerCliBridgeHandlers(
  ctx: IpcContext,
  dependencies: CliBridgeHandlerDependencies = DEFAULT_DEPENDENCIES,
): void {
  ipcMain.handle(IPC_CHANNELS.CLI_BRIDGE_STATUS, async (): Promise<CliBridgeConnectionStatus> => {
    if (dependencies.distribution() !== 'mas') return notApplicableStatus();
    const settingsManager = settingsFrom(ctx);
    const token = await settingsManager.getApiKey(BRIDGE_SECRET_SERVICE);
    if (!token) return notPairedStatus();

    try {
      const providers = await dependencies.createClient(settingsManager).discoverProviders(false);
      return { state: 'connected', paired: true, providers };
    } catch (error) {
      return statusFromError(error, true);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.CLI_BRIDGE_PAIR,
    async (_, tokenValue: unknown): Promise<CliBridgePairResult> => {
      if (dependencies.distribution() !== 'mas') {
        return { success: false, status: notApplicableStatus() };
      }
      const settingsManager = settingsFrom(ctx);
      const previousToken = await settingsManager.getApiKey(BRIDGE_SECRET_SERVICE);
      const candidate = typeof tokenValue === 'string' ? tokenValue.trim() : '';
      if (!BRIDGE_TOKEN_PATTERN.test(candidate)) {
        return {
          success: false,
          status: notPairedStatus(
            Boolean(previousToken),
            'Enter the 43-character token printed by markuprplus bridge token.',
          ),
        };
      }

      try {
        const providers = await dependencies
          .createClient(settingsManager)
          .discoverProviders(true, candidate);
        await settingsManager.setApiKey(BRIDGE_SECRET_SERVICE, candidate);
        return {
          success: true,
          status: { state: 'connected', paired: true, providers },
        };
      } catch (error) {
        return { success: false, status: statusFromError(error, Boolean(previousToken)) };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.CLI_BRIDGE_FORGET, async (): Promise<CliBridgeConnectionStatus> => {
    if (dependencies.distribution() !== 'mas') return notApplicableStatus();
    const settingsManager = settingsFrom(ctx);
    await settingsManager.deleteApiKey(BRIDGE_SECRET_SERVICE);
    if (isCliProvider(settingsManager.get('analysisProvider'))) {
      settingsManager.set('analysisProvider', 'rules');
    }
    return notPairedStatus();
  });
}
