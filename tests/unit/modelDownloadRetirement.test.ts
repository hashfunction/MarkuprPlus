import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');

describe('retired ModelDownload dialog', () => {
  it('has no renderer export or dormant component file', async () => {
    const componentIndex = await readFile(
      resolve(repositoryRoot, 'src/renderer/components/index.ts'),
      'utf8',
    );
    const contributorGuide = await readFile(resolve(repositoryRoot, 'CLAUDE.md'), 'utf8');
    expect(componentIndex).not.toContain('ModelDownloadDialog');
    expect(contributorGuide).not.toContain('ModelDownloadDialog');
    await expect(access(resolve(
      repositoryRoot,
      'src/renderer/components/ModelDownloadDialog.tsx',
    ))).rejects.toThrow();
  });
});
