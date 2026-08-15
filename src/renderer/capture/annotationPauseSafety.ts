interface AnnotationPauseDependencies {
  annotationActive: boolean;
  setAnnotationMode: (mode: 'interact') => Promise<{ success: boolean; error?: string }>;
  endAnnotation: () => Promise<unknown>;
}

/**
 * Ensure a drawing overlay cannot retain focus or accept strokes while the
 * owning recording is paused. Returns true when the overlay had to be ended.
 */
export async function disableAnnotationDrawing(
  dependencies: AnnotationPauseDependencies,
): Promise<boolean> {
  if (!dependencies.annotationActive) return false;

  try {
    const result = await dependencies.setAnnotationMode('interact');
    if (result.success) return false;
  } catch {
    // Fall through to authoritative teardown.
  }

  await dependencies.endAnnotation().catch(() => undefined);
  return true;
}
