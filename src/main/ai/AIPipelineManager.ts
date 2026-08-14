/**
 * Safety-first orchestration for rule-based, Anthropic, and installed-CLI analysis.
 */

import type { Session } from '../SessionController';
import type { MarkdownDocument } from '../output/FileManager';
import type { ISettingsManager } from '../settings/SettingsManager';
import type { AnalysisProvider } from '../../shared/types';
import { generateDocumentForFileManager } from '../output/sessionAdapter';
import { ClaudeAnalyzer } from './ClaudeAnalyzer';
import { CodexAnalyzer } from './CodexAnalyzer';
import { structuredMarkdownBuilder } from './StructuredMarkdownBuilder';
import type { AIAnalysisResult, AIPipelineOutput } from './types';

interface AnalysisEngine {
  analyze(session: Session): Promise<AIAnalysisResult | null>;
}

export interface PipelineDependencies {
  createCodexAnalyzer(): AnalysisEngine;
  createClaudeAnalyzer(apiKey: string): AnalysisEngine;
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
  createCodexAnalyzer: () => new CodexAnalyzer(),
  createClaudeAnalyzer: (apiKey) => new ClaudeAnalyzer(apiKey),
};

function generateFreeTierDocument(
  session: Session,
  projectName: string,
  screenshotDir: string,
): MarkdownDocument {
  return generateDocumentForFileManager(session, { projectName, screenshotDir });
}

function providerDetails(provider: Exclude<AnalysisProvider, 'rules'>): {
  label: string;
  modelId?: string;
} {
  return provider === 'codex-cli'
    ? { label: 'Codex CLI' }
    : { label: 'Claude', modelId: 'claude-sonnet-4-5-20250929' };
}

function fallbackOutput(
  document: MarkdownDocument,
  provider: AnalysisProvider,
  startedAt: number,
  reason?: string,
): { document: MarkdownDocument; pipelineOutput: AIPipelineOutput } {
  const details = provider === 'rules' ? undefined : providerDetails(provider);
  return {
    document,
    pipelineOutput: {
      markdown: document.content,
      aiEnhanced: false,
      processingTimeMs: Date.now() - startedAt,
      tier: provider === 'rules' ? 'free' : 'byok',
      provider,
      ...(details ? { providerLabel: details.label } : {}),
      ...(reason ? { fallbackReason: reason } : {}),
    },
  };
}

/**
 * Generate the rule-based report first, then enhance it with exactly the selected provider.
 */
export async function processSession(
  session: Session,
  options: PipelineProcessOptions,
): Promise<{ document: MarkdownDocument; pipelineOutput: AIPipelineOutput }> {
  const startedAt = Date.now();
  const projectName = options.projectName || session.metadata?.sourceName || 'Feedback Session';
  const screenshotDir = options.screenshotDir || './screenshots';
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  const configuredProvider = options.settingsManager.get('analysisProvider');
  const provider: AnalysisProvider = configuredProvider || 'anthropic-api';

  console.log('[AIPipelineManager] Generating rule-based output as safety net...');
  const freeDocument = generateFreeTierDocument(session, projectName, screenshotDir);

  if (provider === 'rules') {
    console.log('[AIPipelineManager] Local rules selected; skipping external AI analysis.');
    return fallbackOutput(freeDocument, 'rules', startedAt);
  }

  const details = providerDetails(provider);
  try {
    let analyzer: AnalysisEngine;
    if (provider === 'codex-cli') {
      analyzer = dependencies.createCodexAnalyzer();
    } else {
      const apiKey = await options.settingsManager.getApiKey('anthropic');
      if (!apiKey) {
        return fallbackOutput(
          freeDocument,
          'anthropic-api',
          startedAt,
          'Anthropic API key is not configured',
        );
      }
      analyzer = dependencies.createClaudeAnalyzer(apiKey);
    }

    console.log(`[AIPipelineManager] Running ${details.label} analysis...`);
    const analysis = await analyzer.analyze(session);
    if (!analysis) {
      return fallbackOutput(
        freeDocument,
        provider,
        startedAt,
        `${details.label} analysis returned no result`,
      );
    }

    const markdown = structuredMarkdownBuilder.buildDocument(session, analysis, {
      projectName,
      screenshotDir,
      hasRecording: options.hasRecording,
      recordingFilename: options.recordingFilename,
      providerLabel: details.label,
      modelId: details.modelId,
    });
    const document: MarkdownDocument = {
      content: markdown,
      metadata: {
        itemCount: analysis.items.length,
        screenshotCount: session.screenshotBuffer.length,
        types: [...new Set(analysis.items.map((item) => item.category))],
      },
    };

    console.log(
      `[AIPipelineManager] ${details.label} analysis complete: ${analysis.items.length} items ` +
      `(${Date.now() - startedAt}ms)`,
    );
    return {
      document,
      pipelineOutput: {
        markdown,
        aiEnhanced: true,
        analysis,
        processingTimeMs: Date.now() - startedAt,
        tier: 'byok',
        provider,
        providerLabel: details.label,
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown analysis error';
    console.error(
      `[AIPipelineManager] ${details.label} analysis failed after ${Date.now() - startedAt}ms; ` +
      'using the rule-based report.',
    );
    return fallbackOutput(freeDocument, provider, startedAt, reason);
  }
}
