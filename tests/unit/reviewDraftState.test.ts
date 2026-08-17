import { describe, expect, it } from 'vitest';
import type { ReviewSession } from '../../src/shared/types';
import {
  createReviewDraft,
  hasSameReviewSessionKey,
  isReviewDraftDirty,
  reconcileSavedReviewSession,
  reviewDraftReducer,
} from '../../src/renderer/reviewDraftState';

function session(id: string, startTime = 1_000): ReviewSession {
  return {
    id,
    startTime,
    feedbackItems: [
      { id: 'item-a', transcription: 'Alpha', timestamp: 1, screenshots: [] },
      { id: 'item-b', transcription: 'Bravo', timestamp: 2, screenshots: [] },
      { id: 'item-c', transcription: 'Charlie', timestamp: 3, screenshots: [] },
    ],
  };
}

describe('review draft state', () => {
  it('distinguishes a new session generation even when the identifier is reused', () => {
    expect(hasSameReviewSessionKey(session('session-a'), session('session-a'))).toBe(true);
    expect(hasSameReviewSessionKey(session('session-a'), session('session-a', 2_000))).toBe(false);
    expect(hasSameReviewSessionKey(session('session-a'), session('session-b'))).toBe(false);
  });

  it('publishes a save result only to the session generation that started it', () => {
    const current = session('session-a', 2_000);
    const staleSave = session('session-a', 1_000);
    const matchingSave = {
      ...current,
      feedbackItems: [{ ...current.feedbackItems[0], transcription: 'Saved edit' }],
    };

    expect(reconcileSavedReviewSession(current, staleSave)).toBe(current);
    expect(reconcileSavedReviewSession(null, staleSave)).toBeNull();
    expect(reconcileSavedReviewSession(current, matchingSave)).toBe(matchingSave);
  });

  it('keeps newer committed and inline edits when stale props repeat the same session key', () => {
    let draft = createReviewDraft(session('session-a'));
    draft = reviewDraftReducer(draft, {
      type: 'update-item',
      itemId: 'item-a',
      changes: { transcription: 'Committed draft' },
    });
    draft = reviewDraftReducer(draft, { type: 'start-edit', itemId: 'item-b' });
    draft = reviewDraftReducer(draft, { type: 'update-edit', text: 'Inline draft' });

    const repeated = reviewDraftReducer(draft, {
      type: 'sync-session',
      session: session('session-a'),
    });

    expect(repeated.session.feedbackItems[0].transcription).toBe('Committed draft');
    expect(repeated.editing).toEqual({
      itemId: 'item-b',
      originalText: 'Bravo',
      text: 'Inline draft',
    });
    expect(repeated.revision).toBe(1);

    const replacement = reviewDraftReducer(repeated, {
      type: 'sync-session',
      session: session('session-b', 2_000),
    });
    expect(replacement.session.id).toBe('session-b');
    expect(replacement.session.feedbackItems[0].transcription).toBe('Alpha');
    expect(replacement.editing).toBeNull();
    expect(replacement.revision).toBe(0);
  });

  it('commits the current inline edit before editing a different item', () => {
    let draft = createReviewDraft(session('session-a'));
    draft = reviewDraftReducer(draft, { type: 'start-edit', itemId: 'item-a' });
    draft = reviewDraftReducer(draft, { type: 'update-edit', text: 'Updated Alpha' });

    draft = reviewDraftReducer(draft, { type: 'start-edit', itemId: 'item-b' });

    expect(draft.session.feedbackItems[0].transcription).toBe('Updated Alpha');
    expect(draft.editing).toEqual({
      itemId: 'item-b',
      originalText: 'Bravo',
      text: 'Bravo',
    });
    expect(draft.revision).toBe(1);
  });

  it('retains all committed review mutations for the same key and resets on a new start time', () => {
    let draft = createReviewDraft(session('session-a'));
    draft = reviewDraftReducer(draft, {
      type: 'update-item',
      itemId: 'item-a',
      changes: { category: 'Bug', severity: 'High' },
    });
    draft = reviewDraftReducer(draft, {
      type: 'move-item',
      itemId: 'item-c',
      toIndex: 0,
    });
    draft = reviewDraftReducer(draft, {
      type: 'delete-item',
      itemId: 'item-b',
      expiresAt: 10_000,
    });

    const repeated = reviewDraftReducer(draft, {
      type: 'sync-session',
      session: session('session-a'),
    });
    expect(repeated.session.feedbackItems.map((item) => item.id)).toEqual(['item-c', 'item-a']);
    expect(repeated.session.feedbackItems[1]).toMatchObject({ category: 'Bug', severity: 'High' });
    expect(repeated.deletedItems.map((deleted) => deleted.item.id)).toEqual(['item-b']);
    expect(isReviewDraftDirty(repeated)).toBe(true);

    const oldSessionKey = repeated.sessionKey;
    const replacement = reviewDraftReducer(repeated, {
      type: 'sync-session',
      session: session('session-a', 2_000),
    });
    const afterStaleSave = reviewDraftReducer(replacement, {
      type: 'save-succeeded',
      sessionKey: oldSessionKey,
      revision: repeated.revision,
    });
    expect(afterStaleSave.session.startTime).toBe(2_000);
    expect(afterStaleSave.session.feedbackItems.map((item) => item.id)).toEqual([
      'item-a',
      'item-b',
      'item-c',
    ]);
    expect(afterStaleSave.deletedItems).toEqual([]);
    expect(afterStaleSave.revision).toBe(0);
    expect(afterStaleSave.savedRevision).toBe(0);
  });

  it('does not clear a newer edit when an older save snapshot resolves', () => {
    let draft = createReviewDraft(session('session-a'));
    draft = reviewDraftReducer(draft, {
      type: 'update-item',
      itemId: 'item-a',
      changes: { transcription: 'Snapshot A' },
    });
    const snapshotARevision = draft.revision;
    draft = reviewDraftReducer(draft, {
      type: 'save-started',
      sessionKey: draft.sessionKey,
      revision: snapshotARevision,
    });
    draft = reviewDraftReducer(draft, {
      type: 'update-item',
      itemId: 'item-a',
      changes: { transcription: 'Snapshot B' },
    });
    draft = reviewDraftReducer(draft, {
      type: 'save-succeeded',
      sessionKey: draft.sessionKey,
      revision: snapshotARevision,
    });

    expect(draft.session.feedbackItems[0].transcription).toBe('Snapshot B');
    expect(draft.savedRevision).toBe(snapshotARevision);
    expect(isReviewDraftDirty(draft)).toBe(true);

    draft = reviewDraftReducer(draft, {
      type: 'save-started',
      sessionKey: draft.sessionKey,
      revision: draft.revision,
    });
    draft = reviewDraftReducer(draft, {
      type: 'save-succeeded',
      sessionKey: draft.sessionKey,
      revision: draft.revision,
    });
    expect(isReviewDraftDirty(draft)).toBe(false);
  });

  it('marks an item restored after a saved delete as dirty and preserves its identity', () => {
    let draft = createReviewDraft(session('session-a'));
    draft = reviewDraftReducer(draft, {
      type: 'delete-item',
      itemId: 'item-b',
      expiresAt: 10_000,
    });
    draft = reviewDraftReducer(draft, {
      type: 'save-succeeded',
      sessionKey: draft.sessionKey,
      revision: draft.revision,
    });
    expect(isReviewDraftDirty(draft)).toBe(false);

    draft = reviewDraftReducer(draft, { type: 'undo-delete', itemId: 'item-b' });

    expect(draft.session.feedbackItems.map((item) => item.id)).toEqual([
      'item-a',
      'item-b',
      'item-c',
    ]);
    expect(isReviewDraftDirty(draft)).toBe(true);
  });

  it('moves the selected item by stable identity and marks the draft dirty', () => {
    let draft = createReviewDraft(session('session-a'));
    draft = reviewDraftReducer(draft, { type: 'select-item', itemId: 'item-a' });
    draft = reviewDraftReducer(draft, {
      type: 'move-item',
      itemId: 'item-a',
      toIndex: 1,
    });

    expect(draft.session.feedbackItems.map((item) => item.id)).toEqual([
      'item-b',
      'item-a',
      'item-c',
    ]);
    expect(draft.selectedItemId).toBe('item-a');
    expect(isReviewDraftDirty(draft)).toBe(true);
  });
});
