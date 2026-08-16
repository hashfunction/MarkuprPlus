# Development Guide

This guide covers everything you need to know to develop markuprx.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Build System](#build-system)
- [Testing](#testing)
- [Debug Mode](#debug-mode)
- [Code Style](#code-style)
- [Making Changes](#making-changes)

## Prerequisites

### Required Software

- **Node.js**: 18.x or later
- **npm**: 9.x or later (comes with Node.js)
- **Git**: For version control

### Recommended

- **VS Code**: With recommended extensions
- **macOS**: For testing macOS-specific features
- **Windows (VM or machine)**: For testing Windows builds

### VS Code Extensions

Create `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

## Development Setup

### 1. Open the Source Checkout

```bash
cd markuprx
```

### 2. Install Dependencies

```bash
# npm
npm install

# bun
bun install
```

This installs:
- Electron and electron-vite
- React and React DOM
- TypeScript
- OpenAI SDK
- All other dependencies

### 3. Configure Environment

Create a `.env.local` file (optional, for development):

```bash
# Development API key (optional)
DEEPGRAM_API_KEY=your_dev_api_key

# Enable additional logging
DEBUG=markuprx:*
```

### 4. Start Development Server

```bash
# npm
npm run dev

# bun
bun run dev
```

This starts:
- Vite dev server for the renderer (hot reload)
- Electron in development mode
- DevTools automatically opens

### 5. Verify Setup

1. The markuprx window should open
2. Tray icon should appear
3. Press `Cmd+Shift+F` (or `Ctrl+Shift+F`)
4. If you see the window selector, setup is complete!

## Project Structure

```
markuprx/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Entry point, orchestration
│   │   ├── SessionController.ts # Session state machine
│   │   ├── HotkeyManager.ts     # Global hotkey registration
│   │   ├── TrayManager.ts       # System tray management
│   │   ├── MenuManager.ts       # Native menu bar
│   │   ├── AutoUpdater.ts       # Auto-update functionality
│   │   ├── CrashRecovery.ts     # Session recovery
│   │   ├── ErrorHandler.ts      # Error handling
│   │   ├── capture/             # Screen capture
│   │   │   ├── ScreenCapture.ts
│   │   │   └── IntelligentCapture.ts
│   │   ├── audio/               # Audio capture
│   │   │   └── AudioCapture.ts
│   │   ├── transcription/       # OpenAI integration
│   │   │   └── TranscriptionService.ts
│   │   ├── output/              # Document generation
│   │   │   ├── MarkdownGenerator.ts
│   │   │   ├── ExportService.ts
│   │   │   ├── FileManager.ts
│   │   │   └── ClipboardService.ts
│   │   ├── analysis/            # AI categorization
│   │   │   ├── FeedbackAnalyzer.ts
│   │   │   └── ClarificationGenerator.ts
│   │   └── settings/            # Settings management
│   │       └── SettingsManager.ts
│   │
│   ├── renderer/                # React UI
│   │   ├── main.tsx             # React entry point
│   │   ├── App.tsx              # Main component
│   │   ├── components/          # UI components
│   │   │   ├── RecordingOverlay.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── SessionReview.tsx
│   │   │   ├── WindowSelector.tsx
│   │   │   ├── KeyboardShortcuts.tsx
│   │   │   ├── ExportDialog.tsx
│   │   │   └── ...
│   │   ├── hooks/               # React hooks
│   │   │   ├── useAnimation.tsx
│   │   │   └── useTheme.ts
│   │   ├── styles/              # CSS and themes
│   │   │   ├── globals.css
│   │   │   ├── animations.css
│   │   │   └── theme.ts
│   │   └── audio/               # Renderer audio capture
│   │       └── AudioCaptureRenderer.ts
│   │
│   ├── preload/                 # Context bridge
│   │   └── index.ts             # Exposes API to renderer
│   │
│   └── shared/                  # Shared types
│       └── types.ts             # All TypeScript interfaces
│
├── tests/                       # Test files
│   └── output.test.ts
│
├── docs/                        # Documentation
│
├── electron-builder.yml         # Build configuration
├── tsconfig.json                # TypeScript config
├── vite.config.ts               # Vite configuration
├── tailwind.config.js           # Tailwind CSS config
└── package.json
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | Main process entry, orchestrates all services |
| `src/preload/index.ts` | Context bridge, defines renderer API |
| `src/shared/types.ts` | All TypeScript types and IPC channels |
| `src/renderer/App.tsx` | Main React component |

## Build System

markuprx uses [electron-vite](https://electron-vite.org/) for building.

### Configuration Files

- `electron.vite.config.ts`: Build configuration for main, preload, renderer
- `electron-builder.yml`: Packaging configuration

### Build Commands

```bash
# Development build
npm run build

# Production build
npm run build -- --mode production

# Package for current platform
npm run package

# Package for specific platforms
npm run package:mac
npm run package:win
npm run package:linux

# Package macOS without code signing (development)
npm run package:mac:unsigned

# Build and release
npm run release
```

### Build Output

```
dist/
├── main/           # Compiled main process
├── preload/        # Compiled preload script
└── renderer/       # Compiled React app

release/            # Packaged applications
├── markuprx-0.4.0.dmg
├── markuprx-0.4.0-arm64.dmg
├── markuprx Setup 0.4.0.exe
└── markuprx_0.4.0_amd64.deb
```

## Testing

markuprx uses [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/output.test.ts
```

### Test Structure

```
tests/
├── unit/           # Unit tests for individual modules
├── integration/    # Integration tests
└── e2e/            # End-to-end tests
```

### Writing Tests

```typescript
// tests/output.test.ts
import { describe, it, expect } from 'vitest';

describe('OutputManager', () => {
  it('should generate markdown from a session', () => {
    const session = createMockSession();
    const output = outputManager.generateMarkdown(session);

    expect(output.markdown).toContain('# Feedback Session');
    expect(output.screenshots).toHaveLength(1);
  });
});
```

### Mocking Electron APIs

Since many features rely on Electron APIs, use mocks:

```typescript
import { vi } from 'vitest';

// Mock clipboard
vi.mock('electron', () => ({
  clipboard: {
    writeText: vi.fn(),
  },
}));
```

## Debug Mode

### Enabling Debug Mode

1. Open Settings (`Cmd+,` or `Ctrl+,`)
2. Go to Advanced > Debug Mode
3. Enable the toggle

Or set in environment:

```bash
DEBUG=markuprx:* npm run dev
```

### DevTools

In development mode, DevTools opens automatically. In production:

1. Open from View menu (if enabled)
2. Or use `Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Windows)

### Logging

Main process logs appear in the terminal:

```
[Main] App ready, starting initialization...
[Main] Settings loaded
[Main] Session controller initialized
[Main] Transcription service configured
[Main] markuprx initialization complete
```

Renderer logs appear in DevTools console.

### Debug Environment Variables

```bash
# Enable all debug output
DEBUG=markuprx:*

# Enable specific modules
DEBUG=markuprx:transcription,markuprx:capture

# Verbose Electron logs
ELECTRON_ENABLE_LOGGING=1
```

## Code Style

### TypeScript

- Use explicit types for function parameters and returns
- Prefer interfaces over types for objects
- Use `const assertions` for literal types

```typescript
// Good
function createSession(sourceId: string): Session {
  return { id: generateId(), sourceId };
}

// Avoid
function createSession(sourceId) {
  return { id: generateId(), sourceId };
}
```

### React

- Use functional components with hooks
- Prefer named exports
- Keep components focused and small

```tsx
// Good
export function SessionStatus({ state }: SessionStatusProps) {
  return <div className="status">{state}</div>;
}

// Avoid
export default class SessionStatus extends Component {
  render() {
    return <div className="status">{this.props.state}</div>;
  }
}
```

### CSS

- Use Tailwind CSS utilities
- Avoid custom CSS when Tailwind suffices
- Use CSS variables for theming

```tsx
// Good
<div className="bg-gray-900 text-white p-4 rounded-lg">

// Avoid
<div style={{ backgroundColor: '#111827', color: 'white', padding: 16 }}>
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix

# Type checking
npm run typecheck
```

### ESLint Configuration

The project uses:
- `@typescript-eslint/eslint-plugin`
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
```

### 2. Make Changes

Follow the code style guidelines.

### 3. Test Locally

```bash
npm test
npm run lint
npm run typecheck
```

### 4. Test the Build

```bash
npm run build
npm run package
```

### 5. Commit

Follow conventional commits:

```bash
git commit -m "feat: add new export format"
git commit -m "fix: resolve screenshot timing issue"
git commit -m "docs: update API documentation"
```

### 6. Push and Create PR

```bash
git push origin feature/my-feature
```

Then create a Pull Request on GitHub.

### Common Changes

#### Adding a New Setting

1. Add to `AppSettings` in `src/shared/types.ts`
2. Add default in `DEFAULT_SETTINGS`
3. Add UI in `src/renderer/components/SettingsPanel.tsx`
4. Handle in `SettingsManager` if special logic needed

#### Adding a New IPC Channel

1. Add channel name to `IPC_CHANNELS` in `src/shared/types.ts`
2. Add handler in `src/main/index.ts`
3. Add API method in `src/preload/index.ts`
4. Add types for payloads

#### Adding a New Component

1. Create file in `src/renderer/components/`
2. Export from `src/renderer/components/index.ts`
3. Import where needed
4. Add any new hooks to `src/renderer/hooks/`

### Troubleshooting Development

**Hot reload not working**:
- Check if Vite server is running
- Clear `.vite` cache folder
- Restart `npm run dev`

**TypeScript errors**:
- Run `npm run typecheck`
- Ensure types are exported from shared
- Check for circular dependencies

**Electron errors**:
- Check main process terminal output
- Look for native module issues
- Rebuild native modules: `npm run postinstall`

**Native modules failing**:
```bash
# Rebuild for Electron
npx electron-rebuild
```
