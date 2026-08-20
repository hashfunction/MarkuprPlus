/**
 * Output Template System Tests
 *
 * Tests the template registry, all built-in templates, and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  templateRegistry,
  TemplateRegistryImpl,
  markdownTemplate,
  jsonTemplate,
  githubIssueTemplate,
  linearTemplate,
  jiraTemplate,
} from '../../../src/main/output/templates/index';
import type { TemplateContext, OutputTemplate } from '../../../src/main/output/templates/types';
import type { PostProcessResult } from '../../../src/main/pipeline/PostProcessor';
import {
  formatTimestamp,
  formatDuration,
  formatDate,
  generateSegmentTitle,
  wrapTranscription,
  computeRelativeFramePath,
  computeSessionDuration,
  mapFramesToSegments,
} from '../../../src/main/output/templates/helpers';
import { MarkdownGenerator } from '../../../src/main/output/MarkdownGenerator';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeResult(overrides?: Partial<PostProcessResult>): PostProcessResult {
  return {
    transcriptSegments: [
      { text: 'The login button is broken. It does not respond to clicks.', startTime: 0, endTime: 5, confidence: 0.95 },
      { text: 'The navigation menu is confusing for new users.', startTime: 15, endTime: 20, confidence: 0.88 },
      { text: 'Performance is sluggish when loading the dashboard.', startTime: 30, endTime: 35, confidence: 0.92 },
    ],
    extractedFrames: [
      { path: '/tmp/session/frames/frame-001.png', timestamp: 2, reason: 'Key moment: button issue' },
      { path: '/tmp/session/frames/frame-002.png', timestamp: 17, reason: 'Key moment: navigation' },
    ],
    reportPath: '/tmp/session',
    ...overrides,
  };
}

function makeContext(overrides?: Partial<TemplateContext>): TemplateContext {
  return {
    result: makeResult(),
    sessionDir: '/tmp/session',
    timestamp: new Date('2026-02-14T10:30:00').getTime(),
    ...overrides,
  };
}

function makeEmptyContext(): TemplateContext {
  return {
    result: { transcriptSegments: [], extractedFrames: [], reportPath: '/tmp/session' },
    sessionDir: '/tmp/session',
    timestamp: new Date('2026-02-14T10:30:00').getTime(),
  };
}

// =============================================================================
// Helper Tests
// =============================================================================

describe('Template Helpers', () => {
  describe('formatTimestamp', () => {
    it('formats 0 seconds', () => {
      expect(formatTimestamp(0)).toBe('0:00');
    });

    it('formats seconds under a minute', () => {
      expect(formatTimestamp(15.3)).toBe('0:15');
    });

    it('formats minutes and seconds', () => {
      expect(formatTimestamp(125)).toBe('2:05');
    });

    it('handles negative values gracefully', () => {
      expect(formatTimestamp(-5)).toBe('0:00');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds to M:SS', () => {
      expect(formatDuration(90000)).toBe('1:30');
    });

    it('formats zero', () => {
      expect(formatDuration(0)).toBe('0:00');
    });
  });

  describe('formatDate', () => {
    it('formats a date deterministically', () => {
      const date = new Date('2026-02-14T10:30:00');
      const formatted = formatDate(date);
      expect(formatted).toContain('Feb');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('AM');
    });

    it('formats PM correctly', () => {
      const date = new Date('2026-02-14T15:00:00');
      const formatted = formatDate(date);
      expect(formatted).toContain('PM');
      expect(formatted).toContain('3:00');
    });
  });

  describe('generateSegmentTitle', () => {
    it('returns first sentence if short', () => {
      expect(generateSegmentTitle('Hello world.')).toBe('Hello world');
    });

    it('truncates long titles', () => {
      const long = 'A'.repeat(80) + '.';
      const title = generateSegmentTitle(long);
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('...');
    });
  });

  describe('wrapTranscription', () => {
    it('returns plain text without sentence boundaries', () => {
      expect(wrapTranscription('hello world')).toBe('hello world');
    });

    it('wraps multi-sentence text for blockquotes', () => {
      const result = wrapTranscription('First sentence. Second sentence.');
      expect(result).toContain('\n> ');
    });
  });

  describe('computeRelativeFramePath', () => {
    it('returns relative path when given absolute', () => {
      const result = computeRelativeFramePath('/tmp/session/frames/frame.png', '/tmp/session');
      expect(result).toBe('frames/frame.png');
    });

    it('returns as-is when already relative', () => {
      expect(computeRelativeFramePath('frames/frame.png', '/tmp')).toBe('frames/frame.png');
    });
  });

  describe('computeSessionDuration', () => {
    it('returns 0:00 for empty segments', () => {
      expect(computeSessionDuration([])).toBe('0:00');
    });

    it('computes duration from first to last segment', () => {
      const segments = [
        { text: 'a', startTime: 0, endTime: 5, confidence: 0.9 },
        { text: 'b', startTime: 30, endTime: 35, confidence: 0.9 },
      ];
      expect(computeSessionDuration(segments)).toBe('0:35');
    });
  });

  describe('mapFramesToSegments', () => {
    it('maps frames within segment range', () => {
      const segments = [
        { text: 'a', startTime: 0, endTime: 10, confidence: 0.9 },
        { text: 'b', startTime: 15, endTime: 25, confidence: 0.9 },
      ];
      const frames = [
        { path: 'f1.png', timestamp: 5, reason: 'test' },
        { path: 'f2.png', timestamp: 20, reason: 'test' },
      ];
      const map = mapFramesToSegments(segments, frames);
      expect(map.get(0)?.length).toBe(1);
      expect(map.get(1)?.length).toBe(1);
    });

    it('maps frame to closest segment when not in range', () => {
      const segments = [
        { text: 'a', startTime: 0, endTime: 5, confidence: 0.9 },
        { text: 'b', startTime: 50, endTime: 55, confidence: 0.9 },
      ];
      const frames = [{ path: 'f1.png', timestamp: 48, reason: 'test' }];
      const map = mapFramesToSegments(segments, frames);
      expect(map.get(1)?.length).toBe(1);
    });

    it('handles empty frames', () => {
      const segments = [{ text: 'a', startTime: 0, endTime: 5, confidence: 0.9 }];
      const map = mapFramesToSegments(segments, []);
      expect(map.size).toBe(0);
    });
  });
});

// =============================================================================
// Registry Tests
// =============================================================================

describe('TemplateRegistry', () => {
  it('has all built-in templates registered', () => {
    const names = templateRegistry.list();
    expect(names).toContain('markdown');
    expect(names).toContain('json');
    expect(names).toContain('github-issue');
    expect(names).toContain('linear');
    expect(names).toContain('jira');
  });

  it('returns undefined for unknown template', () => {
    expect(templateRegistry.get('nonexistent')).toBeUndefined();
  });

  it('has() returns true for registered templates', () => {
    expect(templateRegistry.has('markdown')).toBe(true);
    expect(templateRegistry.has('nonexistent')).toBe(false);
  });

  it('listWithDescriptions returns template metadata', () => {
    const list = templateRegistry.listWithDescriptions();
    expect(list.length).toBeGreaterThanOrEqual(5);
    for (const item of list) {
      expect(item.name).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.fileExtension).toBeTruthy();
    }
  });

  it('getDefault returns markdown', () => {
    expect(templateRegistry.getDefault()).toBe('markdown');
  });

  it('allows registering custom templates', () => {
    const registry = new TemplateRegistryImpl();
    const custom: OutputTemplate = {
      name: 'custom',
      description: 'A custom template',
      fileExtension: '.txt',
      render: () => ({ content: 'custom output', fileExtension: '.txt' }),
    };
    registry.register(custom);
    expect(registry.has('custom')).toBe(true);
    expect(registry.get('custom')?.render(makeContext()).content).toBe('custom output');
  });

  it('overwrites existing templates with same name', () => {
    const registry = new TemplateRegistryImpl();
    registry.register({
      name: 'test',
      description: 'v1',
      fileExtension: '.md',
      render: () => ({ content: 'v1', fileExtension: '.md' }),
    });
    registry.register({
      name: 'test',
      description: 'v2',
      fileExtension: '.md',
      render: () => ({ content: 'v2', fileExtension: '.md' }),
    });
    expect(registry.get('test')?.description).toBe('v2');
  });
});

// =============================================================================
// Markdown Template Tests
// =============================================================================

describe('Markdown Template', () => {
  it('has correct metadata', () => {
    expect(markdownTemplate.name).toBe('markdown');
    expect(markdownTemplate.fileExtension).toBe('.md');
  });

  it('renders header with session timestamp', () => {
    const output = markdownTemplate.render(makeContext());
    expect(output.content).toContain('# MarkuprPlus Session');
    expect(output.content).toContain('Feb');
    expect(output.content).toContain('2026');
    expect(output.fileExtension).toBe('.md');
  });

  it('renders transcript segments', () => {
    const output = markdownTemplate.render(makeContext());
    expect(output.content).toContain('## Transcript');
    expect(output.content).toContain('[0:00]');
    expect(output.content).toContain('[0:15]');
    expect(output.content).toContain('[0:30]');
    expect(output.content).toContain('login button');
  });

  it('renders frame references', () => {
    const output = markdownTemplate.render(makeContext());
    expect(output.content).toContain('![Frame at');
    expect(output.content).toContain('frames/frame-001.png');
    expect(output.content).toContain('frames/frame-002.png');
  });

  it('renders footer', () => {
    const output = markdownTemplate.render(makeContext());
    expect(output.content).toContain('https://markuprplus.com');
    expect(output.content).not.toContain('Ko-fi');
  });

  it('handles empty transcription', () => {
    const output = markdownTemplate.render(makeEmptyContext());
    expect(output.content).toContain('_No speech was detected');
    expect(output.content).not.toContain('## Transcript');
    expect(output.content).toContain(
      '*Generated by [MarkuprPlus](https://markuprplus.com)*',
    );
    expect(output.content).not.toContain('MarkuprX');
  });

  it('produces output matching MarkdownGenerator.generateFromPostProcess', () => {
    const ctx = makeContext();
    const templateOutput = markdownTemplate.render(ctx);

    const generator = new MarkdownGenerator();
    // We need to use the same timestamp, so we can't compare exactly
    // because MarkdownGenerator uses Date.now() internally.
    // Instead, verify structural equivalence.
    const genOutput = generator.generateFromPostProcess(ctx.result, ctx.sessionDir);

    // Both should have the same structural elements
    expect(templateOutput.content).toContain('# MarkuprPlus Session');
    expect(genOutput).toContain('# MarkuprPlus Session');
    expect(templateOutput.content).toContain('## Transcript');
    expect(genOutput).toContain('## Transcript');
    expect(templateOutput.content).toContain('[0:00]');
    expect(genOutput).toContain('[0:00]');
    expect(templateOutput.content).toContain('frames/frame-001.png');
    expect(genOutput).toContain('frames/frame-001.png');
  });
});

// =============================================================================
// JSON Template Tests
// =============================================================================

describe('JSON Template', () => {
  it('has correct metadata', () => {
    expect(jsonTemplate.name).toBe('json');
    expect(jsonTemplate.fileExtension).toBe('.json');
  });

  it('produces valid JSON', () => {
    const output = jsonTemplate.render(makeContext());
    expect(output.fileExtension).toBe('.json');
    const parsed = JSON.parse(output.content);
    expect(parsed).toBeDefined();
  });

  it('includes all segments', () => {
    const output = jsonTemplate.render(makeContext());
    const parsed = JSON.parse(output.content);
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[0].text).toContain('login button');
  });

  it('includes summary metadata', () => {
    const output = jsonTemplate.render(makeContext());
    const parsed = JSON.parse(output.content);
    expect(parsed.version).toBe('1.0');
    expect(parsed.generator).toBe('MarkuprPlus');
    expect(parsed.summary.segments).toBe(3);
    expect(parsed.summary.frames).toBe(2);
  });

  it('includes frames mapped to segments', () => {
    const output = jsonTemplate.render(makeContext());
    const parsed = JSON.parse(output.content);
    // Frame at t=2 should map to first segment (0-5s)
    expect(parsed.segments[0].frames.length).toBeGreaterThanOrEqual(1);
    expect(parsed.segments[0].frames[0].path).toContain('frame-001');
  });

  it('uses relative paths for frames', () => {
    const output = jsonTemplate.render(makeContext());
    const parsed = JSON.parse(output.content);
    for (const segment of parsed.segments) {
      for (const frame of segment.frames) {
        expect(frame.path).not.toContain('/tmp/session/');
      }
    }
  });

  it('handles empty input', () => {
    const output = jsonTemplate.render(makeEmptyContext());
    const parsed = JSON.parse(output.content);
    expect(parsed.segments).toHaveLength(0);
    expect(parsed.summary.segments).toBe(0);
  });

  it('includes ISO timestamp', () => {
    const output = jsonTemplate.render(makeContext());
    const parsed = JSON.parse(output.content);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// =============================================================================
// GitHub Issue Template Tests
// =============================================================================

describe('GitHub Issue Template', () => {
  it('has correct metadata', () => {
    expect(githubIssueTemplate.name).toBe('github-issue');
    expect(githubIssueTemplate.fileExtension).toBe('.md');
  });

  it('renders task list for action items', () => {
    const output = githubIssueTemplate.render(makeContext());
    expect(output.content).toContain('- [ ] ');
    // Should have 3 action items
    const taskCount = (output.content.match(/- \[ \] /g) || []).length;
    expect(taskCount).toBe(3);
  });

  it('renders collapsible details sections', () => {
    const output = githubIssueTemplate.render(makeContext());
    expect(output.content).toContain('<details>');
    expect(output.content).toContain('<summary>');
    expect(output.content).toContain('</details>');
  });

  it('renders frame images', () => {
    const output = githubIssueTemplate.render(makeContext());
    expect(output.content).toContain('![Screenshot]');
  });

  it('renders header with MarkuprPlus link', () => {
    const output = githubIssueTemplate.render(makeContext());
    expect(output.content).toContain('## Feedback Report');
    expect(output.content).toContain('[MarkuprPlus](https://markuprplus.com)');
  });

  it('handles empty input', () => {
    const output = githubIssueTemplate.render(makeEmptyContext());
    expect(output.content).toContain('_No feedback was captured');
    expect(output.content).not.toContain('<details>');
    expect(output.content).toContain(
      '[MarkuprPlus](https://markuprplus.com)',
    );
    expect(output.content).not.toContain('MarkuprX');
  });
});

// =============================================================================
// Linear Template Tests
// =============================================================================

describe('Linear Template', () => {
  it('has correct metadata', () => {
    expect(linearTemplate.name).toBe('linear');
    expect(linearTemplate.fileExtension).toBe('.md');
  });

  it('avoids HTML (Linear does not support it)', () => {
    const output = linearTemplate.render(makeContext());
    expect(output.content).not.toContain('<details>');
    expect(output.content).not.toContain('<summary>');
    expect(output.content).not.toContain('<br');
  });

  it('renders task list', () => {
    const output = linearTemplate.render(makeContext());
    expect(output.content).toContain('- [ ] ');
  });

  it('renders blockquoted transcript', () => {
    const output = linearTemplate.render(makeContext());
    expect(output.content).toContain('> ');
    expect(output.content).toContain('login button');
  });

  it('renders section headings with timestamps', () => {
    const output = linearTemplate.render(makeContext());
    expect(output.content).toContain('### [0:00]');
    expect(output.content).toContain('### [0:15]');
  });

  it('handles empty input', () => {
    const output = linearTemplate.render(makeEmptyContext());
    expect(output.content).toContain('_No feedback was captured');
    expect(output.content).toContain(
      '_Captured by [MarkuprPlus](https://markuprplus.com)_',
    );
    expect(output.content).not.toContain('MarkuprX');
  });
});

// =============================================================================
// Jira Template Tests
// =============================================================================

describe('Jira Template', () => {
  it('has correct metadata', () => {
    expect(jiraTemplate.name).toBe('jira');
    expect(jiraTemplate.fileExtension).toBe('.jira');
  });

  it('uses Jira wiki markup headings', () => {
    const output = jiraTemplate.render(makeContext());
    expect(output.content).toContain('h1. Feedback Report');
    expect(output.content).toContain('h2. Summary');
    expect(output.content).toContain('h2. Details');
  });

  it('uses Jira panel syntax', () => {
    const output = jiraTemplate.render(makeContext());
    expect(output.content).toContain('{panel:');
    expect(output.content).toContain('{panel}');
  });

  it('uses Jira quote syntax', () => {
    const output = jiraTemplate.render(makeContext());
    expect(output.content).toContain('{quote}');
  });

  it('renders a summary table', () => {
    const output = jiraTemplate.render(makeContext());
    expect(output.content).toContain('||#||Timestamp||Feedback||');
    expect(output.content).toContain('|1|');
    expect(output.content).toContain('|2|');
    expect(output.content).toContain('|3|');
  });

  it('renders Jira image syntax', () => {
    const output = jiraTemplate.render(makeContext());
    expect(output.content).toContain('!frames/frame-001.png|thumbnail!');
  });

  it('renders Jira link syntax in footer', () => {
    const output = jiraTemplate.render(makeContext());
    expect(output.content).toContain('[MarkuprPlus|https://markuprplus.com]');
  });

  it('handles empty input', () => {
    const output = jiraTemplate.render(makeEmptyContext());
    expect(output.content).toContain('_No feedback was captured');
    expect(output.content).not.toContain('h2. Summary');
    expect(output.content).toContain(
      '_Generated by [MarkuprPlus|https://markuprplus.com]_',
    );
    expect(output.content).not.toContain('MarkuprX');
  });
});

// =============================================================================
// All Templates — Shared Contract Tests
// =============================================================================

describe('All Templates — Shared Contract', () => {
  const allTemplates: OutputTemplate[] = [
    markdownTemplate,
    jsonTemplate,
    githubIssueTemplate,
    linearTemplate,
    jiraTemplate,
  ];

  for (const template of allTemplates) {
    describe(`${template.name}`, () => {
      it('returns content as a non-empty string', () => {
        const output = template.render(makeContext());
        expect(typeof output.content).toBe('string');
        expect(output.content.length).toBeGreaterThan(0);
      });

      it('returns a valid file extension', () => {
        const output = template.render(makeContext());
        expect(output.fileExtension).toMatch(/^\.\w+/);
      });

      it('handles empty input without throwing', () => {
        expect(() => template.render(makeEmptyContext())).not.toThrow();
      });

      it('is a pure function (no side effects, same input = structurally valid output)', () => {
        const ctx = makeContext();
        const output1 = template.render(ctx);
        const output2 = template.render(ctx);
        expect(output1.content).toBe(output2.content);
        expect(output1.fileExtension).toBe(output2.fileExtension);
      });

      it('uses only current public branding in generated artifacts', () => {
        const content = template.render(makeContext()).content;
        expect(content).toContain('MarkuprPlus');
        expect(content).not.toContain('MarkuprX');
        expect(content).not.toContain('markuprx.com');
      });
    });
  }
});

describe('Marked issue template preservation', () => {
  const markedIssue = {
    id: 'marked-issue-001',
    ordinal: 1,
    startedAt: 1_000,
    markedAt: 1_100,
    completedAt: 1_200,
    strokeIds: ['stroke-1'],
    tools: ['circle' as const],
    colors: ['#ff3b30' as const],
    screenshotPath: 'screenshots/marked-issue-001.png',
    fallbackVideoTimestamp: 1.1,
    comment: 'The save button overlaps the footer.',
    transcriptionStatus: 'available' as const,
    snapshotRevision: 1,
    transcriptSegmentIds: ['transcript-segment-0001'],
  };
  const context = makeContext({
    result: makeResult({
      markedIssues: [markedIssue],
      extractedFrames: [{
        path: '/tmp/session/screenshots/marked-issue-001.png',
        timestamp: 1.1,
        reason: 'Marked issue MX-001',
        markedIssueId: 'marked-issue-001',
      }],
    }),
  });

  it.each([
    ['markdown', markdownTemplate],
    ['github', githubIssueTemplate],
    ['linear', linearTemplate],
    ['jira', jiraTemplate],
  ])('keeps the separate issue in %s output without a duplicate generic frame', (_name, template) => {
    const content = template.render(context).content;
    expect(content).toContain('MX-001');
    expect(content).toContain('The save button overlaps the footer.');
    expect(content.match(/marked-issue-001\.png/g)).toHaveLength(1);
  });

  it('keeps the complete finalized issue array in JSON output', () => {
    const output = JSON.parse(jsonTemplate.render(context).content);
    expect(output.markedIssues).toEqual([markedIssue]);
  });
});
