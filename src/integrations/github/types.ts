/**
 * GitHub Issues Integration Types
 *
 * Types for creating GitHub issues from MarkuprX feedback sessions.
 */

import type { FeedbackCategory, FeedbackSeverity } from '../../main/output/MarkdownGenerator';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';

// ============================================================================
// Auth
// ============================================================================

export interface GitHubAuth {
  token: string;
  source: 'flag' | 'env' | 'gh-cli';
}

// ============================================================================
// Repository
// ============================================================================

export interface GitHubRepo {
  owner: string;
  repo: string;
}

// ============================================================================
// Issue creation
// ============================================================================

export interface GitHubIssueInput {
  title: string;
  body: string;
  labels: string[];
}

export interface GitHubIssueResult {
  number: number;
  url: string;
  title: string;
}

export interface GitHubLabelInput {
  name: string;
  color: string;
  description: string;
}

// ============================================================================
// Parsed feedback item (from markdown report)
// ============================================================================

export interface ParsedFeedbackItem {
  id: string;
  title: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  timestamp: string;
  transcription: string;
  screenshotPaths: string[];
  suggestedAction: string;
}

// ============================================================================
// Push options
// ============================================================================

export interface PushToGitHubOptions {
  repo: GitHubRepo;
  auth: GitHubAuth;
  reportPath: string;
  dryRun?: boolean;
  items?: string[]; // specific FB-XXX IDs to push, or all if omitted
}

export interface PushToGitHubResult {
  created: GitHubIssueResult[];
  labelsCreated: string[];
  errors: Array<{ itemId: string; error: string }>;
  dryRun: boolean;
}

// ============================================================================
// Category-to-label mapping
// ============================================================================

export const CATEGORY_LABELS: Record<FeedbackCategory, GitHubLabelInput> = {
  Bug: { name: 'bug', color: 'd73a4a', description: 'Something isn\'t working' },
  'UX Issue': { name: 'ux', color: 'e4e669', description: 'User experience issue' },
  Suggestion: { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
  Performance: { name: 'performance', color: 'f9d0c4', description: 'Performance issue' },
  Question: { name: 'question', color: 'd876e3', description: 'Further information is requested' },
  General: { name: 'feedback', color: 'c5def5', description: 'General feedback' },
};

export const SEVERITY_LABELS: Record<FeedbackSeverity, GitHubLabelInput> = {
  Critical: { name: 'priority: critical', color: 'b60205', description: 'Critical priority' },
  High: { name: 'priority: high', color: 'd93f0b', description: 'High priority' },
  Medium: { name: 'priority: medium', color: 'fbca04', description: 'Medium priority' },
  Low: { name: 'priority: low', color: '0e8a16', description: 'Low priority' },
};

export const MARKUPRX_LABEL: GitHubLabelInput = {
  name: PUBLIC_BRAND_NAME,
  color: '6f42c1',
  description: `Created from ${PUBLIC_BRAND_NAME} feedback session`,
};
