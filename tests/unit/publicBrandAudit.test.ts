import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_PUBLIC_TEXT_FILES,
  README_SCREENSHOT_PATHS,
  auditCurrentPublicTextFiles,
  auditPublicImages,
  auditPublicText,
  auditReadme,
  auditRelativeLinks,
  auditRequiredPaths,
} from '../../scripts/verify-public-brand.mjs';

const expectedCurrentPublicTextFiles = [
  'README.md',
  'README-MCP.md',
  'CLAUDE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'PRODUCT_VISION.md',
  'SECURITY.md',
  'SIGNING_INSTRUCTIONS.md',
  'llms-install.md',
  'docs/AI_AGENT_QUICKSTART.md',
  'docs/AI_PIPELINE_DESIGN.md',
  'docs/API.md',
  'docs/ARCHITECTURE.md',
  'docs/CONFIGURATION.md',
  'docs/DEVELOPMENT.md',
  'docs/EXPORT_FORMATS.md',
  'docs/GETTING_STARTED.md',
  'docs/KEYBOARD_SHORTCUTS.md',
  'docs/TROUBLESHOOTING.md',
  'examples/cli-output-example.md',
  'examples/feedback-session-example.md',
  'examples/github-action-examples/basic-pr-feedback.yml',
  'examples/github-action-examples/qa-pipeline.yml',
  'examples/github-action-examples/visual-regression.yml',
  'examples/mcp-session-example.md',
] as const;

describe('public documentation brand audit', () => {
  it('rejects stale current-product, website, and source-repository copy', () => {
    const obsoleteOwner = ['eddie', 'sanjuan'].join('');
    const obsoleteRepository = ['mark', 'uprx'].join('');
    const currentOwner = ['hash', 'function'].join('');
    expect(auditPublicText('README.md', [
      '# MarkuprX',
      'Visit https://markuprx.com/download.',
      `Source: https://github.com/${obsoleteOwner}/${obsoleteRepository}/`,
      `Mirror: https://github.com/${currentOwner}/${obsoleteRepository}?tab=readme`,
      'Proxy: https://api.markuprx.com/v1',
      'Publish with `npm run release`.',
    ].join('\n'))).toEqual([
      'README.md:1: stale public product name',
      'README.md:2: stale public website',
      'README.md:3: stale source repository',
      'README.md:4: stale source repository',
      'README.md:5: stale public website',
      'README.md:6: nonexistent npm script',
    ]);
  });

  it('allows retained lower-case compatibility identifiers without treating them as public names', () => {
    expect(auditPublicText('README.md', [
      'Run `npx markuprx analyze recording.mov`.',
      'Start the server with `markuprx-mcp`.',
      'Keep `.markuprx.json`, `window.markuprx`, and `com.markuprx/markuprx`.',
    ].join('\n'))).toEqual([]);
  });

  it('requires retained Action references to be visibly unpublished and disabled', () => {
    const actionPath = 'examples/github-action-examples/reference.yml';
    const use = 'uses: eddiesanjuan/markuprx-action@v1';
    expect(auditPublicText(actionPath, use)).toEqual([
      `${actionPath}: retained Action reference must be marked unpublished`,
      `${actionPath}: unpublished Action example must be disabled`,
    ]);
    expect(auditPublicText(actionPath, [
      '# UNPUBLISHED REFERENCE ONLY: no published repository/tag today.',
      'jobs:',
      '  demo:',
      '    if: ${{ false }}',
      `    ${use}`,
    ].join('\n'))).toEqual([]);
  });

  it('allows the legacy user-data directory only in explicit troubleshooting context', () => {
    const approved = 'The legacy user-data directory remains `MarkuprX` as a compatibility path.';
    expect(auditPublicText('docs/TROUBLESHOOTING.md', approved)).toEqual([]);
    expect(auditPublicText('README.md', approved)).toEqual([
      'README.md:1: stale public product name',
    ]);
    expect(auditPublicText(
      'docs/TROUBLESHOOTING.md',
      'Open `MarkuprX` from the Applications folder.',
    )).toEqual([
      'docs/TROUBLESHOOTING.md:1: stale public product name',
    ]);
    expect(auditPublicText(
      'docs/TROUBLESHOOTING.md',
      `${approved} Open MarkuprX to continue.`,
    )).toEqual([
      'docs/TROUBLESHOOTING.md:1: stale public product name',
    ]);
  });

  it('fails closed when any current guide or curated image is missing', () => {
    const required = ['README.md', 'docs/images/markuprplus/settings.png'];
    expect(auditRequiredPaths(required, (path) => path === 'README.md')).toEqual([
      'docs/images/markuprplus/settings.png: missing required public file',
    ]);
  });

  it('keeps every approved current public guide in the audit manifest', () => {
    expect(CURRENT_PUBLIC_TEXT_FILES).toEqual(expectedCurrentPublicTextFiles);
    expect(README_SCREENSHOT_PATHS).toEqual([
      'docs/images/markuprplus/settings.png',
      'docs/images/markuprplus/session-history.png',
      'docs/images/markuprplus/keyboard-shortcuts.png',
      'docs/images/markuprplus/review-editor.png',
      'docs/images/markuprplus/onboarding.png',
    ]);
  });

  it('reports live relative links whose repository targets do not exist', () => {
    const content = [
      '[README](../README.md)',
      '[Missing guide](missing.md)',
      '<img src="images/missing.png" alt="Missing">',
      '[External](https://markuprplus.com)',
      '[Heading](#local-heading)',
      '```md',
      '[Generated artifact](frames/example.png)',
      '```',
    ].join('\n');
    const existing = new Set(['README.md']);

    expect(auditRelativeLinks(
      'docs/guide.md',
      content,
      (path) => existing.has(path),
    )).toEqual([
      'docs/guide.md:2: broken relative link "missing.md"',
      'docs/guide.md:3: broken relative link "images/missing.png"',
    ]);
  });

  it('requires origin positioning, compatibility notes, capabilities, and a linked gallery', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(auditReadme(readme)).toEqual([]);
  });

  it('requires every curated screenshot to be a 460 by 680 PNG', () => {
    expect(auditPublicImages()).toEqual([]);

    const wrongSizePng = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(wrongSizePng);
    Buffer.from('IHDR').copy(wrongSizePng, 12);
    wrongSizePng.writeUInt32BE(320, 16);
    wrongSizePng.writeUInt32BE(200, 20);
    expect(auditPublicImages(
      ['docs/images/markuprplus/settings.png'],
      () => wrongSizePng,
      () => true,
    )).toEqual([
      'docs/images/markuprplus/settings.png: expected 460x680 PNG, found 320x200',
    ]);
  });

  it('passes the complete current public documentation tree', () => {
    expect(auditCurrentPublicTextFiles()).toEqual([]);
    const output = execFileSync(process.execPath, ['scripts/verify-public-brand.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(output).toBe('Public documentation brand and link audit passed.\n');
  });
});
