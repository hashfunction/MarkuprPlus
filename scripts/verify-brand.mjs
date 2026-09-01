import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const previousMachineName = ['mark', 'upr'].join('');
const previousBrand = new RegExp(`${previousMachineName}(?!x|plus)`, 'i');
const legacyDisplayName = ['Mark', 'uprX'].join('');
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
const activePackagingFiles = new Set([
  'package.json',
  'electron-builder.yml',
  'assets/svg-source/dmg-background.svg',
  'assets/DMG_BACKGROUND_INSTRUCTIONS.md',
  'build/DMG_BACKGROUND_SPEC.md',
  'scripts/generate-icons.mjs',
  'scripts/generate-installer-images.cjs',
  'scripts/generate-og-image.mjs',
  'scripts/notarize.cjs',
  'scripts/notarize-dmg.mjs',
  'scripts/verify-signing.mjs',
  'scripts/lib/startup-probe.mjs',
  'scripts/smoke-packaged-app.mjs',
  'scripts/verify-brand.mjs',
  'scripts/verify-package.mjs',
]);

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
      if (activePackagingFiles.has(file) && line.includes(legacyDisplayName)) {
        violations.push(`${file}:${index + 1}: legacy packaging display name`);
      }
      if (file === 'electron-builder.yml' && /^\s*publisherName\s*:/.test(line)) {
        violations.push(
          `${file}:${index + 1}: publisherName must derive from the signing certificate`,
        );
      }
      for (const forbiddenReference of forbiddenRepositoryReferences) {
        if (forbiddenReference.test(line)) {
          violations.push(`${file}:${index + 1}: nonexistent repository reference`);
          break;
        }
      }
    });
  }

  const expectedPackageFields = {
    name: 'markuprplus',
    productName: 'MarkuprPlus',
    version: '3.1.2',
    homepage: 'https://markuprplus.com',
    repository: {
      type: 'git',
      url: 'git+https://github.com/hashfunction/MarkuprPlus.git',
    },
    bugs: {
      url: 'https://github.com/hashfunction/MarkuprPlus/issues',
    },
    mcpName: 'com.markuprplus/markuprplus',
  };
  for (const [field, expected] of Object.entries(expectedPackageFields)) {
    if (JSON.stringify(packageJson[field]) !== JSON.stringify(expected)) {
      violations.push(`package.json: expected ${field}=${JSON.stringify(expected)}`);
    }
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    if (typeof command === 'string' && /electron-builder\b.*--publish\b/.test(command)) {
      violations.push(`package.json: script ${name} must not publish to an unconfigured update provider`);
    }
  }
  if (packageJson.bin?.markuprplus !== 'dist/cli/index.mjs'
    || packageJson.bin?.['markuprplus-mcp'] !== 'dist/mcp/index.mjs'
    || Object.keys(packageJson.bin || {}).length !== 2) {
    violations.push('package.json: public binaries must be exactly markuprplus and markuprplus-mcp');
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

export function listRepositoryFiles(runGit = () => execFileSync(
  'git',
  ['ls-files', '-co', '--exclude-standard', '-z'],
  {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  },
)) {
  return [...new Set(runGit().split('\0').filter(Boolean))];
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
