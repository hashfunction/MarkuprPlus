import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CURRENT_PUBLIC_TEXT_FILES = [
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
];

export const README_SCREENSHOT_PATHS = [
  'docs/images/markuprplus/settings.png',
  'docs/images/markuprplus/session-history.png',
  'docs/images/markuprplus/keyboard-shortcuts.png',
  'docs/images/markuprplus/review-editor.png',
  'docs/images/markuprplus/onboarding.png',
];

const compatibilityName = ['mark', 'uprx'].join('');
const originalProjectName = ['mark', 'upr'].join('');
const originalProjectRepository = [
  'https://github.com',
  ['eddie', 'sanjuan'].join(''),
  originalProjectName,
].join('/');
const canonicalRepository = 'https://github.com/hashfunction/MarkuprPlus';
const obsoleteRepositoryPatterns = [
  ['eddie', 'sanjuan'].join(''),
  ['hash', 'function'].join(''),
].flatMap((owner) => [
  new RegExp(`github\\.com/${owner}/${compatibilityName}(?:[/?#]|$)`, 'i'),
  new RegExp(`api\\.github\\.com/repos/${owner}/${compatibilityName}(?:[/?#]|$)`, 'i'),
  new RegExp(`raw\\.githubusercontent\\.com/${owner}/${compatibilityName}(?:[/?#]|$)`, 'i'),
]);

function isApprovedLegacyDataDirectoryGuidance(file, line) {
  return file === 'docs/TROUBLESHOOTING.md'
    && line.trim() === 'The legacy user-data directory remains `MarkuprX` as a compatibility path.';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function auditPublicText(file, content) {
  const findings = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (/\bMarkuprX\b/.test(line)
      && !isApprovedLegacyDataDirectoryGuidance(file, line)) {
      findings.push(`${file}:${index + 1}: stale public product name`);
    }
    if (/https?:\/\/(?:[a-z\d-]+\.)*markuprx\.com(?:[/?#]|$)/i.test(line)) {
      findings.push(`${file}:${index + 1}: stale public website`);
    }
    if (obsoleteRepositoryPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${file}:${index + 1}: stale source repository`);
    }
    if (/\bnpm\s+run\s+release\b/u.test(line)) {
      findings.push(`${file}:${index + 1}: nonexistent npm script`);
    }
  });
  if (file.startsWith('examples/github-action-examples/')
    && /eddiesanjuan\/markuprx-action@/u.test(content)) {
    if (!/UNPUBLISHED REFERENCE ONLY/u.test(content)) {
      findings.push(`${file}: retained Action reference must be marked unpublished`);
    }
    if (!/\bif:\s*\$\{\{\s*false\b/u.test(content)) {
      findings.push(`${file}: unpublished Action example must be disabled`);
    }
  }
  return findings;
}

export function auditRequiredPaths(paths, pathExists = existsSync) {
  return paths
    .filter((path) => !pathExists(path))
    .map((path) => `${path}: missing required public file`);
}

function linesWithoutCodeFences(content) {
  let fence = null;
  return content.split(/\r?\n/).map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      return '';
    }
    if (fence) return '';
    return line.replace(/`[^`]*`/gu, '');
  });
}

function liveRelativeTarget(reference) {
  const trimmed = reference.trim().replace(/^<|>$/g, '');
  if (!trimmed
    || trimmed.startsWith('#')
    || trimmed.startsWith('/')
    || trimmed.startsWith('//')
    || /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    || /[{}*$]/u.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/[?#].*$/u, '');
}

export function auditRelativeLinks(file, content, pathExists = existsSync) {
  const findings = [];
  linesWithoutCodeFences(content).forEach((line, index) => {
    const references = [];
    for (const match of line.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\)/gu)) {
      references.push(match[1] || match[2]);
    }
    for (const match of line.matchAll(/(?:href|src)=["']([^"']+)["']/giu)) {
      references.push(match[1]);
    }

    for (const reference of new Set(references)) {
      const target = liveRelativeTarget(reference);
      if (!target) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        findings.push(`${file}:${index + 1}: invalid relative link "${reference}"`);
        continue;
      }
      const repositoryPath = normalize(join(dirname(file), decoded)).replaceAll('\\', '/');
      if (!pathExists(repositoryPath)) {
        findings.push(`${file}:${index + 1}: broken relative link "${reference}"`);
      }
    }
  });
  return findings;
}

function pngDimensions(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!Buffer.isBuffer(buffer)
    || buffer.length < 24
    || !signature.every((byte, index) => buffer[index] === byte)
    || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function auditPublicImages(
  paths = README_SCREENSHOT_PATHS,
  readBinary = readFileSync,
  pathExists = existsSync,
) {
  const findings = [];
  for (const path of paths) {
    if (!pathExists(path)) {
      findings.push(`${path}: missing required public file`);
      continue;
    }
    let dimensions;
    try {
      dimensions = pngDimensions(readBinary(path));
    } catch (error) {
      findings.push(`${path}: unable to read public image (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    if (!dimensions) {
      findings.push(`${path}: expected 460x680 PNG, found invalid PNG`);
    } else if (dimensions.width !== 460 || dimensions.height !== 680) {
      findings.push(
        `${path}: expected 460x680 PNG, found ${dimensions.width}x${dimensions.height}`,
      );
    }
  }
  return findings;
}

export function auditReadme(content) {
  const findings = [];
  const requiredCopy = [
    ['MarkuprPlus heading', /<h1[^>]*>\s*MarkuprPlus\s*<\/h1>/iu],
    ['canonical website', /https:\/\/markuprplus\.com(?:[/?#"')]|$)/iu],
    ['canonical repository', new RegExp(`${escapeRegExp(canonicalRepository)}(?:[/?#"')]|$)`, 'u')],
    ['canonical issue tracker', new RegExp(`${escapeRegExp(canonicalRepository)}/issues(?:[/?#"')]|$)`, 'u')],
    ['enhanced origin heading', new RegExp(`^## Significantly enhanced from ${originalProjectName}$`, 'imu')],
    ['original-project attribution', new RegExp(`significantly enhanced evolution of \\[${originalProjectName}\\]\\(${escapeRegExp(originalProjectRepository)}\\)`, 'iu')],
    ['portrait taskbar UX', /portrait taskbar-popover UX/iu],
    ['capture and annotation', /capture and live annotation/iu],
    ['multi-issue review', /multi-issue/iu],
    ['session history', /Session History/u],
    ['crash recovery', /crash recovery/iu],
    ['desktop export formats', /Markdown, PDF, HTML, and JSON/u],
    ['GitHub and Linear delivery', /GitHub and Linear/iu],
    ['Codex CLI provider', /Codex CLI/u],
    ['Claude Code CLI provider', /Claude Code CLI/u],
    ['Ollama provider', /Ollama/u],
    ['LM Studio provider', /LM Studio/u],
    ['Anthropic API provider', /Anthropic API/u],
    ['Local Rules provider', /Local Rules/u],
    ['local Whisper', /local Whisper/iu],
    ['CLI interface', /\bCLI\b/u],
    ['MCP interface', /\bMCP\b/u],
    ['accessibility', /accessib/iu],
    ['keyboard support', /keyboard/iu],
    ['privacy', /\bprivacy\b/iu],
    ['security', /\bsecurity\b/iu],
    ['compatibility status', /retained compatibility names are reserved for publication/iu],
    ['compatible CLI name', new RegExp(`\`${compatibilityName}\``, 'u')],
    ['compatible MCP name', new RegExp(`\`${compatibilityName}-mcp\``, 'u')],
  ];
  for (const [label, pattern] of requiredCopy) {
    if (!pattern.test(content)) findings.push(`README.md: missing ${label}`);
  }

  const inaccurateClaims = [
    ['unavailable npm package link', /npmjs\.com\/package\/markuprx/iu],
    ['unavailable npm badge', /img\.shields\.io\/npm\//iu],
    ['unqualified local-only claim', /never leave your machine|no cloud dependency|everything runs locally/iu],
    ['obsolete demo asset', /assets\/demo-cli\.gif/iu],
  ];
  for (const [label, pattern] of inaccurateClaims) {
    if (pattern.test(content)) findings.push(`README.md: ${label}`);
  }

  for (const path of README_SCREENSHOT_PATHS) {
    const escapedPath = escapeRegExp(path);
    const anchor = content.match(
      new RegExp(`<a\\s+[^>]*href=["']${escapedPath}["'][^>]*>([\\s\\S]*?)<\\/a>`, 'iu'),
    )?.[1];
    if (!anchor
      || !new RegExp(`<img\\s+[^>]*src=["']${escapedPath}["']`, 'iu').test(anchor)
      || !/width=["']320["']/iu.test(anchor)
      || !/alt=["'][^"']*MarkuprPlus[^"']*["']/iu.test(anchor)) {
      findings.push(`README.md: ${path} must be a 320px linked MarkuprPlus thumbnail`);
    }
    const occurrences = content.match(new RegExp(escapedPath, 'gu'))?.length ?? 0;
    if (occurrences !== 2) {
      findings.push(`README.md: ${path} must appear exactly once as href and once as src`);
    }
  }
  return findings;
}

export function auditCurrentPublicTextFiles({
  readText = (file) => readFileSync(file, 'utf8'),
  readBinary = readFileSync,
  pathExists = existsSync,
} = {}) {
  const findings = auditRequiredPaths(
    [...CURRENT_PUBLIC_TEXT_FILES, ...README_SCREENSHOT_PATHS],
    pathExists,
  );
  for (const file of CURRENT_PUBLIC_TEXT_FILES) {
    if (!pathExists(file)) continue;
    let content;
    try {
      content = readText(file);
    } catch (error) {
      findings.push(`${file}: unable to read public file (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    findings.push(...auditPublicText(file, content));
    findings.push(...auditRelativeLinks(file, content, pathExists));
    if (file === 'README.md') findings.push(...auditReadme(content));
  }
  findings.push(...auditPublicImages(README_SCREENSHOT_PATHS, readBinary, pathExists));
  return [...new Set(findings)];
}

function runPublicBrandAudit() {
  const findings = auditCurrentPublicTextFiles();
  if (findings.length > 0) {
    console.error('Public documentation brand or link violations found:');
    findings.slice(0, 200).forEach((finding) => console.error(`- ${finding}`));
    if (findings.length > 200) {
      console.error(`- ...and ${findings.length - 200} more`);
    }
    process.exitCode = 1;
  } else {
    console.log('Public documentation brand and link audit passed.');
  }
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPublicBrandAudit();
}
