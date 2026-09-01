/**
 * Tool: push_to_github
 *
 * Creates GitHub issues from a MarkuprX feedback report.
 * Each feedback item (FB-001, FB-002, etc.) becomes a separate issue
 * with labels, severity, and structured markdown body.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { stat } from 'fs/promises';
import { log } from '../utils/Logger.js';
import {
  resolveAuth,
  parseRepoString,
  pushToGitHub,
} from '../../integrations/github/GitHubIssueCreator.js';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand.js';

export function register(server: McpServer): void {
  server.tool(
    'push_to_github',
    'Returns created GitHub issue URLs and numbers, or a dry-run preview, with one issue per report finding.',
    {
      reportPath: z.string().describe(`Absolute path to the ${PUBLIC_BRAND_NAME} markdown report`),
      repo: z.string().describe('Target GitHub repository in "owner/repo" format'),
      token: z.string().optional().describe('GitHub token (falls back to GITHUB_TOKEN env or gh CLI)'),
      items: z.array(z.string()).optional().describe('Specific FB-XXX item IDs to push (default: all)'),
      dryRun: z.boolean().optional().default(false).describe('Preview what would be created without creating'),
    },
    async ({ reportPath, repo, token, items, dryRun }) => {
      try {
        // Validate report exists
        try {
          const stats = await stat(reportPath);
          if (!stats.isFile()) {
            return {
              content: [{ type: 'text' as const, text: `Error: Not a file: ${reportPath}` }],
              isError: true,
            };
          }
        } catch {
          return {
            content: [{ type: 'text' as const, text: `Error: Report not found: ${reportPath}` }],
            isError: true,
          };
        }

        // Parse repo
        let parsedRepo;
        try {
          parsedRepo = parseRepoString(repo);
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
            isError: true,
          };
        }

        // Resolve auth
        let auth;
        try {
          auth = await resolveAuth(token);
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
            isError: true,
          };
        }

        log(`Pushing to GitHub: ${repo} (auth: ${auth.source}, dryRun: ${dryRun})`);

        const result = await pushToGitHub({
          repo: parsedRepo,
          auth,
          reportPath,
          dryRun,
          items,
        });

        // Format output
        const lines: string[] = [];

        if (dryRun) {
          lines.push(`Dry run — ${result.created.length} issue(s) would be created:`);
          lines.push('');
          for (const issue of result.created) {
            lines.push(`  - ${issue.title}`);
          }
          if (result.labelsCreated.length > 0) {
            lines.push('');
            lines.push(`Labels to create: ${result.labelsCreated.join(', ')}`);
          }
        } else {
          lines.push(`Created ${result.created.length} issue(s):`);
          lines.push('');
          for (const issue of result.created) {
            lines.push(`  - #${issue.number}: ${issue.title}`);
            lines.push(`    ${issue.url}`);
          }
          if (result.labelsCreated.length > 0) {
            lines.push('');
            lines.push(`Labels created: ${result.labelsCreated.join(', ')}`);
          }
        }

        if (result.errors.length > 0) {
          lines.push('');
          lines.push(`Errors (${result.errors.length}):`);
          for (const err of result.errors) {
            lines.push(`  - ${err.itemId}: ${err.error}`);
          }
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
