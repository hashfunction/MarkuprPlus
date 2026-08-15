interface RecordingFailureCleanupDependencies {
  releaseCaptureTracks: () => void;
  endAnnotation: () => Promise<unknown>;
  cancelSession: () => Promise<unknown>;
}

/** Fail closed when the selected source cannot become a real recorder. */
export async function cleanupFailedRecordingStart(
  dependencies: RecordingFailureCleanupDependencies,
): Promise<void> {
  dependencies.releaseCaptureTracks();
  await Promise.allSettled([
    dependencies.endAnnotation(),
    dependencies.cancelSession(),
  ]);
}
