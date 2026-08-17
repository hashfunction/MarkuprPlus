import type { ReviewFeedbackItem, ReviewSession } from '../shared/types';

export interface ReviewDraftEdit {
  itemId: string;
  originalText: string;
  text: string;
}

export interface ReviewDraftDeletedItem {
  item: ReviewFeedbackItem;
  index: number;
  expiresAt: number;
}

export interface ReviewDraftState {
  sessionKey: string;
  session: ReviewSession;
  revision: number;
  savedRevision: number;
  selectedItemId: string | null;
  editing: ReviewDraftEdit | null;
  deletedItems: ReviewDraftDeletedItem[];
  savingRevision: number | null;
  saveError: string | null;
}

export type ReviewDraftAction =
  | { type: 'sync-session'; session: ReviewSession }
  | { type: 'select-item'; itemId: string | null }
  | { type: 'start-edit'; itemId: string }
  | { type: 'update-edit'; text: string }
  | { type: 'commit-edit' }
  | { type: 'cancel-edit' }
  | {
      type: 'update-item';
      itemId: string;
      changes: Partial<Pick<ReviewFeedbackItem, 'transcription' | 'category' | 'severity'>>;
    }
  | { type: 'move-item'; itemId: string; toIndex: number }
  | { type: 'delete-item'; itemId: string; expiresAt: number }
  | { type: 'undo-delete'; itemId: string }
  | { type: 'expire-delete'; itemId: string }
  | { type: 'save-started'; sessionKey: string; revision: number }
  | { type: 'save-succeeded'; sessionKey: string; revision: number }
  | { type: 'save-failed'; sessionKey: string; revision: number; message: string };

function sessionKey(session: ReviewSession): string {
  return `${session.id}:${session.startTime}`;
}

export function hasSameReviewSessionKey(
  first: ReviewSession,
  second: ReviewSession,
): boolean {
  return sessionKey(first) === sessionKey(second);
}

export function reconcileSavedReviewSession(
  current: ReviewSession | null,
  saved: ReviewSession,
): ReviewSession | null {
  return current && hasSameReviewSessionKey(current, saved) ? saved : current;
}

function withItems(
  draft: ReviewDraftState,
  feedbackItems: ReviewFeedbackItem[],
): ReviewDraftState {
  return {
    ...draft,
    session: { ...draft.session, feedbackItems },
    revision: draft.revision + 1,
    saveError: null,
  };
}

export function createReviewDraft(session: ReviewSession): ReviewDraftState {
  return {
    sessionKey: sessionKey(session),
    session,
    revision: 0,
    savedRevision: 0,
    selectedItemId: null,
    editing: null,
    deletedItems: [],
    savingRevision: null,
    saveError: null,
  };
}

export function isReviewDraftDirty(draft: ReviewDraftState): boolean {
  return draft.revision !== draft.savedRevision;
}

export function reviewDraftReducer(
  draft: ReviewDraftState,
  action: ReviewDraftAction,
): ReviewDraftState {
  switch (action.type) {
    case 'sync-session':
      return draft.sessionKey === sessionKey(action.session)
        ? draft
        : createReviewDraft(action.session);

    case 'select-item':
      if (
        action.itemId !== null &&
        !draft.session.feedbackItems.some((item) => item.id === action.itemId)
      ) {
        return draft;
      }
      return action.itemId === draft.selectedItemId
        ? draft
        : { ...draft, selectedItemId: action.itemId };

    case 'start-edit': {
      const target = draft.session.feedbackItems.find((candidate) => candidate.id === action.itemId);
      if (!target || draft.editing?.itemId === action.itemId) return draft;
      const prepared = draft.editing
        ? reviewDraftReducer(draft, { type: 'commit-edit' })
        : draft;
      const item = prepared.session.feedbackItems.find(
        (candidate) => candidate.id === action.itemId,
      );
      if (!item) return prepared;
      return {
        ...prepared,
        selectedItemId: item.id,
        editing: {
          itemId: item.id,
          originalText: item.transcription,
          text: item.transcription,
        },
      };
    }

    case 'update-edit':
      return draft.editing
        ? { ...draft, editing: { ...draft.editing, text: action.text } }
        : draft;

    case 'commit-edit': {
      if (!draft.editing) return draft;
      const { itemId, text } = draft.editing;
      const item = draft.session.feedbackItems.find((candidate) => candidate.id === itemId);
      if (!item || item.transcription === text) {
        return { ...draft, editing: null };
      }
      const updated = withItems(
        draft,
        draft.session.feedbackItems.map((candidate) => (
          candidate.id === itemId ? { ...candidate, transcription: text } : candidate
        )),
      );
      return { ...updated, editing: null };
    }

    case 'cancel-edit':
      return draft.editing ? { ...draft, editing: null } : draft;

    case 'update-item': {
      const index = draft.session.feedbackItems.findIndex((item) => item.id === action.itemId);
      if (index < 0) return draft;
      const current = draft.session.feedbackItems[index];
      const next = { ...current, ...action.changes };
      if (
        current.transcription === next.transcription &&
        current.category === next.category &&
        current.severity === next.severity
      ) {
        return draft;
      }
      const feedbackItems = [...draft.session.feedbackItems];
      feedbackItems[index] = next;
      return withItems(draft, feedbackItems);
    }

    case 'move-item': {
      const fromIndex = draft.session.feedbackItems.findIndex((item) => item.id === action.itemId);
      if (
        fromIndex < 0 ||
        action.toIndex < 0 ||
        action.toIndex >= draft.session.feedbackItems.length ||
        fromIndex === action.toIndex
      ) {
        return draft;
      }
      const feedbackItems = [...draft.session.feedbackItems];
      const [moved] = feedbackItems.splice(fromIndex, 1);
      feedbackItems.splice(action.toIndex, 0, moved);
      return withItems(draft, feedbackItems);
    }

    case 'delete-item': {
      const index = draft.session.feedbackItems.findIndex((item) => item.id === action.itemId);
      if (index < 0) return draft;
      const item = draft.session.feedbackItems[index];
      const updated = withItems(
        draft,
        draft.session.feedbackItems.filter((candidate) => candidate.id !== action.itemId),
      );
      return {
        ...updated,
        selectedItemId: draft.selectedItemId === action.itemId ? null : draft.selectedItemId,
        editing: draft.editing?.itemId === action.itemId ? null : draft.editing,
        deletedItems: [
          ...draft.deletedItems.filter((deleted) => deleted.item.id !== action.itemId),
          { item, index, expiresAt: action.expiresAt },
        ],
      };
    }

    case 'undo-delete': {
      const deleted = draft.deletedItems.find((entry) => entry.item.id === action.itemId);
      if (!deleted) return draft;
      const feedbackItems = [...draft.session.feedbackItems];
      feedbackItems.splice(Math.min(deleted.index, feedbackItems.length), 0, deleted.item);
      const updated = withItems(draft, feedbackItems);
      return {
        ...updated,
        selectedItemId: deleted.item.id,
        deletedItems: draft.deletedItems.filter((entry) => entry.item.id !== action.itemId),
      };
    }

    case 'expire-delete': {
      const deletedItems = draft.deletedItems.filter((entry) => entry.item.id !== action.itemId);
      return deletedItems.length === draft.deletedItems.length
        ? draft
        : { ...draft, deletedItems };
    }

    case 'save-started':
      return action.sessionKey === draft.sessionKey
        ? { ...draft, savingRevision: action.revision, saveError: null }
        : draft;

    case 'save-succeeded':
      if (action.sessionKey !== draft.sessionKey) return draft;
      return {
        ...draft,
        savedRevision: Math.max(draft.savedRevision, action.revision),
        savingRevision: draft.savingRevision === action.revision ? null : draft.savingRevision,
        saveError: null,
      };

    case 'save-failed':
      if (action.sessionKey !== draft.sessionKey) return draft;
      return {
        ...draft,
        savingRevision: draft.savingRevision === action.revision ? null : draft.savingRevision,
        saveError: action.message,
      };
  }
}
