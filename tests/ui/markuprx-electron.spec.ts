import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import axe from 'axe-core';
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
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
  const windowMode = selector.getByRole('button', { name: /Window/ });
  if (await windowMode.getAttribute('aria-pressed') !== 'true') {
    await windowMode.click();
  }
  await expect(windowMode)
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

async function seedPortraitSession(
  outputRoot: string,
  options: { id: string; sourceName: string },
): Promise<string> {
  const sessionDir = join(outputRoot, options.id);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, 'metadata.json'), JSON.stringify({
    sessionId: options.id,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_030_000,
    itemCount: 3,
    screenshotCount: 2,
    source: {
      id: `window:${options.id}`,
      name: options.sourceName,
    },
    environment: { os: 'test', version: '1' },
  }), 'utf8');
  await writeFile(
    join(sessionDir, 'feedback-report.md'),
    `# ${options.sourceName}\n\n> Portrait delete confirmation fixture.\n`,
    'utf8',
  );
  return sessionDir;
}

async function seedSessionHistory(
  outputRoot: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const ordinal = String(index + 1).padStart(2, '0');
    const sessionDir = join(outputRoot, `portrait-fixture-${ordinal}`);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      join(sessionDir, 'metadata.json'),
      JSON.stringify({
        sessionId: `portrait-fixture-${ordinal}`,
        startTime: 1_700_000_000_000 + index * 60_000,
        endTime: 1_700_000_030_000 + index * 60_000,
        itemCount: index + 1,
        screenshotCount: index % 4,
        source: {
          id: `window:portrait:${ordinal}`,
          name: `Portrait Fixture ${ordinal}`,
        },
        environment: { os: 'test', version: '1' },
      }),
      'utf8',
    );
    await writeFile(
      join(sessionDir, 'feedback-report.md'),
      `> Portrait history fixture ${ordinal}\n`,
      'utf8',
    );
  }
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

async function expectPortraitWindow(
  application: ElectronApplication,
  page: Page,
): Promise<void> {
  const pageUrl = page.url();
  const bounds = await application.evaluate(({ BrowserWindow }, url) => {
    const window = BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL() === url);
    return window?.getBounds() ?? null;
  }, pageUrl);
  expect(bounds).toMatchObject({ width: 460, height: 680 });

  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.viewportWidth).toBe(460);
  expect(overflow.viewportHeight).toBe(680);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth);
}

async function expectNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth);
}

async function expectSinglePortraitScroller(
  page: Page,
  surfaceName: string,
): Promise<Locator> {
  const surface = page.getByRole('region', { name: surfaceName, exact: true });
  await expect(surface).toBeVisible();
  const metrics = await surface.evaluate((element) => {
    const scrollers = Array.from(
      element.querySelectorAll<HTMLElement>('.ff-portrait-surface__scroller'),
    ).filter((candidate) => {
      const style = getComputedStyle(candidate);
      return style.overflowY === 'auto' || style.overflowY === 'scroll';
    });
    return {
      count: scrollers.length,
      rect: scrollers[0]
        ? (() => {
            const box = scrollers[0].getBoundingClientRect();
            return {
              left: box.left,
              top: box.top,
              right: box.right,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            };
          })()
        : null,
      nestedVerticalScrollers: scrollers[0]
        ? Array.from(scrollers[0].querySelectorAll<HTMLElement>('*'))
          .filter((candidate) => {
            const style = getComputedStyle(candidate);
            const box = candidate.getBoundingClientRect();
            return (style.overflowY === 'auto' || style.overflowY === 'scroll')
              && style.display !== 'none'
              && style.visibility !== 'hidden'
              && box.width > 0
              && box.height > 0;
          })
          .map((candidate) => ({
            tag: candidate.tagName.toLowerCase(),
            className: candidate.className,
            overflowY: getComputedStyle(candidate).overflowY,
            clientHeight: candidate.clientHeight,
            scrollHeight: candidate.scrollHeight,
          }))
        : [],
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentOverflow:
        document.documentElement.scrollWidth > window.innerWidth
        || document.body.scrollWidth > window.innerWidth,
      scrollerOverflow: scrollers.some(
        (candidate) => candidate.scrollWidth > candidate.clientWidth,
      ),
      overflowCandidates: scrollers[0]
        ? Array.from(scrollers[0].querySelectorAll<HTMLElement>('*'))
          .filter((candidate) => {
            const candidateBox = candidate.getBoundingClientRect();
            const scrollerBox = scrollers[0].getBoundingClientRect();
            return candidateBox.right > scrollerBox.right + 0.5
              || candidateBox.left < scrollerBox.left - 0.5
              || candidate.scrollWidth > candidate.clientWidth + 0.5;
          })
          .slice(0, 12)
          .map((candidate) => ({
            tag: candidate.tagName.toLowerCase(),
            className: candidate.className,
            text: candidate.textContent?.trim().slice(0, 60) ?? '',
            clientWidth: candidate.clientWidth,
            scrollWidth: candidate.scrollWidth,
            rect: {
              left: candidate.getBoundingClientRect().left,
              right: candidate.getBoundingClientRect().right,
            },
          }))
        : [],
    };
  });
  expect(metrics.count).toBe(1);
  expect(metrics.nestedVerticalScrollers).toEqual([]);
  expect(metrics.documentOverflow).toBe(false);
  expect(metrics.scrollerOverflow, JSON.stringify(metrics.overflowCandidates, null, 2)).toBe(false);
  expect(metrics.rect).not.toBeNull();
  expect(metrics.rect!.width).toBeGreaterThan(0);
  expect(metrics.rect!.height).toBeGreaterThan(0);
  expect(metrics.rect!.left).toBeGreaterThanOrEqual(0);
  expect(metrics.rect!.top).toBeGreaterThanOrEqual(0);
  expect(metrics.rect!.right).toBeLessThanOrEqual(metrics.viewport.width);
  expect(metrics.rect!.bottom).toBeLessThanOrEqual(metrics.viewport.height);
  return surface.locator('.ff-portrait-surface__scroller');
}

async function expectActionsWithinPortrait(actions: Locator[]): Promise<void> {
  for (const action of actions) {
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(460);
    expect(box!.y + box!.height).toBeLessThanOrEqual(680);
  }
}

async function expectSettingsTabUnobscured(
  settings: Locator,
  tabName: string,
  direction: 'forward' | 'backward',
): Promise<void> {
  const rail = settings.getByRole('tablist', { name: 'Settings sections' });
  const tab = rail.getByRole('tab', { name: tabName, exact: true });
  const affordance = settings.getByRole('button', {
    name: direction === 'forward'
      ? 'Show more settings sections'
      : 'Show previous settings sections',
    exact: true,
  });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(affordance).toHaveAttribute('data-direction', direction);
  const readLayout = () => tab.evaluate((element) => {
    const railElement = element.closest<HTMLElement>('[role="tablist"]')!;
    const control = railElement.parentElement!
      .querySelector<HTMLElement>('.ff-settings-section-rail__more')!;
    const tabBox = element.getBoundingClientRect();
    const railBox = railElement.getBoundingClientRect();
    const controlBox = control.getBoundingClientRect();
    return {
      leftVisible: tabBox.left >= railBox.left - 0.5,
      rightVisible: tabBox.right <= controlBox.left + 0.5,
      widthPositive: tabBox.width > 0,
      heightPositive: tabBox.height > 0,
      tabLeft: tabBox.left,
      tabRight: tabBox.right,
      railLeft: railBox.left,
      controlLeft: controlBox.left,
      scrollLeft: railElement.scrollLeft,
      maximumScroll: railElement.scrollWidth - railElement.clientWidth,
    };
  });
  if (process.env.PORTRAIT_VISUAL_DIAGNOSTICS === '1') {
    console.log(`[settings-rail] ${tabName}: ${JSON.stringify(await readLayout())}`);
  }
  await expect.poll(readLayout).toEqual({
    leftVisible: true,
    rightVisible: true,
    widthPositive: true,
    heightPositive: true,
    tabLeft: expect.any(Number),
    tabRight: expect.any(Number),
    railLeft: expect.any(Number),
    controlLeft: expect.any(Number),
    scrollLeft: expect.any(Number),
    maximumScroll: expect.any(Number),
  });
}

async function setRendererTheme(
  page: Page,
  theme: 'light' | 'dark',
): Promise<void> {
  await page.evaluate(async (nextTheme) => {
    await window.markuprx.settings.set('theme', nextTheme);
    window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
      detail: { type: 'appearance' },
    }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function setActiveWindowZoom(
  application: ElectronApplication,
  page: Page,
  factor: number,
): Promise<void> {
  const pageUrl = page.url();
  const updated = await application.evaluate(({ BrowserWindow }, options) => {
    const window = BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL() === options.url);
    if (!window) return null;
    window.webContents.setZoomFactor(options.factor);
    return {
      bounds: window.getBounds(),
      zoomFactor: window.webContents.getZoomFactor(),
    };
  }, { url: pageUrl, factor });
  expect(updated).not.toBeNull();
  expect(updated!.zoomFactor).toBe(factor);
  await expect.poll(() => page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    visualWidth: window.visualViewport?.width ?? 0,
    visualHeight: window.visualViewport?.height ?? 0,
  }))).toEqual({
    width: Math.round(updated!.bounds.width / factor),
    height: Math.round(updated!.bounds.height / factor),
    visualWidth: Math.round(updated!.bounds.width / factor),
    visualHeight: Math.round(updated!.bounds.height / factor),
  });
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function parseCssColor(value: string): RgbColor {
  const hex = value.trim().match(/^#([\da-f]{6})([\da-f]{2})?$/i);
  if (hex) {
    return {
      red: Number.parseInt(hex[1].slice(0, 2), 16),
      green: Number.parseInt(hex[1].slice(2, 4), 16),
      blue: Number.parseInt(hex[1].slice(4, 6), 16),
      alpha: hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1,
    };
  }
  const rgb = value.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) throw new Error(`Unsupported CSS color: ${value}`);
  const channels = rgb[1].split(',').map((channel) => Number.parseFloat(channel.trim()));
  return {
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    alpha: channels[3] ?? 1,
  };
}

function compositeColor(foreground: RgbColor, background: RgbColor): RgbColor {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
}

function colorContrast(first: RgbColor, second: RgbColor): number {
  const luminance = (color: RgbColor): number => {
    const linear = [color.red, color.green, color.blue].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const brighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (brighter + 0.05) / (darker + 0.05);
}

async function expectStablePortraitSurface(
  page: Page,
  surfaceName: string,
  theme: 'light' | 'dark',
): Promise<void> {
  const surface = page.getByRole('region', { name: surfaceName, exact: true });
  await expect.poll(() => surface.evaluate((element) => ({
    theme: document.documentElement.dataset.theme,
    opacity: getComputedStyle(element).opacity,
    visible: element.getBoundingClientRect().width > 0
      && element.getBoundingClientRect().height > 0,
  }))).toEqual({ theme, opacity: '1', visible: true });
  await expect.poll(() => surface.locator('.ff-list-item-enter').evaluateAll((elements) =>
    elements.every((element) => getComputedStyle(element).opacity === '1'))).toBe(true);

  await expect.poll(() => surface.evaluate((element) => {
    const card = element.closest<HTMLElement>('.ff-shell__card');
    const back = element.querySelector<HTMLElement>('.ff-portrait-surface__back');
    const icon = back?.querySelector<SVGElement>('svg[aria-hidden="true"]');
    const iconPath = icon?.querySelector('path');
    const surfaceBox = element.getBoundingClientRect();
    const backBox = back?.getBoundingClientRect();
    const iconBox = icon?.getBoundingClientRect();
    return {
      cardOpacity: card ? getComputedStyle(card).opacity : null,
      cardTransform: card ? getComputedStyle(card).transform : null,
      surfaceBox: {
        left: surfaceBox.left,
        top: surfaceBox.top,
        right: surfaceBox.right,
        bottom: surfaceBox.bottom,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      backBox: backBox
        ? { left: backBox.left, top: backBox.top, right: backBox.right, bottom: backBox.bottom }
        : null,
      icon: icon
        ? {
            tag: icon.tagName.toLowerCase(),
            pathCount: icon.querySelectorAll('path').length,
            stroke: iconPath ? getComputedStyle(iconPath).stroke : null,
            color: getComputedStyle(icon).color,
            opacity: getComputedStyle(icon).opacity,
            visibility: getComputedStyle(icon).visibility,
            width: iconBox?.width ?? 0,
            height: iconBox?.height ?? 0,
          }
        : null,
    };
  })).toMatchObject({
    cardOpacity: '1',
    cardTransform: 'none',
    icon: {
      tag: 'svg',
      pathCount: 1,
      opacity: '1',
      visibility: 'visible',
    },
  });

  const headerGeometry = await surface.evaluate((element) => {
    const back = element.querySelector<HTMLElement>('.ff-portrait-surface__back')!;
    const icon = back.querySelector<SVGElement>('svg[aria-hidden="true"]')!;
    const iconPath = icon.querySelector('path')!;
    const surfaceBox = element.getBoundingClientRect();
    const backBox = back.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return {
      surfaceBox: {
        left: surfaceBox.left,
        top: surfaceBox.top,
        right: surfaceBox.right,
        bottom: surfaceBox.bottom,
      },
      backBox: { left: backBox.left, right: backBox.right },
      iconBox: {
        width: iconBox.width,
        height: iconBox.height,
        color: getComputedStyle(icon).color,
        stroke: getComputedStyle(iconPath).stroke,
      },
      palette: {
        icon: getComputedStyle(iconPath).stroke,
        button: getComputedStyle(back).backgroundColor,
        header: getComputedStyle(back.parentElement!).backgroundColor,
      },
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(headerGeometry.surfaceBox.left).toBeGreaterThanOrEqual(0);
  expect(headerGeometry.surfaceBox.right).toBeLessThanOrEqual(headerGeometry.width);
  expect(headerGeometry.surfaceBox.top).toBeGreaterThanOrEqual(0);
  expect(headerGeometry.surfaceBox.bottom).toBeLessThanOrEqual(headerGeometry.height);
  expect(headerGeometry.backBox.left).toBeGreaterThanOrEqual(0);
  expect(headerGeometry.backBox.right).toBeLessThanOrEqual(headerGeometry.width);
  expect(headerGeometry.iconBox.width).toBeGreaterThan(0);
  expect(headerGeometry.iconBox.height).toBeGreaterThan(0);
  expect(headerGeometry.iconBox.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(headerGeometry.iconBox.stroke).not.toBe('none');
  const backBackground = compositeColor(
    parseCssColor(headerGeometry.palette.button),
    parseCssColor(headerGeometry.palette.header),
  );
  const backIconContrast = colorContrast(
    parseCssColor(headerGeometry.palette.icon),
    backBackground,
  );
  expect(backIconContrast).toBeGreaterThanOrEqual(3);

  const back = surface.locator('.ff-portrait-surface__back');
  const backScreenshot = await back.screenshot({ animations: 'disabled' });
  const { data: backPixels, info: backImage } = await sharp(backScreenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const insetX = Math.floor(backImage.width * 0.22);
  const insetY = Math.floor(backImage.height * 0.22);
  let contrastingIconPixels = 0;
  for (let y = insetY; y < backImage.height - insetY; y += 1) {
    for (let x = insetX; x < backImage.width - insetX; x += 1) {
      const offset = (y * backImage.width + x) * backImage.channels;
      const pixel = {
        red: backPixels[offset],
        green: backPixels[offset + 1],
        blue: backPixels[offset + 2],
        alpha: backPixels[offset + 3] / 255,
      };
      if (colorContrast(pixel, backBackground) >= 3) contrastingIconPixels += 1;
    }
  }
  expect(contrastingIconPixels).toBeGreaterThanOrEqual(8);
  if (process.env.PORTRAIT_VISUAL_DIAGNOSTICS === '1') {
    console.log(
      `[portrait-back] ${surfaceName}: contrast=${backIconContrast.toFixed(2)}, `
      + `paintedPixels=${contrastingIconPixels}`,
    );
  }

  const palette = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      pageBackground: root.getPropertyValue('--bg-primary').trim(),
      shellSurface: root.getPropertyValue('--ff-surface').trim(),
      shellText: root.getPropertyValue('--ff-text-primary').trim(),
    };
  });
  const surfaceColor = compositeColor(
    parseCssColor(palette.shellSurface),
    parseCssColor(palette.pageBackground),
  );
  expect(colorContrast(parseCssColor(palette.shellText), surfaceColor))
    .toBeGreaterThanOrEqual(4.5);
  expect(await seriousAccessibilityViolations(page)).toEqual([]);
}

async function expectNormalizedPortraitMetrics(
  page: Page,
  surfaceName: string,
  primaryAction: Locator,
): Promise<void> {
  const surface = page.getByRole('region', { name: surfaceName, exact: true });
  const content = surface.locator('.ff-portrait-content');
  const card = content.locator('.ff-portrait-card').first();
  await expect(content).toHaveCount(1);
  await expect(card).toBeVisible();
  await expect(primaryAction).toBeVisible();

  const metrics = await surface.evaluate((element) => {
    const header = element.querySelector<HTMLElement>('.ff-portrait-surface__header')!;
    const back = header.querySelector<HTMLElement>('.ff-portrait-surface__back')!;
    const heading = header.querySelector<HTMLElement>('h1')!;
    const scroller = element.querySelector<HTMLElement>('.ff-portrait-surface__scroller')!;
    const contentElement = scroller.querySelector<HTMLElement>('.ff-portrait-content')!;
    const cardElement = contentElement.querySelector<HTMLElement>('.ff-portrait-card')!;
    const footer = element.querySelector<HTMLElement>('.ff-portrait-surface__footer');
    const rootStyle = getComputedStyle(element);
    const surfaceBox = element.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const backBox = back.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    const contentBox = contentElement.getBoundingClientRect();
    const headerStyle = getComputedStyle(header);
    const headingStyle = getComputedStyle(heading);
    const contentStyle = getComputedStyle(contentElement);
    const cardStyle = getComputedStyle(cardElement);
    const footerStyle = footer ? getComputedStyle(footer) : null;
    return {
      tokens: {
        inlineInset: rootStyle.getPropertyValue('--ff-portrait-inline-inset').trim(),
        cardRadius: rootStyle.getPropertyValue('--ff-portrait-card-radius').trim(),
        cardPadding: rootStyle.getPropertyValue('--ff-portrait-card-padding').trim(),
        itemGap: rootStyle.getPropertyValue('--ff-portrait-item-gap').trim(),
        controlHeight: rootStyle.getPropertyValue('--ff-portrait-control-height').trim(),
        bodyFontSize: rootStyle.getPropertyValue('--ff-portrait-body-font-size').trim(),
      },
      surface: { width: surfaceBox.width },
      header: {
        width: headerBox.width,
        height: headerBox.height,
        paddingTop: headerStyle.paddingTop,
        paddingRight: headerStyle.paddingRight,
        paddingBottom: headerStyle.paddingBottom,
        paddingLeft: headerStyle.paddingLeft,
      },
      back: { width: backBox.width, height: backBox.height },
      heading: { fontSize: headingStyle.fontSize, lineHeight: headingStyle.lineHeight },
      scroller: {
        width: scrollerBox.width,
        overflowX: getComputedStyle(scroller).overflowX,
        overflowY: getComputedStyle(scroller).overflowY,
      },
      content: {
        width: contentBox.width,
        leftInset: contentBox.left - surfaceBox.left,
        rightInset: surfaceBox.right - contentBox.right,
        paddingLeft: contentStyle.paddingLeft,
        paddingRight: contentStyle.paddingRight,
      },
      card: {
        borderRadius: cardStyle.borderRadius,
        paddingTop: cardStyle.paddingTop,
        paddingRight: cardStyle.paddingRight,
        paddingBottom: cardStyle.paddingBottom,
        paddingLeft: cardStyle.paddingLeft,
      },
      footer: footer
        ? {
            width: footer.getBoundingClientRect().width,
            borderTopWidth: footerStyle!.borderTopWidth,
            flexShrink: footerStyle!.flexShrink,
          }
        : null,
    };
  });

  expect(metrics).toMatchObject({
    tokens: {
      inlineInset: '14px',
      cardRadius: '12px',
      cardPadding: '12px',
      itemGap: '12px',
      controlHeight: '40px',
      bodyFontSize: '13px',
    },
    surface: { width: 438 },
    header: {
      width: 438,
      height: 65,
      paddingTop: '12px',
      paddingRight: '14px',
      paddingBottom: '12px',
      paddingLeft: '14px',
    },
    back: { width: 36, height: 36 },
    heading: { fontSize: '18px', lineHeight: '22px' },
    scroller: { width: 438, overflowX: 'hidden', overflowY: 'auto' },
    content: {
      width: 430,
      leftInset: 0,
      rightInset: 8,
      paddingLeft: '14px',
      paddingRight: '14px',
    },
    card: {
      borderRadius: '12px',
      paddingTop: '12px',
      paddingRight: '12px',
      paddingBottom: '12px',
      paddingLeft: '12px',
    },
  });
  if (metrics.footer) {
    expect(metrics.footer).toEqual({ width: 438, borderTopWidth: '1px', flexShrink: '0' });
  }
  const actionBox = await primaryAction.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.height).toBeGreaterThanOrEqual(40);
}

async function expectPortraitScreenshot(
  page: Page,
  filename: string,
  mask: Locator[] = [],
): Promise<void> {
  await expect(page).toHaveScreenshot(filename, {
    animations: 'disabled',
    caret: 'hide',
    mask,
  });
}

async function expectContainedDialog(page: Page, dialogName: string | RegExp): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/\bff-contained-dialog\b/);
  await expect(dialog.locator('[role="dialog"]')).toHaveCount(0);

  const layout = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const layer = element.parentElement;
    return {
      box: {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      },
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      layerClass: layer?.className ?? '',
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.box.left).toBeGreaterThanOrEqual(12);
  expect(layout.box.top).toBeGreaterThanOrEqual(12);
  expect(layout.box.right).toBeLessThanOrEqual(448);
  expect(layout.box.bottom).toBeLessThanOrEqual(668);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.layerClass).toContain('ff-contained-dialog-layer');
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  return dialog;
}

async function measureReviewContrast(
  review: Locator,
  bodyText: string,
): Promise<{
  shellMatchesTheme: boolean;
  shellOpaque: boolean;
  bodyContrast: number;
  footerContrast: number;
}> {
  return review.evaluate((surface, expectedBodyText) => {
    interface Rgba {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    const parseColor = (value: string): Rgba => {
      const normalized = value.trim();
      const hex = normalized.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
      if (hex) {
        return {
          r: Number.parseInt(hex[1], 16),
          g: Number.parseInt(hex[2], 16),
          b: Number.parseInt(hex[3], 16),
          a: 1,
        };
      }
      const channels = normalized.match(/^rgba?\(([^)]+)\)$/i)?.[1]
        .split(',')
        .map((channel) => Number.parseFloat(channel.trim()));
      if (!channels || channels.length < 3) {
        throw new Error(`Unsupported computed color: ${value}`);
      }
      return {
        r: channels[0],
        g: channels[1],
        b: channels[2],
        a: channels[3] ?? 1,
      };
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => ({
      r: foreground.r * foreground.a + background.r * (1 - foreground.a),
      g: foreground.g * foreground.a + background.g * (1 - foreground.a),
      b: foreground.b * foreground.a + background.b * (1 - foreground.a),
      a: 1,
    });
    const luminance = (color: Rgba): number => {
      const linearize = (channel: number): number => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linearize(color.r)
        + 0.7152 * linearize(color.g)
        + 0.0722 * linearize(color.b);
    };
    const contrast = (foreground: Rgba, background: Rgba): number => {
      const first = luminance(foreground);
      const second = luminance(background);
      const lighter = Math.max(first, second);
      const darker = Math.min(first, second);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const shell = surface.closest('.ff-review-shell');
    const body = [...surface.querySelectorAll('p')]
      .find((candidate) => candidate.textContent?.trim() === expectedBodyText);
    const footer = [...surface.querySelectorAll('.ff-review-actions button')]
      .find((candidate) => candidate.textContent?.trim() === 'Open Folder');
    if (!shell || !body || !footer) {
      throw new Error('Review contrast fixtures were not found.');
    }

    const shellColor = parseColor(getComputedStyle(shell).backgroundColor);
    const themeColor = parseColor(
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary'),
    );
    const transparentCanvas = { r: 0, g: 0, b: 0, a: 1 };
    const shellBackground = composite(shellColor, transparentCanvas);
    const footerStyle = getComputedStyle(footer);
    const footerBackground = composite(
      parseColor(footerStyle.backgroundColor),
      shellBackground,
    );
    const closeEnough = (left: number, right: number) => Math.abs(left - right) < 1;

    return {
      shellMatchesTheme: closeEnough(shellColor.r, themeColor.r)
        && closeEnough(shellColor.g, themeColor.g)
        && closeEnough(shellColor.b, themeColor.b),
      shellOpaque: shellColor.a === 1,
      bodyContrast: contrast(parseColor(getComputedStyle(body).color), shellBackground),
      footerContrast: contrast(parseColor(footerStyle.color), footerBackground),
    };
  }, bodyText);
}

async function reviewItemFocusState(item: Locator): Promise<{
  focused: boolean;
  ariaCurrent: string | null;
  tabIndex: number;
}> {
  return item.evaluate((element) => ({
    focused: document.activeElement === element,
    ariaCurrent: element.getAttribute('aria-current'),
    tabIndex: (element as HTMLElement).tabIndex,
  }));
}

async function clickApplicationMenuItem(
  application: ElectronApplication,
  menuLabel: string,
  itemLabel: string,
): Promise<void> {
  await application.evaluate(({ Menu }, labels) => {
    const menu = Menu.getApplicationMenu()?.items
      .find((candidate) => candidate.label === labels.menuLabel);
    const item = menu?.submenu?.items
      .find((candidate) => candidate.label === labels.itemLabel);
    if (!item) throw new Error('Application menu item not found.');
    item.click();
  }, { menuLabel, itemLabel });
}

async function expectHudWindow(
  application: ElectronApplication,
  page: Page,
  size: { width: number; height: number },
): Promise<void> {
  const pageUrl = page.url();
  const bounds = await application.evaluate(({ BrowserWindow }, url) => {
    const window = BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL() === url);
    return window?.getBounds() ?? null;
  }, pageUrl);
  expect(bounds).toMatchObject(size);

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    cardHeight: document.querySelector<HTMLElement>('.ff-shell__card')?.offsetHeight,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
  }));
  expect(layout.viewportWidth).toBe(size.width);
  expect(layout.viewportHeight).toBe(size.height);
  expect(layout.cardHeight).toBe(size.height);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight);
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
    const startSession = window.getByRole('button', { name: /start session/i });
    await expect(startSession).toBeVisible();
    await expectPortraitWindow(application, window);
    await expectActionsWithinPortrait([startSession]);
  });

  test('caps the configured recording countdown inside the portrait window', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await window.getByRole('button', { name: 'Open Settings' }).click();
    await window.getByRole('tab', { name: 'Recording', exact: true }).click();
    const countdownSetting = window.getByRole('combobox', {
      name: 'Countdown Before Recording',
    });
    await countdownSetting.selectOption('5');
    await expect(countdownSetting).toHaveValue('5');
    await window.getByRole('button', { name: 'Back to MarkuprX' }).click();
    const startAction = window.getByRole('button', { name: /start session/i });
    await expect(startAction).toBeEnabled();
    await startAction.click();

    const skipAction = window.getByRole('button', { name: /Press Esc or Space to skip/ });
    await expect(skipAction).toBeVisible({ timeout: 1_000 });
    const countdownContent = skipAction.locator('..');
    await expect(countdownContent).toHaveClass(/\bff-countdown-content\b/, { timeout: 500 });
    await expectPortraitWindow(application, window);

    const layout = await countdownContent.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      };
    });
    expect(layout.box.left).toBeGreaterThanOrEqual(12);
    expect(layout.box.top).toBeGreaterThanOrEqual(12);
    expect(layout.box.right).toBeLessThanOrEqual(448);
    expect(layout.box.bottom).toBeLessThanOrEqual(668);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(['auto', 'scroll']).toContain(layout.overflowY);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const exportDialog = await expectContainedDialog(window, 'Export Feedback');
    const closeExport = exportDialog.getByRole('button', { name: 'Close export dialog' });
    await expect(closeExport).toBeFocused();
    const countdownAndExportLayers = await window.evaluate(() => {
      const countdown = document.querySelector<HTMLElement>('.ff-countdown-content')?.parentElement;
      const exportLayer = document.querySelector<HTMLElement>(
        '[data-contained-dialog-stack-index="0"]',
      );
      return {
        countdown: Number(getComputedStyle(countdown!).zIndex),
        exportDialog: Number(getComputedStyle(exportLayer!).zIndex),
      };
    });
    expect(countdownAndExportLayers.exportDialog).toBeGreaterThan(countdownAndExportLayers.countdown);
    expect(await closeExport.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return Boolean(hit && button.contains(hit));
    })).toBe(true);
    await window.keyboard.press('Space');
    await expect(exportDialog).toBeHidden();
    await window.waitForTimeout(250);
    await expect(countdownContent).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(countdownContent).toBeHidden();
    await expect(startAction).toBeVisible();
    await expect(startAction).toBeFocused();
  });

  test('does not expose an unconfigured repository update channel', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    const helpMenuLabels = await application.evaluate(({ Menu }) => {
      const helpMenu = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Help');
      return helpMenu?.submenu?.items.map((item) => item.label).filter(Boolean) ?? [];
    });
    expect(helpMenuLabels).not.toContain('Check for Updates...');
    expect(helpMenuLabels).not.toContain('Release Notes');
    expect(helpMenuLabels).not.toContain('Report Issue...');
    expect(helpMenuLabels).not.toContain('Feature Request...');

    await window.getByRole('button', { name: 'Open Settings' }).click();
    await window.getByRole('tab', { name: 'General', exact: true }).click();
    await expect(window.getByText('Software Update', { exact: true })).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Check for Updates' })).toHaveCount(0);
  });

  test('renders Session History as a scrollable portrait surface', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await window.getByRole('button', { name: 'Open Session History' }).click();
    await expectPortraitWindow(application, window);
    await expect(window.getByRole('dialog', { name: 'Session History' })).toHaveCount(0);
    const history = window.getByRole('region', { name: 'Session History' });
    await expectSinglePortraitScroller(window, 'Session History');
    const search = history.getByPlaceholder('Search sessions...');
    await expect(search).toBeVisible();
    await expect(history.getByRole('button', { name: /Sort:/ })).toBeVisible();
    await search.fill('temporary search');
    const clearSearch = history.getByRole('button', { name: 'Clear session search' });
    await expect(clearSearch).toBeVisible();
    await clearSearch.click();
    await expect(search).toHaveValue('');
    expect(await seriousAccessibilityViolations(window)).toEqual([]);
  });

  test('scrolls a long portrait session history', async () => {
    await seedSessionHistory(harness.outputRoot, 18);
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await setRendererTheme(window, 'light');

    await window.getByRole('button', { name: 'Open Session History' }).click();
    await expectPortraitWindow(application, window);
    const history = window.getByRole('region', { name: 'Session History' });
    const scroller = await expectSinglePortraitScroller(window, 'Session History');
    await expect(history.getByText('18 sessions', { exact: true })).toBeVisible();
    await expect(history.getByRole('listitem')).toHaveCount(18);
    expect(await scroller.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    )).toBe(true);
    await expectStablePortraitSurface(window, 'Session History', 'light');
    await expectNormalizedPortraitMetrics(
      window,
      'Session History',
      history.getByRole('button', { name: 'Open session' }).first(),
    );

    await expectPortraitScreenshot(window, 'history-portrait.png', [
      history.getByText(
        /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/,
      ),
      history.getByAltText('Session thumbnail'),
    ]);

    const newestSession = history.getByRole('listitem').filter({
      hasText: 'Portrait Fixture 18',
    });
    await newestSession.click();
    await expectActionsWithinPortrait([
      history.getByRole('button', { name: 'Export', exact: true }),
      history.getByRole('button', { name: 'Delete', exact: true }),
    ]);

    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const oldestSession = history.getByRole('listitem').filter({
      hasText: 'Portrait Fixture 01',
    });
    await expect(oldestSession).toBeVisible();
    await oldestSession.click();
    await expect(oldestSession).toHaveAttribute('aria-current', 'true');
    const oldestOpen = oldestSession.getByRole('button', { name: 'Open session' });
    const oldestMore = oldestSession.getByRole('button', {
      name: 'More actions for session',
    });
    await expectActionsWithinPortrait([oldestOpen, oldestMore]);
    await oldestMore.click();
    const oldestMenu = window.getByRole('menu', { name: 'Session actions' });
    await expect(oldestMenu).toBeVisible();
    await expectActionsWithinPortrait([
      oldestMenu.getByRole('menuitem', { name: 'Export' }),
      oldestMenu.getByRole('menuitem', { name: 'Delete' }),
    ]);
    await expectSinglePortraitScroller(window, 'Session History');
  });

  test('contains history deletion, traps focus, and restores the selected session', async () => {
    const sourceName = `Delete-${'unbroken-session-name-'.repeat(24)}`;
    await seedPortraitSession(harness.outputRoot, {
      id: 'portrait-delete-session',
      sourceName,
    });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await window.getByRole('button', { name: 'Open Session History' }).click();
    await expectPortraitWindow(application, window);
    const history = window.getByRole('region', { name: 'Session History' });
    const session = history.getByRole('listitem').filter({ hasText: sourceName });
    await expect(session).toBeVisible();
    await session.click();
    await session.focus();
    await window.keyboard.press('Delete');

    let confirmation = await expectContainedDialog(window, /Delete 1 session/);
    const cancel = confirmation.getByRole('button', { name: 'Cancel' });
    const deleteAction = confirmation.getByRole('button', { name: 'Delete', exact: true });
    await expect(cancel).toBeFocused();
    await window.getByPlaceholder('Search sessions...').focus();
    await expect(cancel).toBeFocused();
    await cancel.focus();
    await window.keyboard.press('Shift+Tab');
    await expect(deleteAction).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const stackedExport = await expectContainedDialog(window, 'Export Feedback');
    await expect(stackedExport.getByRole('button', { name: 'Close export dialog' })).toBeFocused();
    await expect(confirmation.locator('..')).toHaveAttribute('data-contained-dialog-stack-index', '0');
    await expect(stackedExport.locator('..')).toHaveAttribute('data-contained-dialog-stack-index', '1');
    expect(await stackedExport.locator('..').evaluate((exportLayer) => {
      const confirmationLayer = document.querySelector<HTMLElement>(
        '.ff-contained-dialog-layer[data-contained-dialog-stack-index="0"]',
      );
      return Number(getComputedStyle(exportLayer).zIndex)
        > Number(getComputedStyle(confirmationLayer!).zIndex);
    })).toBe(true);
    await window.keyboard.press('Escape');
    await expect(stackedExport).toBeHidden();
    await expect(confirmation).toBeVisible();
    await expect(cancel).toBeFocused();

    await window.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(session).toBeFocused();

    await window.keyboard.press('Delete');
    confirmation = await expectContainedDialog(window, /Delete 1 session/);
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(session).toHaveCount(0);
  });

  test('blocks every History shortcut while Export owns the topmost modal layer', async () => {
    await seedPortraitSession(harness.outputRoot, {
      id: 'history-shortcut-first',
      sourceName: 'History Shortcut First',
    });
    await seedPortraitSession(harness.outputRoot, {
      id: 'history-shortcut-second',
      sourceName: 'History Shortcut Second',
    });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await window.getByRole('button', { name: 'Open Session History' }).click();
    const history = window.getByRole('region', { name: 'Session History' });
    const rows = history.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    const first = rows.first();
    const second = rows.nth(1);
    await first.click();
    await first.focus();
    await expect(first).toHaveAttribute('aria-current', 'true');
    await expect(history.getByText('1 selected', { exact: true })).toBeVisible();

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const exportDialog = await expectContainedDialog(window, 'Export Feedback');
    const preview = exportDialog.getByLabel('MARKDOWN export preview');
    await preview.focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'Space', 'Delete', 'Backspace', 'Enter', 'ControlOrMeta+A']) {
      await window.keyboard.press(key);
      await expect(exportDialog).toBeVisible();
      await expect(history).toBeVisible();
      await expect(preview).toBeFocused();
      await expect(first).toHaveAttribute('aria-current', 'true');
      await expect(second).not.toHaveAttribute('aria-current', 'true');
      await expect(history.getByText('1 selected', { exact: true })).toBeVisible();
      await expect(window.getByRole('dialog', { name: /Delete .* session/ })).toHaveCount(0);
    }
  });

  test('restores More-action deletion focus on cancel, Escape, surviving rows, and empty history', async () => {
    await seedPortraitSession(harness.outputRoot, {
      id: 'delete-focus-first',
      sourceName: 'Delete Focus First',
    });
    await seedPortraitSession(harness.outputRoot, {
      id: 'delete-focus-second',
      sourceName: 'Delete Focus Second',
    });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await window.getByRole('button', { name: 'Open Session History' }).click();
    const history = window.getByRole('region', { name: 'Session History' });
    const first = history.getByRole('listitem').filter({ hasText: 'Delete Focus First' });
    const second = history.getByRole('listitem').filter({ hasText: 'Delete Focus Second' });

    const openDeleteFromMore = async (row: Locator): Promise<Locator> => {
      const trigger = row.getByRole('button', { name: 'More actions for session' });
      await trigger.click();
      await window.getByRole('menu', { name: 'Session actions' })
        .getByRole('menuitem', { name: 'Delete' }).click();
      return trigger;
    };

    let firstTrigger = await openDeleteFromMore(first);
    let confirmation = await expectContainedDialog(window, /Delete 1 session/);
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toBeHidden();
    await expect(firstTrigger).toBeFocused();

    firstTrigger = await openDeleteFromMore(first);
    confirmation = await expectContainedDialog(window, /Delete 1 session/);
    await window.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(firstTrigger).toBeFocused();

    await openDeleteFromMore(first);
    confirmation = await expectContainedDialog(window, /Delete 1 session/);
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(first).toHaveCount(0);
    await expect(second).toBeFocused();

    await openDeleteFromMore(second);
    confirmation = await expectContainedDialog(window, /Delete 1 session/);
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(second).toHaveCount(0);
    await expect(history.getByPlaceholder('Search sessions...')).toBeFocused();
  });

  test('blocks renderer-initiated navigation away from the trusted application page', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    const trustedUrl = window.url();

    await window.evaluate(() => {
      window.location.assign('https://navigation-should-be-blocked.invalid/');
    });
    await window.waitForTimeout(300);

    const guardedState = await application.evaluate(async ({ BrowserWindow }, expectedUrl) => {
      const guardedWindow = BrowserWindow.getAllWindows()
        .find((candidate) => candidate.webContents.getURL() === expectedUrl);
      if (!guardedWindow) return null;
      return {
        url: guardedWindow.webContents.getURL(),
        title: guardedWindow.webContents.getTitle(),
        hasStartAction: await guardedWindow.webContents.executeJavaScript(
          `document.body?.textContent?.toLowerCase().includes('start session') === true`,
        ),
      };
    }, trustedUrl);
    expect(guardedState).toEqual({
      url: trustedUrl,
      title: 'MarkuprX',
      hasStartAction: true,
    });
  });

  test('guides first-run users through multi-issue annotation and remembers completion', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ showOnboarding: true });
    let launched = await launchApplication(harness);
    application = launched.application;
    let window = launched.mainWindow;

    await expectPortraitWindow(application, window);
    const wizard = await expectContainedDialog(window, 'Setup wizard');
    const expectWizardRegions = async (actionName: string | RegExp): Promise<void> => {
      await expect(wizard.locator('.ff-contained-dialog__body')).toHaveCount(1);
      const actions = wizard.locator('.ff-contained-dialog__actions');
      await expect(actions).toHaveCount(1);
      await expect(actions.getByRole('button', { name: actionName })).toBeVisible();
    };
    const expectWizardA11yInBothThemes = async (): Promise<void> => {
      for (const theme of ['dark', 'light'] as const) {
        await window.evaluate(async (nextTheme) => {
          await window.markuprx.settings.set('theme', nextTheme);
          window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
            detail: { type: 'appearance' },
          }));
        }, theme);
        await expect(window.locator('html')).toHaveAttribute('data-theme', theme);
        await window.waitForTimeout(500);
        expect(await seriousAccessibilityViolations(window)).toEqual([]);
      }
    };
    await expectWizardRegions('Get Started');
    const welcomeHeading = window.getByRole('heading', { name: 'Welcome to MarkuprX' });
    await expect(welcomeHeading).toBeVisible();
    await expect.poll(() => welcomeHeading.evaluate((element) =>
      getComputedStyle(element.parentElement!).opacity)).toBe('1');
    const getStarted = wizard.getByRole('button', { name: 'Get Started' });
    const skipSetup = wizard.getByRole('button', { name: 'Skip setup' });
    await expect(getStarted).toBeFocused();
    await getStarted.focus();
    await window.keyboard.press('Shift+Tab');
    await expect(skipSetup).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(getStarted).toBeFocused();
    await expectWizardA11yInBothThemes();
    await expectActionsWithinPortrait([skipSetup, getStarted]);
    await expectPortraitScreenshot(window, 'onboarding-portrait.png');

    await getStarted.click();
    await expect(window.getByRole('heading', { name: 'Microphone Access' })).toBeVisible();
    await expectWizardRegions('Continue');
    let progress = wizard.getByRole('list', { name: 'Setup progress' });
    await expect(progress.getByRole('listitem')).toHaveCount(4);
    await expect(progress.getByRole('listitem').filter({ hasText: 'Microphone access' }))
      .toHaveAttribute('aria-current', 'step');
    await expectWizardA11yInBothThemes();
    await window.getByRole('button', { name: 'Continue' }).click();
    await expect(window.getByRole('heading', { name: 'Screen Recording' })).toBeVisible();
    await expectWizardRegions('Continue');
    progress = wizard.getByRole('list', { name: 'Setup progress' });
    await expect(progress.getByRole('listitem').filter({ hasText: 'Screen recording' }))
      .toHaveAttribute('aria-current', 'step');
    await expectWizardA11yInBothThemes();
    await window.getByRole('button', { name: 'Continue' }).click();
    await expectWizardRegions(/Skip for now/);
    progress = wizard.getByRole('list', { name: 'Setup progress' });
    await expect(progress.getByRole('listitem').filter({ hasText: 'OpenAI API key' }))
      .toHaveAttribute('aria-current', 'step');
    const openAiHelp = wizard.getByRole('link', { name: 'platform.openai.com' });
    await expect(openAiHelp).toHaveCSS('text-decoration-line', 'underline');
    await expectWizardA11yInBothThemes();
    await window.getByRole('button', { name: /Skip for now/ }).click();
    await expectWizardRegions(/Skip — configure report generation later/);
    progress = wizard.getByRole('list', { name: 'Setup progress' });
    await expect(progress.getByRole('listitem').filter({ hasText: 'Report generation' }))
      .toHaveAttribute('aria-current', 'step');
    const anthropicHelp = wizard.getByRole('link', { name: 'console.anthropic.com' });
    await expect(anthropicHelp).toHaveCSS('text-decoration-line', 'underline');
    await expectWizardA11yInBothThemes();
    await window.getByRole('button', { name: /Skip — configure report generation later/ }).click();

    await expect(window.getByRole('heading', { name: /You're All Set!/ })).toBeVisible();
    await expectWizardRegions('Start Your First Recording');
    await expect(window.getByText(/Hold Command \(⌘\) and drag to mark the current screen/))
      .toBeVisible();
    await expect(window.getByText(/click normally to save and clear that issue/)).toBeVisible();
    await expect(window.getByText(/as many separate issues as you need/)).toBeVisible();
    await expect(window.getByText('Each issue keeps its matching narration and screenshot'))
      .toBeVisible();
    await window.waitForTimeout(500);
    await expectWizardA11yInBothThemes();

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

  test('keeps focus in only the topmost contained dialog when transient dialogs stack', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ showOnboarding: true });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    const wizard = await expectContainedDialog(window, 'Setup wizard');
    const getStarted = wizard.getByRole('button', { name: 'Get Started' });
    await expect(getStarted).toBeFocused();
    await expect(wizard.locator('..')).toHaveAttribute('data-contained-dialog-stack-index', '0');

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const exportDialog = await expectContainedDialog(window, 'Export Feedback');
    const closeExport = exportDialog.getByRole('button', { name: 'Close export dialog' });
    await expect(closeExport).toBeFocused();
    await expect(wizard.locator('..')).toHaveAttribute('data-contained-dialog-stack-index', '0');
    await expect(exportDialog.locator('..')).toHaveAttribute('data-contained-dialog-stack-index', '1');
    const paintOrder = await window.evaluate(() => {
      const layers = Array.from(document.querySelectorAll<HTMLElement>(
        '.ff-contained-dialog-layer[data-contained-dialog-stack-index]',
      ));
      return layers.map((layer) => Number(getComputedStyle(layer).zIndex));
    });
    expect(paintOrder).toEqual([200, 201]);

    await getStarted.focus();
    await expect(closeExport).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(exportDialog).toBeHidden();
    await expect(getStarted).toBeFocused();
    await expect(wizard.locator('..')).toHaveAttribute('data-contained-dialog-stack-index', '0');
    await expect(wizard.locator('..')).toHaveCSS('z-index', '200');

    const startAction = window.getByRole('button', { name: /start session/i });
    await startAction.focus();
    await expect(getStarted).toBeFocused();
  });

  test('contains Export, explains the no-session state, and restores focus on close', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    const startAction = window.getByRole('button', { name: /start session/i });
    await startAction.focus();

    await clickApplicationMenuItem(application, 'File', 'Export...');
    await expectPortraitWindow(application, window);
    const exportDialog = await expectContainedDialog(window, 'Export Feedback');
    const closeButton = exportDialog.getByRole('button', { name: 'Close export dialog' });
    const exportButton = exportDialog.getByRole('button', { name: /Export as/ });
    await expect(closeButton).toBeFocused();
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeDisabled();
    await expect(exportDialog.getByRole('alert')).toContainText(
      'Complete a feedback session before exporting',
    );

    const projectName = exportDialog.getByRole('textbox', { name: 'Project Name' });
    await startAction.focus();
    await expect(closeButton).toBeFocused();
    await projectName.focus();
    await projectName.evaluate((element) => element.setAttribute('disabled', ''));
    await expect(closeButton).toBeFocused();
    await projectName.evaluate((element) => element.removeAttribute('disabled'));
    await projectName.focus();
    await projectName.evaluate((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });
    await expect(closeButton).toBeFocused();
    await exportDialog.locator('#markuprx-export-project-name').evaluate((element) => {
      (element as HTMLElement).style.visibility = '';
    });
    await projectName.fill(`portrait-${'unbroken-export-name-'.repeat(32)}`);
    expect(await exportDialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);

    await exportDialog.evaluate((element) => {
      const displayNoneContainer = document.createElement('div');
      displayNoneContainer.dataset.dialogDecoy = 'true';
      displayNoneContainer.style.display = 'none';
      const displayNone = document.createElement('button');
      displayNone.type = 'button';
      displayNone.textContent = 'Display none focus decoy';
      displayNoneContainer.append(displayNone);

      const inertContainer = document.createElement('div');
      inertContainer.dataset.dialogDecoy = 'true';
      inertContainer.setAttribute('inert', '');
      const inert = document.createElement('button');
      inert.type = 'button';
      inert.textContent = 'Inert focus decoy';
      inertContainer.append(inert);

      const ariaHiddenContainer = document.createElement('div');
      ariaHiddenContainer.dataset.dialogDecoy = 'true';
      ariaHiddenContainer.setAttribute('aria-hidden', 'true');
      const ariaHidden = document.createElement('button');
      ariaHidden.type = 'button';
      ariaHidden.textContent = 'ARIA hidden focus decoy';
      ariaHiddenContainer.append(ariaHidden);

      const dynamic = document.createElement('button');
      dynamic.type = 'button';
      dynamic.dataset.dialogDynamicControl = 'true';
      dynamic.textContent = 'Dynamic final action';

      element.append(displayNoneContainer, inertContainer, ariaHiddenContainer, dynamic);
    });
    const dynamicAction = exportDialog.locator('[data-dialog-dynamic-control="true"]');
    await dynamicAction.focus();
    await window.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
    await dynamicAction.evaluate((element) => element.remove());
    await closeButton.focus();
    await window.keyboard.press('Shift+Tab');
    await expect(exportDialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await exportDialog.evaluate((element) => {
      element.querySelectorAll('[data-dialog-decoy="true"]')
        .forEach((decoy) => decoy.remove());
    });
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await window.keyboard.press('Escape');
    await expect(exportDialog).toBeHidden();
    await expect(startAction).toBeFocused();
  });

  test('exports a genuine completed evidence session through the native File menu', async () => {
    test.setTimeout(120_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);
    const input = createInputSequence(mainWindow);
    const ordinaryEvidence = 'The general checkout feedback keeps this exact narration.';
    const markedEvidence = 'The marked checkout evidence keeps this exact narration.';
    await input.next();
    expect(await mainWindow.evaluate(() => window.markuprx.capture.manualScreenshot()))
      .toEqual({ success: true });
    await expect(mainWindow.getByText('+1', { exact: true })).toBeVisible();
    expect(await mainWindow.evaluate(async ({ text, recordedAt }) => {
      if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
      return window.markuprx.e2e.injectTranscript(text, recordedAt);
    }, { text: ordinaryEvidence, recordedAt: Date.now() })).toEqual({ success: true });
    await mainWindow.waitForTimeout(500);
    await drawAndCommitIssue({
      annotation,
      mainWindow,
      input,
      ordinal: 1,
      tool: 'Circle',
      color: '#ffcc00',
      comment: markedEvidence,
    });

    await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
      .toBeVisible({ timeout: 60_000 });
    const canonicalOutputRoot = await realpath(harness.outputRoot);
    const exportArtifact = async (options: {
      format: 'Markdown' | 'PDF' | 'HTML' | 'JSON';
      includeImages?: boolean;
      theme?: 'Dark' | 'Light';
      projectName: string;
    }): Promise<string> => {
      await clickApplicationMenuItem(application!, 'File', 'Export...');
      const dialog = await expectContainedDialog(mainWindow, 'Export Feedback');
      if (options.format !== 'Markdown') {
        await dialog.getByRole('button', { name: new RegExp(`^${options.format}`) }).click();
      }
      await dialog.getByRole('textbox', { name: 'Project Name' }).fill(options.projectName);
      if (options.theme) {
        await dialog.getByRole('button', { name: options.theme, exact: true }).click();
      }
      if (options.includeImages === false && options.format !== 'JSON') {
        await dialog.getByRole('button', { name: 'Include images' }).click();
      }
      if (options.format === 'PDF') {
        const preview = dialog.getByLabel('PDF export preview');
        if (options.includeImages === false) {
          await expect(preview).toContainText('Screenshots excluded');
          await expect(preview).not.toContainText('Embedded screenshots');
        } else {
          await expect(preview).toContainText('Embedded screenshots');
        }
      }
      const action = dialog.getByRole('button', { name: `Export as ${options.format}` });
      await expect(action).toBeEnabled();
      await action.click();
      const success = dialog.getByRole('status');
      await expect(success).toContainText('Exported to', { timeout: 30_000 });
      const artifactPath = (await success.locator('code').textContent())?.trim() ?? '';
      expect(artifactPath).not.toBe('');
      expect(relative(canonicalOutputRoot, artifactPath)).toMatch(/^exports\//);
      expect(relative(canonicalOutputRoot, artifactPath)).not.toContain('..');
      expect(await stat(artifactPath)).toMatchObject({ isFile: expect.any(Function) });
      expect((await stat(artifactPath)).isFile()).toBe(true);
      expect(dirname(relative(canonicalOutputRoot, artifactPath)))
        .toMatch(/^exports\/public-checkout-audit-/);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      return artifactPath;
    };

    const htmlWithImagesPath = await exportArtifact({
      format: 'HTML',
      includeImages: true,
      theme: 'Light',
      projectName: 'Public Checkout Audit HTML Images',
    });
    const htmlWithImages = await readFile(htmlWithImagesPath, 'utf8');
    expect(htmlWithImages).toContain('<h1>Public Checkout Audit HTML Images Feedback Report</h1>');
    expect(htmlWithImages).toContain(ordinaryEvidence);
    expect(htmlWithImages).toContain(markedEvidence);
    expect(htmlWithImages).toContain('<meta name="theme-color" content="#ffffff">');
    const htmlEmbeds = [...htmlWithImages.matchAll(/<img src="data:image\/png;base64,([^"]+)"/g)]
      .map((match) => match[1]);
    expect(htmlEmbeds.length).toBeGreaterThanOrEqual(1);
    expect(htmlWithImages).not.toContain('Screenshot not available');
    for (const embed of htmlEmbeds) {
      expect((await sharp(Buffer.from(embed, 'base64')).metadata()).format).toBe('png');
    }

    const htmlWithoutImagesPath = await exportArtifact({
      format: 'HTML',
      includeImages: false,
      theme: 'Dark',
      projectName: 'Public Checkout Audit HTML Text',
    });
    const htmlWithoutImages = await readFile(htmlWithoutImagesPath, 'utf8');
    expect(htmlWithoutImages).toContain(ordinaryEvidence);
    expect(htmlWithoutImages).toContain(markedEvidence);
    expect(htmlWithoutImages).not.toContain('<img src="data:image/');
    expect(htmlWithoutImages).toContain('0 screenshots');

    const markdownWithImagesPath = await exportArtifact({
      format: 'Markdown',
      includeImages: true,
      projectName: 'Public Checkout Audit Markdown Images',
    });
    const markdownWithImages = await readFile(markdownWithImagesPath, 'utf8');
    const markdownReferences = [...markdownWithImages.matchAll(/!\[[^\]]+\]\(([^)]+)\)/g)]
      .map((match) => match[1]);
    expect(markdownWithImages).toContain(ordinaryEvidence);
    expect(markdownWithImages).toContain(markedEvidence);
    expect(markdownReferences.length).toBeGreaterThanOrEqual(1);
    for (const reference of markdownReferences) {
      expect(reference).toMatch(/^\.\/assets\/fb-\d{3}(?:-\d+)?\.png$/);
      const imagePath = resolve(dirname(markdownWithImagesPath), reference);
      expect(relative(dirname(markdownWithImagesPath), imagePath)).toMatch(/^assets\//);
      expect((await sharp(imagePath).metadata()).format).toBe('png');
    }

    const markdownWithoutImagesPath = await exportArtifact({
      format: 'Markdown',
      includeImages: false,
      projectName: 'Public Checkout Audit Markdown Text',
    });
    const markdownWithoutImages = await readFile(markdownWithoutImagesPath, 'utf8');
    expect(markdownWithoutImages).toContain('Screenshots: 0');
    expect(markdownWithoutImages).not.toMatch(/!\[[^\]]+\]\([^)]+\)/);
    expect(markdownWithoutImages).toContain('Screenshots were excluded from this export.');

    const jsonPath = await exportArtifact({
      format: 'JSON',
      projectName: 'Public Checkout Audit JSON',
    });
    const jsonText = await readFile(jsonPath, 'utf8');
    const json = JSON.parse(jsonText) as {
      session: { items: Array<{ screenshots: Array<{ base64?: string }> }> };
      summary: { screenshotCount: number };
    };
    expect(json.summary.screenshotCount).toBe(markdownReferences.length);
    expect(json.session.items.flatMap((item) => item.screenshots))
      .not.toContainEqual(expect.objectContaining({ base64: expect.anything() }));
    expect(jsonText).not.toContain('data:image/');

    const pdfWithImagesPath = await exportArtifact({
      format: 'PDF',
      includeImages: true,
      theme: 'Light',
      projectName: 'Public Checkout Audit PDF Images',
    });
    const pdfWithoutImagesPath = await exportArtifact({
      format: 'PDF',
      includeImages: false,
      theme: 'Light',
      projectName: 'Public Checkout Audit PDF Text',
    });
    const pdfWithImages = await readFile(pdfWithImagesPath);
    const pdfWithoutImages = await readFile(pdfWithoutImagesPath);
    expect(pdfWithImages.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfWithoutImages.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfWithImages.length).toBeGreaterThan(pdfWithoutImages.length);
  });

  test('keeps Export guarded and retryable through delayed IPC failures', async () => {
    test.setTimeout(90_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    await selectDeterministicWindow(application, mainWindow);
    expect(await mainWindow.evaluate(async () => {
      if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
      return window.markuprx.e2e.injectTranscript(
        'A completed transcript makes the export dialog actionable.',
        Date.now(),
      );
    })).toEqual({ success: true });
    await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
      .toBeVisible({ timeout: 60_000 });

    await application.evaluate(({ ipcMain }, channel) => {
      (globalThis as typeof globalThis & { __markuprxExportCalls?: number })
        .__markuprxExportCalls = 0;
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async () => {
        const state = globalThis as typeof globalThis & { __markuprxExportCalls?: number };
        state.__markuprxExportCalls = (state.__markuprxExportCalls ?? 0) + 1;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 650));
        return { success: false, status: 'error', error: 'Injected export rejection.' };
      });
    }, 'markuprx:output:export');

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const dialog = await expectContainedDialog(mainWindow, 'Export Feedback');
    const exportAction = dialog.getByRole('button', { name: 'Export as Markdown' });
    const closeAction = dialog.getByRole('button', { name: 'Close export dialog' });
    const cancelAction = dialog.getByRole('button', { name: 'Cancel' });
    await exportAction.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(dialog.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
    await expect(closeAction).toBeDisabled();
    await expect(cancelAction).toBeDisabled();
    await dialog.locator('..').evaluate((layer) => (layer as HTMLElement).click());
    await mainWindow.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('Injected export rejection.');
    await expect(dialog.getByRole('button', { name: 'Retry Export as Markdown' })).toBeEnabled();
    expect(await application.evaluate(() => (
      globalThis as typeof globalThis & { __markuprxExportCalls?: number }
    ).__markuprxExportCalls)).toBe(1);

    await application.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({
        success: true,
        status: 'success',
        path: `/test/${'long-export-path-'.repeat(30)}report.md`,
        format: 'markdown',
      }));
    }, 'markuprx:output:export');
    await dialog.getByRole('button', { name: 'Retry Export as Markdown' }).click();
    await expect(dialog.getByRole('status')).toContainText('long-export-path-');

    await application.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async () => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
        return { success: false, status: 'error', error: 'Retry remains open.' };
      });
    }, 'markuprx:output:export');
    await dialog.getByRole('button', { name: 'Exported!' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Retry remains open.');
    await mainWindow.waitForTimeout(2_300);
    await expect(dialog).toBeVisible();
  });

  test('keeps a stale export operation from surviving recovery into a newer dialog', async () => {
    test.setTimeout(90_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    await selectDeterministicWindow(application, mainWindow);
    expect(await mainWindow.evaluate(async () => window.markuprx.e2e?.injectTranscript(
      'A completed session drives the recovery export race.',
      Date.now(),
    ))).toEqual({ success: true });
    await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
      .toBeVisible({ timeout: 60_000 });

    await application.evaluate(({ ipcMain }, channel) => {
      const state = globalThis as typeof globalThis & {
        __markuprxPendingExport?: {
          calls: number;
          resolvers: Array<(value: unknown) => void>;
        };
      };
      state.__markuprxPendingExport = { calls: 0, resolvers: [] };
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => {
        state.__markuprxPendingExport!.calls += 1;
        return new Promise((resolveExport) => {
          state.__markuprxPendingExport!.resolvers.push(resolveExport);
        });
      });
    }, 'markuprx:output:export');

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const firstDialog = await expectContainedDialog(mainWindow, 'Export Feedback');
    await firstDialog.getByRole('button', { name: 'Export as Markdown' }).click();
    await expect(firstDialog.getByRole('button', { name: 'Exporting...' })).toBeDisabled();

    await application.evaluate(({ BrowserWindow }, payload) => {
      const target = BrowserWindow.getAllWindows()
        .find((candidate) => candidate.webContents.getURL() === payload.url);
      if (!target) throw new Error('Main renderer window not found.');
      target.webContents.send('markuprx:crash-recovery:found', {
        session: payload.session,
      });
    }, {
      url: mainWindow.url(),
      session: {
        id: 'injected-recovery-export-race',
        startTime: Date.now() - 10_000,
        lastSaveTime: Date.now(),
        feedbackItems: [],
        transcriptionBuffer: '',
        sourceId: 'window:test',
        sourceName: 'Injected Recovery',
        screenshotCount: 0,
        markedIssueCount: 0,
        pendingMarkedIssue: false,
      },
    });

    await expect(firstDialog).toBeHidden();
    const recovery = await expectContainedDialog(mainWindow, 'Recover Previous Session?');
    await recovery.getByRole('button', { name: /Discard/ }).click();
    await expect(recovery).toBeHidden();
    await expect(mainWindow.getByRole('dialog', { name: 'Export Feedback' })).toHaveCount(0);

    await clickApplicationMenuItem(application, 'File', 'Export...');
    const secondDialog = await expectContainedDialog(mainWindow, 'Export Feedback');
    await expect(secondDialog.getByRole('status'))
      .toContainText('A previous export is still finishing.');
    await expect(secondDialog.getByRole('button', { name: 'Export in progress...' })).toBeDisabled();
    expect(await application.evaluate(() => (
      globalThis as typeof globalThis & {
        __markuprxPendingExport?: { calls: number };
      }
    ).__markuprxPendingExport?.calls)).toBe(1);

    await application.evaluate(() => {
      const pending = (globalThis as typeof globalThis & {
        __markuprxPendingExport?: { resolvers: Array<(value: unknown) => void> };
      }).__markuprxPendingExport;
      pending?.resolvers.shift()?.({
        success: true,
        status: 'success',
        path: '/test/stale-export.md',
        format: 'markdown',
      });
    });

    await expect(secondDialog.getByRole('button', { name: 'Export as Markdown' })).toBeEnabled();
    await mainWindow.waitForTimeout(2_400);
    await expect(secondDialog).toBeVisible();
    await expect(secondDialog.getByRole('status')).toHaveCount(0);

    await secondDialog.getByRole('button', { name: 'Export as Markdown' }).click();
    expect(await application.evaluate(() => (
      globalThis as typeof globalThis & {
        __markuprxPendingExport?: { calls: number };
      }
    ).__markuprxPendingExport?.calls)).toBe(2);
    await application.evaluate(() => {
      const pending = (globalThis as typeof globalThis & {
        __markuprxPendingExport?: { resolvers: Array<(value: unknown) => void> };
      }).__markuprxPendingExport;
      pending?.resolvers.shift()?.({
        success: false,
        status: 'error',
        error: 'Fresh export remains retryable.',
      });
    });
    await expect(secondDialog.getByRole('alert')).toContainText('Fresh export remains retryable.');
  });

  test('has no serious accessibility violations on the home and settings surfaces', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    await window.getByRole('button', { name: 'Open Settings' }).click();
    await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(window.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
    await window.waitForTimeout(500);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);

    for (const theme of ['light', 'dark'] as const) {
      const appearance = window.getByRole('tab', { name: 'Appearance', exact: true });
      await appearance.click();
      await window.getByLabel('Theme Mode').selectOption(theme);
      await expect(window.locator('html')).toHaveAttribute('data-theme', theme);

      for (const tabName of ['General', 'Recording', 'Appearance', 'Hotkeys', 'Advanced']) {
        const tab = window.getByRole('tab', { name: tabName, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expectSinglePortraitScroller(window, 'Settings');
        await expectStablePortraitSurface(window, 'Settings', theme);
      }
    }

    await setActiveWindowZoom(application, window, 2);
    try {
      await expectNoHorizontalDocumentOverflow(window);
      await expectSinglePortraitScroller(window, 'Settings');
      const advancedAtZoom = window.getByRole('tab', { name: 'Advanced', exact: true });
      await advancedAtZoom.focus();
      await window.keyboard.press('Home');
      const generalAtZoom = window.getByRole('tab', { name: 'General', exact: true });
      await expect(generalAtZoom).toBeFocused();
      await expect(generalAtZoom).toHaveAttribute('aria-selected', 'true');
      expect(await seriousAccessibilityViolations(window)).toEqual([]);
    } finally {
      await setActiveWindowZoom(application, window, 1);
    }
    await expectNoHorizontalDocumentOverflow(window);

    await window.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    expect(await window.evaluate(() => ({
      forcedColors: matchMedia('(forced-colors: active)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }))).toEqual({ forcedColors: true, reducedMotion: true });
    const general = window.getByRole('tab', { name: 'General', exact: true });
    await general.click();
    await general.focus();
    await window.keyboard.press('ArrowRight');
    const recording = window.getByRole('tab', { name: 'Recording', exact: true });
    await expect(recording).toBeFocused();
    await expect(recording).toHaveAttribute('aria-selected', 'true');
    await expectNoHorizontalDocumentOverflow(window);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);
    await window.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  });

  test('reveals an automatically selected Advanced tab without stealing heading focus', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await window.evaluate(() => window.markuprx.settings.set(
      'analysisProvider',
      'anthropic-api',
    ));

    await window.getByRole('button', { name: 'Open Settings' }).click();
    const settings = window.getByRole('region', { name: 'Settings', exact: true });
    const heading = settings.getByRole('heading', { name: 'Settings', exact: true });
    await expect(settings.getByRole('tab', { name: 'Advanced', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await expectSettingsTabUnobscured(settings, 'Advanced', 'backward');
    await expect(heading).toBeFocused();
  });

  test('reveals AI Setup selection while leaving focus on its initiating control', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await window.evaluate(() => window.markuprx.settings.set(
      'analysisProvider',
      'anthropic-api',
    ));

    await window.getByRole('button', { name: 'Open Settings' }).click();
    const settings = window.getByRole('region', { name: 'Settings', exact: true });
    await expect(settings.getByRole('tab', { name: 'Advanced', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    const general = settings.getByRole('tab', { name: 'General', exact: true });
    await general.click();
    await expectSettingsTabUnobscured(settings, 'General', 'forward');

    const aiSetup = settings.getByRole('button', { name: 'AI Setup', exact: true });
    await aiSetup.focus();
    await aiSetup.press('Enter');
    await expectSettingsTabUnobscured(settings, 'Advanced', 'backward');
    await expect(aiSetup).toBeFocused();
  });

  test('renders Settings as the approved portrait surface', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await setRendererTheme(window, 'light');
    await window.evaluate(() => {
      localStorage.setItem('markuprx:donate-message-index', '0');
    });

    await window.getByRole('button', { name: 'Open Settings' }).click();
    await expectPortraitWindow(application, window);
    await expect(window.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);

    const settings = window.getByRole('region', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await expectSinglePortraitScroller(window, 'Settings');
    await expectStablePortraitSurface(window, 'Settings', 'light');
    await expectNormalizedPortraitMetrics(
      window,
      'Settings',
      settings.getByRole('button', { name: 'Browse...' }),
    );
    const rail = settings.getByRole('tablist', { name: 'Settings sections' });
    await expect(rail).toBeVisible();
    expect(await rail.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const railAffordance = settings.getByRole('button', {
      name: 'Show more settings sections',
      exact: true,
    });
    await expect(railAffordance).toBeVisible();
    await expect(railAffordance).toHaveAttribute('data-direction', 'forward');
    const railLayout = await rail.evaluate((element) => {
      const tabs = Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]'));
      const affordance = element.parentElement!
        .querySelector<HTMLElement>('.ff-settings-section-rail__more')!;
      const railBox = element.getBoundingClientRect();
      const affordanceBox = affordance.getBoundingClientRect();
      return {
        scrollbarDisplay: getComputedStyle(element, '::-webkit-scrollbar').display,
        affordanceLeft: affordanceBox.left,
        firstThree: tabs.slice(0, 3).map((tab) => {
          const box = tab.getBoundingClientRect();
          return { left: box.left, right: box.right };
        }),
        fourthLeft: tabs[3].getBoundingClientRect().left,
        railLeft: railBox.left,
        railRight: railBox.right,
      };
    });
    expect(railLayout.scrollbarDisplay).toBe('none');
    for (const tab of railLayout.firstThree) {
      expect(tab.left).toBeGreaterThanOrEqual(railLayout.railLeft);
      expect(tab.right).toBeLessThanOrEqual(railLayout.affordanceLeft);
    }
    expect(railLayout.fourthLeft).toBeGreaterThanOrEqual(railLayout.railRight);

    await railAffordance.click();
    const hotkeys = rail.getByRole('tab', { name: 'Hotkeys', exact: true });
    await expect(hotkeys).toBeFocused();
    await expect(hotkeys).toHaveAttribute('aria-selected', 'true');
    await expectSettingsTabUnobscured(settings, 'Hotkeys', 'forward');
    const moreSections = settings.getByRole('button', {
      name: 'Show more settings sections',
      exact: true,
    });
    await moreSections.press('Enter');
    const advancedFromAffordance = rail.getByRole('tab', {
      name: 'Advanced',
      exact: true,
    });
    await expect(advancedFromAffordance).toBeFocused();
    await expectSettingsTabUnobscured(settings, 'Advanced', 'backward');

    await settings.getByRole('button', { name: 'Back to MarkuprX', exact: true }).click();
    await window.evaluate(() => {
      localStorage.setItem('markuprx:donate-message-index', '0');
    });
    await window.getByRole('button', { name: 'Open Settings', exact: true }).click();
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Buy Eddie a Coffee', exact: true }))
      .toBeVisible();
    const generalBeforeScreenshot = rail.getByRole('tab', { name: 'General', exact: true });
    await expect(settings.getByRole('button', {
      name: 'Show more settings sections',
      exact: true,
    })).toHaveAttribute('data-direction', 'forward');
    await generalBeforeScreenshot.focus();
    await expect(generalBeforeScreenshot).toBeFocused();
    await expect(generalBeforeScreenshot).toHaveAttribute('aria-selected', 'true');
    await expectStablePortraitSurface(window, 'Settings', 'light');

    await expectPortraitScreenshot(window, 'settings-portrait.png', [
      settings.getByRole('textbox', { name: 'Output Directory', exact: true }),
    ]);
    await expectActionsWithinPortrait([
      settings.getByRole('button', { name: 'Back to MarkuprX', exact: true }),
      settings.getByRole('button', { name: 'Reset All to Defaults', exact: true }),
    ]);

    const general = rail.getByRole('tab', { name: 'General', exact: true });
    await general.focus();
    await window.keyboard.press('End');
    const advanced = rail.getByRole('tab', { name: 'Advanced', exact: true });
    await expect(advanced).toBeFocused();
    await expect(advanced).toHaveAttribute('aria-selected', 'true');
    await expectSettingsTabUnobscured(settings, 'Advanced', 'backward');
    expect(await seriousAccessibilityViolations(window)).toEqual([]);
  });

  test('renders Keyboard Shortcuts as a portrait surface', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;
    await setRendererTheme(window, 'light');

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');
    await expectPortraitWindow(application, window);
    await expect(window.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toHaveCount(0);
    const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    await expect(shortcuts).toHaveCount(1);
    await expect(window.getByRole('region', { name: 'Keyboard shortcuts list', exact: true }))
      .toBeVisible();
    await expect(shortcuts.getByPlaceholder('Search shortcuts...')).toBeVisible();
    await expect(shortcuts.getByRole('heading', { name: 'Recording' })).toBeVisible();
    const scroller = await expectSinglePortraitScroller(window, 'Keyboard Shortcuts');
    await expectStablePortraitSurface(window, 'Keyboard Shortcuts', 'light');
    await expectNormalizedPortraitMetrics(
      window,
      'Keyboard Shortcuts',
      shortcuts.getByPlaceholder('Search shortcuts...'),
    );
    const scrollLayout = await scroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(scrollLayout.scrollHeight).toBeGreaterThan(scrollLayout.clientHeight);
    expect(scrollLayout.scrollWidth).toBeLessThanOrEqual(scrollLayout.clientWidth);
    await expectPortraitScreenshot(window, 'shortcuts-portrait.png');
    await expectActionsWithinPortrait([
      shortcuts.getByRole('button', { name: 'Back to MarkuprX', exact: true }),
      shortcuts.getByRole('button', {
        name: 'Rebind Start/Stop Recording',
        exact: true,
      }),
    ]);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);
  });

  test('makes customizable shortcut rows keyboard accessible', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');

    const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    const rebind = shortcuts.getByRole('button', {
      name: 'Rebind Start/Stop Recording',
      exact: true,
    });
    await expect(rebind).toBeVisible();
    await shortcuts.getByPlaceholder('Search shortcuts...').focus();
    await window.keyboard.press('Tab');
    await expect(rebind).toBeFocused();
    const focusStyle = await rebind.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe('none');
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

    await rebind.press('Enter');
    await expect(shortcuts.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(shortcuts.getByRole('button', {
      name: 'Rebind Start/Stop Recording',
      exact: true,
    })).toHaveCount(0);
    expect(await seriousAccessibilityViolations(window)).toEqual([]);
    await shortcuts.getByRole('button', { name: 'Cancel' }).click();

    const rebindWithSpace = shortcuts.getByRole('button', {
      name: 'Rebind Start/Stop Recording',
      exact: true,
    });
    await rebindWithSpace.focus();
    await rebindWithSpace.press('Space');
    await expect(shortcuts.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('Escape cancels active shortcut capture without closing Shortcuts', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');

    const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    const recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    const primaryKey = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    expect(await recordingRow.locator('kbd').allTextContents()).toEqual([primaryKey, '⇧', 'F']);

    await recordingRow.click();
    await window.keyboard.press('Control+Alt+J');
    await expect(shortcuts.getByRole('button', { name: 'Save' })).toBeVisible();
    await window.keyboard.press('Escape');

    await expect(shortcuts).toBeVisible();
    await expect(shortcuts.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    expect(await recordingRow.locator('kbd').allTextContents()).toEqual([primaryKey, '⇧', 'F']);
  });

  test('registers and persists a shortcut rebind from the app surface', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    const homeAction = window.getByRole('button', { name: /start session/i });
    await expect(homeAction).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');

    let shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    let recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    await recordingRow.click();
    await window.keyboard.press('Control+Alt+J');
    await shortcuts.getByRole('button', { name: 'Save' }).click();

    const expectedAccelerator = 'CommandOrControl+Alt+J';
    await expect.poll(() => window.evaluate(async () => {
      const [registered, persisted] = await Promise.all([
        window.markuprx.hotkeys.getConfig(),
        window.markuprx.settings.get('hotkeys'),
      ]);
      return {
        registered: registered.toggleRecording,
        persisted: persisted.toggleRecording,
      };
    })).toEqual({
      registered: expectedAccelerator,
      persisted: expectedAccelerator,
    });

    const primaryKey = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    await expect.poll(() => recordingRow.locator('kbd').allTextContents())
      .toEqual([primaryKey, '⌥', 'J']);

    await window.keyboard.press('Escape');
    await expect(homeAction).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');
    shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    expect(await recordingRow.locator('kbd').allTextContents())
      .toEqual([primaryKey, '⌥', 'J']);
  });

  test('restores a persisted shortcut registration after relaunch', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ initializeHotkeys: true });
    let launched = await launchApplication(harness);
    application = launched.application;
    let window = launched.mainWindow;

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');
    let shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    let recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    await recordingRow.click();
    await window.keyboard.press('Control+Alt+J');
    await shortcuts.getByRole('button', { name: 'Save' }).click();

    const expectedAccelerator = 'CommandOrControl+Alt+J';
    await expect.poll(() => window.evaluate(async () => ({
      live: (await window.markuprx.hotkeys.getConfig()).toggleRecording,
      persisted: (await window.markuprx.settings.get('hotkeys')).toggleRecording,
    }))).toEqual({
      live: expectedAccelerator,
      persisted: expectedAccelerator,
    });
    expect(await application.evaluate(({ globalShortcut }, accelerator) => (
      globalShortcut.isRegistered(accelerator)
    ), expectedAccelerator)).toBe(true);

    await application.close();
    application = null;
    launched = await launchApplication(harness);
    application = launched.application;
    window = launched.mainWindow;
    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();

    const restored = await window.evaluate(async () => ({
      live: (await window.markuprx.hotkeys.getConfig()).toggleRecording,
      persisted: (await window.markuprx.settings.get('hotkeys')).toggleRecording,
    }));
    expect(restored).toEqual({
      live: expectedAccelerator,
      persisted: expectedAccelerator,
    });
    expect(await application.evaluate(({ globalShortcut }, accelerator) => (
      globalShortcut.isRegistered(accelerator)
    ), expectedAccelerator)).toBe(true);

    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');
    shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    const primaryKey = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    await expect.poll(() => recordingRow.locator('kbd').allTextContents())
      .toEqual([primaryKey, '⌥', 'J']);
  });

  test('persists the actual fallback configuration chosen during startup', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ initializeHotkeys: true });
    let launched = await launchApplication(harness);
    application = launched.application;
    let window = launched.mainWindow;

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    const configured = {
      toggleRecording: 'CommandOrControl+Alt+J',
      manualScreenshot: 'CommandOrControl+Alt+J',
      pauseResume: 'CommandOrControl+Alt+K',
    };
    await window.evaluate((hotkeys) => window.markuprx.settings.set('hotkeys', hotkeys), configured);
    await application.close();
    application = null;

    launched = await launchApplication(harness);
    application = launched.application;
    window = launched.mainWindow;
    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();

    const reconciled = await window.evaluate(async () => ({
      live: await window.markuprx.hotkeys.getConfig(),
      persisted: await window.markuprx.settings.get('hotkeys'),
    }));
    expect(reconciled.persisted).toEqual(reconciled.live);
    expect(reconciled.live.toggleRecording).toBe(configured.toggleRecording);
    expect(reconciled.live.manualScreenshot).not.toBe(configured.manualScreenshot);
    expect(new Set(Object.values(reconciled.live)).size).toBe(3);
    for (const accelerator of Object.values(reconciled.live)) {
      expect(await application.evaluate(({ globalShortcut }, registeredAccelerator) => (
        globalShortcut.isRegistered(registeredAccelerator)
      ), accelerator)).toBe(true);
    }
  });

  test('reports and displays the actual fallback when a requested shortcut is unavailable', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    const reserved = await application.evaluate(({ globalShortcut }) => (
      globalShortcut.register('CommandOrControl+Alt+J', () => {})
    ));
    expect(reserved).toBe(true);
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');

    const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    const recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    await recordingRow.click();
    await window.keyboard.press('Control+Alt+J');
    await shortcuts.getByRole('button', { name: 'Save' }).click();

    const expectedFallback = 'CommandOrControl+Shift+R';
    await expect.poll(() => window.evaluate(async () => {
      const [registered, persisted] = await Promise.all([
        window.markuprx.hotkeys.getConfig(),
        window.markuprx.settings.get('hotkeys'),
      ]);
      return {
        registered: registered.toggleRecording,
        persisted: persisted.toggleRecording,
      };
    })).toEqual({
      registered: expectedFallback,
      persisted: expectedFallback,
    });
    await expect(shortcuts.getByRole('status'))
      .toContainText(/requested shortcut.*unavailable.*using.*shift.*r/i);
    await expect(shortcuts.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    const primaryKey = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    expect(await recordingRow.locator('kbd').allTextContents())
      .toEqual([primaryKey, '⇧', 'R']);
  });

  test('rolls back a registered shortcut when settings persistence fails', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({
      initializeHotkeys: true,
      failHotkeyPersistenceAfterRegistration: true,
    });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await expect(window.getByRole('button', { name: /start session/i })).toBeVisible();
    await expect.poll(() => window.evaluate(async () => {
      const config = await window.markuprx.hotkeys.getConfig();
      return window.markuprx.settings.get('hotkeys').then((stored) => (
        stored.toggleRecording === config.toggleRecording
      ));
    })).toBe(true);
    const priorAccelerator = await window.evaluate(async () => (
      (await window.markuprx.hotkeys.getConfig()).toggleRecording
    ));
    expect(await application.evaluate(({ globalShortcut }, accelerator) => (
      globalShortcut.isRegistered(accelerator)
    ), priorAccelerator)).toBe(true);
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');

    const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    const recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    await recordingRow.click();
    await window.keyboard.press('Control+Alt+J');
    const save = shortcuts.getByRole('button', { name: 'Save' });
    await save.click();

    await expect(shortcuts.getByRole('alert')).toContainText(/unable|shortcut|hotkey/i);
    await expect(save).toBeEnabled();
    const primaryKey = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    expect(await recordingRow.locator('kbd').allTextContents())
      .toEqual([primaryKey, '⌥', 'J']);

    const unchanged = await window.evaluate(async () => {
      const [registered, persisted] = await Promise.all([
        window.markuprx.hotkeys.getConfig(),
        window.markuprx.settings.get('hotkeys'),
      ]);
      return {
        registered: registered.toggleRecording,
        persisted: persisted.toggleRecording,
      };
    });
    expect(unchanged).toEqual({
      registered: priorAccelerator,
      persisted: priorAccelerator,
    });
    const registrations = await application.evaluate(({ globalShortcut }, accelerators) => ({
      prior: globalShortcut.isRegistered(accelerators.prior),
      requested: globalShortcut.isRegistered(accelerators.requested),
    }), {
      prior: priorAccelerator,
      requested: 'CommandOrControl+Alt+J',
    });
    expect(registrations).toEqual({ prior: true, requested: false });
  });

  test('preserves shortcut search in the portrait surface', async () => {
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    const homeAction = window.getByRole('button', { name: /start session/i });
    await expect(homeAction).toBeVisible();
    await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');

    const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts', exact: true });
    const search = shortcuts.getByPlaceholder('Search shortcuts...');
    await expect(search).toBeFocused();
    await search.fill('pause');
    await expect(shortcuts.getByText('Pause/Resume', { exact: true })).toBeVisible();
    await shortcuts.getByRole('button', { name: 'Clear shortcut search' }).click();
    await expect(search).toBeFocused();

    const recordingRow = shortcuts.locator('.ff-shortcut-row')
      .filter({ hasText: 'Start/Stop Recording' });
    const primaryKey = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    expect(await recordingRow.locator('kbd').allTextContents()).toEqual([primaryKey, '⇧', 'F']);

    await recordingRow.click();
    await expect(shortcuts.getByText('Press keys...', { exact: true })).toBeVisible();
    await window.keyboard.press('Control+Shift+S');
    await expect(shortcuts.getByText('Conflicts with: Take Screenshot', { exact: true }))
      .toBeVisible();
    await shortcuts.getByRole('button', { name: 'Cancel' }).click();
    await expect(shortcuts.getByText('Press keys...', { exact: true })).toHaveCount(0);

    await window.keyboard.press('Escape');
    await expect(homeAction).toBeVisible();
  });

  test('keeps recording and processing HUDs matched to their compact windows', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ processingDelayMs: 500 });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await selectDeterministicWindow(application, window);
    await expectHudWindow(application, window, { width: 316, height: 90 });
    expect(await window.evaluate(async () => window.markuprx.e2e?.injectTranscript(
      'Portrait HUD completion fixture.',
      Date.now(),
    ))).toEqual({ success: true });

    await window.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(async () => {
      const pageUrl = window.url();
      const bounds = await application!.evaluate(({ BrowserWindow }, url) => {
        const candidate = BrowserWindow.getAllWindows()
          .find((current) => current.webContents.getURL() === url);
        return candidate?.getBounds() ?? null;
      }, pageUrl);
      return bounds?.width === 320 && bounds.height === 140;
    }).toBe(true);
    await expectHudWindow(application, window, { width: 320, height: 140 });
    await expect.poll(async () => (await diagnostics(window)).state, {
      timeout: 60_000,
    }).toBe('complete');
    await expect(window.getByRole('heading', { name: 'Report Ready' })).toBeVisible({
      timeout: 60_000,
    });
    await expectPortraitWindow(application, window);
  });

  test('stops Reset All after the first persistence failure', async () => {
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ failSettingsKey: 'outputDirectory' });
    const launched = await launchApplication(harness);
    application = launched.application;
    const window = launched.mainWindow;

    await window.evaluate(() => window.markuprx.settings.set('theme', 'dark'));
    await window.getByRole('button', { name: 'Open Settings' }).click();
    await expect(window.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Reset All to Defaults', exact: true }).click();

    await expect(window.getByText('Unable to save', { exact: true })).toBeVisible();
    await expect.poll(() => window.evaluate(() => window.markuprx.settings.get('theme'))).toBe('dark');
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
    await expect(window.getByText('Saved', { exact: true })).toBeVisible();

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

  test('commits one marked screenshot when modifier release and navigation click arrive together', async () => {
    test.setTimeout(60_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);
    const input = createInputSequence(mainWindow);
    await input.next();
    await input.next({ modifierDown: true });
    await drawStroke(annotation, { x: 210, y: 170 }, { x: 430, y: 260 });

    const comment = 'The combined release click must preserve this evidence.';
    expect(await mainWindow.evaluate(async ({ text, recordedAt }) => {
      if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
      return window.markuprx.e2e.injectTranscript(text, recordedAt);
    }, { text: comment, recordedAt: Date.now() })).toEqual({ success: true });
    await mainWindow.waitForTimeout(1_900);

    // A single observer tick can contain both the modifier-up edge and the
    // primary-down edge. Production must snapshot before the clear event.
    await input.next({ modifierDown: false, primaryDown: true });
    await input.next({ primaryDown: false });
    await expect.poll(async () => (await diagnostics(mainWindow))).toMatchObject({
      markedIssueCount: 1,
      pendingMarkedIssue: false,
    });

    await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
      .toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => {
      const entries = await readdir(harness.outputRoot, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).length;
    }, { timeout: 45_000 }).toBe(1);
    const sessionDir = await findOnlySessionDirectory(harness.outputRoot);
    const report = await readFile(join(sessionDir, 'feedback-report.md'), 'utf8');
    expect(report).toContain(comment);
    expect(report).toContain('./screenshots/marked-issue-001.png');
    expect((await stat(join(sessionDir, 'screenshots', 'marked-issue-001.png'))).size)
      .toBeGreaterThan(1_000);
  });

  test('finalizes an unclicked marked area with narration when Stop is chosen', async () => {
    test.setTimeout(90_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const annotation = await selectDeterministicWindow(application, mainWindow);
    const input = createInputSequence(mainWindow);
    const comment = 'The final pending mark must be included when recording stops.';

    await input.next();
    await input.next({ modifierDown: true });
    await drawStroke(annotation, { x: 230, y: 190 }, { x: 450, y: 280 });
    await input.next({ modifierDown: false });
    await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(true);
    expect(await mainWindow.evaluate(async ({ text, recordedAt }) => {
      if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
      return window.markuprx.e2e.injectTranscript(text, recordedAt);
    }, { text: comment, recordedAt: Date.now() })).toEqual({ success: true });
    await mainWindow.waitForTimeout(2_200);

    await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
      .toBeVisible({ timeout: 60_000 });

    const sessionDir = await findOnlySessionDirectory(harness.outputRoot);
    const report = await readFile(join(sessionDir, 'feedback-report.md'), 'utf8');
    const metadata = JSON.parse(
      await readFile(join(sessionDir, 'metadata.json'), 'utf8'),
    ) as {
      itemCount: number;
      screenshotCount: number;
      markedIssues: Array<{ id: string; comment?: string; screenshotPath?: string }>;
    };
    expect(report).toContain('### MX-001');
    expect(report).toContain(comment);
    expect(report).toContain('./screenshots/marked-issue-001.png');
    expect(metadata).toMatchObject({
      itemCount: 1,
      screenshotCount: 1,
      markedIssues: [{
        id: 'marked-issue-001',
        comment,
        screenshotPath: 'screenshots/marked-issue-001.png',
      }],
    });
    expect((await stat(join(sessionDir, 'screenshots', 'marked-issue-001.png'))).size)
      .toBeGreaterThan(1_000);
  });

  test('keeps marked evidence isolated across back-to-back sessions', async () => {
    test.setTimeout(120_000);
    const launched = await launchApplication(harness);
    application = launched.application;
    const mainWindow = launched.mainWindow;
    const firstComment = 'First session checkout feedback.';
    const secondComment = 'Second session navigation feedback.';

    const recordOneIssue = async (
      comment: string,
      tool: 'Pen' | 'Circle',
      color: string,
    ): Promise<void> => {
      const annotation = await selectDeterministicWindow(application!, mainWindow);
      const input = createInputSequence(mainWindow);
      await input.next();
      await drawAndCommitIssue({
        annotation,
        mainWindow,
        input,
        ordinal: 1,
        tool,
        color,
        comment,
      });
      await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
      await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
        .toBeVisible({ timeout: 60_000 });
    };

    await recordOneIssue(firstComment, 'Pen', '#ff3b30');
    await expect.poll(async () => {
      const entries = await readdir(harness.outputRoot, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).length;
    }).toBe(1);

    await recordOneIssue(secondComment, 'Circle', '#ffcc00');
    await expect.poll(async () => {
      const entries = await readdir(harness.outputRoot, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).length;
    }, { timeout: 60_000 }).toBe(2);

    const sessionDirectories = (await readdir(harness.outputRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(harness.outputRoot, entry.name));
    const sessions = await Promise.all(sessionDirectories.map(async (sessionDir) => ({
      sessionDir,
      report: await readFile(join(sessionDir, 'feedback-report.md'), 'utf8'),
      metadata: JSON.parse(
        await readFile(join(sessionDir, 'metadata.json'), 'utf8'),
      ) as {
        sessionId: string;
        screenshotCount: number;
        markedIssues: Array<{ id: string; comment?: string; screenshotPath?: string }>;
      },
    })));

    expect(new Set(sessions.map(({ metadata }) => metadata.sessionId)).size).toBe(2);
    expect(sessions.filter(({ report }) => report.includes(firstComment))).toHaveLength(1);
    expect(sessions.filter(({ report }) => report.includes(secondComment))).toHaveLength(1);
    expect(sessions.every(({ report }) =>
      report.includes('./screenshots/marked-issue-001.png'))).toBe(true);
    expect(sessions.every(({ metadata }) =>
      metadata.screenshotCount === 1 && metadata.markedIssues.length === 1)).toBe(true);

    const firstSession = sessions.find(({ report }) => report.includes(firstComment));
    const secondSession = sessions.find(({ report }) => report.includes(secondComment));
    expect(firstSession?.report).not.toContain(secondComment);
    expect(secondSession?.report).not.toContain(firstComment);
    expect(firstSession?.metadata.markedIssues).toMatchObject([{
      id: 'marked-issue-001',
      comment: firstComment,
      screenshotPath: 'screenshots/marked-issue-001.png',
    }]);
    expect(secondSession?.metadata.markedIssues).toMatchObject([{
      id: 'marked-issue-001',
      comment: secondComment,
      screenshotPath: 'screenshots/marked-issue-001.png',
    }]);
    for (const { sessionDir } of sessions) {
      expect((await stat(join(sessionDir, 'screenshots', 'marked-issue-001.png'))).size)
        .toBeGreaterThan(1_000);
    }
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

    const recoveredComment = `The recovered checkout button needs more contrast. ${'unbroken-recovery-note-'.repeat(18)}`;
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
    await expectPortraitWindow(application, mainWindow);
    const recoveryDialog = await expectContainedDialog(mainWindow, 'Recover Previous Session?');
    const showDetails = recoveryDialog.getByRole('button', { name: 'Show details' });
    const recoverAction = recoveryDialog.getByRole('button', { name: /Recover Session/ });
    await expect(showDetails).toBeFocused();
    await expect(recoveryDialog.locator('..'))
      .toHaveAttribute('data-contained-dialog-stack-index', '0');
    await clickApplicationMenuItem(application, 'File', 'Export...');
    await expect(mainWindow.getByRole('dialog', { name: 'Export Feedback' })).toHaveCount(0);
    await expect(mainWindow.getByRole('dialog')).toHaveCount(1);
    await expect(showDetails).toBeFocused();
    await showDetails.focus();
    await mainWindow.keyboard.press('Shift+Tab');
    await expect(recoverAction).toBeFocused();
    await mainWindow.keyboard.press('Tab');
    await expect(showDetails).toBeFocused();
    await showDetails.click();
    await expectContainedDialog(mainWindow, 'Recover Previous Session?');
    await expect(recoveryDialog.getByText('Marked issues:')).toBeVisible();
    await expect(recoveryDialog.getByText('1', { exact: true })).toBeVisible();
    await expect(recoveryDialog.getByText('Uncommitted drawing:')).toBeVisible();
    await expect(recoveryDialog.getByText('Not included', { exact: true })).toBeVisible();
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);

    await recoveryDialog.getByRole('button', { name: /Recover Session/ }).click();
    await expect(recoveryDialog).toBeHidden({ timeout: 30_000 });
    await expect(mainWindow.getByRole('dialog', { name: 'Export Feedback' })).toHaveCount(0);
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
    await harness.cleanup();
    harness = await createElectronHarnessEnvironment({ reviewSaveDelayMs: 500 });
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
    expect(metadata.itemCount).toBe(3);
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
    await expectPortraitWindow(application, mainWindow);
    await expect(mainWindow.getByText('Latest Report Path')).toBeVisible();
    await expect(mainWindow.getByText(reportPath, { exact: true })).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Open Settings' }).click();
    await mainWindow.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await mainWindow.getByLabel('Theme Mode').selectOption('light');
    await expect.poll(() => mainWindow.evaluate(() =>
      document.documentElement.getAttribute('data-theme'))).toBe('light');
    await mainWindow.getByRole('button', { name: 'Back to MarkuprX' }).click();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' })).toBeVisible();

    // Exercise the completed-session editor against the already-saved report.
    // The update must happen in place without losing marked evidence or media.
    await mainWindow.getByRole('button', { name: 'Open Review Editor' }).click();
    const review = mainWindow.getByRole('region', { name: 'Review Editor' });
    await expect(review).toBeVisible();
    await expect(mainWindow.getByRole('heading', { name: 'Report Ready' })).toBeHidden();
    await expect(mainWindow.getByRole('heading', { name: 'Recent Captures' })).toBeHidden();
    await expectPortraitWindow(application, mainWindow);
    await expectSinglePortraitScroller(mainWindow, 'Review Editor');
    await expectStablePortraitSurface(mainWindow, 'Review Editor', 'light');
    await expectNormalizedPortraitMetrics(
      mainWindow,
      'Review Editor',
      review.getByRole('button', { name: 'Open Folder', exact: true }),
    );
    const feedbackRegion = review.getByRole('region', { name: 'Feedback items' });
    await expect(feedbackRegion).toBeVisible();
    const reviewLayout = await feedbackRegion.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      hasVerticalScroll: element.scrollHeight > element.clientHeight,
    }));
    expect(reviewLayout.scrollWidth).toBeLessThanOrEqual(reviewLayout.clientWidth);
    expect(reviewLayout.hasVerticalScroll).toBe(true);
    await expectPortraitScreenshot(mainWindow, 'review-portrait.png', [
      review.getByRole('img', { name: /Screenshot \d+/ }),
    ]);
    await expectActionsWithinPortrait([
      review.getByRole('button', { name: 'Open Folder', exact: true }),
      review.getByRole('button', { name: 'Copy', exact: true }),
      review.getByRole('button', { name: 'Save', exact: true }),
      review.getByRole('button', { name: 'Close', exact: true }),
    ]);

    const navigationDraftComment = 'Draft retained while visiting session history.';
    await review.locator('p').filter({ hasText: cases[0].comment }).first().dblclick();
    let draftEditor = mainWindow.getByPlaceholder('Enter feedback text...');
    await draftEditor.fill(navigationDraftComment);
    await draftEditor.press('Enter');
    await expect(mainWindow.getByText('Unsaved changes', { exact: true })).toBeVisible();

    const classifiedDraftCard = review.getByRole('listitem').nth(0);
    await classifiedDraftCard.getByRole('button', { name: 'UX Issue', exact: true }).click();
    await classifiedDraftCard.getByRole('button', { name: 'Bug', exact: true }).click();
    await classifiedDraftCard.getByRole('button', { name: 'Medium', exact: true }).click();
    await classifiedDraftCard.getByRole('button', { name: 'High', exact: true }).click();

    const inlineDraftComment = 'Inline draft retained across native navigation.';
    await review.locator('p').filter({ hasText: cases[1].comment }).first().dblclick();
    draftEditor = mainWindow.getByPlaceholder('Enter feedback text...');
    await draftEditor.fill(inlineDraftComment);

    await clickApplicationMenuItem(application, 'File', 'Session History');
    const historyFromReview = mainWindow.getByRole('region', { name: 'Session History' });
    await expect(historyFromReview).toBeVisible();
    await expect(review).toHaveCount(0);
    await expect(mainWindow.locator('.ff-portrait-surface')).toHaveCount(1);
    await expect(mainWindow.getByRole('region', { name: 'Keyboard Shortcuts', exact: true }))
      .toHaveCount(0);
    await historyFromReview.getByRole('button', { name: 'Back to MarkuprX' }).click();
    await expect(review).toBeVisible();
    await expect(mainWindow.locator('.ff-portrait-surface')).toHaveCount(1);
    await expect(mainWindow.getByText(navigationDraftComment, { exact: true })).toBeVisible();
    await expect(review.getByRole('listitem').nth(0)
      .getByRole('button', { name: 'Bug', exact: true })).toBeVisible();
    await expect(review.getByRole('listitem').nth(0)
      .getByRole('button', { name: 'High', exact: true })).toBeVisible();
    const restoredInlineEditor = mainWindow.getByPlaceholder('Enter feedback text...');
    await expect(restoredInlineEditor).toHaveValue(inlineDraftComment);
    await restoredInlineEditor.press('Escape');
    const restoredInlineCard = review.getByRole('listitem').filter({ hasText: cases[1].comment });
    await expect(mainWindow.getByText(cases[1].comment, { exact: true })).toBeVisible();
    await expect(mainWindow.getByText(inlineDraftComment, { exact: true })).toBeHidden();
    expect(await reviewItemFocusState(restoredInlineCard)).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    const lightContrast = await measureReviewContrast(review, navigationDraftComment);
    expect(lightContrast.shellOpaque).toBe(true);
    expect(lightContrast.shellMatchesTheme).toBe(true);
    expect(lightContrast.bodyContrast).toBeGreaterThanOrEqual(4.5);
    expect(lightContrast.footerContrast).toBeGreaterThanOrEqual(4.5);
    await expect.poll(() => review.locator('.ff-list-item-enter').last().evaluate((element) =>
      getComputedStyle(element).opacity)).toBe('1');
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);

    const feedbackItems = review.getByRole('listitem');
    await expect(feedbackItems).toHaveCount(3);
    const firstFeedback = feedbackItems.nth(0);
    await firstFeedback.focus();
    await expect(firstFeedback).toBeFocused();
    await expect(firstFeedback).toHaveAttribute('aria-current', 'true');
    const focusAppearance = await firstFeedback.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusAppearance).toEqual({ outlineStyle: 'solid', outlineWidth: '2px' });
    await mainWindow.keyboard.press('ArrowDown');
    await expect(feedbackItems.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(feedbackItems.nth(1)).toBeFocused();
    await mainWindow.keyboard.press('ArrowUp');
    await expect(feedbackItems.nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(feedbackItems.nth(0)).toBeFocused();

    const firstMore = firstFeedback.getByRole('button', {
      name: 'More actions for feedback FB-001',
    });
    await expect(firstMore).toBeVisible();
    await firstMore.focus();
    await mainWindow.keyboard.press('Enter');
    let feedbackMenu = firstFeedback.getByRole('menu', { name: 'Feedback actions for FB-001' });
    await expect(feedbackMenu).toBeVisible();
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Move Up' })).toBeDisabled();
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Move Down' })).toBeEnabled();
    const feedbackMenuBox = await feedbackMenu.boundingBox();
    expect(feedbackMenuBox).not.toBeNull();
    expect(feedbackMenuBox!.x).toBeGreaterThanOrEqual(0);
    expect(feedbackMenuBox!.x + feedbackMenuBox!.width).toBeLessThanOrEqual(460);
    expect(feedbackMenuBox!.y).toBeGreaterThanOrEqual(0);
    expect(feedbackMenuBox!.y + feedbackMenuBox!.height).toBeLessThanOrEqual(680);
    await mainWindow.keyboard.press('End');
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await mainWindow.keyboard.press('Home');
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await mainWindow.keyboard.press('ArrowUp');
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await mainWindow.keyboard.press('ArrowDown');
    await expect(feedbackMenu.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await mainWindow.keyboard.press('Escape');
    await expect(feedbackMenu).toBeHidden();
    await expect(firstMore).toBeFocused();

    await firstMore.press('Enter');
    feedbackMenu = firstFeedback.getByRole('menu', { name: 'Feedback actions for FB-001' });
    await feedbackMenu.getByRole('menuitem', { name: 'Move Down' }).click();
    await expect(feedbackItems.nth(0)).toContainText(cases[1].comment);
    await expect(feedbackItems.nth(1)).toContainText(navigationDraftComment);
    await expect(feedbackItems.nth(1)).toHaveAttribute('aria-current', 'true');
    expect(await reviewItemFocusState(feedbackItems.nth(1))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    const movedMore = feedbackItems.nth(1).getByRole('button', {
      name: 'More actions for feedback FB-002',
    });
    await movedMore.click();
    await feedbackItems.nth(1)
      .getByRole('menu', { name: 'Feedback actions for FB-002' })
      .getByRole('menuitem', { name: 'Move Up' })
      .click();
    await expect(feedbackItems.nth(0)).toContainText(navigationDraftComment);
    await expect(feedbackItems.nth(0)).toHaveAttribute('aria-current', 'true');
    expect(await reviewItemFocusState(feedbackItems.nth(0))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    await feedbackItems.nth(0)
      .getByRole('button', { name: 'More actions for feedback FB-001' })
      .click();
    await feedbackItems.nth(0)
      .getByRole('menu', { name: 'Feedback actions for FB-001' })
      .getByRole('menuitem', { name: 'Edit' })
      .click();
    await expect(mainWindow.getByPlaceholder('Enter feedback text...')).toBeFocused();
    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.getByText(navigationDraftComment, { exact: true })).toBeVisible();
    expect(await reviewItemFocusState(feedbackItems.nth(0))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    const thirdFeedback = feedbackItems.nth(2);
    await thirdFeedback
      .getByRole('button', { name: 'More actions for feedback FB-003' })
      .click();
    await thirdFeedback
      .getByRole('menu', { name: 'Feedback actions for FB-003' })
      .getByRole('menuitem', { name: 'Delete' })
      .click();
    await expect(feedbackItems).toHaveCount(2);
    expect(await reviewItemFocusState(feedbackItems.nth(1))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });
    await expect(mainWindow.getByText('Deleted FB-003', { exact: true })).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(feedbackItems).toHaveCount(3);
    await expect(feedbackItems.nth(2)).toContainText(cases[2].comment);
    expect(await reviewItemFocusState(feedbackItems.nth(2))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    // Keyboard deletion follows the same nearest-neighbor focus contract.
    await mainWindow.keyboard.press('Delete');
    await expect(feedbackItems).toHaveCount(2);
    expect(await reviewItemFocusState(feedbackItems.nth(1))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });
    await mainWindow.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(feedbackItems).toHaveCount(3);
    expect(await reviewItemFocusState(feedbackItems.nth(2))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    // Deleting the first item chooses the next item at the same index.
    await feedbackItems.nth(0).focus();
    await mainWindow.keyboard.press('Delete');
    await expect(feedbackItems).toHaveCount(2);
    expect(await reviewItemFocusState(feedbackItems.nth(0))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });
    await mainWindow.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(feedbackItems).toHaveCount(3);
    expect(await reviewItemFocusState(feedbackItems.nth(0))).toEqual({
      focused: true,
      ariaCurrent: 'true',
      tabIndex: 0,
    });

    // With no surviving cards, focus falls back to a safe Review control.
    await mainWindow.keyboard.press('Delete');
    await expect(feedbackItems).toHaveCount(2);
    await feedbackItems.nth(0).focus();
    await mainWindow.keyboard.press('Delete');
    await expect(feedbackItems).toHaveCount(1);
    await feedbackItems.nth(0).focus();
    await mainWindow.keyboard.press('Delete');
    await expect(feedbackItems).toHaveCount(0);
    expect(await review.getByRole('button', { name: 'Preview', exact: true }).evaluate(
      (element) => document.activeElement === element,
    )).toBe(true);

    for (const expectedCount of [1, 2, 3]) {
      await mainWindow.getByRole('button', { name: 'Undo', exact: true }).last().click();
      await expect(feedbackItems).toHaveCount(expectedCount);
      const restoredItem = feedbackItems.nth(0);
      expect(await reviewItemFocusState(restoredItem)).toEqual({
        focused: true,
        ariaCurrent: 'true',
        tabIndex: 0,
      });
    }

    await expect(mainWindow.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    const reviewActions = await Promise.all(
      ['Open Folder', 'Copy', 'Save', 'Close'].map(async (name) => {
        const box = await mainWindow.getByRole('button', { name, exact: true }).boundingBox();
        expect(box, `${name} should have a visible review-toolbar box`).not.toBeNull();
        return box!;
      }),
    );
    for (const action of reviewActions) {
      expect(action.x).toBeGreaterThanOrEqual(0);
      expect(action.x + action.width).toBeLessThanOrEqual(460);
      expect(action.y).toBeGreaterThanOrEqual(0);
      expect(action.y + action.height).toBeLessThanOrEqual(680);
    }
    const previewButton = review.getByRole('button', { name: 'Preview', exact: true });
    await expect(previewButton).toHaveAttribute('aria-expanded', 'false');
    await previewButton.click();
    await expect(previewButton).toHaveAttribute('aria-expanded', 'true');
    await expect(review.getByLabel('Markdown report preview')).toBeVisible();
    await previewButton.click();

    const invokingThumbnail = review.locator('button[title="Click to view full size"]').first();
    await invokingThumbnail.click();
    const lightbox = mainWindow.getByRole('dialog', { name: 'Screenshot preview' });
    await expect(lightbox).toBeVisible();
    const lightboxBox = await lightbox.boundingBox();
    expect(lightboxBox).not.toBeNull();
    expect(lightboxBox!.x).toBeGreaterThanOrEqual(12);
    expect(lightboxBox!.y).toBeGreaterThanOrEqual(12);
    expect(lightboxBox!.x + lightboxBox!.width).toBeLessThanOrEqual(448);
    expect(lightboxBox!.y + lightboxBox!.height).toBeLessThanOrEqual(668);
    const lightboxClose = lightbox.getByRole('button', { name: 'Close screenshot preview' });
    await expect(lightboxClose).toBeFocused();
    await mainWindow.keyboard.press('Tab');
    await expect(lightboxClose).toBeFocused();
    await mainWindow.keyboard.press('Shift+Tab');
    await expect(lightboxClose).toBeFocused();
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);
    await mainWindow.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
    await expect(invokingThumbnail).toBeFocused();
    await expect.poll(() => review.locator('.ff-list-item-enter').last().evaluate((element) =>
      getComputedStyle(element).opacity)).toBe('1');
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);
    await mainWindow.locator('p').filter({ hasText: navigationDraftComment }).first().dblclick();
    const editor = mainWindow.getByPlaceholder('Enter feedback text...');
    const editedComment = 'Edited review: the primary action fails contrast requirements.';
    await editor.fill(editedComment);
    await editor.press('Enter');
    await expect(mainWindow.getByText('Unsaved changes', { exact: true })).toBeVisible();
    const reviewSaveButton = mainWindow.getByRole('button', { name: 'Save', exact: true });
    await reviewSaveButton.click();
    await mainWindow.waitForTimeout(150);
    await expect(mainWindow.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();

    const newerComment = 'Newer draft created while snapshot A is saving.';
    await mainWindow.locator('p').filter({ hasText: editedComment }).first().dblclick();
    const newerEditor = mainWindow.getByPlaceholder('Enter feedback text...');
    await newerEditor.fill(newerComment);
    await newerEditor.press('Enter');
    await expect(mainWindow.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(reviewSaveButton).toBeEnabled();
    await reviewSaveButton.click();
    await expect.poll(async () => {
      const updated = await readFile(reportPath, 'utf8');
      return updated.includes(newerComment);
    }).toBe(true);
    await expect(reviewSaveButton).toBeDisabled();

    const updatedReport = await readFile(reportPath, 'utf8');
    const updatedMetadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
      itemCount: number;
      screenshotCount: number;
      reviewFeedbackItems: Array<{
        transcription: string;
        category?: string;
        severity?: string;
      }>;
      markedIssues: Array<{ comment?: string; screenshotPath?: string }>;
    };
    expect(occurrences(updatedReport, cases[0].comment)).toBe(0);
    expect(updatedReport).toContain(newerComment);
    expect(updatedReport).toContain('./session-recording.webm');
    expect(updatedReport).toContain('./session-audio.wav');
    for (const [index, issue] of cases.entries()) {
      expect(updatedReport).toContain(index === 0 ? newerComment : issue.comment);
      expect(updatedReport).toContain(
        `./screenshots/marked-issue-${String(index + 1).padStart(3, '0')}.png`,
      );
    }
    expect(updatedMetadata.reviewFeedbackItems[0].transcription).toBe(newerComment);
    expect(updatedMetadata.reviewFeedbackItems[0]).toMatchObject({
      category: 'Bug',
      severity: 'High',
    });
    expect(updatedMetadata.markedIssues).toHaveLength(3);
    expect(updatedMetadata.markedIssues[0].comment).toBe(newerComment);
    expect(updatedMetadata.screenshotCount).toBe(3);
    expect(updatedMetadata.itemCount).toBe(metadata.itemCount);

    // Native drag completion must use the same identity-based move path as the
    // overflow menu. Start from a clean save so this also proves drag marks the
    // draft dirty without shifting selection to a different feedback item.
    let draggedFeedback = feedbackItems.filter({ hasText: newerComment });
    await draggedFeedback.focus();
    await draggedFeedback.dragTo(feedbackItems.nth(1));
    draggedFeedback = feedbackItems.filter({ hasText: newerComment });
    await expect(draggedFeedback).toHaveAttribute('aria-current', 'true');
    await expect(draggedFeedback).toHaveCount(1);
    expect(await feedbackItems.allTextContents()).toEqual(expect.arrayContaining([
      expect.stringContaining(newerComment),
      expect.stringContaining(cases[1].comment),
      expect.stringContaining(cases[2].comment),
    ]));
    await expect(feedbackItems.nth(1)).toContainText(newerComment);
    await expect(mainWindow.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(reviewSaveButton).toBeEnabled();

    await draggedFeedback.dragTo(feedbackItems.nth(0));
    draggedFeedback = feedbackItems.filter({ hasText: newerComment });
    await expect(feedbackItems.nth(0)).toContainText(newerComment);
    await expect(draggedFeedback).toHaveAttribute('aria-current', 'true');
    await reviewSaveButton.click();
    await expect.poll(async () => {
      const saved = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
        reviewFeedbackItems?: Array<{ id: string }>;
      };
      return saved.reviewFeedbackItems?.map((item) => item.id) ?? [];
    }).toEqual(['marked-issue-001', 'marked-issue-002', 'marked-issue-003']);
    await expect(reviewSaveButton).toBeDisabled();

    // Undo is itself a new draft mutation, even when the deletion has already
    // been persisted. Verify both saves on disk so App's retained draft cannot
    // make this sequence pass from renderer state alone.
    const persistedDeleteTarget = feedbackItems.nth(2);
    await persistedDeleteTarget
      .getByRole('button', { name: 'More actions for feedback FB-003' })
      .click();
    await persistedDeleteTarget
      .getByRole('menu', { name: 'Feedback actions for FB-003' })
      .getByRole('menuitem', { name: 'Delete' })
      .click();
    await expect(feedbackItems).toHaveCount(2);
    await expect(reviewSaveButton).toBeEnabled();
    await reviewSaveButton.click();
    await expect.poll(async () => {
      const saved = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
        reviewFeedbackItems?: Array<{ id: string }>;
      };
      return saved.reviewFeedbackItems?.map((item) => item.id) ?? [];
    }).toEqual(['marked-issue-001', 'marked-issue-002']);
    await expect(reviewSaveButton).toBeDisabled();

    await mainWindow.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(feedbackItems).toHaveCount(3);
    await expect(feedbackItems.nth(2)).toContainText(cases[2].comment);
    await expect(mainWindow.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(reviewSaveButton).toBeEnabled();
    await reviewSaveButton.click();
    await expect.poll(async () => {
      const saved = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
        reviewFeedbackItems?: Array<{ id: string }>;
      };
      return saved.reviewFeedbackItems?.map((item) => item.id) ?? [];
    }).toEqual(['marked-issue-001', 'marked-issue-002', 'marked-issue-003']);
    await expect(reviewSaveButton).toBeDisabled();

    await mainWindow.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(mainWindow.getByText(reportPath, { exact: true })).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Open Review Editor' }).click();
    await expect(mainWindow.getByRole('region', { name: 'Review Editor' }).getByRole('listitem'))
      .toHaveCount(3);
    await mainWindow.getByRole('button', { name: 'Close', exact: true }).click();

    await mainWindow.getByRole('button', { name: 'Open Session History' }).click();
    const history = mainWindow.getByRole('region', { name: 'Session History' });
    await expect(history).toBeVisible();
    await expect(history.getByText('1 session', { exact: true })).toBeVisible();
    const historyRow = history.getByRole('listitem').filter({
      hasText: `${metadata.itemCount} items`,
    });
    await expect(historyRow).toBeVisible();
    await expect(historyRow.getByText(String(metadata.screenshotCount), { exact: true })).toBeVisible();
    await expect(historyRow.getByRole('button', { name: 'Open session' })).toBeVisible();
    await historyRow.click();
    await expect(history.getByText('1 selected', { exact: true })).toBeVisible();
    const moreActions = historyRow.getByRole('button', { name: 'More actions for session' });
    await moreActions.focus();
    await mainWindow.keyboard.press('Enter');
    const actionMenu = mainWindow.getByRole('menu', { name: 'Session actions' });
    await expect(history).toBeVisible();
    await expect(actionMenu.getByRole('menuitem', { name: 'Open', exact: true })).toBeFocused();
    await expect(actionMenu.getByRole('menuitem', { name: 'Open Folder' })).toBeVisible();
    await expect(actionMenu.getByRole('menuitem', { name: 'Export' })).toBeVisible();
    await expect(actionMenu.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
    const menuBox = await actionMenu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(460);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(680);
    await mainWindow.keyboard.press('ArrowDown');
    await expect(actionMenu.getByRole('menuitem', { name: 'Open Folder' })).toBeFocused();
    await mainWindow.keyboard.press('ArrowUp');
    await expect(actionMenu.getByRole('menuitem', { name: 'Open', exact: true })).toBeFocused();
    await mainWindow.keyboard.press('ArrowDown');
    await expect(actionMenu.getByRole('menuitem', { name: 'Open Folder' })).toBeFocused();
    await mainWindow.keyboard.press('End');
    await expect(actionMenu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await mainWindow.keyboard.press('Home');
    await expect(actionMenu.getByRole('menuitem', { name: 'Open', exact: true })).toBeFocused();
    await mainWindow.keyboard.press('Escape');
    await expect(actionMenu).toBeHidden();
    await expect(history).toBeVisible();
    await expect(moreActions).toBeFocused();
    await historyRow.focus();
    await mainWindow.keyboard.press('Delete');
    const deleteConfirmation = mainWindow.getByRole('dialog', { name: /Delete 1 session/ });
    await expect(deleteConfirmation).toBeVisible();
    await deleteConfirmation.getByRole('button', { name: 'Cancel' }).click();

    await application.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ success: false, error: 'Folder unavailable for test.' }));
    }, 'markuprx:output:open-folder');
    await moreActions.focus();
    await mainWindow.keyboard.press('Enter');
    await actionMenu.getByRole('menuitem', { name: 'Open Folder' }).click();
    const actionError = history.getByRole('alert');
    await expect(actionError).toContainText('Folder unavailable for test.');

    await application.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ success: true }));
    }, 'markuprx:output:open-folder');
    await moreActions.focus();
    await mainWindow.keyboard.press('Enter');
    await actionMenu.getByRole('menuitem', { name: 'Open Folder' }).click();
    await expect(actionError).toBeHidden();

    await application.evaluate(({ ipcMain }, channels) => {
      ipcMain.removeHandler(channels.openFolder);
      ipcMain.handle(channels.openFolder, () => ({ success: false, error: 'Export folder unavailable for test.' }));
      ipcMain.removeHandler(channels.exportSessions);
      ipcMain.handle(channels.exportSessions, () => ({ success: true, path: '/tmp/exported-sessions.zip' }));
    }, {
      openFolder: 'markuprx:output:open-folder',
      exportSessions: 'markuprx:output:export-sessions',
    });
    await moreActions.focus();
    await mainWindow.keyboard.press('Enter');
    await actionMenu.getByRole('menuitem', { name: 'Export' }).click();
    await expect(actionError).toContainText('Export folder unavailable for test.');

    await mainWindow.getByRole('button', { name: 'Back to MarkuprX' }).click();
    await mainWindow.getByRole('button', { name: 'Open Review Editor' }).click();
    await rm(sessionDir, { recursive: true, force: true });
    await mainWindow.locator('p').filter({ hasText: newerComment }).first().dblclick();
    const failedEditor = mainWindow.getByPlaceholder('Enter feedback text...');
    const unsavedComment = 'This edit must remain visible after save fails.';
    await failedEditor.fill(unsavedComment);
    await failedEditor.press('Enter');
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();
    const failedSaveAlert = mainWindow.getByRole('alert');
    await expect(failedSaveAlert).toContainText(/save|folder/i);
    await expect(failedSaveAlert.getByRole('button', { name: 'Retry save' })).toBeEnabled();
    await expect(mainWindow.getByText(unsavedComment, { exact: true })).toBeVisible();
    expect(await seriousAccessibilityViolations(mainWindow)).toEqual([]);
  });
});
