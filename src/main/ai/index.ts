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
  AnalysisProviderRegistry,
  createAnalysisProviderRegistry,
  createCliAnalysisProviderRegistry,
  createDefaultAnalysisProviderRegistry,
  createLocalAnalysisProviderRegistry,
} from './providers/AnalysisProviderRegistry';
export {
  AnthropicApiProvider,
  AnthropicApiProviderError,
} from './providers/AnthropicApiProvider';
export {
  ClaudeCliAnalyzer,
  ClaudeCliError,
} from './providers/ClaudeCliAnalyzer';
export {
  ClaudeCliDiscovery,
  claudeCliDiscovery,
} from './providers/ClaudeCliDiscovery';
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
  AdapterAnalysisProvider,
  AnalysisProviderAdapter,
} from './providers/types';
export type {
  AITier,
  AIPipelineOutput,
  AIPipelineOptions,
  AIPipelineProgress,
  AIPipelineStage,
  AIAnalysisResult,
} from './types';
