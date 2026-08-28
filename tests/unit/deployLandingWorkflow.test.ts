import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('landing page deployment workflow', () => {
  it('deploys the current MarkuprPlus site without regenerating legacy-brand metadata', () => {
    const workflow = readFileSync('.github/workflows/deploy-landing.yml', 'utf8');
    const sitemap = readFileSync('site/sitemap.xml', 'utf8');

    expect(workflow).toContain('actions/configure-pages@v5');
    expect(workflow).toContain('actions/upload-pages-artifact@v4');
    expect(workflow).toContain('actions/deploy-pages@v4');
    expect(workflow).toContain('cp -r site/* _site/');
    expect(workflow).not.toContain('markuprx.com');
    expect(sitemap).toContain('https://markuprplus.com/');
  });
});
