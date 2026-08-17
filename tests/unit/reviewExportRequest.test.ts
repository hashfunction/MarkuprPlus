import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createReviewExportDestination,
  prepareReviewExportDestination,
  sanitizeReviewExportOptions,
  trustedReviewExportSession,
} from '../../src/main/output/ReviewExportRequest';
import type { ReviewSession } from '../../src/shared/types';

function reviewSession(): ReviewSession {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_005_000,
    feedbackItems: [{
      id: 'feedback-1',
      transcription: 'The checkout action needs a clearer focus treatment.',
      timestamp: 1_700_000_001_000,
      screenshots: [{
        id: 'screenshot-1',
        timestamp: 1_700_000_001_000,
        imagePath: '../../renderer-chosen-secret.png',
        base64: 'renderer-chosen-base64',
        width: 1280,
        height: 720,
      }],
      category: 'UX Issue',
      severity: 'High',
    }],
    metadata: {
      os: 'darwin',
      sourceName: 'Checkout Review',
      sourceType: 'window',
    },
  };
}

describe('review export request security', () => {
  it('allowlists and bounds every renderer-controlled option', () => {
    expect(sanitizeReviewExportOptions({
      format: 'html',
      projectName: '  Checkout Review  ',
      includeImages: false,
      theme: 'light',
    })).toEqual({
      format: 'html',
      projectName: 'Checkout Review',
      includeImages: false,
      theme: 'light',
    });

    for (const invalid of [
      { format: 'exe', projectName: 'Review', includeImages: true, theme: 'dark' },
      { format: 'html', projectName: 'x'.repeat(121), includeImages: true, theme: 'dark' },
      { format: 'html', projectName: 'Review', includeImages: 'yes', theme: 'dark' },
      { format: 'html', projectName: 'Review', includeImages: true, theme: 'system' },
    ]) {
      expect(() => sanitizeReviewExportOptions(invalid)).toThrow(/export/i);
    }
  });

  it('rejects unfinished or empty sessions and never trusts renderer image data', () => {
    const unfinished = reviewSession();
    delete unfinished.endTime;
    expect(() => trustedReviewExportSession(unfinished, null)).toThrow(/completed/i);

    const empty = reviewSession();
    empty.feedbackItems = [];
    expect(() => trustedReviewExportSession(empty, null)).toThrow(/feedback/i);

    const unhydrated = trustedReviewExportSession(reviewSession(), null);
    expect(unhydrated.feedbackItems[0].screenshots[0]).toMatchObject({
      id: 'screenshot-1',
      imagePath: '',
    });
    expect(unhydrated.feedbackItems[0].screenshots[0].base64).toBeUndefined();

    const mainOwned = reviewSession();
    mainOwned.feedbackItems[0].screenshots[0].imagePath = '/main-owned/screenshot.png';
    mainOwned.feedbackItems[0].screenshots[0].base64 = 'main-owned-base64';
    const hydrated = trustedReviewExportSession(reviewSession(), mainOwned);
    expect(hydrated.feedbackItems[0].screenshots[0]).toMatchObject({
      imagePath: '/main-owned/screenshot.png',
      base64: 'main-owned-base64',
    });
  });

  it('creates collision-safe destinations strictly beneath the configured output root', () => {
    const outputRoot = '/tmp/markuprx-output';
    const first = createReviewExportDestination(
      outputRoot,
      reviewSession(),
      { format: 'html', projectName: '../../Checkout / Review', includeImages: true, theme: 'dark' },
      'nonce-one',
    );
    const second = createReviewExportDestination(
      outputRoot,
      reviewSession(),
      { format: 'html', projectName: '../../Checkout / Review', includeImages: true, theme: 'dark' },
      'nonce-two',
    );

    expect(first).not.toBe(second);
    expect(resolve(first).startsWith(`${resolve(outputRoot)}/exports/`)).toBe(true);
    expect(first).toMatch(/checkout-review-feedback-\d{8}-\d{4}-nonce-one\.html$/);
    expect(first).not.toContain('..');
  });

  it('fails closed when the exports directory is a symlink outside the output root', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
    const outputRoot = join(fixtureRoot, 'output');
    const outsideRoot = join(fixtureRoot, 'outside');
    try {
      await mkdir(outputRoot);
      await mkdir(outsideRoot);
      await symlink(outsideRoot, join(outputRoot, 'exports'), 'dir');

      await expect(prepareReviewExportDestination(
        outputRoot,
        reviewSession(),
        { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
        'outside-symlink',
      )).rejects.toThrow(/export directory|output root/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when the exports path is not a directory', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
    const outputRoot = join(fixtureRoot, 'output');
    try {
      await mkdir(outputRoot);
      await writeFile(join(outputRoot, 'exports'), 'not a directory');

      await expect(prepareReviewExportDestination(
        outputRoot,
        reviewSession(),
        { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
        'not-a-directory',
      )).rejects.toThrow(/export directory|directory/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
