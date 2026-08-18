import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const publicSurfaces = [
  'src/main/trayContextMenu.ts',
  'src/main/output/MarkdownGenerator.ts',
  'src/main/output/templates/html-template.ts',
  'src/main/output/templates/markdown.ts',
  'src/main/ai/StructuredMarkdownBuilder.ts',
  'src/renderer/App.tsx',
  'src/renderer/components/SettingsPanel.tsx',
  'site/index.html',
  'docs/landing/index.html',
];

describe('public product funding copy', () => {
  it('does not route users to personal tips, coffee, or Ko-fi', () => {
    for (const file of publicSurfaces) {
      const content = readFileSync(join(root, file), 'utf8');
      expect(content, file).not.toMatch(/ko-fi|coffee|donat(?:e|ion)|buy\s+(?:me|developer|eddie)/iu);
    }
  });
});
