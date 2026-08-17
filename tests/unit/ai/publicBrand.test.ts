import { describe, expect, it } from 'vitest';
import { ANALYSIS_SYSTEM_PROMPT } from '../../../src/main/ai/analysisContract';
import { StructuredMarkdownBuilder } from '../../../src/main/ai/StructuredMarkdownBuilder';

describe('AI-generated public attribution', () => {
  it('identifies the current product in the provider system prompt', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("MarkuprPlus's AI analysis engine");
    expect(ANALYSIS_SYSTEM_PROMPT).not.toContain('MarkuprX');
  });

  it('brands structured reports with the canonical public name and URL', () => {
    const builder = new StructuredMarkdownBuilder();
    const markdown = builder.buildDocument(
      {
        id: 'session-brand',
        startTime: 1_000,
        endTime: 2_000,
        feedbackItems: [],
        screenshotBuffer: [],
        transcriptBuffer: [],
        metadata: { sourceName: 'Test App' },
      } as Parameters<StructuredMarkdownBuilder['buildDocument']>[0],
      {
        summary: 'The tested flow is clear.',
        items: [],
        themes: [],
        positiveNotes: [],
        metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
      },
      {
        projectName: 'Test App',
        screenshotDir: './screenshots',
        providerLabel: 'Local Rules',
      },
    );

    expect(markdown).toContain('[MarkuprPlus](https://markuprplus.com)');
    expect(markdown).not.toContain('MarkuprX');
    expect(markdown).not.toContain('markuprx.com');
  });
});
