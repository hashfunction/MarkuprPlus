/**
 * TranscriptAnalyzer.ts - Heuristic Key Moment Detection
 *
 * Analyzes transcript segments to identify moments where video frames
 * should be extracted. Uses local heuristics (no AI required):
 *
 * - Natural pauses > 1.5s between segments
 * - Periodic baseline captures every 15-20 seconds
 * - Session start and end always included
 *
 * Part of the post-processing pipeline that runs after recording stops.
 */

import type { TranscriptSegment } from './PostProcessor';

// ============================================================================
// Types
// ============================================================================

export interface KeyMoment {
  timestamp: number; // seconds from start of recording
  reason: string; // human-readable reason for selection
  confidence: number; // 0-1
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum gap between segments to count as a natural pause */
const PAUSE_THRESHOLD_SECONDS = 1.5;

/** Baseline periodic capture interval when no pauses are found */
const PERIODIC_INTERVAL_SECONDS = 15;

/** Maximum periodic interval to avoid sparse captures */
const MAX_PERIODIC_INTERVAL_SECONDS = 20;

/** Hard cap on returned key moments */
const MAX_KEY_MOMENTS = 20;

/** Avoid capturing the very first frame of a recording (often corrupted or blank) */
const FRAME_EDGE_MARGIN_SECONDS = 0.35;

// ============================================================================
// TranscriptAnalyzer Class
// ============================================================================

export class TranscriptAnalyzer {
  /**
   * Analyze transcript segments and return key moments where frames
   * should be extracted from the video recording.
   *
   * @param segments - Array of transcript segments with timing info
   * @param aiHints - Optional AI-informed key-moment hints to merge
   * @returns Array of key moments sorted by timestamp, capped at 20
   */
  analyze(segments: TranscriptSegment[], aiHints: KeyMoment[] = []): KeyMoment[] {
    if (segments.length === 0) {
      return this.finalizeMoments(
        aiHints.filter((hint) => Number.isFinite(hint.timestamp)).map((hint) => this.normalizeHint(hint)),
      );
    }

    const moments: KeyMoment[] = [];

    // Always include session start, offset by edge margin to avoid corrupted
    // startup frames (video encoders may not have a clean frame at t=0).
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const sessionDuration = lastSegment.endTime - firstSegment.startTime;
    const startOffset = sessionDuration > FRAME_EDGE_MARGIN_SECONDS
      ? FRAME_EDGE_MARGIN_SECONDS
      : 0;

    moments.push({
      timestamp: firstSegment.startTime + startOffset,
      reason: 'Session start',
      confidence: 1.0,
    });

    // Detect natural pauses between segments
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1];
      const curr = segments[i];
      const gap = curr.startTime - prev.endTime;

      if (gap >= PAUSE_THRESHOLD_SECONDS) {
        // Place the key moment at the start of the pause (end of previous segment)
        moments.push({
          timestamp: prev.endTime,
          reason: 'Natural pause in narration',
          confidence: Math.min(1.0, gap / 3.0), // Longer pauses = higher confidence
        });
      }
    }

    // Always include session end regardless of duration so that even very
    // short sessions (<5s) produce at least 2 key moments.
    if (lastSegment.endTime > firstSegment.startTime + startOffset) {
      moments.push({
        timestamp: lastSegment.endTime,
        reason: 'Session end',
        confidence: 1.0,
      });
    }

    // If we found fewer than 3 moments (just start/end), add periodic baseline captures.
    // When AI hints exist, prefer them over periodic filler captures.
    if (moments.length < 3 && aiHints.length === 0) {
      if (sessionDuration > PERIODIC_INTERVAL_SECONDS) {
        // Calculate interval: target 15s but stretch up to 20s to avoid one extra capture
        const rawCount = Math.floor(sessionDuration / PERIODIC_INTERVAL_SECONDS);
        const interval = Math.min(
          sessionDuration / rawCount,
          MAX_PERIODIC_INTERVAL_SECONDS
        );

        for (
          let t = firstSegment.startTime + interval;
          t < lastSegment.endTime;
          t += interval
        ) {
          moments.push({
            timestamp: t,
            reason: 'Periodic capture',
            confidence: 0.5,
          });
        }
      }
    }

    // Merge AI hints (when available) so frame extraction can prioritize
    // narration moments that the analysis pipeline considered important.
    for (const hint of aiHints) {
      if (!Number.isFinite(hint.timestamp)) {
        continue;
      }
      moments.push(this.normalizeHint(hint));
    }

    return this.finalizeMoments(moments);
  }

  private normalizeHint(hint: KeyMoment): KeyMoment {
    return {
      timestamp: Math.max(0, Number.isFinite(hint.timestamp) ? hint.timestamp : 0),
      reason: hint.reason?.trim() || 'AI-highlighted context',
      confidence: Math.max(0, Math.min(1, Number.isFinite(hint.confidence) ? hint.confidence : 0.8)),
    };
  }

  private finalizeMoments(moments: KeyMoment[]): KeyMoment[] {
    const deduped = this.deduplicateMoments(moments);
    deduped.sort((a, b) => a.timestamp - b.timestamp);
    if (deduped.length <= MAX_KEY_MOMENTS) return deduped;

    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    const middle = deduped
      .slice(1, -1)
      .sort((a, b) => {
        const priorityDelta = this.momentPriority(b) - this.momentPriority(a);
        return priorityDelta || b.confidence - a.confidence;
      })
      .slice(0, MAX_KEY_MOMENTS - 2);
    const capped = [first, ...middle, last];
    capped.sort((a, b) => a.timestamp - b.timestamp);
    return capped;
  }

  /**
   * Remove moments that are within 1 second of each other,
   * keeping the one with higher confidence.
   */
  private deduplicateMoments(moments: KeyMoment[]): KeyMoment[] {
    if (moments.length <= 1) {
      return moments;
    }

    // Sort by timestamp first for grouping
    const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp);
    const result: KeyMoment[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = result[result.length - 1];
      const curr = sorted[i];

      if (curr.timestamp - prev.timestamp < 1.0) {
        // Prefer higher-priority moments (AI / semantic captures over periodic).
        const currPriority = this.momentPriority(curr);
        const prevPriority = this.momentPriority(prev);
        if (
          currPriority > prevPriority ||
          (currPriority === prevPriority && (
            curr.confidence > prev.confidence
            || (this.isAnnotationMoment(curr) && this.isAnnotationMoment(prev))
          ))
        ) {
          result[result.length - 1] = curr;
        }
      } else {
        result.push(curr);
      }
    }

    return result;
  }

  private momentPriority(moment: KeyMoment): number {
    const reason = (moment.reason || '').toLowerCase();
    if (reason.includes('annotation completed')) {
      return 5;
    }
    if (reason.includes('session start') || reason.includes('session end')) {
      return 4;
    }
    if (reason.includes('ai-') || reason.includes('ai ')) {
      return 3;
    }
    if (reason.includes('natural pause')) {
      return 2;
    }
    if (reason.includes('periodic')) {
      return 0;
    }
    return 1;
  }

  private isAnnotationMoment(moment: KeyMoment): boolean {
    return (moment.reason || '').toLowerCase().includes('annotation completed');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const transcriptAnalyzer = new TranscriptAnalyzer();
export default TranscriptAnalyzer;
