/**
 * AI Pipeline - Barrel Export
 *
 * Re-exports the pipeline manager and key types for use in the main process.
 */

export { processSession } from './AIPipelineManager';
export { CodexAnalyzer, CodexCliError } from './CodexAnalyzer';
export { CodexCliDiscovery, codexCliDiscovery } from './CodexCliDiscovery';
export { runCliProcess } from './CliProcessRunner';
export {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_SYSTEM_PROMPT,
  buildTranscriptText,
  parseAnalysisResult,
} from './analysisContract';
export type { PipelineProcessOptions } from './AIPipelineManager';
export type { CodexAnalyzerDependencies, CodexCliErrorCode } from './CodexAnalyzer';
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
