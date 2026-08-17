import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

describe('CLI public branding', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('keeps the markuprx command while presenting MarkuprPlus help', async () => {
    const cacheDirectory = join(process.cwd(), 'node_modules', '.cache');
    await mkdir(cacheDirectory, { recursive: true });
    const outputDirectory = await mkdtemp(join(cacheDirectory, 'markuprplus-cli-help-'));
    temporaryDirectories.push(outputDirectory);
    const outputPath = join(outputDirectory, 'index.mjs');

    await build({
      entryPoints: [join(process.cwd(), 'src', 'cli', 'index.ts')],
      outfile: outputPath,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      packages: 'external',
      define: { __MARKUPRX_VERSION__: JSON.stringify('3.0.0-test') },
    });

    const { stdout } = await execFileAsync(process.execPath, [outputPath, '--help'], {
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Usage: markuprx');
    expect(stdout).toContain('MarkuprPlus');
    expect(stdout).toContain('.markuprx.json');
    expect(stdout).not.toContain('MarkuprX');
  });
});
