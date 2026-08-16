import { describe, expect, it } from 'vitest';
import { getAnnotationGuidance } from '../../src/renderer/components/RecordingOverlay';

describe('recording overlay annotation guidance', () => {
  it('explains modifier drawing without taking over normal clicks', () => {
    expect(getAnnotationGuidance({
      active: true,
      inputMode: 'modifier',
      modifierKey: 'Command',
      pendingMarkedIssue: false,
      isPaused: false,
    })).toBe('Hold ⌘ and drag to mark · click to save and continue');

    expect(getAnnotationGuidance({
      active: true,
      inputMode: 'modifier',
      modifierKey: 'Control',
      pendingMarkedIssue: true,
      isPaused: false,
    })).toBe('Marked area ready · click to save and continue');
  });

  it('gives an explicit Draw and Done workflow only for fallback input', () => {
    expect(getAnnotationGuidance({
      active: true,
      inputMode: 'fallback',
      modifierKey: null,
      pendingMarkedIssue: false,
      isPaused: false,
    })).toBe('Choose Draw, mark the screen, then choose Done to save');
  });

  it('makes preservation clear while paused', () => {
    expect(getAnnotationGuidance({
      active: true,
      inputMode: 'modifier',
      modifierKey: 'Command',
      pendingMarkedIssue: true,
      isPaused: true,
    })).toBe('Paused · your current marks are preserved');
  });
});
