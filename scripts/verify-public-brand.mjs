import { existsSync, readFileSync, realpathSync } from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from 'node:path';
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
const credentialStorageGuidance = new Map([
  ['README.md', [
    ['owner-only plaintext credential fallback disclosure', /owner-only plaintext/iu],
    ['hosted-key avoidance guidance', /(?:omit|do not save|avoid saving) (?:hosted|cloud) API keys/iu],
  ]],
  ['SECURITY.md', [
    ['owner-only plaintext credential fallback disclosure', /owner-only plaintext/iu],
    ['fallback credential filename', /`secure-keys\.json`/u],
    ['hosted-key avoidance guidance', /(?:omit|do not save|avoid saving) (?:hosted|cloud) API keys/iu],
    ['settings-export sensitivity warning', /Settings Export[\s\S]*?(?:legacy|older)[\s\S]*?secret/iu],
  ]],
  ['docs/CONFIGURATION.md', [
    ['owner-only plaintext credential fallback disclosure', /owner-only plaintext/iu],
    ['fallback credential filename', /`secure-keys\.json`/u],
    ['hosted-key avoidance guidance', /(?:omit|do not save|avoid saving) (?:hosted|cloud) API keys/iu],
    ['settings-export sensitivity warning', /Export Settings[\s\S]*?(?:legacy|older)[\s\S]*?secret/iu],
  ]],
  ['docs/ARCHITECTURE.md', [
    ['owner-only plaintext credential fallback disclosure', /owner-only plaintext/iu],
  ]],
  ['docs/AI_PIPELINE_DESIGN.md', [
    ['owner-only plaintext credential fallback disclosure', /owner-only plaintext/iu],
  ]],
  ['docs/TROUBLESHOOTING.md', [
    ['owner-only plaintext credential fallback disclosure', /owner-only plaintext/iu],
    ['fallback credential filename', /`secure-keys\.json`/u],
    ['safe fallback cleanup guidance', /Clear All Data/u],
    ['secret-excluding backup guidance', /back up only[\s\S]*?exclud(?:e|ing)[\s\S]*?(?:settings|secure-keys)/iu],
  ]],
  ['docs/API.md', [
    ['raw-settings legacy-secret warning', /raw persisted[\s\S]*?legacy[\s\S]*?secret/iu],
    ['unknown-key validation limitation', /unknown setting keys[\s\S]*?(?:accepted|not rejected)/iu],
  ]],
]);
const privateContactGuidance = new Map([
  ['SECURITY.md', [
    ['unavailable private-reporting disclosure', /private vulnerability reporting is not yet configured/iu],
    ['sensitive-details warning', /do not post sensitive details[\s\S]*?public/iu],
    ['minimal private-channel request guidance', /minimal[\s\S]*?issue[\s\S]*?request(?:ing)? a private channel/iu],
  ]],
  ['CODE_OF_CONDUCT.md', [
    ['canonical Contact issue route', /https:\/\/github\.com\/hashfunction\/MarkuprPlus\/issues\/new(?:[?#)\s]|$)/u],
    ['sensitive-details warning', /do not include[\s\S]*?(?:private|sensitive|security)[\s\S]*?public issue/iu],
  ]],
]);
const mcpGuideRequirements = new Map([
  ['README-MCP.md', [
    ['describe_screen Anthropic image egress', /`describe_screen`[\s\S]*?sends?[^\n]*image[^\n]*Anthropic/iu],
    ['describe_screen Anthropic key setup', /`apiKey`[\s\S]*?`ANTHROPIC_API_KEY`/u],
    ['analyze_screenshot client-return behavior', /`analyze_screenshot`[\s\S]*?returns?[^\n]*image[^\n]*(?:MCP client|client\/agent)/iu],
    ['deterministic CLI pipeline boundary', /`capture_with_voice`[\s\S]*?`analyze_video`[\s\S]*?`stop_recording`[\s\S]*?local Whisper[\s\S]*?deterministic `TranscriptAnalyzer`[\s\S]*?do not use the desktop provider selection/iu],
    ['MCP Whisper model directory', /`~\/\.markuprx\/whisper-models`/u],
    ['MCP Whisper model filenames', /`ggml-medium\.bin`[\s\S]*?`ggml-small\.bin`[\s\S]*?`ggml-base\.bin`[\s\S]*?`ggml-tiny\.bin`[\s\S]*?`ggml-large-v3\.bin`/u],
    ['MCP Whisper doctor check', /doctor/iu],
    ['GitHub token setup', /`GITHUB_TOKEN`/u],
    ['Linear token setup', /`LINEAR_API_KEY`/u],
    ['transcriptless model warning', /transcriptless/iu],
  ]],
  ['llms-install.md', [
    ['describe_screen Anthropic image egress', /`describe_screen`[\s\S]*?sends?[^\n]*image[^\n]*Anthropic/iu],
    ['describe_screen Anthropic key setup', /`apiKey`[\s\S]*?`ANTHROPIC_API_KEY`/u],
    ['analyze_screenshot client-return behavior', /`analyze_screenshot`[\s\S]*?returns?[^\n]*image[^\n]*(?:MCP client|client\/agent)/iu],
    ['deterministic CLI pipeline boundary', /`capture_with_voice`[\s\S]*?`analyze_video`[\s\S]*?`stop_recording`[\s\S]*?local Whisper[\s\S]*?deterministic `TranscriptAnalyzer`[\s\S]*?do not use the desktop provider selection/iu],
    ['MCP Whisper model directory', /`~\/\.markuprx\/whisper-models`/u],
    ['MCP Whisper model filenames', /`ggml-medium\.bin`[\s\S]*?`ggml-small\.bin`[\s\S]*?`ggml-base\.bin`[\s\S]*?`ggml-tiny\.bin`[\s\S]*?`ggml-large-v3\.bin`/u],
    ['MCP Whisper doctor check', /doctor/iu],
    ['GitHub token setup', /`GITHUB_TOKEN`/u],
    ['Linear token setup', /`LINEAR_API_KEY`/u],
    ['transcriptless model warning', /transcriptless/iu],
  ]],
]);
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

function indentation(line) {
  return line.match(/^\s*/u)?.[0].length ?? 0;
}

function isFalseCondition(line, expectedIndent) {
  return indentation(line) === expectedIndent
    && /^\s*if:\s*(?:\$\{\{\s*)?false\b/iu.test(line);
}

function actionUseIsDisabled(lines, useIndex) {
  let jobStart = -1;
  for (let index = useIndex; index >= 0; index -= 1) {
    if (/^  [a-zA-Z\d_-]+:\s*(?:#.*)?$/u.test(lines[index])) {
      jobStart = index;
      break;
    }
  }
  if (jobStart < 0) return false;

  let jobEnd = lines.length;
  for (let index = jobStart + 1; index < lines.length; index += 1) {
    if (/^  [a-zA-Z\d_-]+:\s*(?:#.*)?$/u.test(lines[index])
      || (/^\S/u.test(lines[index]) && lines[index].trim() !== '')) {
      jobEnd = index;
      break;
    }
  }
  if (lines.slice(jobStart + 1, jobEnd).some((line) => isFalseCondition(line, 4))) {
    return true;
  }

  const useIndent = indentation(lines[useIndex]);
  const inlineStep = /^\s*-\s*uses:/u.test(lines[useIndex]);
  const stepIndent = inlineStep ? useIndent : useIndent - 2;
  let stepStart = inlineStep ? useIndex : -1;
  if (!inlineStep) {
    for (let index = useIndex - 1; index > jobStart; index -= 1) {
      if (indentation(lines[index]) === stepIndent && /^\s*-\s+/u.test(lines[index])) {
        stepStart = index;
        break;
      }
    }
  }
  if (stepStart < 0) return false;
  let stepEnd = jobEnd;
  for (let index = stepStart + 1; index < jobEnd; index += 1) {
    if (indentation(lines[index]) === stepIndent && /^\s*-\s+/u.test(lines[index])) {
      stepEnd = index;
      break;
    }
  }
  return lines.slice(stepStart, stepEnd)
    .some((line) => isFalseCondition(line, stepIndent + 2));
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
    if (/\b(?:[a-z\d-]+\.)*markuprx\.(?:com|app|org)\b/iu.test(line)) {
      findings.push(`${file}:${index + 1}: stale public website`);
    }
    if (obsoleteRepositoryPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${file}:${index + 1}: stale source repository`);
    }
    if (/\bnpm\s+run\s+release\b/u.test(line)) {
      findings.push(`${file}:${index + 1}: nonexistent npm script`);
    }
    if (/\bsecure credential storage\b/iu.test(line)
      || /\b(?:with|and|otherwise)\s+(?:the\s+)?(?:existing\s+)?(?:an\s+)?encrypted(?:\s+compatibility)?\s+fallback\b/iu.test(line)) {
      findings.push(`${file}:${index + 1}: credential storage overclaim`);
    }
    if (/\bhandlers validate (?:the )?senders?\b/iu.test(line)
      || /\bhardened IPC(?:\/navigation)? boundar/iu.test(line)) {
      findings.push(`${file}:${index + 1}: IPC sender-authorization overclaim`);
    }
    if (/\beddie@efsanjuan\.com\b/iu.test(line)) {
      findings.push(`${file}:${index + 1}: stale upstream maintainer contact`);
    }
    if (/output deletion[\s\S]*?only on validated contained targets/iu.test(line)) {
      findings.push(`${file}:${index + 1}: destructive output-path containment overclaim`);
    }
    if (/Clear All Data[^\n]*?\bdeletes?\b[^\n]*?(?:keychain|credential)[^\n]*?entr(?:y|ies)/iu.test(line)
      && !/Clear All Data[^\n]*?attempt/iu.test(line)) {
      findings.push(`${file}:${index + 1}: credential-cleanup guarantee overclaim`);
    }
    if (/\bordinary settings are schema-validated\b/iu.test(line)) {
      findings.push(`${file}:${index + 1}: settings schema-validation overclaim`);
    }
    if (/\bAPI keys are not returned (?:in|by) `?getAll/iu.test(line)) {
      findings.push(`${file}:${index + 1}: settings secret-exposure overclaim`);
    }
  });
  if (file.startsWith('examples/github-action-examples/')
    && /eddiesanjuan\/markuprx-action@/u.test(content)) {
    if (!/UNPUBLISHED REFERENCE ONLY/u.test(content)) {
      findings.push(`${file}: retained Action reference must be marked unpublished`);
    }
    const lines = content.split(/\r?\n/u);
    const activeUseIndexes = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^\s*(?:-\s*)?uses:\s*eddiesanjuan\/markuprx-action@/u.test(line))
      .map(({ index }) => index);
    if (activeUseIndexes.length === 0
      || activeUseIndexes.some((index) => !actionUseIsDisabled(lines, index))) {
      findings.push(`${file}: unpublished Action example must be disabled`);
    }
  }
  return findings;
}

export function auditCredentialStorageGuidance(file, content) {
  const requirements = credentialStorageGuidance.get(file) ?? [];
  return requirements
    .filter(([, pattern]) => !pattern.test(content))
    .map(([label]) => `${file}: missing ${label}`);
}

export function auditPrivateContactGuidance(file, content) {
  const requirements = privateContactGuidance.get(file) ?? [];
  return requirements
    .filter(([, pattern]) => !pattern.test(content))
    .map(([label]) => `${file}: missing ${label}`);
}

export function auditMcpGuide(file, content) {
  const findings = [];
  if (/provider-dependent/iu.test(content)) {
    findings.push(`${file}: provider-dependent MCP processing claim`);
  }
  if (/screen-description and analysis providers may transmit/iu.test(content)
    || /selected local model service[\s\S]*?chosen cloud\/CLI provider/iu.test(content)) {
    findings.push(`${file}: generic MCP provider-selection claim`);
  }
  const requirements = mcpGuideRequirements.get(file) ?? [];
  findings.push(...requirements
    .filter(([, pattern]) => !pattern.test(content))
    .map(([label]) => `${file}: missing ${label}`));
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

function pathEscapesRoot(path) {
  const portablePath = path.replaceAll('\\', '/');
  return portablePath === '..'
    || portablePath.startsWith('../')
    || portablePath.startsWith('/')
    || isAbsolute(path);
}

export function auditRelativeLinks(
  file,
  content,
  pathExists = existsSync,
  repositoryRoot = process.cwd(),
  resolveRealPath = realpathSync,
) {
  const findings = [];
  const absoluteRepositoryRoot = resolve(repositoryRoot);
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
      const decodedPath = decoded.replaceAll('\\', '/');
      const repositoryPath = normalize(join(dirname(file), decodedPath)).replaceAll('\\', '/');
      if (decodedPath.startsWith('/') || pathEscapesRoot(repositoryPath)) {
        findings.push(`${file}:${index + 1}: relative link escapes repository "${reference}"`);
        continue;
      }

      const absoluteTarget = resolve(absoluteRepositoryRoot, repositoryPath);
      const lexicalRelativeTarget = relative(absoluteRepositoryRoot, absoluteTarget);
      if (pathEscapesRoot(lexicalRelativeTarget)) {
        findings.push(`${file}:${index + 1}: relative link escapes repository "${reference}"`);
        continue;
      }
      if (!pathExists(absoluteTarget)) {
        findings.push(`${file}:${index + 1}: broken relative link "${reference}"`);
        continue;
      }

      try {
        const resolvedRoot = resolveRealPath(absoluteRepositoryRoot);
        const resolvedTarget = resolveRealPath(absoluteTarget);
        if (pathEscapesRoot(relative(resolvedRoot, resolvedTarget))) {
          findings.push(`${file}:${index + 1}: relative link resolves outside repository "${reference}"`);
        }
      } catch {
        findings.push(`${file}:${index + 1}: unable to resolve relative link "${reference}"`);
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
    ['CI status badge', new RegExp(`<a href="${escapeRegExp(canonicalRepository)}/actions/workflows/ci\\.yml"><img src="${escapeRegExp(canonicalRepository)}/actions/workflows/ci\\.yml/badge\\.svg" alt="CI"></a>`, 'u')],
    ['MIT license badge', /<a href="LICENSE"><img src="https:\/\/img\.shields\.io\/badge\/License-MIT-yellow\.svg" alt="License: MIT"><\/a>/u],
    ['GitHub stars badge', new RegExp(`<a href="${escapeRegExp(canonicalRepository)}"><img src="https://img\\.shields\\.io/github/stars/hashfunction/MarkuprPlus\\?style=flat" alt="GitHub stars"></a>`, 'u')],
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
    findings.push(...auditCredentialStorageGuidance(file, content));
    findings.push(...auditPrivateContactGuidance(file, content));
    findings.push(...auditMcpGuide(file, content));
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
