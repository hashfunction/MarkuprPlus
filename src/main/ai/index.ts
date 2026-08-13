/**
 * AI Pipeline - Barrel Export
 *
 * Re-exports the pipeline manager and key types for use in the main process.
 */

export { processSession } from './AIPipelineManager';
export { CodexCliDiscovery, codexCliDiscovery } from './CodexCliDiscovery';
export { runCliProcess } from './CliProcessRunner';
export type { PipelineProcessOptions } from './AIPipelineManager';
export type { CodexCliDiscoveryDependencies } from './CodexCliDiscovery';
export type { CliProcessOptions, CliProcessResult } from './CliProcessRunner';
export type {
  AITier,
  AIPipelineOutput,
  AIPipelineOptions,
  AIPipelineProgress,
  AIPipelineStage,
  AIAnalysisResult,
} from './types';
