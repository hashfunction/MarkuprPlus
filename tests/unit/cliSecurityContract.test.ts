import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('CLI security and capability contract', () => {
  it('does not accept or propagate a dead API-key command-line option', async () => {
    const files = await Promise.all([
      'src/cli/index.ts',
      'src/cli/CLIPipeline.ts',
      'src/cli/WatchMode.ts',
    ].map((file) => readFile(join(root, file), 'utf8')));
    const source = files.join('\n');

    expect(source).not.toContain('--openai-key');
    expect(source).not.toContain('openaiKey');
  });
});
