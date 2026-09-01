import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

function section(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^## ${escaped}\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm'));
  return match?.[1].trim() || '';
}

async function waitForServer(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('site server did not start')), 5_000);
    child.once('error', reject);
    child.stdout?.on('data', (chunk) => {
      if (!String(chunk).includes('site serving')) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

describe('App Store public metadata', () => {
  it('serves a privacy policy and links it from the public home page', async () => {
    const port = 32_000 + (process.pid % 1_000);
    const child = spawn(process.execPath, ['site/server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await waitForServer(child);
      const [privacy, home] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/privacy`).then((response) => response.text()),
        fetch(`http://127.0.0.1:${port}/`).then((response) => response.text()),
      ]);

      expect(privacy).toContain('<title>Privacy Policy — MarkuprPlus</title>');
      expect(privacy).toMatch(/no account/i);
      expect(privacy).toMatch(/no telemetry/i);
      expect(privacy).toMatch(/stored locally/i);
      expect(privacy).toMatch(/only.*provider.*you choose/is);
      expect(home).toContain('href="/privacy"');
    } finally {
      child.kill('SIGTERM');
    }
  });

  it('keeps the English listing within limits without edition comparisons', async () => {
    const metadata = await readFile('app-store/metadata/en-US.md', 'utf8');
    const fields = {
      name: section(metadata, 'Name'),
      subtitle: section(metadata, 'Subtitle'),
      promotionalText: section(metadata, 'Promotional Text'),
      keywords: section(metadata, 'Keywords'),
      description: section(metadata, 'Description'),
    };

    expect(fields.name.length).toBeGreaterThan(0);
    expect(fields.name.length).toBeLessThanOrEqual(30);
    expect(fields.subtitle.length).toBeLessThanOrEqual(30);
    expect(fields.promotionalText.length).toBeLessThanOrEqual(170);
    expect(fields.keywords.length).toBeLessThanOrEqual(100);
    expect(fields.description.length).toBeLessThanOrEqual(4_000);
    expect(fields.description).toMatch(/AI coding agents/i);
    expect(fields.description).not.toMatch(
      /\bpaid\b|open[ -]?source|free (?:on GitHub|direct-download)|MIT-licensed|direct-download edition/i,
    );
    expect(fields.description).toMatch(/Codex CLI/);
    expect(fields.description).toMatch(/optional local companion/i);
    expect(fields.description).not.toMatch(/App Store app (?:directly )?(?:runs|executes|launches).*CLI/is);
    const releaseNotes = section(metadata, "What's New in Version 3.1.2");
    expect(releaseNotes.length).toBeGreaterThan(0);
    expect(releaseNotes.length).toBeLessThanOrEqual(4_000);
  });

  it('uses first-party support and never tells customers to strip quarantine metadata', async () => {
    const [metadata, readme] = await Promise.all([
      readFile('app-store/metadata/en-US.md', 'utf8'),
      readFile('README.md', 'utf8'),
    ]);

    expect(metadata).toContain('## Support URL\nhttps://markuprplus.com/support');
    expect(section(metadata, 'Support URL')).not.toContain(
      'github.com/hashfunction/MarkuprPlus/issues/new',
    );
    expect(readme).not.toMatch(/xattr\s+-dr\s+com\.apple\.quarantine/);
    expect(readme).toMatch(/signed, notarized, and stapled/i);
  });
});
