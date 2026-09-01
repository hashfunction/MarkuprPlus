import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type BrandVerifier = {
  findBrandViolations?: (
    files: string[],
    readFile: (file: string) => string,
    packageJson: Record<string, unknown>,
  ) => string[];
  listRepositoryFiles?: (runGit: () => string) => string[];
};

const compatiblePackageJson = {
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
  bin: {
    markuprplus: 'dist/cli/index.mjs',
    'markuprplus-mcp': 'dist/mcp/index.mjs',
  },
  scripts: {},
};

const requiredFiles = {
  'markuprx-action/action.yml': 'name: MarkuprX action',
  'scripts/setup-markuprx.sh': '#!/bin/sh',
  'site/index.html': '<html></html>',
  'site/launch.html': '<html></html>',
  'site/whats-new-v2.5.0.html': '<html></html>',
};

async function scan(
  files: Record<string, string>,
  omittedFiles: string[] = [],
): Promise<string[]> {
  const verifier = await import('../../scripts/verify-brand.mjs') as BrandVerifier;

  expect(
    verifier.findBrandViolations,
    'the brand policy must be importable without invoking the CLI',
  ).toBeTypeOf('function');

  const repositoryFiles: Record<string, string> = { ...requiredFiles, ...files };
  for (const omittedFile of omittedFiles) delete repositoryFiles[omittedFile];

  return verifier.findBrandViolations!(
    Object.keys(repositoryFiles),
    (file) => repositoryFiles[file],
    compatiblePackageJson,
  );
}

describe('repository brand audit', () => {
  it('accepts the MarkuprPlus public product name', async () => {
    await expect(scan({ 'README.md': 'MarkuprPlus' })).resolves.toEqual([]);
  });

  it('rejects stale public packaging metadata and accepts canonical destinations', async () => {
    const verifier = await import('../../scripts/verify-brand.mjs') as BrandVerifier;
    const files = Object.keys(requiredFiles);
    const readFile = (file: string) => requiredFiles[file as keyof typeof requiredFiles];
    const legacyRepository = [
      'https://github.com',
      'eddiesanjuan',
      'markuprx',
    ].join('/');

    expect(verifier.findBrandViolations!(files, readFile, {
      ...compatiblePackageJson,
      productName: 'MarkuprX',
      homepage: 'https://markuprx.com',
      repository: {
        type: 'git',
        url: `git+${legacyRepository}.git`,
      },
      bugs: { url: `${legacyRepository}/issues` },
    })).toEqual(expect.arrayContaining([
      'package.json: expected productName="MarkuprPlus"',
      'package.json: expected homepage="https://markuprplus.com"',
      'package.json: expected repository={"type":"git","url":"git+https://github.com/hashfunction/MarkuprPlus.git"}',
      'package.json: expected bugs={"url":"https://github.com/hashfunction/MarkuprPlus/issues"}',
    ]));

    expect(verifier.findBrandViolations!(
      files,
      readFile,
      compatiblePackageJson,
    )).toEqual([]);
  });

  it('rejects the legacy display brand in active packaging surfaces', async () => {
    const legacyDisplayName = ['Mark', 'uprX'].join('');

    expect(await scan({
      'electron-builder.yml': `productName: ${legacyDisplayName}`,
    })).toContain('electron-builder.yml:1: legacy packaging display name');
  });

  it.each(['MarkuprX', 'MarkuprPlus'])(
    'rejects a hardcoded %s Windows publisher instead of guessing the certificate subject',
    async (publisherName) => {
      expect(await scan({
        'electron-builder.yml': `publisherName: "${publisherName}"`,
      })).toContain(
        'electron-builder.yml:1: publisherName must derive from the signing certificate',
      );
    },
  );

  it('rejects the legacy public wordmark in active public documentation', async () => {
    const legacyWordmark = ['mark', 'upr'].join('');

    expect(await scan({
      'README.md': `The old public ${legacyWordmark} wordmark without a hyphen`,
    })).toContain('README.md:1');
  });

  it('ignores approved historical decision records', async () => {
    const legacyWordmark = ['mark', 'upr'].join('');

    await expect(scan({
      'docs/superpowers/specs/history.md': legacyWordmark,
    })).resolves.toEqual([]);
  });

  it('rejects the legacy public wordmark in application source', async () => {
    const legacyWordmark = ['mark', 'upr'].join('');

    expect(await scan({ 'src/main/index.ts': legacyWordmark }))
      .toContain('src/main/index.ts:1');
  });

  it('fails closed when canonical site pages are missing', async () => {
    const violations = await scan({}, [
      'site/index.html',
      'site/launch.html',
      'site/whats-new-v2.5.0.html',
    ]);

    expect(violations).toEqual([
      'site/index.html: missing canonical file',
      'site/launch.html: missing canonical file',
      'site/whats-new-v2.5.0.html: missing canonical file',
    ]);
  });

  it('keeps missing tracked files in the audit input so reads fail closed', async () => {
    const verifier = await import('../../scripts/verify-brand.mjs') as BrandVerifier;
    expect(verifier.listRepositoryFiles).toBeTypeOf('function');

    const tracked = verifier.listRepositoryFiles!(() =>
      ['README.md', 'missing-tracked-file.md', ''].join('\0'));
    expect(tracked).toEqual(['README.md', 'missing-tracked-file.md']);
    expect(() => verifier.findBrandViolations!(
      tracked,
      (file) => {
        if (file === 'missing-tracked-file.md') throw new Error('ENOENT: tracked file is missing');
        return 'MarkuprPlus';
      },
      compatiblePackageJson,
    )).toThrow(/ENOENT.*tracked file is missing/i);

    const afterCommittedDeletion = verifier.listRepositoryFiles!(() => 'README.md\0');
    expect(afterCommittedDeletion).toEqual(['README.md']);
  });

  it('can be imported without executing the command-line audit', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./scripts/verify-brand.mjs')",
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stdout: '',
      stderr: '',
    });
  });

  it('enforces canonical product and machine identities across repository files', () => {
    const output = execFileSync(process.execPath, ['scripts/verify-brand.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(output).toMatch(/Brand audit passed across \d+ repository files\./);
  });
});
