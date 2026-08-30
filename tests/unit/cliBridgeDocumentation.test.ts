import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const lifecycleCommands = [
  'markuprx bridge install',
  'markuprx bridge start',
  'markuprx bridge status',
  'markuprx bridge token',
  'markuprx bridge rotate-token',
  'markuprx bridge uninstall',
];

describe('CLI Bridge release documentation', () => {
  it('sets version 3.1.0 and Mac App Store build 3', async () => {
    const [packageJson, lockJson, masConfig] = await Promise.all([
      readFile('package.json', 'utf8').then(JSON.parse),
      readFile('package-lock.json', 'utf8').then(JSON.parse),
      readFile('electron-builder.mas.yml', 'utf8'),
    ]);

    expect(packageJson.version).toBe('3.1.0');
    expect(lockJson.version).toBe('3.1.0');
    expect(lockJson.packages[''].version).toBe('3.1.0');
    expect(masConfig).toMatch(/^buildVersion: "3"$/m);
  });

  it('documents the complete optional companion lifecycle and fixed loopback endpoint', async () => {
    const readme = await readFile('README.md', 'utf8');
    expect(readme).toMatch(/optional.*companion/is);
    expect(readme).toContain('npm install -g markuprx@latest');
    for (const command of lifecycleCommands) expect(readme).toContain(command);
    expect(readme).toContain('127.0.0.1:49647');
    expect(readme).toMatch(/App Store app does not (?:run|execute|launch) shell commands/i);
  });

  it('discloses bridge data flow in Store copy, privacy copy, and review notes', async () => {
    const [metadata, reviewNotes, privacyAnswers, privacyPage, changelog] = await Promise.all([
      readFile('app-store/metadata/en-US.md', 'utf8'),
      readFile('app-store/review-notes.md', 'utf8'),
      readFile('app-store/privacy-answers.md', 'utf8'),
      readFile('site/privacy.html', 'utf8'),
      readFile('CHANGELOG.md', 'utf8'),
    ]);

    for (const content of [metadata, reviewNotes, privacyAnswers, privacyPage]) {
      expect(content).toMatch(/companion/i);
      expect(content).toMatch(/(?:localhost|loopback|127\.0\.0\.1)/i);
    }
    expect(metadata).toContain("## What's New in Version 3.1.0");
    expect(reviewNotes).toContain('# App Review Notes — MarkuprPlus 3.1.0');
    expect(reviewNotes.indexOf('Local Rules')).toBeLessThan(reviewNotes.indexOf('Optional CLI Bridge'));
    expect(reviewNotes).toMatch(/does not execute external.*inside.*sandbox/is);
    expect(privacyPage).toMatch(/transcript.*selected screenshots.*companion/is);
    expect(changelog).toMatch(/^## 3\.1\.0 - 2026-08-30$/m);
  });
});
