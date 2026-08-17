/**
 * Tool: push_to_linear
 *
 * Push a MarkuprX feedback report to Linear as structured issues.
 * Each feedback item becomes a Linear issue with priority, labels,
 * and full context from the original session.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { stat } from 'fs/promises';
import { LinearIssueCreator } from '../../integrations/linear/LinearIssueCreator.js';
import { log } from '../utils/Logger.js';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand.js';

export function register(server: McpServer): void {
  server.tool(
    'push_to_linear',
    `Push a ${PUBLIC_BRAND_NAME} feedback report to Linear. Creates one issue per feedback item with priority mapping, labels, and full context.`,
    {
      reportPath: z
        .string()
        .describe(`Absolute path to the ${PUBLIC_BRAND_NAME} markdown report`),
      teamKey: z
        .string()
        .describe('Linear team key (e.g., "ENG", "DES")'),
      token: z
        .string()
        .optional()
        .describe('Linear API key (or set LINEAR_API_KEY env var)'),
      projectName: z
        .string()
        .optional()
        .describe('Linear project name to assign issues to'),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe('Preview what would be created without actually creating issues'),
    },
    async ({ reportPath, teamKey, token, projectName, dryRun }) => {
      try {
        // Resolve token
        const apiToken = token || process.env.LINEAR_API_KEY;
        if (!apiToken) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No Linear API token provided. Pass via `token` parameter or set LINEAR_API_KEY env var.',
              },
            ],
            isError: true,
          };
        }

        // Validate report file
        try {
          const stats = await stat(reportPath);
          if (!stats.isFile() || stats.size === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Report file is empty or not a regular file: ${reportPath}`,
                },
              ],
              isError: true,
            };
          }
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Report file not found: ${reportPath}`,
              },
            ],
            isError: true,
          };
        }

        log(`Pushing report to Linear: ${reportPath} → team ${teamKey}`);

        const creator = new LinearIssueCreator(apiToken);
        const result = await creator.pushReport(reportPath, {
          token: apiToken,
          teamKey,
          projectName,
          dryRun,
        });

        const lines: string[] = [
          dryRun ? 'DRY RUN — no issues created' : 'Push to Linear complete',
          '',
          `Team: ${teamKey}`,
          `Total items: ${result.totalItems}`,
          `Created: ${result.created}`,
          `Failed: ${result.failed}`,
          '',
        ];

        for (const issue of result.issues) {
          if (issue.success) {
            lines.push(
              `  ${issue.identifier}: ${issue.issueUrl}`,
            );
          } else {
            lines.push(`  FAILED: ${issue.error}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
