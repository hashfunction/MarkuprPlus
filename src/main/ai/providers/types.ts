import type {
  AnalysisConnection,
  AnalysisProvider,
  AnalysisProviderStatus,
} from '../../../shared/types';
import type { Session } from '../../SessionController';
import type { AIAnalysisResult } from '../types';

export type AdapterAnalysisProvider = Exclude<AnalysisProvider, 'rules'>;

export interface AnalysisProviderAdapter {
  readonly id: AdapterAnalysisProvider;
  readonly name: string;
  readonly connection: AnalysisConnection;
  discover(forceRefresh?: boolean): Promise<AnalysisProviderStatus>;
  analyze(session: Session, modelId?: string): Promise<AIAnalysisResult | null>;
}
