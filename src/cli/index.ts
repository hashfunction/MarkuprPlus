/**
 * MarkuprX CLI - Analyze screen recordings from the command line
 *
 * Usage:
 *   markuprx analyze <video-file> [options]
 *   markuprx doctor
 *   markuprx init
 *
 * Processes a video recording through the MarkuprX pipeline:
 *   1. Extract audio from video (or use a separate audio file)
 *   2. Transcribe with local Whisper
 *   3. Detect key moments in transcript
 *   4. Extract video frames at key timestamps
 *   5. Generate structured Markdown report
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { Command } from 'commander';
import {
  CLIPipeline,
  CLIPipelineError,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  EXIT_SYSTEM_ERROR,
  EXIT_SIGINT,
} from './CLIPipeline';
import { WatchMode } from './WatchMode';
import { runDoctorChecks } from './doctor';
import { runInit, CONFIG_FILENAME } from './init';
import { templateRegistry } from '../main/output/templates/index';
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand';
import { registerBridgeCommand } from '../bridge/BridgeCommand';

// Read version from package.json at build time (injected by esbuild)
declare const __MARKUPRX_VERSION__: string;
const VERSION = typeof __MARKUPRX_VERSION__ !== 'undefined' ? __MARKUPRX_VERSION__ : '0.0.0-dev';

// ============================================================================
// Console output helpers
// ============================================================================

const SYMBOLS = {
  check: '\u2714',    // checkmark
  cross: '\u2718',    // cross
  arrow: '\u2192',    // right arrow
  bullet: '\u2022',   // bullet
  ellipsis: '\u2026', // ellipsis
  line: '\u2500',     // horizontal line
  warn: '\u26A0',     // warning sign
} as const;

function banner(): void {
  console.log();
  console.log(`  ${PUBLIC_BRAND_NAME} v${VERSION} ${SYMBOLS.bullet} CLI Mode`);
  console.log(`  ${SYMBOLS.line.repeat(40)}`);
  console.log();
}

function step(message: string): void {
  console.log(`  ${SYMBOLS.arrow} ${message}`);
}

function success(message: string): void {
  console.log(`  ${SYMBOLS.check} ${message}`);
}

function fail(message: string): void {
  console.log(`  ${SYMBOLS.cross} ${message}`);
}

function warn(message: string): void {
  console.log(`  ${SYMBOLS.warn} ${message}`);
}

// ============================================================================
// Signal handling
// ============================================================================

let activePipeline: CLIPipeline | null = null;

function setupSignalHandlers(): void {
  const handler = async () => {
    console.log('\n  Interrupted \u2014 cleaning up...');
    if (activePipeline) {
      await activePipeline.abort();
    }
    process.exit(EXIT_SIGINT);
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}

setupSignalHandlers();

// ============================================================================
// CLI definition
// ============================================================================

const program = new Command();

program
  .name('markuprx')
  .description('Analyze screen recordings and generate AI-ready Markdown reports')
  .version(VERSION, '-v, --version')
  .showHelpAfterError('(use --help for available options)');

program
  .command('analyze')
  .description('Analyze a video recording and generate a structured feedback report')
  .argument('<video-file>', 'Path to the video file to analyze')
  .option('--audio <file>', 'Separate audio file (if not embedded in video)')
  .option('--output <dir>', 'Output directory', './markuprx-output')
  .option('--whisper-model <path>', 'Path to Whisper model file')
  .option('--openai-key <key>', 'OpenAI API key for cloud transcription (prefer OPENAI_API_KEY env var)')
  .option('--no-frames', 'Skip frame extraction')
  .option('--template <name>', `Output template (${templateRegistry.list().join(', ')})`, 'markdown')
  .option('--verbose', 'Verbose output', false)
  .action(async (videoFile: string, options: {
    audio?: string;
    output: string;
    whisperModel?: string;
    openaiKey?: string;
    frames: boolean;
    template: string;
    verbose: boolean;
  }) => {
    banner();
    const videoPath = resolve(videoFile);
    const outputDir = resolve(options.output);
    const audioPath = options.audio ? resolve(options.audio) : undefined;
    const whisperModelPath = options.whisperModel ? resolve(options.whisperModel) : undefined;
    let openaiKey: string | undefined;
    if (options.openaiKey) {
      console.warn('  WARNING: Passing API keys via CLI args is insecure (visible in ps, shell history).');
      console.warn('  Use OPENAI_API_KEY env var instead.');
      console.warn();
      openaiKey = options.openaiKey;
    } else if (process.env.OPENAI_API_KEY) {
      openaiKey = process.env.OPENAI_API_KEY;
    }
    if (!existsSync(videoPath)) {
      fail(`Video file not found: ${videoPath}`);
      process.exit(EXIT_USER_ERROR);
    }
    if (audioPath && !existsSync(audioPath)) {
      fail(`Audio file not found: ${audioPath}`);
      process.exit(EXIT_USER_ERROR);
    }
    if (whisperModelPath && !existsSync(whisperModelPath)) {
      fail(`Whisper model not found: ${whisperModelPath}`);
      process.exit(EXIT_USER_ERROR);
    }
    step(`Video:  ${videoPath}`);
    if (audioPath) {
      step(`Audio:  ${audioPath}`);
    }
    step(`Output: ${outputDir}`);
    console.log();
    if (!templateRegistry.has(options.template)) {
      fail(`Unknown template "${options.template}". Available: ${templateRegistry.list().join(', ')}`);
      process.exit(EXIT_USER_ERROR);
    }
    if (options.template !== 'markdown') {
      step(`Template: ${options.template}`);
    }
    const pipeline = new CLIPipeline(
      {
        videoPath,
        audioPath,
        outputDir,
        whisperModelPath,
        openaiKey,
        skipFrames: !options.frames,
        template: options.template,
        verbose: options.verbose,
      },
      options.verbose ? step : () => {},
      step,
    );
    activePipeline = pipeline;
    try {
      step('Starting analysis pipeline...');
      console.log();
      const result = await pipeline.run();
      if (result.transcriptSegments === 0 && result.extractedFrames === 0) {
        console.log();
        fail('Analysis produced no output (no transcript, no frames).');
        console.log('  Possible causes:');
        console.log('  - Video has no audio track (provide --audio <file>)');
        console.log('  - Whisper model not installed (check --whisper-model)');
        console.log('  - ffmpeg not installed (brew install ffmpeg)');
        process.exit(EXIT_USER_ERROR);
      }
      console.log();
      success('Analysis complete!');
      console.log();
      console.log(`  Transcript segments: ${result.transcriptSegments}`);
      console.log(`  Extracted frames:    ${result.extractedFrames}`);
      console.log(`  Processing time:     ${result.durationSeconds.toFixed(1)}s`);
      console.log();
      console.log(`  Output: ${result.outputPath}`);
      console.log(`OUTPUT:${result.outputPath}`);
      console.log();
    } catch (error) {
      console.log();
      const message = error instanceof Error ? error.message : String(error);
      fail(`Analysis failed: ${message}`);
      if (options.verbose && error instanceof Error && error.stack) {
        console.log();
        console.log(error.stack);
      }
      const exitCode =
        error instanceof CLIPipelineError && error.severity === 'user'
          ? EXIT_USER_ERROR
          : EXIT_SYSTEM_ERROR;
      process.exit(exitCode);
    } finally {
      activePipeline = null;
    }
  });

registerBridgeCommand(program, { bridgeVersion: VERSION });

// ============================================================================
// watch command
// ============================================================================

program
  .command('watch')
  .description('Watch a directory for new recordings and auto-process them')
  .argument('[directory]', 'Directory to watch for recordings', '.')
  .option('--output <dir>', 'Output directory (default: <watched-dir>/markuprx-output)')
  .option('--whisper-model <path>', 'Path to Whisper model file')
  .option('--openai-key <key>', 'OpenAI API key for cloud transcription (prefer OPENAI_API_KEY env var)')
  .option('--no-frames', 'Skip frame extraction')
  .option('--verbose', 'Verbose output', false)
  .action(async (directory: string, options: {
    output?: string;
    whisperModel?: string;
    openaiKey?: string;
    frames: boolean;
    verbose: boolean;
  }) => {
    banner();
    const watchDir = resolve(directory);
    let openaiKey: string | undefined;
    if (options.openaiKey) {
      console.warn('  WARNING: Passing API keys via CLI args is insecure (visible in ps, shell history).');
      console.warn('  Use OPENAI_API_KEY env var instead.');
      console.warn();
      openaiKey = options.openaiKey;
    } else if (process.env.OPENAI_API_KEY) {
      openaiKey = process.env.OPENAI_API_KEY;
    }
    if (!existsSync(watchDir)) {
      fail(`Directory not found: ${watchDir}`);
      process.exit(EXIT_USER_ERROR);
    }
    const watchMode = new WatchMode(
      {
        watchDir,
        outputDir: options.output ? resolve(options.output) : undefined,
        whisperModelPath: options.whisperModel ? resolve(options.whisperModel) : undefined,
        openaiKey,
        skipFrames: !options.frames,
        verbose: options.verbose,
      },
      {
        onLog: step,
        onFileDetected: (filePath) => {
          step(`Detected: ${filePath}`);
        },
        onProcessingStart: (filePath) => {
          console.log();
          step(`Processing: ${filePath}`);
        },
        onProcessingComplete: (filePath, outputPath) => {
          success(`Done: ${filePath}`);
          step(`Output: ${outputPath}`);
        },
        onProcessingError: (filePath, error) => {
          fail(`Failed: ${filePath} \u2014 ${error.message}`);
        },
      }
    );
    const shutdown = () => {
      console.log('\n  Stopping watcher...');
      watchMode.stop();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    step(`Watching for recordings in: ${watchDir}`);
    step('Press Ctrl+C to stop');
    console.log();
    try {
      await watchMode.start();
      success('Watch mode stopped.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`Watch mode error: ${message}`);
      process.exit(EXIT_SYSTEM_ERROR);
    }
  });

// ============================================================================
// doctor command
// ============================================================================

program
  .command('doctor')
  .description(`Check your environment for ${PUBLIC_BRAND_NAME} dependencies and configuration`)
  .action(async () => {
    banner();
    step('Checking environment...');
    console.log();
    const result = await runDoctorChecks();
    for (const check of result.checks) {
      if (check.status === 'pass') {
        success(`${check.name}: ${check.message}`);
      } else if (check.status === 'warn') {
        warn(`${check.name}: ${check.message}`);
      } else {
        fail(`${check.name}: ${check.message}`);
      }
      if (check.hint) {
        for (const line of check.hint.split('\n')) {
          console.log(`      ${line}`);
        }
      }
    }
    console.log();
    console.log(`  ${SYMBOLS.line.repeat(40)}`);
    console.log(`  ${result.passed} passed, ${result.warned} warnings, ${result.failed} failed`);
    console.log();
    if (result.failed > 0) {
      fail(`Some required checks failed. Fix them to use ${PUBLIC_BRAND_NAME}.`);
      process.exit(EXIT_USER_ERROR);
    } else if (result.warned > 0) {
      success(`${PUBLIC_BRAND_NAME} is ready (some optional features are not configured).`);
    } else {
      success(`${PUBLIC_BRAND_NAME} is fully configured and ready to go!`);
    }
    console.log();
  });

// ============================================================================
// init command
// ============================================================================

program
  .command('init')
  .description(`Create a ${PUBLIC_BRAND_NAME} project config file (.markuprx.json) in the current project`)
  .option('--output <dir>', 'Output directory for feedback sessions', './markuprx-output')
  .option('--no-gitignore', 'Skip updating .gitignore')
  .option('--force', 'Overwrite existing config file', false)
  .action(async (options: {
    output: string;
    gitignore: boolean;
    force: boolean;
  }) => {
    banner();
    const result = await runInit({
      directory: process.cwd(),
      outputDir: options.output,
      skipGitignore: !options.gitignore,
      force: options.force,
    });
    if (result.alreadyExists) {
      warn(`${CONFIG_FILENAME} already exists at ${result.configPath}`);
      console.log('      Use --force to overwrite.');
      console.log();
      process.exit(EXIT_USER_ERROR);
    }
    success(`Created ${result.configPath}`);
    if (result.gitignoreUpdated) {
      success(`Updated .gitignore with ${PUBLIC_BRAND_NAME} output directory`);
    }
    console.log();
    step('Next steps:');
    console.log('    1. Run `markuprx doctor` to verify your environment');
    console.log(`    2. Record a session with the ${PUBLIC_BRAND_NAME} desktop app or screen recorder`);
    console.log('    3. Run `markuprx analyze <video-file>` to generate a feedback report');
    console.log();
  });

// ============================================================================
// push command group
// ============================================================================

const pushCmd = program
  .command('push')
  .description('Push feedback to external services');

// ============================================================================
// push linear command
// ============================================================================

pushCmd
  .command('linear')
  .description(`Create Linear issues from a ${PUBLIC_BRAND_NAME} feedback report`)
  .argument('<report>', `Path to the ${PUBLIC_BRAND_NAME} markdown report`)
  .requiredOption('--team <key>', 'Linear team key (e.g., ENG, DES)')
  .option('--token <token>', 'Linear API key (prefer LINEAR_API_KEY env var)')
  .option('--project <name>', 'Linear project name to assign issues to')
  .option('--dry-run', 'Show what would be created without creating anything', false)
  .action(async (report: string, options: {
    team: string;
    token?: string;
    project?: string;
    dryRun: boolean;
  }) => {
    banner();
    const reportPath = resolve(report);
    if (!existsSync(reportPath)) {
      fail(`Report file not found: ${reportPath}`);
      process.exit(EXIT_USER_ERROR);
    }
    if (options.token) {
      console.warn('  WARNING: Passing tokens via CLI args is insecure (visible in ps, shell history).');
      console.warn('  Use LINEAR_API_KEY env var instead.');
      console.warn();
    }
    const apiToken = options.token || process.env.LINEAR_API_KEY;
    if (!apiToken) {
      fail('No Linear API token found.');
      console.log('  Provide via --token flag or LINEAR_API_KEY env var.');
      process.exit(EXIT_USER_ERROR);
    }
    const { LinearIssueCreator } = await import(
      '../integrations/linear/LinearIssueCreator'
    );
    try {
      step(`Report: ${reportPath}`);
      step(`Team:   ${options.team}`);
      if (options.project) {
        step(`Project: ${options.project}`);
      }
      if (options.dryRun) {
        step('Mode:   DRY RUN');
      }
      console.log();
      step('Parsing feedback report...');
      const creator = new LinearIssueCreator(apiToken);
      const result = await creator.pushReport(reportPath, {
        token: apiToken,
        teamKey: options.team,
        projectName: options.project,
        dryRun: options.dryRun,
      });
      console.log();
      if (options.dryRun) {
        success(`Dry run complete \u2014 ${result.created} issue(s) would be created:`);
        console.log();
        for (const issue of result.issues) {
          if (issue.success) {
            step(`${issue.identifier}: ${issue.issueUrl}`);
          }
        }
      } else {
        success(`Created ${result.created} issue(s):`);
        console.log();
        for (const issue of result.issues) {
          if (issue.success) {
            step(`${issue.identifier}: ${issue.issueUrl}`);
          }
        }
      }
      if (result.failed > 0) {
        console.log();
        fail(`${result.failed} error(s):`);
        for (const issue of result.issues) {
          if (!issue.success) {
            fail(`  ${issue.error}`);
          }
        }
      }
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(message);
      process.exit(EXIT_USER_ERROR);
    }
  });

// ============================================================================
// push github command
// ============================================================================

pushCmd
  .command('github')
  .description(`Create GitHub issues from a ${PUBLIC_BRAND_NAME} feedback report`)
  .argument('<report>', `Path to the ${PUBLIC_BRAND_NAME} markdown report`)
  .requiredOption('--repo <owner/repo>', 'Target GitHub repository (e.g., myorg/myapp)')
  .option('--token <token>', 'GitHub token (prefer GITHUB_TOKEN env var or gh auth login)')
  .option('--items <ids...>', 'Specific FB-XXX item IDs to push (default: all)')
  .option('--dry-run', 'Show what would be created without creating anything', false)
  .action(async (report: string, options: {
    repo: string;
    token?: string;
    items?: string[];
    dryRun: boolean;
  }) => {
    banner();
    const reportPath = resolve(report);
    if (!existsSync(reportPath)) {
      fail(`Report file not found: ${reportPath}`);
      process.exit(EXIT_USER_ERROR);
    }
    if (options.token) {
      console.warn('  WARNING: Passing tokens via CLI args is insecure (visible in ps, shell history).');
      console.warn('  Use GITHUB_TOKEN env var or `gh auth login` instead.');
      console.warn();
    }
    const { resolveAuth, parseRepoString, pushToGitHub } = await import(
      '../integrations/github/GitHubIssueCreator'
    );
    try {
      const parsedRepo = parseRepoString(options.repo);
      const auth = await resolveAuth(options.token);
      step(`Report: ${reportPath}`);
      step(`Repo:   ${parsedRepo.owner}/${parsedRepo.repo}`);
      step(`Auth:   ${auth.source}`);
      if (options.dryRun) {
        step('Mode:   DRY RUN');
      }
      console.log();
      step('Parsing feedback report and creating issues...');
      const result = await pushToGitHub({
        repo: parsedRepo,
        auth,
        reportPath,
        dryRun: options.dryRun,
        items: options.items,
      });
      console.log();
      if (options.dryRun) {
        success(`Dry run complete \u2014 ${result.created.length} issue(s) would be created:`);
        console.log();
        for (const issue of result.created) {
          step(`  ${issue.title}`);
        }
      } else {
        success(`Created ${result.created.length} issue(s):`);
        console.log();
        for (const issue of result.created) {
          step(`#${issue.number}: ${issue.title}`);
          step(`  ${issue.url}`);
        }
      }
      if (result.labelsCreated.length > 0) {
        console.log();
        step(`Labels created: ${result.labelsCreated.join(', ')}`);
      }
      if (result.errors.length > 0) {
        console.log();
        fail(`${result.errors.length} error(s):`);
        for (const err of result.errors) {
          fail(`  ${err.itemId}: ${err.error}`);
        }
      }
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(message);
      process.exit(EXIT_USER_ERROR);
    }
  });

// Show help if no command provided
if (process.argv.length <= 2) {
  banner();
  program.outputHelp();
  process.exit(EXIT_SUCCESS);
}

await program.parseAsync();
