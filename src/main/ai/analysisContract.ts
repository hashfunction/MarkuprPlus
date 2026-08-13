import type { Session } from '../SessionController';
import type { AIAnalysisResult } from './types';
import { AIPipelineError } from './types';

export const ANALYSIS_SYSTEM_PROMPT = `You are markupR's AI analysis engine. You receive a developer's voice-narrated feedback session: a transcript of everything they said while reviewing software, paired with screenshots captured at natural pause points.

Your job is to transform this raw narration into a structured, actionable feedback document.

## Rules

1. Preserve the user's voice. Quote their exact words. Never rephrase their observations.
2. Group related feedback. If the user mentions the same area multiple times, combine those into one item.
3. Match screenshots to feedback. Reference screenshots by their zero-based index in screenshotIndices.
4. Extract action items. For each feedback item, write a concrete one-sentence action a developer can take immediately.
5. Assign priority. Use Critical, High, Medium, or Low based on described severity.
6. Categorize. Use exactly one of: Bug, UX Issue, Performance, Suggestion, Question, Positive Note.
7. Write a concise two-to-three sentence summary.
8. Handle sparse input. If narration is short or absent, use screenshots. If both are absent, return an empty items array.
9. Respond with only the structured JSON result.`;

export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items', 'themes', 'positiveNotes', 'metadata'],
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'category',
          'priority',
          'quote',
          'screenshotIndices',
          'actionItem',
          'area',
        ],
        properties: {
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: ['Bug', 'UX Issue', 'Performance', 'Suggestion', 'Question', 'Positive Note'],
          },
          priority: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
          quote: { type: 'string' },
          screenshotIndices: { type: 'array', items: { type: 'integer', minimum: 0 } },
          actionItem: { type: 'string' },
          area: { type: 'string' },
        },
      },
    },
    themes: { type: 'array', items: { type: 'string' } },
    positiveNotes: { type: 'array', items: { type: 'string' } },
    metadata: {
      type: 'object',
      additionalProperties: false,
      required: ['totalItems', 'criticalCount', 'highCount'],
      properties: {
        totalItems: { type: 'integer', minimum: 0 },
        criticalCount: { type: 'integer', minimum: 0 },
        highCount: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

/** Convert an epoch timestamp to session-relative MM:SS. */
export function toRelativeTimestamp(timestampMs: number, sessionStartMs: number): string {
  const relativeSeconds = Math.max(0, Math.floor((timestampMs - sessionStartMs) / 1_000));
  const minutes = Math.floor(relativeSeconds / 60).toString().padStart(2, '0');
  const seconds = (relativeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Build a chronological, timestamped transcript from final events when available. */
export function buildTranscriptText(session: Session): string {
  const finalEvents = session.transcriptBuffer
    .filter((event) => event.isFinal && event.text.trim().length > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  const events = finalEvents.length > 0
    ? finalEvents
    : session.transcriptBuffer
        .filter((event) => event.text.trim().length > 0)
        .sort((a, b) => a.timestamp - b.timestamp);

  if (events.length === 0) return '[No transcript available]';

  return events
    .map((event) => {
      const relative = toRelativeTimestamp(Math.round(event.timestamp * 1_000), session.startTime);
      return `[${relative}] ${event.text.trim()}`;
    })
    .join('\n');
}

/** Parse and defensively coerce a provider's structured result. */
export function parseAnalysisResult(text: string): AIAnalysisResult {
  let json = text.trim();
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) json = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AIPipelineError('AI response was not valid JSON.', 'INVALID_RESPONSE');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('summary' in parsed) ||
    !('items' in parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).items)
  ) {
    throw new AIPipelineError(
      'AI response JSON is missing required fields (summary, items).',
      'INVALID_RESPONSE',
    );
  }

  const object = parsed as Record<string, unknown>;
  const items = (object.items as Record<string, unknown>[]).map(validateFeedbackItem);

  return {
    summary: String(object.summary ?? ''),
    items,
    themes: Array.isArray(object.themes) ? object.themes.map(String) : [],
    positiveNotes: Array.isArray(object.positiveNotes) ? object.positiveNotes.map(String) : [],
    metadata: {
      totalItems: items.length,
      criticalCount: items.filter((item) => item.priority === 'Critical').length,
      highCount: items.filter((item) => item.priority === 'High').length,
    },
  };
}

function validateFeedbackItem(raw: Record<string, unknown>): AIAnalysisResult['items'][number] {
  const categories = ['Bug', 'UX Issue', 'Performance', 'Suggestion', 'Question', 'Positive Note'];
  const priorities = ['Critical', 'High', 'Medium', 'Low'];
  const category = String(raw.category ?? 'Suggestion');
  const priority = String(raw.priority ?? 'Medium');

  return {
    title: String(raw.title ?? 'Untitled Feedback'),
    category: categories.includes(category)
      ? category as AIAnalysisResult['items'][number]['category']
      : 'Suggestion',
    priority: priorities.includes(priority)
      ? priority as AIAnalysisResult['items'][number]['priority']
      : 'Medium',
    quote: String(raw.quote ?? ''),
    screenshotIndices: Array.isArray(raw.screenshotIndices)
      ? raw.screenshotIndices.filter((value): value is number => Number.isInteger(value) && value >= 0)
      : [],
    actionItem: String(raw.actionItem ?? ''),
    area: String(raw.area ?? 'General'),
  };
}
