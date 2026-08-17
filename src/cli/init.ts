/**
 * init.ts - Project initialization for markuprx CLI
 *
 * Creates a `.markuprx.json` config file in the current project directory
 * with sensible defaults. Also adds output directory to .gitignore.
 */

import { existsSync } from 'fs';
import { readFile, writeFile, appendFile } from 'fs/promises';
import { join, resolve } from 'path';
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand';

// ============================================================================
// Types
// ============================================================================

export interface MarkuprXConfig {
  /** Directory where markuprx writes feedback session output */
  outputDir: string;
  /** Default recording settings */
  recording: {
    /** Skip frame extraction by default */
    skipFrames: boolean;
    /** Output template name */
    template: string;
  };
  /** API key references (env var names, not the actual keys) */
  apiKeys: {
    /** Env var name for the Anthropic API key */
    anthropic: string;
    /** Legacy config entry retained for backward-compatible reads. */
    openai?: string;
  };
}

export interface InitOptions {
  /** Working directory to create config in (default: cwd) */
  directory: string;
  /** Output directory for sessions (default: ./markuprx-output) */
  outputDir: string;
  /** Whether to skip the .gitignore update */
  skipGitignore: boolean;
  /** Force overwrite existing config */
  force: boolean;
}

export interface InitResult {
  configPath: string;
  created: boolean;
  gitignoreUpdated: boolean;
  alreadyExists: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const CONFIG_FILENAME = '.markuprx.json';

// ============================================================================
// Default config
// ============================================================================

export function createDefaultConfig(outputDir: string): MarkuprXConfig {
  return {
    outputDir,
    recording: {
      skipFrames: false,
      template: 'markdown',
    },
    apiKeys: {
      anthropic: 'ANTHROPIC_API_KEY',
    },
  };
}

// ============================================================================
// Gitignore management
// ============================================================================

/**
 * Add the output directory and markuprx temp files to .gitignore.
 * Returns true if the file was updated, false if entries already existed.
 */
export async function updateGitignore(
  projectDir: string,
  outputDir: string,
): Promise<boolean> {
  const gitignorePath = join(projectDir, '.gitignore');
  const entriesToAdd = [outputDir, '.markuprx-watch.log'];

  let existingContent = '';
  if (existsSync(gitignorePath)) {
    existingContent = await readFile(gitignorePath, 'utf-8');
  }

  const lines = existingContent.split('\n');
  const missingEntries = entriesToAdd.filter(
    (entry) => !lines.some((line) => line.trim() === entry),
  );

  if (missingEntries.length === 0) {
    return false; // Already up to date
  }

  // Build the block to append
  const block = [
    '',
    `# ${PUBLIC_BRAND_NAME} output`,
    ...missingEntries,
    '',
  ].join('\n');

  await appendFile(gitignorePath, block, 'utf-8');
  return true;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize a markuprx project configuration.
 */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const projectDir = resolve(options.directory);
  const configPath = join(projectDir, CONFIG_FILENAME);

  // Check if config already exists
  if (existsSync(configPath) && !options.force) {
    return {
      configPath,
      created: false,
      gitignoreUpdated: false,
      alreadyExists: true,
    };
  }

  // Create config
  const config = createDefaultConfig(options.outputDir);
  const content = JSON.stringify(config, null, 2) + '\n';
  await writeFile(configPath, content, 'utf-8');

  // Update .gitignore
  let gitignoreUpdated = false;
  if (!options.skipGitignore) {
    try {
      gitignoreUpdated = await updateGitignore(projectDir, options.outputDir);
    } catch {
      // Non-critical -- don't fail init if gitignore update fails
    }
  }

  return {
    configPath,
    created: true,
    gitignoreUpdated,
    alreadyExists: false,
  };
}
