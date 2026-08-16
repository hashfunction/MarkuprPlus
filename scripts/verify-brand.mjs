import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const previousMachineName = ['mark', 'upr'].join('');
const previousBrand = new RegExp(`${previousMachineName}(?!x)`, 'i');
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

const repositoryFiles = [...new Set(execFileSync(
  'git',
  ['ls-files', '-co', '--exclude-standard', '-z'],
  {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  },
).split('\0').filter(Boolean))];

const violations = [];
for (const file of repositoryFiles) {
  if (!allowedLegacyFiles.has(file) && previousBrand.test(file)) {
    violations.push(`${file}: filename`);
  }
  previousBrand.lastIndex = 0;
  if (allowedLegacyFiles.has(file)) continue;

  const content = readFileSync(file).toString('latin1');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    previousBrand.lastIndex = 0;
    if (previousBrand.test(line)) violations.push(`${file}:${index + 1}`);
    for (const forbiddenReference of forbiddenRepositoryReferences) {
      forbiddenReference.lastIndex = 0;
      if (forbiddenReference.test(line)) {
        violations.push(`${file}:${index + 1}: nonexistent repository reference`);
        break;
      }
    }
  });
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
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
for (const requiredPath of ['markuprx-action/action.yml', 'scripts/setup-markuprx.sh']) {
  if (!repositoryFiles.includes(requiredPath)) violations.push(`${requiredPath}: missing canonical file`);
}
for (const htmlPath of ['site/index.html', 'site/launch.html', 'site/whats-new-v2.5.0.html']) {
  if (readFileSync(htmlPath, 'utf8').includes('markup<span')) {
    violations.push(`${htmlPath}: split legacy wordmark remains`);
  }
}

if (violations.length > 0) {
  console.error('Brand or repository reference violations found:');
  violations.slice(0, 200).forEach((violation) => console.error(`- ${violation}`));
  if (violations.length > 200) console.error(`- ...and ${violations.length - 200} more`);
  process.exitCode = 1;
} else {
  console.log(`Brand audit passed across ${repositoryFiles.length} repository files.`);
}
