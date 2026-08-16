/**
 * Linear Integration Types
 *
 * Types for creating Linear issues from MarkuprX feedback sessions.
 * Uses raw GraphQL API (no @linear/sdk dependency).
 */

import type { FeedbackCategory, FeedbackSeverity } from '../../main/output/MarkdownGenerator';

/** Linear issue priority levels (0 = No priority, 1 = Urgent, 4 = Low) */
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

/** Linear issue creation input */
export interface LinearIssueInput {
  title: string;
  description: string;
  teamId: string;
  priority: LinearPriority;
  labelIds?: string[];
  projectId?: string;
}

/** Result of creating a single Linear issue */
export interface LinearIssueResult {
  success: boolean;
  issueId?: string;
  issueUrl?: string;
  identifier?: string;
  error?: string;
}

/** Result of pushing an entire report to Linear */
export interface LinearPushResult {
  teamKey: string;
  totalItems: number;
  created: number;
  failed: number;
  issues: LinearIssueResult[];
  dryRun: boolean;
}

/** Options for the Linear push operation */
export interface LinearPushOptions {
  token: string;
  teamKey: string;
  projectName?: string;
  dryRun?: boolean;
}

/** Parsed feedback item extracted from a MarkuprX markdown report */
export interface ParsedFeedbackItem {
  id: string;
  title: string;
  severity: FeedbackSeverity;
  category: FeedbackCategory;
  timestamp: string;
  description: string;
  screenshotPaths: string[];
  suggestedAction: string;
}

/** Linear team info from API */
export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

/** Linear label info from API */
export interface LinearLabel {
  id: string;
  name: string;
}

/** Map from MarkuprX severity to Linear priority */
export const SEVERITY_TO_PRIORITY: Record<FeedbackSeverity, LinearPriority> = {
  Critical: 1,
  High: 2,
  Medium: 3,
  Low: 4,
};

/** Map from MarkuprX category to Linear label name */
export const CATEGORY_TO_LABEL: Record<string, string> = {
  'Bug': 'Bug',
  'UX Issue': 'Improvement',
  'Suggestion': 'Feature',
  'Performance': 'Bug',
  'Question': 'Feature',
  'General': 'Feature',
};
