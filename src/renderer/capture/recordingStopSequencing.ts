export interface AnnotationEndResult {
  success: boolean;
  snapshotRevision?: number;
  error?: string;
}

interface RecordingStopDependencies<T> {
  annotationActive: boolean;
  finalizePendingIssue: boolean;
  endAnnotation: (finalizePendingIssue: boolean) => Promise<AnnotationEndResult>;
  waitForMarkedSnapshot: (revision: number) => Promise<boolean>;
  stopRecorder: () => Promise<T>;
  releaseCaptureTracks: () => void;
}

/** Preserve the last marked frame before any compositor or source-track teardown. */
export async function stopRecordingWithMarkedIssue<T>(
  dependencies: RecordingStopDependencies<T>,
): Promise<T> {
  let snapshotRevision: number | undefined;
  if (dependencies.annotationActive) {
    try {
      const result = await dependencies.endAnnotation(dependencies.finalizePendingIssue);
      snapshotRevision = result.snapshotRevision;
    } catch {
      // Recorder finalization must continue even if the overlay renderer is gone.
    }
  }

  if (snapshotRevision !== undefined) {
    try {
      await dependencies.waitForMarkedSnapshot(snapshotRevision);
    } catch {
      // The report pipeline will attempt a video-frame fallback for this issue.
    }
  }

  try {
    return await dependencies.stopRecorder();
  } finally {
    dependencies.releaseCaptureTracks();
  }
}
