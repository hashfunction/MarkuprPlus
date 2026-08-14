import type { AnalysisProvider } from '../../../shared/types';
import type { Session } from '../../SessionController';
import type { AIAnalysisResult } from '../types';
import type {
  AdapterAnalysisProvider,
  AnalysisProviderAdapter,
} from './types';

export class AnalysisProviderRegistry {
  private readonly adapters: AnalysisProviderAdapter[];
  private readonly adaptersById = new Map<AdapterAnalysisProvider, AnalysisProviderAdapter>();

  constructor(adapters: AnalysisProviderAdapter[]) {
    this.adapters = [...adapters];
    for (const adapter of this.adapters) {
      if (this.adaptersById.has(adapter.id)) {
        throw new Error(`Duplicate analysis provider: ${adapter.id}`);
      }
      this.adaptersById.set(adapter.id, adapter);
    }
  }

  get(provider: AnalysisProvider): AnalysisProviderAdapter {
    const adapter = this.adaptersById.get(provider as AdapterAnalysisProvider);
    if (!adapter) {
      throw new Error(`Unsupported analysis provider: ${provider}`);
    }
    return adapter;
  }

  async discoverAll(forceRefresh = false) {
    return Promise.all(
      this.adapters.map((adapter) => adapter.discover(forceRefresh)),
    );
  }

  analyze(
    provider: AnalysisProvider,
    session: Session,
    modelId?: string,
  ): Promise<AIAnalysisResult | null> {
    return this.get(provider).analyze(session, modelId);
  }
}

export function createAnalysisProviderRegistry(
  adapters: AnalysisProviderAdapter[],
): AnalysisProviderRegistry {
  return new AnalysisProviderRegistry(adapters);
}
