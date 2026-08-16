import type {
  AnnotationColor,
  AnnotationEvent,
  AnnotationTool,
  MarkedIssuePayload,
  MarkedIssueSnapshotRequest,
} from '../../shared/types';

export const MAX_MARKED_ISSUES_PER_SESSION = 200;
export const MAX_STROKES_PER_MARKED_ISSUE = 100;

interface CompletedStrokeSnapshot {
  id: string;
  tool: AnnotationTool;
  color: AnnotationColor;
  startedAt: number;
  endedAt: number;
}

interface ActiveStrokeSnapshot {
  id: string;
  tool: AnnotationTool;
  color: AnnotationColor;
  startedAt: number;
}

export interface ActiveMarkedIssueSnapshot {
  startedAt: number;
  markedAt: number;
  strokes: CompletedStrokeSnapshot[];
  activeStroke: ActiveStrokeSnapshot | null;
  snapshotRevision: number;
  fallbackVideoTimestamp: number;
  dirty: boolean;
}

export interface MarkedIssueAccumulatorSnapshot {
  sessionId: string;
  issues: MarkedIssuePayload[];
  active: ActiveMarkedIssueSnapshot | null;
  nextOrdinal: number;
  nextRevision: number;
}

export interface MarkedIssueConsumeResult {
  accepted: boolean;
  limitReached?: 'strokes' | 'issues';
}

function cloneIssue(issue: MarkedIssuePayload): MarkedIssuePayload {
  return {
    ...issue,
    strokeIds: [...issue.strokeIds],
    tools: [...issue.tools],
    colors: [...issue.colors],
    transcriptSegmentIds: [...issue.transcriptSegmentIds],
    ...(issue.captureContext
      ? { captureContext: structuredClone(issue.captureContext) }
      : {}),
  };
}

function cloneActive(active: ActiveMarkedIssueSnapshot | null): ActiveMarkedIssueSnapshot | null {
  if (!active) return null;
  return {
    ...active,
    strokes: active.strokes.map((stroke) => ({ ...stroke })),
    activeStroke: active.activeStroke ? { ...active.activeStroke } : null,
  };
}

function uniqueInOrder<T>(values: T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validCounter(value: unknown, allowZero = false): value is number {
  return Number.isSafeInteger(value) && Number(value) >= (allowZero ? 0 : 1);
}

function validStrokeId(value: unknown, seen: Set<string>): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return true;
}

function validCompletedStroke(value: unknown, seen: Set<string>): boolean {
  if (!isRecord(value)
    || !validStrokeId(value.id, seen)
    || (value.tool !== 'freehand' && value.tool !== 'circle' && value.tool !== 'highlight')
    || (value.color !== '#ff3b30' && value.color !== '#ffcc00'
      && value.color !== '#34c759' && value.color !== '#0a84ff')
    || !validTimestamp(value.startedAt)
    || !validTimestamp(value.endedAt)) {
    return false;
  }
  return Number(value.endedAt) >= Number(value.startedAt);
}

function validAccumulatorSnapshot(value: unknown): value is MarkedIssueAccumulatorSnapshot {
  if (!isRecord(value)
    || typeof value.sessionId !== 'string'
    || !Array.isArray(value.issues)
    || value.issues.length > MAX_MARKED_ISSUES_PER_SESSION
    || !validCounter(value.nextOrdinal)
    || Number(value.nextOrdinal) !== value.issues.length + 1
    || !validCounter(value.nextRevision)) {
    return false;
  }

  const seenStrokeIds = new Set<string>();
  let greatestRevision = 0;
  for (let index = 0; index < value.issues.length; index += 1) {
    const issue = value.issues[index];
    const ordinal = index + 1;
    if (!isRecord(issue)
      || issue.id !== `marked-issue-${String(ordinal).padStart(3, '0')}`
      || issue.ordinal !== ordinal
      || !validTimestamp(issue.startedAt)
      || !validTimestamp(issue.markedAt)
      || !validTimestamp(issue.completedAt)
      || Number(issue.markedAt) < Number(issue.startedAt)
      || Number(issue.completedAt) < Number(issue.markedAt)
      || !Array.isArray(issue.strokeIds)
      || issue.strokeIds.length === 0
      || issue.strokeIds.length > MAX_STROKES_PER_MARKED_ISSUE
      || issue.strokeIds.some((id) => !validStrokeId(id, seenStrokeIds))
      || !Array.isArray(issue.tools)
      || issue.tools.some((tool) => tool !== 'freehand' && tool !== 'circle' && tool !== 'highlight')
      || !Array.isArray(issue.colors)
      || issue.colors.some((color) => color !== '#ff3b30' && color !== '#ffcc00'
        && color !== '#34c759' && color !== '#0a84ff')
      || !validTimestamp(issue.fallbackVideoTimestamp)
      || !validCounter(issue.snapshotRevision, true)
      || !Array.isArray(issue.transcriptSegmentIds)
      || issue.transcriptSegmentIds.some((id) => typeof id !== 'string' || id.length > 128)) {
      return false;
    }
    greatestRevision = Math.max(greatestRevision, Number(issue.snapshotRevision));
  }

  if (value.active !== null) {
    const active = value.active;
    if (!isRecord(active)
      || !validTimestamp(active.startedAt)
      || !validTimestamp(active.markedAt)
      || Number(active.markedAt) < Number(active.startedAt)
      || !validCounter(active.snapshotRevision, true)
      || !validTimestamp(active.fallbackVideoTimestamp)
      || typeof active.dirty !== 'boolean'
      || !Array.isArray(active.strokes)
      || active.strokes.length > MAX_STROKES_PER_MARKED_ISSUE
      || active.strokes.some((stroke) => !validCompletedStroke(stroke, seenStrokeIds))
      || (active.activeStroke !== null && !isRecord(active.activeStroke))) {
      return false;
    }
    if (active.activeStroke !== null) {
      const stroke = active.activeStroke;
      if (active.strokes.length >= MAX_STROKES_PER_MARKED_ISSUE
        || !validStrokeId(stroke.id, seenStrokeIds)
        || (stroke.tool !== 'freehand' && stroke.tool !== 'circle' && stroke.tool !== 'highlight')
        || (stroke.color !== '#ff3b30' && stroke.color !== '#ffcc00'
          && stroke.color !== '#34c759' && stroke.color !== '#0a84ff')
        || !validTimestamp(stroke.startedAt)
        || Number(stroke.startedAt) < Number(active.startedAt)) {
        return false;
      }
    }
    if (active.strokes.length === 0 && active.activeStroke === null) return false;
    greatestRevision = Math.max(greatestRevision, Number(active.snapshotRevision));
  }

  return Number(value.nextRevision) > greatestRevision;
}

export class MarkedIssueAccumulator {
  private readonly issues: MarkedIssuePayload[];

  private active: ActiveMarkedIssueSnapshot | null;

  private nextOrdinal: number;

  private nextRevision: number;

  constructor(
    private readonly sessionId: string,
    snapshot?: MarkedIssueAccumulatorSnapshot,
  ) {
    this.issues = snapshot?.issues.map(cloneIssue) ?? [];
    this.active = cloneActive(snapshot?.active ?? null);
    this.nextOrdinal = snapshot?.nextOrdinal ?? 1;
    this.nextRevision = snapshot?.nextRevision ?? 1;
  }

  static restore(
    sessionId: string,
    snapshot: MarkedIssueAccumulatorSnapshot,
  ): MarkedIssueAccumulator {
    if (!isRecord(snapshot)) {
      throw new Error('Marked issue snapshot is invalid.');
    }
    if (snapshot.sessionId !== sessionId) {
      throw new Error('Marked issue snapshot belongs to a different session.');
    }
    if (!validAccumulatorSnapshot(snapshot)) {
      throw new Error('Marked issue snapshot is invalid.');
    }
    return new MarkedIssueAccumulator(sessionId, structuredClone(snapshot));
  }

  consume(event: AnnotationEvent, recordedAt: number): MarkedIssueConsumeResult {
    if (event.sessionId !== this.sessionId || !validTimestamp(recordedAt)) {
      return { accepted: false };
    }

    switch (event.type) {
      case 'stroke-start':
        return this.startStroke(event.stroke.id, event.stroke.tool, event.stroke.color, recordedAt);
      case 'stroke-end':
        return this.endStroke(event.strokeId, recordedAt);
      case 'undo':
        return this.undo();
      case 'clear':
        this.active = null;
        return { accepted: true };
      case 'cursor':
      case 'stroke-points':
      case 'mode':
      case 'bounds':
        return { accepted: true };
      case 'snapshot-request':
        return { accepted: false };
    }
  }

  releaseModifier(
    requestedAt: number,
    videoStartTime: number,
  ): MarkedIssueSnapshotRequest | null {
    if (!validTimestamp(requestedAt)
      || !validTimestamp(videoStartTime)
      || !this.active
      || this.active.activeStroke
      || this.active.strokes.length === 0
      || !this.active.dirty) {
      return null;
    }

    const revision = this.nextRevision;
    this.nextRevision += 1;
    this.active.snapshotRevision = revision;
    this.active.fallbackVideoTimestamp = Math.max(
      0,
      (this.active.markedAt - videoStartTime) / 1_000,
    );
    this.active.dirty = false;

    return { sessionId: this.sessionId, revision, requestedAt };
  }

  commit(completedAt: number): MarkedIssuePayload | null {
    if (!validTimestamp(completedAt)
      || !this.active
      || this.active.activeStroke
      || this.active.strokes.length === 0
      || this.issues.length >= MAX_MARKED_ISSUES_PER_SESSION) {
      return null;
    }

    const { strokes } = this.active;
    const issue: MarkedIssuePayload = {
      id: `marked-issue-${String(this.nextOrdinal).padStart(3, '0')}`,
      ordinal: this.nextOrdinal,
      startedAt: this.active.startedAt,
      markedAt: this.active.markedAt,
      completedAt,
      strokeIds: strokes.map((stroke) => stroke.id),
      tools: uniqueInOrder(strokes.map((stroke) => stroke.tool)),
      colors: uniqueInOrder(strokes.map((stroke) => stroke.color)),
      fallbackVideoTimestamp: this.active.fallbackVideoTimestamp,
      transcriptionStatus: 'pending',
      snapshotRevision: this.active.snapshotRevision,
      transcriptSegmentIds: [],
    };

    this.issues.push(issue);
    this.nextOrdinal += 1;
    this.active = null;
    return cloneIssue(issue);
  }

  finalize(completedAt: number): MarkedIssuePayload | null {
    return this.commit(completedAt);
  }

  getIssues(): MarkedIssuePayload[] {
    return this.issues.map(cloneIssue);
  }

  snapshot(): MarkedIssueAccumulatorSnapshot {
    return {
      sessionId: this.sessionId,
      issues: this.getIssues(),
      active: cloneActive(this.active),
      nextOrdinal: this.nextOrdinal,
      nextRevision: this.nextRevision,
    };
  }

  private startStroke(
    id: string,
    tool: AnnotationTool,
    color: AnnotationColor,
    startedAt: number,
  ): MarkedIssueConsumeResult {
    if (this.issues.length >= MAX_MARKED_ISSUES_PER_SESSION) {
      return { accepted: false, limitReached: 'issues' };
    }
    if ((this.active?.strokes.length ?? 0) >= MAX_STROKES_PER_MARKED_ISSUE) {
      return { accepted: false, limitReached: 'strokes' };
    }
    if (!id || this.active?.activeStroke || this.hasStroke(id)) {
      return { accepted: false };
    }

    if (!this.active) {
      this.active = {
        startedAt,
        markedAt: startedAt,
        strokes: [],
        activeStroke: null,
        snapshotRevision: 0,
        fallbackVideoTimestamp: 0,
        dirty: false,
      };
    }
    this.active.activeStroke = { id, tool, color, startedAt };
    return { accepted: true };
  }

  private endStroke(id: string, endedAt: number): MarkedIssueConsumeResult {
    const activeStroke = this.active?.activeStroke;
    if (!this.active || !activeStroke || activeStroke.id !== id || endedAt < activeStroke.startedAt) {
      return { accepted: false };
    }

    this.active.strokes.push({ ...activeStroke, endedAt });
    this.active.activeStroke = null;
    this.active.markedAt = endedAt;
    this.active.dirty = true;
    return { accepted: true };
  }

  private undo(): MarkedIssueConsumeResult {
    if (!this.active) return { accepted: false };

    if (this.active.activeStroke) {
      this.active.activeStroke = null;
    } else if (this.active.strokes.length > 0) {
      this.active.strokes.pop();
    } else {
      return { accepted: false };
    }

    if (this.active.strokes.length === 0) {
      this.active = null;
    } else {
      this.active.markedAt = this.active.strokes[this.active.strokes.length - 1].endedAt;
      this.active.dirty = true;
    }
    return { accepted: true };
  }

  private hasStroke(id: string): boolean {
    if (this.active?.activeStroke?.id === id
      || this.active?.strokes.some((stroke) => stroke.id === id)) {
      return true;
    }
    return this.issues.some((issue) => issue.strokeIds.includes(id));
  }
}
