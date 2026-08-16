# Contributing to MarkuprX

Thank you for your interest in contributing to MarkuprX! This document covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How the Pipeline Works](#how-the-pipeline-works)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Style Guide](#style-guide)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Please:

- Be respectful and considerate in all interactions
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Accept responsibility for mistakes and learn from them

## Getting Started

### Prerequisites

- **Node.js** 20.9+ (check with `node --version`)
- **npm** 9+ (comes with Node.js)
- **Git**
- **ffmpeg** -- required for frame extraction and audio processing
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: `choco install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/)
- A code editor (VS Code recommended)

**Optional:**
- **Whisper model** -- downloaded automatically on first run (~75MB for tiny, ~500MB for base)
- **OpenAI API key** -- for cloud transcription (configured in-app, not required for development)
- **Anthropic API key** -- for AI-enhanced analysis (configured in-app, not required for development)

### Setup

1. **Open an authorized source checkout**:
   ```bash
   cd markuprx
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development**:
   ```bash
   npm run dev
   ```

### Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development mode with hot reload |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint code |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | TypeScript type checking |
| `npm run build` | Build for production |

### Architecture Reference

See [CLAUDE.md](CLAUDE.md) for the most up-to-date architecture reference, including the full directory structure, key design decisions, and conventions. This file is also used by AI coding assistants (Claude Code, Cursor, etc.) for codebase context.

For detailed development setup and debugging instructions, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## How the Pipeline Works

Understanding the post-processing pipeline helps when contributing to any part of the codebase. When recording stops, four stages run in sequence:

1. **Transcribe** (`src/main/transcription/`) -- Audio is transcribed using local Whisper (or OpenAI API). Produces timestamped transcript segments.
2. **Analyze** (`src/main/pipeline/TranscriptAnalyzer.ts`) -- Transcript is analyzed to identify key moments, topic changes, and important observations using heuristic scoring.
3. **Extract** (`src/main/pipeline/FrameExtractor.ts`) -- ffmpeg extracts video frames at the exact timestamps of each key moment.
4. **Generate** (`src/main/output/MarkdownGenerator.ts`) -- Everything is stitched into a structured Markdown document with screenshots placed at the correct positions.

Each step degrades gracefully: if transcription fails, frame extraction still runs on a timer; if ffmpeg is missing, a transcript-only document is generated.

The pipeline orchestrator lives at `src/main/pipeline/PostProcessor.ts`.

## Development Workflow

### Branch Naming

Use descriptive branch names:

- `feature/add-pdf-export`
- `fix/hotkey-conflict`
- `docs/update-readme`
- `refactor/settings-panel`

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** following the [style guide](#style-guide)

3. **Test your changes**:
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

4. **Commit your changes** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat(export): add PDF export format"
   ```

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc.)
- `refactor`: Code change that neither fixes nor adds
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(export): add PDF export format
fix(hotkey): resolve conflict with system shortcuts
docs(readme): update installation instructions
refactor(settings): simplify settings manager
```

### Keeping Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Pull Request Process

### Before Submitting

Ensure your PR:

1. **Passes all tests**: `npm test`
2. **Passes linting**: `npm run lint`
3. **Passes type checking**: `npm run typecheck`
4. **Has been tested manually**
5. **Includes documentation updates** (if applicable)

### Submitting a PR

1. Push your branch: `git push origin feature/my-feature`
2. Open a Pull Request on GitHub
3. Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md) -- describe what the PR does, link related issues, and include screenshots for UI changes
4. Request review if not automatically assigned

### Review Process

1. Automated checks (CI) must pass
2. At least one maintainer must approve
3. All comments must be resolved
4. No merge conflicts with main

### After Merging

- Delete your branch
- Pull changes to your local main

## Style Guide

### TypeScript

- Use explicit types for function parameters and return values
- Use interfaces for object shapes
- Use `as const` assertions for literal objects
- Strict mode is enabled -- no `any` without justification

```typescript
// Use explicit types
function createSession(sourceId: string): Session {
  // ...
}

// Use interfaces for objects
interface SessionOptions {
  sourceId: string;
  sourceName?: string;
}

// Use const assertions for literals
const STATUS = {
  IDLE: 'idle',
  RECORDING: 'recording',
} as const;
```

### React

- Functional components only
- Named exports preferred
- Clean up effects with return functions

```tsx
export function SessionStatus({ state }: SessionStatusProps) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    return () => cleanup();
  }, []);

  return <div className="status">{state}</div>;
}
```

### CSS / Tailwind

- Use Tailwind utilities for styling
- Use `cn()` helper for conditional classes

```tsx
<div className={cn(
  "bg-gray-900 text-white p-4 rounded-lg",
  isActive && "ring-2 ring-blue-500",
  className
)}>
```

### Testing

- **Framework:** Vitest
- **Convention:** Test files mirror source structure in `tests/unit/`, `tests/integration/`, `tests/e2e/`
- **Expectation:** New features should include tests; bug fixes should include a regression test

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `SessionReview.tsx` |
| Hooks | camelCase, `use` prefix | `useSessionState.ts` |
| Utilities | camelCase | `formatTime.ts` |
| Types | PascalCase | `SessionState` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |

## Reporting Issues

### Before Reporting

1. **Search existing issues** for duplicates
2. **Try the latest version** -- the issue may already be fixed
3. **Collect information**: OS, MarkuprX version (visible in Settings footer), steps to reproduce, error messages or logs

### Filing a Bug

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when opening a new issue. Include your OS, MarkuprX version, and steps to reproduce.

### Requesting a Feature

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Describe the problem you're trying to solve, not just the solution you want.

## Questions?

- Check the [documentation](docs/)
- Visit [markuprx.com](https://markuprx.com) for current project information

Thank you for contributing to MarkuprX!
