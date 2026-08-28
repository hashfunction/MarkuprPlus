import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const APP_STORE_URL = 'https://apps.apple.com/app/id6803780271';

function visibleText(html: string): string {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('MarkuprPlus website Store destination', () => {
  it('sends every Mac acquisition CTA to the App Store release', async () => {
    const pages = await Promise.all([
      readFile('site/index.html', 'utf8'),
      readFile('site/launch.html', 'utf8'),
      readFile('site/whats-new-v2.5.0.html', 'utf8'),
    ]);

    for (const html of pages) {
      expect(html).toContain(`href="${APP_STORE_URL}"`);
    }

    const home = pages[0];
    const macButton = home.match(/<a\b[^>]*data-platform="mac"[^>]*>/)?.[0];
    expect(macButton).toContain(`href="${APP_STORE_URL}"`);
    expect(home).toContain('data-platform="mac"');
    expect(home).not.toMatch(/data-platform="mac-(?:arm|intel)"/);
    expect(pages.slice(1).join('\n')).not.toMatch(/mailto:[^"']*desktop%20access/i);
    expect(home).toContain(`"installUrl": "${APP_STORE_URL}"`);
    expect(home).toContain('Get MarkuprPlus on the Mac App Store');
  });

  it('keeps public website copy focused on the product instead of editions', async () => {
    const [home, launch, whatsNew, privacy] = await Promise.all([
      readFile('site/index.html', 'utf8'),
      readFile('site/launch.html', 'utf8'),
      readFile('site/whats-new-v2.5.0.html', 'utf8'),
      readFile('site/privacy.html', 'utf8'),
    ]);
    const marketingText = visibleText([home, launch, whatsNew].join('\n'));
    const privacyText = visibleText(privacy);

    expect(marketingText).not.toMatch(/\bopen[ -]?source\b|\bpremium\b|free as in/i);
    expect(marketingText).not.toMatch(/unidentified-developer warning/i);
    expect(privacyText).not.toMatch(
      /paid Mac App Store edition|free direct-download edition|open source and direct downloads/i,
    );
  });
});
