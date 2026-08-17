import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const previousMachineName = ['mark', 'upr'].join('');
const previousBrand = new RegExp(`${previousMachineName}(?!x|plus)`, 'i');
const forbiddenRepositoryReferences = [
  /(?:https?:\/\/)?github\.com\/eddiesanjuan\/markuprx(?:[/?#]|$)/i,
  /api\.github\.com\/repos\/eddiesanjuan\/markuprx(?:[/?#]|$)/i,
  /raw\.githubusercontent\.com\/eddiesanjuan\/markuprx(?:[/?#]|$)/i,
  /\bio\.github\.eddiesanjuan\/markuprx\b/i,
  /\beddiesanjuan\/markuprx(?!-action)\b/i,
];
const allowedLegacyFiles = new Set([
  'src/main/migration/LegacyBrandMigration.ts',
  'tests/unit/legacyBrandMigration.test.ts',
]);
const requiredPaths = ['markuprx-action/action.yml', 'scripts/setup-markuprx.sh'];
const siteHtmlPaths = ['site/index.html', 'site/launch.html', 'site/whats-new-v2.5.0.html'];

const isDecisionRecord = (file) => file.startsWith('docs/superpowers/');

function readText(readFile, file, encoding = 'latin1') {
  const content = readFile(file);
  return Buffer.isBuffer(content) ? content.toString(encoding) : String(content);
}

/**
 * Apply the repository's public-brand and compatibility policy to a controlled
 * set of files. The caller owns filesystem access so this policy is testable
 * without scanning the working tree.
 */
export function findBrandViolations(files, readFile, packageJson) {
  const repositoryFiles = [...new Set(files)];
  const repositoryFileSet = new Set(repositoryFiles);
  const violations = [];

  for (const file of repositoryFiles) {
    if (isDecisionRecord(file)) continue;

    if (!allowedLegacyFiles.has(file) && previousBrand.test(file)) {
      violations.push(`${file}: filename`);
    }
    if (allowedLegacyFiles.has(file)) continue;

    const content = readText(readFile, file);
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (previousBrand.test(line)) violations.push(`${file}:${index + 1}`);
      for (const forbiddenReference of forbiddenRepositoryReferences) {
        if (forbiddenReference.test(line)) {
          violations.push(`${file}:${index + 1}: nonexistent repository reference`);
          break;
        }
      }
    });
  }

  const expectedPackageFields = {
    name: 'markuprx',
    productName: 'MarkuprX',
    version: '3.0.0',
    mcpName: 'com.markuprx/markuprx',
  };
  for (const [field, expected] of Object.entries(expectedPackageFields)) {
    if (packageJson[field] !== expected) {
      violations.push(`package.json: expected ${field}=${JSON.stringify(expected)}`);
    }
  }
  if ('repository' in packageJson || 'bugs' in packageJson) {
    violations.push('package.json: nonexistent repository metadata must not be published');
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    if (typeof command === 'string' && /electron-builder\b.*--publish\b/.test(command)) {
      violations.push(`package.json: script ${name} must not publish to an unconfigured update provider`);
    }
  }
  if (packageJson.bin?.markuprx !== './dist/cli/index.mjs'
    || packageJson.bin?.['markuprx-mcp'] !== './dist/mcp/index.mjs'
    || Object.keys(packageJson.bin || {}).length !== 2) {
    violations.push('package.json: public binaries must be exactly markuprx and markuprx-mcp');
  }
  for (const requiredPath of requiredPaths) {
    if (!repositoryFileSet.has(requiredPath)) violations.push(`${requiredPath}: missing canonical file`);
  }
  for (const htmlPath of siteHtmlPaths) {
    if (!repositoryFileSet.has(htmlPath)) {
      violations.push(`${htmlPath}: missing canonical file`);
      continue;
    }
    if (readText(readFile, htmlPath, 'utf8').includes('markup<span')) {
      violations.push(`${htmlPath}: split legacy wordmark remains`);
    }
  }

  return violations;
}

function listRepositoryFiles() {
  return [...new Set(execFileSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', '-z'],
    {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  ).split('\0').filter(Boolean))];
}

function runBrandAudit() {
  const repositoryFiles = listRepositoryFiles();
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const violations = findBrandViolations(repositoryFiles, readFileSync, packageJson);

  if (violations.length > 0) {
    console.error('Brand or repository reference violations found:');
    violations.slice(0, 200).forEach((violation) => console.error(`- ${violation}`));
    if (violations.length > 200) console.error(`- ...and ${violations.length - 200} more`);
    process.exitCode = 1;
  } else {
    console.log(`Brand audit passed across ${repositoryFiles.length} repository files.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBrandAudit();
}
