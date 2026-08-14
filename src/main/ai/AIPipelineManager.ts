/** Safety-first orchestration for selectable report-analysis providers. */

import type { Session } from '../SessionController';
import type { MarkdownDocument } from '../output/FileManager';
import type { ISettingsManager } from '../settings/SettingsManager';
import type {
  AnalysisConnection,
  AnalysisProvider,
} from '../../shared/types';
import { generateDocumentForFileManager } from '../output/sessionAdapter';
import {
  AnalysisProviderRegistry,
  createDefaultAnalysisProviderRegistry,
} from './providers/AnalysisProviderRegistry';
import { structuredMarkdownBuilder } from './StructuredMarkdownBuilder';
import type { AIPipelineOutput } from './types';

export interface PipelineDependencies {
  createProviderRegistry(settingsManager: ISettingsManager): AnalysisProviderRegistry;
}

export interface PipelineProcessOptions {
  settingsManager: ISettingsManager;
  projectName?: string;
  screenshotDir?: string;
  hasRecording?: boolean;
  recordingFilename?: string;
  dependencies?: Partial<PipelineDependencies>;
}

const DEFAULT_DEPENDENCIES: PipelineDependencies = {
  createProviderRegistry: createDefaultAnalysisProviderRegistry,
};

function generateFreeTierDocument(
  session: Session,
  projectName: string,
  screenshotDir: string,
): MarkdownDocument {
  return generateDocumentForFileManager(session, { projectName, screenshotDir });
}

function sanitizeFailureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Unknown analysis error';
  const withoutControls = Array.from(raw, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
  }).join('');
  const sanitized = withoutControls
    .replace(/\s+/g, ' ')
    .trim();
  return (sanitized || 'Unknown analysis error').slice(0, 500);
}

function escapeMarkdownHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function addFallbackWarning(document: MarkdownDocument, reason: string): MarkdownDocument {
  const warning = [
    '> **AI analysis unavailable; Local Rules used.**',
    `> ${escapeMarkdownHtml(reason)}`,
    '',
  ].join('\n');
  const newline = document.content.indexOf('\n');
  const content = newline >= 0
    ? `${document.content.slice(0, newline + 1)}\n${warning}${document.content.slice(newline + 1)}`
    : `${document.content}\n\n${warning}`;
  return { ...document, content };
}

function localRulesOutput(
  document: MarkdownDocument,
  startedAt: number,
): { document: MarkdownDocument; pipelineOutput: AIPipelineOutput } {
  return {
    document,
    pipelineOutput: {
      markdown: document.content,
      aiEnhanced: false,
      processingTimeMs: Date.now() - startedAt,
      tier: 'free',
      provider: 'rules',
      requestedProvider: 'rules',
      requestedModel: null,
      actualProvider: 'rules',
      actualModel: null,
      connection: 'local',
      providerLabel: 'Local Rules',
    },
  };
}

function fallbackOutput(
  document: MarkdownDocument,
  provider: Exclude<AnalysisProvider, 'rules'>,
  modelId: string | null,
  connection: AnalysisConnection,
  providerLabel: string,
  startedAt: number,
  reason: string,
): { document: MarkdownDocument; pipelineOutput: AIPipelineOutput } {
  const warnedDocument = addFallbackWarning(document, reason);
  return {
    document: warnedDocument,
    pipelineOutput: {
      markdown: warnedDocument.content,
      aiEnhanced: false,
      processingTimeMs: Date.now() - startedAt,
      tier: 'byok',
      provider,
      requestedProvider: provider,
      requestedModel: modelId,
      actualProvider: 'rules',
      actualModel: null,
      connection,
      providerLabel,
      fallbackReason: reason,
    },
  };
}

/** Generate Local Rules first, then invoke exactly the selected report provider. */
export async function processSession(
  session: Session,
  options: PipelineProcessOptions,
): Promise<{ document: MarkdownDocument; pipelineOutput: AIPipelineOutput }> {
  const startedAt = Date.now();
  const projectName = options.projectName || session.metadata?.sourceName || 'Feedback Session';
  const screenshotDir = options.screenshotDir || './screenshots';
  const provider = options.settingsManager.get('analysisProvider') || 'anthropic-api';

  console.log('[AIPipelineManager] Generating rule-based output as safety net...');
  const freeDocument = generateFreeTierDocument(session, projectName, screenshotDir);

  if (provider === 'rules') {
    console.log('[AIPipelineManager] Local Rules selected; skipping external AI analysis.');
    return localRulesOutput(freeDocument, startedAt);
  }

  const models = options.settingsManager.get('analysisModelsByProvider') || {};
  const modelId = models[provider]?.trim() || null;
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  const adapter = dependencies.createProviderRegistry(options.settingsManager).get(provider);

  try {
    const status = await adapter.discover(false);
    if (!status.ready) {
      throw new Error(status.diagnostic || `${adapter.name} is not ready.`);
    }

    console.log(`[AIPipelineManager] Running ${adapter.name} analysis...`);
    const analysis = await adapter.analyze(session, modelId || undefined);
    if (!analysis) {
      throw new Error(`${adapter.name} analysis returned no result`);
    }

    const markdown = structuredMarkdownBuilder.buildDocument(session, analysis, {
      projectName,
      screenshotDir,
      hasRecording: options.hasRecording,
      recordingFilename: options.recordingFilename,
      providerLabel: adapter.name,
      modelId: modelId || undefined,
    });
    const document: MarkdownDocument = {
      content: markdown,
      metadata: {
        itemCount: analysis.items.length,
        screenshotCount: session.screenshotBuffer.length,
        types: [...new Set(analysis.items.map((item) => item.category))],
      },
    };

    return {
      document,
      pipelineOutput: {
        markdown,
        aiEnhanced: true,
        analysis,
        processingTimeMs: Date.now() - startedAt,
        tier: 'byok',
        provider,
        requestedProvider: provider,
        requestedModel: modelId,
        actualProvider: provider,
        actualModel: modelId,
        connection: adapter.connection,
        providerLabel: adapter.name,
      },
    };
  } catch (error) {
    const reason = sanitizeFailureReason(error);
    console.error(
      `[AIPipelineManager] ${adapter.name} analysis failed after ${Date.now() - startedAt}ms; ` +
      'using the rule-based report.',
    );
    return fallbackOutput(
      freeDocument,
      provider,
      modelId,
      adapter.connection,
      adapter.name,
      startedAt,
      reason,
    );
  }
}
