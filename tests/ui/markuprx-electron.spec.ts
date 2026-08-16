import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import axe from 'axe-core';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  createElectronHarnessEnvironment,
  type ElectronHarnessEnvironment,
} from '../fixtures/electronHarness';

const applicationRoot = resolve(import.meta.dirname, '../..');

interface InputSequence {
  next(options?: {
    modifierDown?: boolean;
    primaryDown?: boolean;
    cursor?: { x: number; y: number };
  }): Promise<void>;
}

async function launchApplication(
  harness: ElectronHarnessEnvironment,
): Promise<{ application: ElectronApplication; mainWindow: Page }> {
  const application = await electron.launch({
    args: [applicationRoot, `--user-data-dir=${harness.userDataDir}`],
    env: harness.env,
  });
  const record = (source: string, value: unknown) => {
    harness.logs.push(`[${source}] ${String(value).trimEnd()}`);
    if (harness.logs.length > 1_000) harness.logs.shift();
  };
  const process = application.process();
  process.stdout?.on('data', (chunk) => record('main:stdout', chunk));
  process.stderr?.on('data', (chunk) => record('main:stderr', chunk));
  const wireRendererLogs = (page: Page) => {
    page.on('console', (message) => record(`renderer:${message.type()}`, message.text()));
    page.on('pageerror', (error) => record('renderer:pageerror', error.stack || error.message));
  };
  application.on('window', wireRendererLogs);
  const mainWindow = await application.firstWindow();
  wireRendererLogs(mainWindow);
  return { application, mainWindow };
}

async function selectDeterministicWindow(
  application: ElectronApplication,
  mainWindow: Page,
): Promise<Page> {
  const selectorPromise = application.waitForEvent('window');
  await mainWindow.getByRole('button', { name: /start session/i }).click();
  const selector = await selectorPromise;
  await expect(selector.getByRole('main', { name: 'Choose what MarkuprX should record' }))
    .toBeVisible();
  await expect(selector.getByRole('button', { name: /Window/ }))
    .toHaveAttribute('aria-pressed', 'true');

  const annotationPromise = application.waitForEvent('window');
  await selector.mouse.click(120, 120).catch((error) => {
    // A successful selection intentionally destroys this window. Depending on
    // scheduling, Playwright can observe that before its synthetic mouseup.
    if (!selector.isClosed()) throw error;
  });
  const annotation = await annotationPromise;
  await expect(annotation.getByRole('main', { name: 'Live recording annotation layer' }))
    .toBeVisible();
  await expect(mainWindow.getByRole('status', { name: 'Recording in progress' })).toBeVisible();
  return annotation;
}

function createInputSequence(mainWindow: Page): InputSequence {
  let sequence = 0;
  return {
    async next(options = {}) {
      sequence += 1;
      const result = await mainWindow.evaluate(async ({ sample }) => {
        if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
        return window.markuprx.e2e.injectInput(sample);
      }, {
        sample: {
          sequence,
          modifierDown: options.modifierDown ?? false,
          primaryDown: options.primaryDown ?? false,
          cursor: options.cursor ?? { x: 240, y: 220 },
          capturedAt: Date.now(),
        },
      });
      expect(result).toEqual({ success: true });
    },
  };
}

async function diagnostics(mainWindow: Page): Promise<{
  state: string;
  markedIssueCount: number;
  pendingMarkedIssue: boolean;
}> {
  return mainWindow.evaluate(async () => {
    if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
    return window.markuprx.e2e.getDiagnostics();
  });
}

async function drawStroke(
  annotation: Page,
  start: { x: number; y: number } = { x: 180, y: 180 },
  end: { x: number; y: number } = { x: 360, y: 220 },
): Promise<void> {
  await annotation.mouse.move(start.x, start.y);
  await annotation.mouse.down();
  await annotation.mouse.move((start.x + end.x) / 2, end.y + 40, { steps: 8 });
  await annotation.mouse.move(end.x, end.y, { steps: 8 });
  await annotation.mouse.up();
}

async function cancelActiveSession(mainWindow: Page): Promise<void> {
  const result = await mainWindow.evaluate(() => window.markuprx.session.cancel());
  expect(result).toEqual({ success: true });
  await expect.poll(async () => (await diagnostics(mainWindow)).state).toBe('idle');
  await expect(mainWindow.getByRole('button', { name: /start session/i })).toBeVisible();
}

async function drawAndCommitIssue(options: {
  annotation: Page;
  mainWindow: Page;
  input: InputSequence;
  ordinal: number;
  tool: 'Pen' | 'Circle' | 'Highlight';
  color: string;
  comment: string;
}): Promise<void> {
  const { annotation, mainWindow, input, ordinal, tool, color, comment } = options;
  await input.next({ modifierDown: true });

  const tools = annotation.getByRole('region', { name: 'Annotation tools' });
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: tool, exact: true }).click();
  await tools.getByRole('button', { name: `Use ${color}` }).click();

  const offset = (ordinal - 1) * 45;
  await drawStroke(
    annotation,
    { x: 180 + offset, y: 180 },
    { x: 360 + offset, y: 190 },
  );

  await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(true);
  await input.next({ modifierDown: false });
  await expect(tools).toBeHidden();
  await expect(mainWindow.getByText('Marked area ready · click to save and continue')).toBeVisible();

  const injected = await mainWindow.evaluate(async ({ text, recordedAt }) => {
    if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
    return window.markuprx.e2e.injectTranscript(text, recordedAt);
  }, { text: comment, recordedAt: Date.now() });
  expect(injected).toEqual({ success: true });

  // The synthetic final transcript uses the same duration estimate as production.
  // Keep its midpoint inside this issue's completion window with scheduling margin.
  const wordCount = comment.trim().split(/\s+/).length;
  const estimatedDurationMs = Math.min(3, Math.max(1, wordCount * 0.35)) * 1_000;
  await mainWindow.waitForTimeout(estimatedDurationMs / 2 + 400);
  await input.next({ primaryDown: true });
  await input.next({ primaryDown: false });

  await expect.poll(async () => (await diagnostics(mainWindow)).markedIssueCount).toBe(ordinal);
  await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(false);
  await expect(mainWindow.getByText(`${ordinal} ${ordinal === 1 ? 'issue' : 'issues'}`, { exact: true }))
    .toBeVisible();
}

async function findOnlySessionDirectory(outputRoot: string): Promise<string> {
  const entries = await readdir(outputRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  expect(directories).toHaveLength(1);
  return join(outputRoot, directories[0].name);
}

function markedIssueSection(report: string, ordinal: number): string {
  const heading = `### MX-${String(ordinal).padStart(3, '0')}`;
  const start = report.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const followingHeading = report.indexOf('\n### MX-', start + heading.length);
  const followingSection = report.indexOf('\n## ', start + heading.length);
  const possibleEnds = [followingHeading, followingSection].filter((value) => value >= 0);
  return report.slice(start, possibleEnds.length > 0 ? Math.min(...possibleEnds) : undefined);
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

async function seriousAccessibilityViolations(page: Page): Promise<unknown[]> {
  await page.evaluate(axe.source);
  return page.evaluate(async () => {
    const axeRuntime = (globalThis as typeof globalThis & {
      axe?: { run(root: Document): Promise<{ violations: Array<{
        id: string;
        impact: string | null;
        nodes: Array<{ target: unknown; failureSummary?: string }>;
      }> }> };
    }).axe;
    if (!axeRuntime) throw new Error('axe-core did not load in the renderer.');
    const results = await axeRuntime.run(document);
    return results.violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          failureSummary: node.failureSummary,
        })),
      }));
  });
}

test.describe('MarkuprX desktop application', () => {
  let application: ElectronApplication | null = null;
  let harness: ElectronHarnessEnvironment;

  test.beforeEach(async () => {
    harness = await createElectronHarnessEnvironment();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      if (harness.logs.length > 0) {
        await testInfo.attach('electron.log', {
          body: Buffer.from(`${harness.logs.join('\n')}\n`),
          contentType: 'text/plain',
        });
      }
      const sessionEntries = await readdir(harness.outputRoot, { withFileTypes: true })
        .catch(() => []);
      const diagnosticFiles = [
        ['metadata.json', 'application/json'],
        ['feedback-report.md', 'text/markdown'],
        ['processing-trace.json', 'application/json'],
      ] as const;

      for (const entry of sessionEntries.filter((candidate) => candidate.isDirectory())) {
        for (const [filename, contentType] of diagnosticFiles) {
          const body = await readFile(join(harness.outputRoot, entry.name, filename))
            .catch(() => null);
          if (body) {
            await testInfo.attach(`${entry.name}-${filename}`, { body, contentType });
          }
        }
      }
    }
    await application?.close().catch(() => {});
    application = null;
    await harness.cleanup();
  });

  test('launches MarkuprX and shows the idle capture action', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await expect(window).toHaveTitle(/MarkuprX/);
    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('guides first-run users through multi-issue annotation and remembers completion', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ showOnboarding: true });
    let launched = await launchApplication(harness);
    application = launched.application;
    let window = launched.mainWindow;

    const wizard = window.getByRole('dialog', { name: 'Setup wizard' });
    await expect(wizard).toBeVisible();
    const welcomeHeading = window.getByRole('heading', { name: 'Welcome to MarkuprX' });
    await expect(welcomeHeading).toBeVisible();
    await expect.poll(() => welcomeHeading.evaluate((element) =>
      getComputedStyle(element.parentElement!).opacity)).toBe('1');
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await window.getByRole('button', { name: 'Get Started' }).click();
    await expect(window.getByRole('heading', { name: 'Microphone Access' })).toBeVisible();
    await window.getByRole('button', { name: 'Continue' }).click();
    await expect(window.getByRole('heading', { name: 'Screen Recording' })).toBeVisible();
    await window.getByRole('button', { name: 'Continue' }).click();
    await window.getByRole('button', { name: /Skip for now/ }).click();
    await window.getByRole('button', { name: /Skip — configure report generation later/ }).click();

    await expect(window.getByRole('heading', { name: /You're All Set!/ })).toBeVisible();
    await expect(window.getByText(/Hold Command \(⌘\) and drag to mark the current screen/))
      .toBeVisible();
    await expect(window.getByText(/click normally to save and clear that issue/)).toBeVisible();
    await expect(window.getByText(/as many separate issues as you need/)).toBeVisible();
    await expect(window.getByText('Each issue keeps its matching narration and screenshot'))
      .toBeVisible();
    await window.waitForTimeout(500);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await window.getByRole('button', { name: 'Start Your First Recording' }).click();
    await expect(wizard).toBeHidden();
    await application.close();
    application = null;

    launched = await launchApplication(harness);
    application = launched.application;
    window = launched.mainWindow;
    await expect(window.getByRole('dialog', { name: 'Setup wizard' })).toBeHidden();
    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('has no serious accessibility violations on the home and settings surfaces', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await window.getByRole('button', { name: 'Open Settings' }).click();
    await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect.poll(() => window.getByRole('dialog', { name: 'Settings' }).evaluate((element) =>
      getComputedStyle(element).opacity)).toBe('1');
    await window.waitForTimeout(500);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    for (const tabName of ['Recording', 'Appearance', 'Hotkeys', 'Advanced']) {
      const tab = window.getByRole('tab', { name: tabName, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(await seriousAccessibilityViolations(window)).toEqual([]);
    }
  });

  test('applies custom appearance settings immediately and restores them from app settings', async () => {
    let launched = await launchApplication(harness);
    application = launched.application;
    let window = launched.mainWindow;

    await window.getByRole('button', { name: 'Open Settings' }).click();
    await window.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await window.getByLabel('Theme Mode').selectOption('dark');
    await expect.poll(() => window.evaluate(() =>
      document.documentElement.getAttribute('data-theme'))).toBe('dark');

    const customAccent = '#123456';
    await window.getByLabel('Choose a custom accent color').evaluate((element, value) => {
      const input = element as HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, customAccent);
    await expect.poll(() => window.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-default').trim(),
    )).toBe(customAccent);
    await expect.poll(() => window.evaluate(async () => ({
      theme: await window.markuprx.settings.get('theme'),
      accentColor: await window.markuprx.settings.get('accentColor'),
    }))).toEqual({ theme: 'dark', accentColor: customAccent });

    // Prove the canonical Electron settings store restores appearance instead of
    // accidentally relying on ThemeProvider's localStorage cache.
    await window.evaluate(() => localStorage.clear());
    await application.close();
    application = null;

    launched = await launchApplication(harness);
    application = launched.application;
    window = launched.mainWindow;
    await expect.poll(() => window.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      accent: getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-default')
        .trim(),
    }))).toEqual({ theme: 'dark', accent: customAccent });

    await window.getByRole('button', { name: 'Open Settings' }).click();
    await window.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await window.getByTitle('Reset section to defaults').click();
    await expect.poll(() => window.evaluate(async () => ({
      theme: await window.markuprx.settings.get('theme'),
      accentColor: await window.markuprx.settings.get('accentColor'),
      appliedAccent: getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-default')
        .trim(),
    }))).toEqual({
      theme: 'system',
      accentColor: '#3b82f6',
      appliedAccent: '#3b82f6',
    });
  });

  test('selects the deterministic window and enters the annotation-ready recording HUD', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await selectDeterministicWindow(application, window);

    await expect(window.getByRole('status', { name: 'Recording in progress' })).toBeVisible();
    await expect(window.getByText(/Hold ⌘ and drag to mark/)).toBeVisible();
  });

  test('supports selector keyboard modes and cancellation without starting a session', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const selectorPromise = application.waitForEvent('window');
    await mainWindow.getByRole('button', { name: /start session/i }).click();
    const selector = await selectorPromise;
    await expect(selector.getByRole('main', { name: 'Choose what MarkuprX should record' }))
      .toBeVisible();

    await selector.keyboard.press('r');
    await expect(selector.getByRole('button', { name: /Region/ })).toHaveAttribute('aria-pressed', 'true');
    await selector.keyboard.press('s');
    await expect(selector.getByRole('button', { name: /Full Screen/ })).toHaveAttribute('aria-pressed', 'true');
    await selector.keyboard.press('w');
    await expect(selector.getByRole('button', { name: /Window/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await seriousAccessibilityViolations(selector)).toEqual([]);

    await Promise.all([
      selector.waitForEvent('close'),
      selector.keyboard.press('Escape').catch(() => {
        // The keydown intentionally destroys the selector before Playwright sends keyup.
      }),
    ]);
    await expect(mainWindow.getByRole('button', { name: /start session/i })).toBeVisible();
    await expect.poll(async () => (await diagnostics(mainWindow)).state).toBe('idle');
  });

  test('keeps ordinary clicks harmless until marks exist and preserves pending marks across pause', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);
    const input = createInputSequence(mainWindow);
    await input.next();

    await input.next({ primaryDown: true });
    await input.next({ primaryDown: false });
    expect((await diagnostics(mainWindow)).markedIssueCount).toBe(0);
    await expect(annotation.getByRole('region', { name: 'Annotation tools' })).toBeHidden();

    await input.next({ modifierDown: true });
    await expect(annotation.getByRole('region', { name: 'Annotation tools' })).toBeVisible();
    await drawStroke(annotation);
    await input.next({ modifierDown: false });
    await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(true);

    expect(await mainWindow.evaluate(() => window.markuprx.session.pause()))
      .toEqual({ success: true });
    await expect(mainWindow.getByText('Paused · your current marks are preserved')).toBeVisible();
    await input.next({ modifierDown: true });
    await expect(annotation.getByRole('region', { name: 'Annotation tools' })).toBeHidden();

    expect(await mainWindow.evaluate(() => window.markuprx.session.resume()))
      .toEqual({ success: true });
    await expect(mainWindow.getByText('Marked area ready · click to save and continue')).toBeVisible();
    await input.next({ modifierDown: false });
    await input.next({ primaryDown: true });
    await input.next({ primaryDown: false });
    await expect.poll(async () => (await diagnostics(mainWindow)).markedIssueCount).toBe(1);

    await cancelActiveSession(mainWindow);
    expect(await readdir(harness.outputRoot)).toEqual([]);
  });

  test('recovers from modifier monitoring failure with Draw, Undo, Clear, and Done controls', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);

    expect(await mainWindow.evaluate(() => window.markuprx.e2e?.setInputAvailable(
      false,
      'Injected observer failure.',
    ))).toEqual({ success: true });
    const drawButton = mainWindow.getByRole('button', { name: 'Draw', exact: true });
    await expect(drawButton).toBeVisible();
    await expect(mainWindow.getByText('Choose Draw, mark the screen, then choose Done to save'))
      .toBeVisible();
    await expect(annotation.getByText('Hold-to-draw is unavailable · use the fallback Draw control'))
      .toBeVisible();

    await drawButton.click();
    const tools = annotation.getByRole('region', { name: 'Annotation tools' });
    await expect(tools).toBeVisible();
    await drawStroke(annotation);
    await tools.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(false);

    await drawStroke(annotation, { x: 220, y: 150 }, { x: 420, y: 260 });
    await tools.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(false);

    await drawStroke(annotation, { x: 260, y: 160 }, { x: 500, y: 280 });
    await tools.getByRole('button', { name: 'Done · Esc', exact: true }).click();
    await expect.poll(async () => (await diagnostics(mainWindow)).markedIssueCount).toBe(1);
    await expect(tools).toBeHidden();

    expect(await mainWindow.evaluate(() => window.markuprx.e2e?.setInputAvailable(true)))
      .toEqual({ success: true });
    await expect(drawButton).toBeHidden();
    await expect(mainWindow.getByText(/Hold ⌘ and drag to mark/)).toBeVisible();
    await expect(mainWindow.getByText('+1', { exact: true })).toBeHidden();
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);
    expect(await seriousAccessibilityViolations(annotation)).toEqual([]);

    await cancelActiveSession(mainWindow);
  });

  test('recovers committed marked evidence and narration after forced process termination', async () => {
    test.setTimeout(90_000);
    let launched = await launchApplication(harness);
    application = launched.application;
    let mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);
    const input = createInputSequence(mainWindow);
    await input.next();

    const recoveredComment = 'The recovered checkout button needs more contrast.';
    await drawAndCommitIssue({
      annotation,
      mainWindow,
      input,
      ordinal: 1,
      tool: 'Circle',
      color: '#ff3b30',
      comment: recoveredComment,
    });

    // Leave a second drawing uncommitted to prove recovery distinguishes a
    // completed issue from marks that were never saved by an ordinary click.
    await input.next({ modifierDown: true });
    await drawStroke(annotation, { x: 250, y: 260 }, { x: 470, y: 330 });
    await input.next({ modifierDown: false });
    await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(true);

    // Exercise the production five-second crash autosave, then kill the main
    // process without Electron's clean-exit handlers.
    await mainWindow.waitForTimeout(5_750);
    const crashed = application.waitForEvent('close');
    application.process().kill('SIGKILL');
    await crashed;
    application = null;

    launched = await launchApplication(harness);
    application = launched.application;
    mainWindow = launched.mainWindow;
    const recoveryDialog = mainWindow.getByRole('dialog', { name: 'Recover Previous Session?' });
    await expect(recoveryDialog).toBeVisible();
    await expect(recoveryDialog.getByText('Marked issues:')).toBeVisible();
    await expect(recoveryDialog.getByText('1', { exact: true })).toBeVisible();
    await expect(recoveryDialog.getByText('Uncommitted drawing:')).toBeVisible();
    await expect(recoveryDialog.getByText('Not included', { exact: true })).toBeVisible();
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);

    await recoveryDialog.getByRole('button', { name: /Recover Session/ }).click();
    await expect(recoveryDialog).toBeHidden({ timeout: 30_000 });
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' })).toBeVisible();

    const sessionDir = await findOnlySessionDirectory(harness.outputRoot);
    const reportPath = join(sessionDir, 'feedback-report.md');
    const report = await readFile(reportPath, 'utf8');
    const metadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
      screenshotCount: number;
      markedIssues: Array<{ id: string; comment?: string; screenshotPath?: string }>;
    };
    expect(report).toContain('(Recovered) Feedback Report');
    expect(report).toContain(recoveredComment);
    expect(report).toContain('./screenshots/marked-issue-001.png');
    expect(report).not.toContain('MX-002');
    expect(metadata.screenshotCount).toBe(1);
    expect(metadata.markedIssues).toMatchObject([{
      id: 'marked-issue-001',
      comment: recoveredComment,
      screenshotPath: 'screenshots/marked-issue-001.png',
    }]);
    expect((await stat(join(sessionDir, 'screenshots', 'marked-issue-001.png'))).size)
      .toBeGreaterThan(1_000);
    await expect(mainWindow.getByText(reportPath, { exact: true })).toBeVisible();
  });

  test('records three separately narrated marked issues and generates complete evidence', async () => {
    test.setTimeout(90_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);
    const input = createInputSequence(mainWindow);
    await input.next();

    const cases = [
      {
        tool: 'Pen' as const,
        color: '#ff3b30',
        comment: 'The primary action needs more contrast.',
      },
      {
        tool: 'Circle' as const,
        color: '#ffcc00',
        comment: 'This card spacing is inconsistent.',
      },
      {
        tool: 'Highlight' as const,
        color: '#34c759',
        comment: 'The confirmation state needs a clearer label.',
      },
    ];

    for (const [index, issue] of cases.entries()) {
      await drawAndCommitIssue({
        annotation,
        mainWindow,
        input,
        ordinal: index + 1,
        ...issue,
      });
    }

    await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(async () => {
      const entries = await readdir(harness.outputRoot, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).length;
    }, { timeout: 60_000 }).toBe(1);

    const sessionDir = await findOnlySessionDirectory(harness.outputRoot);
    const reportPath = join(sessionDir, 'feedback-report.md');
    await expect.poll(async () => {
      try {
        return (await stat(reportPath)).size;
      } catch {
        return 0;
      }
    }, { timeout: 60_000 }).toBeGreaterThan(100);
    await expect.poll(async () => {
      try {
        const parsed = JSON.parse(
          await readFile(join(sessionDir, 'metadata.json'), 'utf8'),
        ) as { markedIssues?: Array<{ comment?: string }> };
        return parsed.markedIssues?.map((issue) => issue.comment) ?? [];
      } catch {
        return [];
      }
    }, { timeout: 60_000 }).toEqual(cases.map((issue) => issue.comment));
    await expect.poll(async () => {
      try {
        return (await stat(join(sessionDir, 'processing-trace.json'))).size;
      } catch {
        return 0;
      }
    }, { timeout: 60_000 }).toBeGreaterThan(100);

    const report = await readFile(reportPath, 'utf8');
    const metadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
      itemCount: number;
      screenshotCount: number;
      markedIssues: Array<{
        id: string;
        ordinal: number;
        comment?: string;
        screenshotPath?: string;
        transcriptSegmentIds: string[];
      }>;
    };
    expect(metadata.markedIssues.map((issue) => issue.id)).toEqual([
      'marked-issue-001',
      'marked-issue-002',
      'marked-issue-003',
    ]);
    expect(metadata.markedIssues.map((issue) => issue.comment)).toEqual(
      cases.map((issue) => issue.comment),
    );
    expect(new Set(metadata.markedIssues.flatMap((issue) => issue.transcriptSegmentIds)).size).toBe(3);
    expect(metadata.screenshotCount).toBe(3);
    expect(report).toContain(`Items: ${metadata.itemCount} | Screenshots: 3`);
    expect(report).toContain('3 screenshots were aligned to spoken context.');

    for (const [index, issue] of cases.entries()) {
      const ordinal = index + 1;
      const issueId = `marked-issue-${String(ordinal).padStart(3, '0')}`;
      expect(report.match(new RegExp(`^### MX-${String(ordinal).padStart(3, '0')}$`, 'gm')))
        .toHaveLength(1);
      const section = markedIssueSection(report, ordinal);
      expect(occurrences(section, issue.comment)).toBe(1);
      expect(occurrences(section, `${issueId}.png`)).toBe(1);

      const screenshotPath = join(sessionDir, 'screenshots', `${issueId}.png`);
      const screenshotMetadata = await sharp(screenshotPath).metadata();
      expect(screenshotMetadata.format).toBe('png');
      expect(screenshotMetadata.width).toBe(960);
      expect(screenshotMetadata.height).toBe(540);
      expect((await stat(screenshotPath)).size).toBeGreaterThan(1_000);
    }

    const sessionFiles = await readdir(sessionDir);
    const recordingName = sessionFiles.find((name) => /^session-recording\./.test(name));
    expect(recordingName).toBeTruthy();
    expect((await stat(join(sessionDir, recordingName!))).size).toBeGreaterThan(1_000);
    expect((await stat(join(sessionDir, 'session-audio.wav'))).size).toBeGreaterThan(1_000);
    expect((await stat(join(sessionDir, 'processing-trace.json'))).size).toBeGreaterThan(100);

    await expect.poll(async () => (await diagnostics(mainWindow)).state).toBe('complete');
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' })).toBeVisible();
    await expect(mainWindow.getByText('Latest Report Path')).toBeVisible();
    await expect(mainWindow.getByText(reportPath, { exact: true })).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Open Session History' }).click();
    const historyDialog = mainWindow.getByRole('dialog', { name: 'Session History' });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText('1 session', { exact: true })).toBeVisible();
    const historyRow = historyDialog.getByRole('listitem').filter({
      hasText: `${metadata.itemCount} items`,
    });
    await expect(historyRow).toBeVisible();
    await expect(historyRow.getByText(String(metadata.screenshotCount), { exact: true })).toBeVisible();
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);
  });
});
