import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_PUBLIC_TEXT_FILES,
  README_SCREENSHOT_PATHS,
  auditCurrentPublicTextFiles,
  auditCredentialStorageGuidance,
  auditMcpGuide,
  auditPrivateContactGuidance,
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
      'Old app: https://markuprx.app/download',
      'Old docs: https://docs.markuprx.org/start',
      'Publish with `npm run release`.',
    ].join('\n'))).toEqual([
      'README.md:1: stale public product name',
      'README.md:2: stale public website',
      'README.md:3: stale source repository',
      'README.md:4: stale source repository',
      'README.md:5: stale public website',
      'README.md:6: stale public website',
      'README.md:7: stale public website',
      'README.md:8: nonexistent npm script',
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
    expect(auditPublicText(actionPath, [
      '# UNPUBLISHED REFERENCE ONLY: no published repository/tag today.',
      '# if: ${{ false }}',
      'jobs:',
      '  demo:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      `      - ${use}`,
    ].join('\n'))).toEqual([
      `${actionPath}: unpublished Action example must be disabled`,
    ]);
  });

  it('rejects credential-storage claims that hide the plaintext last resort', () => {
    expect(auditPublicText('README.md', 'Includes secure credential storage.')).toEqual([
      'README.md:1: credential storage overclaim',
    ]);
    expect(auditPublicText(
      'docs/CONFIGURATION.md',
      'Secrets use the OS credential service when available and an encrypted fallback otherwise.',
    )).toEqual([
      'docs/CONFIGURATION.md:1: credential storage overclaim',
    ]);
  });

  it('rejects blanket IPC sender-authorization claims', () => {
    expect(auditPublicText(
      'docs/API.md',
      'Main-process handlers validate senders, values, and paths.',
    )).toEqual([
      'docs/API.md:1: IPC sender-authorization overclaim',
    ]);
    expect(auditPublicText(
      'README.md',
      'Hardened IPC/navigation boundaries protect every request.',
    )).toEqual([
      'README.md:1: IPC sender-authorization overclaim',
    ]);
  });

  it('rejects destructive-path and credential-cleanup guarantees the runtime does not enforce', () => {
    expect(auditPublicText(
      'docs/ARCHITECTURE.md',
      'Output deletion and export operate only on validated contained targets.',
    )).toEqual([
      'docs/ARCHITECTURE.md:1: destructive output-path containment overclaim',
    ]);
    expect(auditPublicText(
      'SECURITY.md',
      'Clear All Data deletes keychain and fallback entries.',
    )).toEqual([
      'SECURITY.md:1: credential-cleanup guarantee overclaim',
    ]);
    expect(auditPublicText(
      'docs/API.md',
      [
        'Ordinary settings are schema-validated.',
        'API keys are not returned in getAll().',
      ].join('\n'),
    )).toEqual([
      'docs/API.md:1: settings schema-validation overclaim',
      'docs/API.md:2: settings secret-exposure overclaim',
    ]);
  });

  it('rejects the upstream maintainer email and requires truthful interim private-contact guidance', () => {
    expect(auditPublicText(
      'SECURITY.md',
      'Email eddie@efsanjuan.com with private vulnerability details.',
    )).toEqual([
      'SECURITY.md:1: stale upstream maintainer contact',
    ]);
    expect(auditPrivateContactGuidance(
      'SECURITY.md',
      'Open a public issue with the full vulnerability report.',
    )).toEqual([
      'SECURITY.md: missing unavailable private-reporting disclosure',
      'SECURITY.md: missing sensitive-details warning',
      'SECURITY.md: missing minimal private-channel request guidance',
    ]);
    expect(auditPrivateContactGuidance(
      'CODE_OF_CONDUCT.md',
      'Email the old maintainer.',
    )).toEqual([
      'CODE_OF_CONDUCT.md: missing canonical Contact issue route',
      'CODE_OF_CONDUCT.md: missing sensitive-details warning',
    ]);
  });

  it('requires the public security guides to disclose and locate the plaintext fallback', () => {
    expect(auditCredentialStorageGuidance(
      'README.md',
      'The app tries the OS credential service.',
    )).toEqual([
      'README.md: missing owner-only plaintext credential fallback disclosure',
      'README.md: missing hosted-key avoidance guidance',
    ]);
    expect(auditCredentialStorageGuidance(
      'docs/TROUBLESHOOTING.md',
      'The owner-only plaintext fallback is possible.',
    )).toEqual([
      'docs/TROUBLESHOOTING.md: missing fallback credential filename',
      'docs/TROUBLESHOOTING.md: missing safe fallback cleanup guidance',
      'docs/TROUBLESHOOTING.md: missing secret-excluding backup guidance',
    ]);
    expect(auditCredentialStorageGuidance(
      'docs/API.md',
      'Settings are exposed to the renderer.',
    )).toEqual([
      'docs/API.md: missing raw-settings legacy-secret warning',
      'docs/API.md: missing unknown-key validation limitation',
    ]);
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
      (path) => existing.has(relative(process.cwd(), path).replaceAll('\\', '/')),
    )).toEqual([
      'docs/guide.md:2: broken relative link "missing.md"',
      'docs/guide.md:3: broken relative link "images/missing.png"',
    ]);
  });

  it('rejects decoded relative links that traverse outside the repository', () => {
    expect(auditRelativeLinks(
      'docs/guide.md',
      [
        '[plain](../../../../../../../etc/passwd)',
        '[encoded](%2e%2e/%2e%2e/etc/passwd?view=1#details)',
        '[mixed](..%5C..%5Cetc%5Cpasswd?view=1#details)',
      ].join('\n'),
      () => true,
    )).toEqual([
      'docs/guide.md:1: relative link escapes repository "../../../../../../../etc/passwd"',
      'docs/guide.md:2: relative link escapes repository "%2e%2e/%2e%2e/etc/passwd?view=1#details"',
      'docs/guide.md:3: relative link escapes repository "..%5C..%5Cetc%5Cpasswd?view=1#details"',
    ]);
  });

  it('rejects a repository-contained symlink whose resolved target escapes the repository', () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), 'markuprplus-public-links-repo-'));
    const outsideRoot = mkdtempSync(join(tmpdir(), 'markuprplus-public-links-outside-'));
    try {
      mkdirSync(join(repositoryRoot, 'docs'));
      writeFileSync(join(outsideRoot, 'secret.txt'), 'not repository content');
      symlinkSync(
        outsideRoot,
        join(repositoryRoot, 'linked-outside'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      expect(auditRelativeLinks(
        'docs/guide.md',
        '[escape](../linked-outside/secret.txt)',
        existsSync,
        repositoryRoot,
      )).toEqual([
        'docs/guide.md:1: relative link resolves outside repository "../linked-outside/secret.txt"',
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('requires origin positioning, compatibility notes, capabilities, and a linked gallery', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(auditReadme(readme)).toEqual([]);
  });

  it('rejects generic MCP provider claims and requires tool-specific egress', () => {
    expect(auditMcpGuide(
      'README-MCP.md',
      [
        'Every processing tool uses provider-dependent analysis.',
        'Screen-description and analysis providers may transmit input depending on configuration.',
        'Confirm the selected local model service or chosen cloud/CLI provider is configured.',
      ].join('\n'),
    )).toEqual(expect.arrayContaining([
      'README-MCP.md: provider-dependent MCP processing claim',
      'README-MCP.md: generic MCP provider-selection claim',
      'README-MCP.md: missing describe_screen Anthropic image egress',
      'README-MCP.md: missing analyze_screenshot client-return behavior',
      'README-MCP.md: missing deterministic CLI pipeline boundary',
    ]));
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
