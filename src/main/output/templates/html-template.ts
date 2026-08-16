/**
 * HTML Template for Standalone Export
 *
 * Generates a self-contained HTML document with:
 * - Embedded CSS (no external dependencies)
 * - Dark theme matching MarkuprX aesthetic
 * - Base64-embedded images
 * - Responsive design
 * - Print-friendly styles
 */

import type { Session, FeedbackItem, FeedbackCategory, FeedbackSeverity } from '../MarkdownGenerator';

// ============================================================================
// Types
// ============================================================================

export interface HtmlExportOptions {
  projectName?: string;
  includeImages?: boolean;
  theme?: 'dark' | 'light';
  /** MarkuprX version string (e.g., "2.2.0") shown in the footer. */
  version?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format timestamp to a deterministic human-readable string.
 * Avoids toLocaleString to ensure consistent output across platforms.
 */
function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const rawHours = date.getHours();
  const ampm = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
}

function generateTitle(transcription: string): string {
  const firstSentence = transcription.split(/[.!?]/)[0].trim();
  if (firstSentence.length <= 50) return escapeHtml(firstSentence);
  return escapeHtml(firstSentence.slice(0, 47) + '...');
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

function countByCategory(session: Session): Record<string, number> {
  const counts = session.feedbackItems.reduce((acc, item) => {
    const category = item.category || 'General';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const markedIssueCount = session.metadata?.markedIssues?.length ?? 0;
  if (markedIssueCount > 0) counts['Marked Issue'] = markedIssueCount;
  return counts;
}

function getCategoryClass(category: FeedbackCategory): string {
  const classes: Record<FeedbackCategory, string> = {
    Bug: 'tag-bug',
    'UX Issue': 'tag-ux',
    Suggestion: 'tag-suggestion',
    Performance: 'tag-performance',
    Question: 'tag-question',
    General: 'tag-general',
  };
  return classes[category] || 'tag-general';
}

function getSeverityClass(severity: FeedbackSeverity): string {
  const classes: Record<FeedbackSeverity, string> = {
    Critical: 'severity-critical',
    High: 'severity-high',
    Medium: 'severity-medium',
    Low: 'severity-low',
  };
  return classes[severity] || 'severity-medium';
}

// ============================================================================
// CSS Styles
// ============================================================================

function getStyles(theme: 'dark' | 'light'): string {
  const isDark = theme === 'dark';

  return `
    :root {
      --bg: ${isDark ? '#0f172a' : '#ffffff'};
      --bg-secondary: ${isDark ? '#1e293b' : '#f8fafc'};
      --text: ${isDark ? '#e2e8f0' : '#1e293b'};
      --text-secondary: ${isDark ? '#94a3b8' : '#64748b'};
      --border: ${isDark ? '#334155' : '#e2e8f0'};
      --accent: #3b82f6;
      --accent-soft: ${isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)'};
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }

    /* Header */
    header {
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid var(--accent);
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      color: ${isDark ? '#ffffff' : '#0f172a'};
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }

    .meta {
      color: var(--text-secondary);
      font-size: 0.875rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .meta-item svg {
      width: 14px;
      height: 14px;
      opacity: 0.7;
    }

    /* Feedback Items */
    .feedback-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .feedback-item {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: box-shadow 0.2s ease;
    }

    .feedback-item:hover {
      box-shadow: 0 4px 12px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.08)'};
    }

    .feedback-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .feedback-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: ${isDark ? '#ffffff' : '#0f172a'};
      margin: 0;
    }

    .feedback-id {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-secondary);
      background: var(--bg);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      white-space: nowrap;
    }

    .tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .tag {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .tag-bug { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .tag-ux { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .tag-suggestion { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .tag-performance { background: rgba(34, 197, 94, 0.18); color: #22c55e; }
    .tag-question { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
    .tag-general { background: rgba(107, 114, 128, 0.15); color: #6b7280; }

    .severity-critical { background: rgba(220, 38, 38, 0.15); color: #dc2626; }
    .severity-high { background: rgba(234, 88, 12, 0.15); color: #ea580c; }
    .severity-medium { background: rgba(202, 138, 4, 0.15); color: #ca8a04; }
    .severity-low { background: rgba(101, 163, 13, 0.15); color: #65a30d; }

    blockquote {
      border-left: 3px solid var(--accent);
      margin: 0;
      padding: 0.75rem 0 0.75rem 1rem;
      color: var(--text);
      font-size: 0.9375rem;
      background: var(--accent-soft);
      border-radius: 0 8px 8px 0;
    }

    .screenshots {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .screenshot {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg);
    }

    .screenshot img {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Summary Section */
    .summary {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
    }

    .summary h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: ${isDark ? '#ffffff' : '#0f172a'};
      margin-bottom: 1.25rem;
    }

    .summary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .summary-table th,
    .summary-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .summary-table th {
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    .summary-table tbody tr:hover {
      background: var(--accent-soft);
    }

    .summary-table tfoot td {
      font-weight: 600;
      border-top: 2px solid var(--border);
      background: var(--bg-secondary);
    }

    /* Footer */
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.8125rem;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    /* Print Styles */
    @media print {
      body {
        background: white;
        color: black;
      }

      .container {
        max-width: 100%;
        padding: 1rem;
      }

      .feedback-item {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .screenshot img {
        max-height: 300px;
        object-fit: contain;
      }
    }

    /* Responsive */
    @media (max-width: 640px) {
      .container {
        padding: 1rem;
      }

      h1 {
        font-size: 1.5rem;
      }

      .feedback-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .feedback-id {
        align-self: flex-start;
      }

      .screenshots {
        grid-template-columns: 1fr;
      }
    }
  `;
}

// ============================================================================
// HTML Generator
// ============================================================================

function generateFeedbackItemHtml(item: FeedbackItem, index: number, includeImages: boolean): string {
  const id = `FB-${(index + 1).toString().padStart(3, '0')}`;
  const category = item.category || 'General';
  const severity = item.severity || 'Medium';

  let screenshotsHtml = '';
  if (includeImages && item.screenshots.length > 0) {
    const imagesHtml = item.screenshots
      .map((ss, ssIndex) => {
        // Try base64 field first, then convert buffer if available (SessionController.Screenshot)
        const ssAny = ss as unknown as { buffer?: Buffer; base64?: string };
        const base64Data = ssAny.base64
          || (ssAny.buffer instanceof Buffer ? ssAny.buffer.toString('base64') : null);

        if (base64Data) {
          // Strip data URI prefix if already present
          const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
          return `
            <div class="screenshot">
              <img src="data:image/png;base64,${cleanBase64}" alt="Screenshot ${ssIndex + 1}" loading="lazy" />
            </div>
          `;
        }
        return `
          <div class="screenshot">
            <div style="padding:2rem;text-align:center;color:var(--text-secondary);font-size:0.875rem;">Screenshot not available</div>
          </div>
        `;
      })
      .join('');

    screenshotsHtml = `<div class="screenshots">${imagesHtml}</div>`;
  }

  return `
    <article class="feedback-item">
      <div class="feedback-header">
        <h3 class="feedback-title">${generateTitle(item.transcription)}</h3>
        <span class="feedback-id">${id}</span>
      </div>
      <div class="tags">
        <span class="tag ${getCategoryClass(category as FeedbackCategory)}">${escapeHtml(category)}</span>
        <span class="tag ${getSeverityClass(severity as FeedbackSeverity)}">${escapeHtml(severity)}</span>
      </div>
      <blockquote>${escapeHtml(item.transcription)}</blockquote>
      ${screenshotsHtml}
    </article>
  `;
}

function generateSummaryTableHtml(session: Session): string {
  const categories = countByCategory(session);
  const rows = Object.entries(categories)
    .map(([category, count]) => `
      <tr>
        <td>${escapeHtml(category)}</td>
        <td>${count}</td>
      </tr>
    `)
    .join('');

  return `
    <table class="summary-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${session.feedbackItems.length + (session.metadata?.markedIssues?.length ?? 0)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function generateMarkedIssuesHtml(session: Session, includeImages: boolean): string {
  const issues = session.metadata?.markedIssues ?? [];
  if (issues.length === 0) return '';
  const cards = issues
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((issue) => {
      const displayId = `MX-${String(issue.ordinal).padStart(3, '0')}`;
      const comment = issue.comment
        || issue.transcriptionWarning
        || 'No narration was associated with this marked issue.';
      const evidence = includeImages && issue.screenshotPath
        ? `<div class="screenshots"><div class="screenshot"><img src="${escapeHtml(issue.screenshotPath)}" alt="Marked issue ${displayId}" loading="lazy" /></div></div>`
        : `<p>${escapeHtml(issue.evidenceWarning || 'No marked screenshot could be recovered for this issue.')}</p>`;
      return `
        <article class="feedback-item marked-issue" data-marked-issue-id="${escapeHtml(issue.id)}">
          <div class="feedback-header">
            <h3 class="feedback-title">Marked issue ${displayId}</h3>
            <span class="feedback-id">${displayId}</span>
          </div>
          <div class="tags"><span class="tag tag-ux">Marked Issue</span></div>
          <blockquote>${escapeHtml(comment)}</blockquote>
          ${evidence}
        </article>
      `;
    })
    .join('');
  return `<section class="marked-issues"><h2>Marked Issues</h2><div class="feedback-list">${cards}</div></section>`;
}

// ============================================================================
// Main Export Function
// ============================================================================

export function generateHtmlDocument(session: Session, options: HtmlExportOptions = {}): string {
  const {
    projectName = session.metadata?.sourceName || 'Project',
    includeImages = true,
    theme = 'dark',
    version,
  } = options;

  const duration = session.endTime
    ? formatDuration(session.endTime - session.startTime)
    : 'In Progress';
  const timestamp = formatTimestamp(session.endTime || Date.now());
  const screenshotCount = session.feedbackItems.reduce(
    (sum, item) => sum + item.screenshots.length,
    0
  ) + (session.metadata?.markedIssues ?? []).filter((issue) => Boolean(issue.screenshotPath)).length;
  const totalItemCount = session.feedbackItems.length + (session.metadata?.markedIssues?.length ?? 0);

  const feedbackItemsHtml = session.feedbackItems
    .map((item, index) => generateFeedbackItemHtml(item, index, includeImages))
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="MarkuprX">
  <meta name="theme-color" content="${theme === 'dark' ? '#0f172a' : '#ffffff'}">
  <title>${escapeHtml(projectName)} - Feedback Report</title>
  <style>${getStyles(theme)}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(projectName)} Feedback Report</h1>
      <div class="meta">
        <span class="meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          ${timestamp}
        </span>
        <span class="meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${duration}
        </span>
        <span class="meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          ${totalItemCount} items
        </span>
        <span class="meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          ${screenshotCount} screenshots
        </span>
      </div>
    </header>

    <main>
      ${generateMarkedIssuesHtml(session, includeImages)}
      <div class="feedback-list">
        ${feedbackItemsHtml}
      </div>

      <section class="summary">
        <h2>Summary</h2>
        ${generateSummaryTableHtml(session)}
      </section>
    </main>

    <footer>
      Generated by <a href="https://markuprx.com" target="_blank" rel="noopener">MarkuprX${version ? ` v${escapeHtml(version)}` : ''}</a> ·
      <a href="https://ko-fi.com/eddiesanjuan" target="_blank" rel="noopener">Support development</a>
    </footer>
  </div>
</body>
</html>`;
}
