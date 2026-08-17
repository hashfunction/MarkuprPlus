# Portrait Popover Surfaces and Tray Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Convert every non-HUD MarkuprX surface to one scrollable 460-by-680 portrait window and add Help, Contact, and Exit/Quit to the native tray context menu.

**Architecture:** A shared layout module will be the only source of outer-window dimensions. The renderer will route one top-level surface at a time through a reusable PortraitSurface component, while true transient dialogs remain contained overlays. Existing feature hooks, IPC, persistence, and compact recording/processing HUD behavior remain unchanged.

**Tech Stack:** Electron 28, React 18, TypeScript 5.3, CSS, Vitest 1, Playwright Electron, axe-core

## Global Constraints

- Every non-HUD BrowserWindow state is exactly 460 by 680 CSS pixels.
- Recording remains 316 by 90; processing remains 320 by 140.
- Preserve every current setting, history action, shortcut editor action, review action, onboarding step, export option, recovery action, completion detail, and error detail.
- Use one primary vertical scroll region per top-level surface and no document-level horizontal overflow.
- Preserve the current MarkuprX visual tokens and add no runtime dependency.
- Top-level surfaces are not modal; only transient decisions use aria-modal and focus trapping.
- Keep left-click tray behavior unchanged.
- Help opens https://markuprx.com.
- Contact opens mailto:hello@markuprx.com?subject=MarkuprX%20Support.
- Use Quit MarkuprX on macOS and Exit MarkuprX on Windows/Linux.
- Write a failing focused test before each production behavior change.
- Commit and push each independently passing task to origin/main.

## Scope Note

The tray menu is isolated as its own task in this plan. It does not need a separate plan because it is one pure template helper plus one existing TrayManager consumer; it shares the same release and final verification boundary as the portrait-window work.

## File Structure

- Create src/shared/popoverLayout.ts: authoritative portrait and HUD sizes plus the renderer-view size helper.
- Create src/renderer/components/PortraitSurface.tsx: shared semantic header, optional rail, primary scroller, and optional footer.
- Create src/renderer/styles/portrait-surface.css: portrait shell, rail, toolbar, card, contained-dialog, focus, and reduced-motion rules.
- Create src/renderer/hooks/useContainedDialogFocus.ts: transient-dialog focus entry, Tab cycling, and focus restoration.
- Create src/main/trayContextMenu.ts: pure native menu-template construction and guarded external-link handlers.
- Create tests/unit/popoverLayout.test.ts: exact shared size contract.
- Create tests/unit/trayContextMenu.test.ts: menu labels, state, URLs, error handling, and quit behavior.
- Modify src/main/windows/PopoverManager.ts: consume shared state sizes.
- Modify src/renderer/contexts/UIContext.tsx: remove wide view-size mapping and consume the shared portrait helper.
- Modify src/renderer/App.tsx: mount exactly one top-level surface inside the card and leave only transient overlays above it.
- Modify src/renderer/components/index.ts: export PortraitSurface.
- Modify src/renderer/components/SettingsPanel.tsx and settings files: implement approved horizontal rail and stacked portrait controls.
- Modify src/renderer/components/SessionHistory.tsx: implement portrait toolbar/cards and always-visible actions.
- Modify src/renderer/components/KeyboardShortcuts.tsx: implement portrait categories and inline editor.
- Modify src/renderer/components/SessionReview.tsx: implement portrait toolbar, cards, scrolling, and bounded preview/lightbox.
- Modify Onboarding.tsx, ExportDialog.tsx, CrashRecoveryDialog.tsx, ModelDownloadDialog.tsx, and CountdownTimer.tsx: contain transient layouts within the portrait card.
- Modify tests/ui/markuprx-electron.spec.ts: real-window bounds, overflow, keyboard, accessibility, all-surface, and screenshot coverage.

---

### Task 1: Shared Popover Size Contract

**Files:**
- Create: src/shared/popoverLayout.ts
- Create: tests/unit/popoverLayout.test.ts
- Modify: src/main/windows/PopoverManager.ts:17-28
- Modify: src/renderer/contexts/UIContext.tsx:70-89,198-209

**Interfaces:**
- Consumes: UIContext AppView values main, settings, history, and shortcuts.
- Produces: PORTRAIT_POPOVER_SIZE, POPOVER_SIZES, PopoverState, PortraitAppView, and getPopoverSizeForView(view).

- [ ] **Step 1: Write the failing shared-size test**

    import { describe, expect, it } from 'vitest';
    import {
      getPopoverSizeForView,
      POPOVER_SIZES,
      PORTRAIT_POPOVER_SIZE,
    } from '../../src/shared/popoverLayout';

    describe('popover layout contract', () => {
      it('uses one 460 by 680 size for every non-HUD state and view', () => {
        expect(PORTRAIT_POPOVER_SIZE).toEqual({ width: 460, height: 680 });
        expect(POPOVER_SIZES.idle).toEqual(PORTRAIT_POPOVER_SIZE);
        expect(POPOVER_SIZES.complete).toEqual(PORTRAIT_POPOVER_SIZE);
        expect(POPOVER_SIZES.settings).toEqual(PORTRAIT_POPOVER_SIZE);
        expect(POPOVER_SIZES.error).toEqual(PORTRAIT_POPOVER_SIZE);
        expect(getPopoverSizeForView('settings')).toEqual(PORTRAIT_POPOVER_SIZE);
        expect(getPopoverSizeForView('history')).toEqual(PORTRAIT_POPOVER_SIZE);
        expect(getPopoverSizeForView('shortcuts')).toEqual(PORTRAIT_POPOVER_SIZE);
      });

      it('preserves compact HUD dimensions', () => {
        expect(POPOVER_SIZES.recording).toEqual({ width: 316, height: 90 });
        expect(POPOVER_SIZES.processing).toEqual({ width: 320, height: 140 });
      });
    });

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: npm run test:unit -- --run tests/unit/popoverLayout.test.ts

Expected: FAIL because src/shared/popoverLayout.ts does not exist.

- [ ] **Step 3: Add the shared size module**

    export const PORTRAIT_POPOVER_SIZE = Object.freeze({
      width: 460,
      height: 680,
    });

    export const POPOVER_SIZES = Object.freeze({
      idle: PORTRAIT_POPOVER_SIZE,
      recording: Object.freeze({ width: 316, height: 90 }),
      processing: Object.freeze({ width: 320, height: 140 }),
      complete: PORTRAIT_POPOVER_SIZE,
      settings: PORTRAIT_POPOVER_SIZE,
      error: PORTRAIT_POPOVER_SIZE,
    });

    export type PopoverState = keyof typeof POPOVER_SIZES;
    export type PortraitAppView = 'settings' | 'history' | 'shortcuts';

    export function getPopoverSizeForView(
      view: PortraitAppView,
    ): typeof PORTRAIT_POPOVER_SIZE {
      return PORTRAIT_POPOVER_SIZE;
    }

- [ ] **Step 4: Replace both local size maps**

In PopoverManager.ts, import POPOVER_SIZES and PopoverState from ../../shared/popoverLayout and remove the local declaration. Preserve the current public re-export used by src/main/windows/index.ts:

    import {
      POPOVER_SIZES,
      type PopoverState,
    } from '../../shared/popoverLayout';

    export { POPOVER_SIZES };
    export type { PopoverState };

In UIContext.tsx, import getPopoverSizeForView and replace mapOverlaySize with:

    function resizeForView(view: Exclude<AppView, 'main'>): Promise<void> {
      const size = getPopoverSizeForView(view);
      return window.markuprx.popover.resize(size.width, size.height);
    }

Use void resizeForView(currentView).catch(() => {}) after currentView is narrowed away from main.

- [ ] **Step 5: Run focused and static verification**

Run: npm run test:unit -- --run tests/unit/popoverLayout.test.ts tests/unit/appViewState.test.ts

Expected: PASS.

Run: npm run typecheck

Expected: PASS with no duplicate PopoverState export or AppView narrowing error.

- [ ] **Step 6: Commit and push**

    git add src/shared/popoverLayout.ts tests/unit/popoverLayout.test.ts src/main/windows/PopoverManager.ts src/renderer/contexts/UIContext.tsx
    git commit -m "refactor: centralize portrait popover sizes"
    git push origin main

---

### Task 2: Portrait Surface Router and Approved Settings Layout

**Files:**
- Create: src/renderer/components/PortraitSurface.tsx
- Create: src/renderer/styles/portrait-surface.css
- Modify: src/renderer/components/index.ts
- Modify: src/renderer/App.tsx:1-180
- Modify: src/renderer/components/SettingsPanel.tsx:1-244
- Modify: src/renderer/components/settings/settingsStyles.ts:1-676
- Modify: src/renderer/components/settings/useSettingsPanel.ts:55-100,480-525
- Modify: tests/ui/markuprx-electron.spec.ts:1-390

**Interfaces:**
- Consumes: PortraitSurfaceProps, UIContext.currentView, SettingsTab, TABS, and existing useSettingsPanel handlers.
- Produces: PortraitSurface, SettingsSaveStatus, expectPortraitWindow(application, page), and the approved Settings region/tab semantics used by later tasks.

- [ ] **Step 1: Add the real-window portrait assertion and failing Settings test**

Add this helper beside seriousAccessibilityViolations:

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

Add this test:

    test('renders Settings as the approved portrait surface', async () => {
      const launched = await launchApplication(harness);
      application = launched.application;
      const window = launched.mainWindow;

      await window.getByRole('button', { name: 'Open Settings' }).click();
      await expectPortraitWindow(application, window);
      await expect(window.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);

      const settings = window.getByRole('region', { name: 'Settings' });
      await expect(settings).toBeVisible();
      const rail = settings.getByRole('tablist', { name: 'Settings sections' });
      await expect(rail).toBeVisible();
      expect(await rail.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

      const general = rail.getByRole('tab', { name: 'General', exact: true });
      await general.focus();
      await window.keyboard.press('End');
      const advanced = rail.getByRole('tab', { name: 'Advanced', exact: true });
      await expect(advanced).toBeFocused();
      await expect(advanced).toHaveAttribute('aria-selected', 'true');
      expect(await seriousAccessibilityViolations(window)).toEqual([]);
    });

In the existing appearance-settings test, after the theme persistence assertion add:

    await expect(window.getByText('Saved', { exact: true })).toBeVisible();

- [ ] **Step 2: Run the Settings UI test and confirm the old modal/size failure**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "approved portrait surface"

Expected: FAIL because Settings still requests 920 by 760 and exposes a modal dialog.

- [ ] **Step 3: Add PortraitSurface**

Create PortraitSurface.tsx with this public shape:

    import React, { useEffect, useRef } from 'react';
    import '../styles/portrait-surface.css';

    export interface PortraitSurfaceProps {
      title: string;
      titleId: string;
      backLabel: string;
      onBack: () => void;
      subtitle?: React.ReactNode;
      headerActions?: React.ReactNode;
      navigation?: React.ReactNode;
      footer?: React.ReactNode;
      contentLabel?: string;
      className?: string;
      children: React.ReactNode;
    }

    export function PortraitSurface({
      title,
      titleId,
      backLabel,
      onBack,
      subtitle,
      headerActions,
      navigation,
      footer,
      contentLabel,
      className = '',
      children,
    }: PortraitSurfaceProps): React.ReactElement {
      const headingRef = useRef<HTMLHeadingElement>(null);

      useEffect(() => {
        headingRef.current?.focus();
      }, []);

      return (
        <section
          className={'ff-portrait-surface ' + className}
          aria-labelledby={titleId}
        >
          <header className="ff-portrait-surface__header">
            <button
              type="button"
              className="ff-portrait-surface__back"
              onClick={onBack}
              aria-label={backLabel}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <div className="ff-portrait-surface__heading">
              <h1 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h1>
              {subtitle && <div className="ff-portrait-surface__subtitle">{subtitle}</div>}
            </div>
            {headerActions && (
              <div className="ff-portrait-surface__header-actions">{headerActions}</div>
            )}
          </header>
          {navigation && (
            <div className="ff-portrait-surface__navigation">{navigation}</div>
          )}
          <div
            className="ff-portrait-surface__scroller"
            role="region"
            aria-label={contentLabel}
            tabIndex={0}
          >
            {children}
          </div>
          {footer && <footer className="ff-portrait-surface__footer">{footer}</footer>}
        </section>
      );
    }

Export it from components/index.ts.

- [ ] **Step 4: Add the shared portrait CSS contract**

Create portrait-surface.css with the exact structural rules:

    .ff-portrait-surface {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      height: 100%;
      overflow: hidden;
      color: var(--text-primary);
    }

    .ff-portrait-surface__header {
      display: flex;
      align-items: center;
      flex: 0 0 auto;
      gap: 10px;
      min-width: 0;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-default);
      background: var(--surface-glass);
    }

    .ff-portrait-surface__back {
      display: inline-grid;
      place-items: center;
      flex: 0 0 36px;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border-default);
      border-radius: 9px;
      background: var(--surface-inset);
      color: var(--text-secondary);
      font-size: 25px;
    }

    .ff-portrait-surface__heading {
      flex: 1 1 auto;
      min-width: 0;
    }

    .ff-portrait-surface__heading h1 {
      margin: 0;
      color: var(--text-primary);
      font-size: 18px;
      line-height: 1.2;
    }

    .ff-portrait-surface__subtitle {
      margin-top: 2px;
      color: var(--text-tertiary);
      font-size: 11px;
    }

    .ff-portrait-surface__header-actions {
      display: flex;
      flex: 0 1 auto;
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
      gap: 6px;
    }

    .ff-portrait-surface__navigation {
      flex: 0 0 auto;
      min-width: 0;
      border-bottom: 1px solid var(--border-default);
    }

    .ff-portrait-surface__scroller {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .ff-portrait-surface__footer {
      flex: 0 0 auto;
      min-width: 0;
      border-top: 1px solid var(--border-default);
    }

    @media (prefers-reduced-motion: reduce) {
      .ff-portrait-surface,
      .ff-portrait-surface * {
        scroll-behavior: auto;
      }
    }

- [ ] **Step 5: Route one top-level view at a time**

Move SettingsPanel, SessionHistory, and KeyboardShortcuts inside ff-shell__card and guard them directly:

    {ui.currentView === 'settings' && (
      <SettingsPanel isOpen onClose={ui.closeOverlay} />
    )}
    {ui.currentView === 'history' && (
      <SessionHistory
        isOpen
        onClose={ui.closeOverlay}
        onOpenSession={recording.openRecent}
      />
    )}
    {ui.currentView === 'shortcuts' && (
      <KeyboardShortcuts isOpen onClose={ui.closeOverlay} />
    )}

Wrap the current home/recording/processing/complete/error JSX in one fragment guarded by ui.currentView === 'main'; retain those existing children and handlers unchanged. Keep onboarding, countdown, recovery, and export above the card because they remain transient overlays.

Add a dedicated-surface modifier to the card:

    <main
      className={
        'ff-shell__card' +
        (ui.isHudMode ? ' ff-shell__card--hud' : '') +
        (ui.currentView !== 'main' ? ' ff-shell__card--portrait' : '')
      }
    >

Add this root sizing adjustment to app-shell.css:

    .ff-shell {
      width: 100%;
      height: 100%;
      min-height: 0;
    }

    .ff-shell__card {
      height: calc(100vh - 24px);
      min-height: 0;
    }

    .ff-shell__card--portrait {
      gap: 0;
      padding: 0;
      overflow: hidden;
    }

- [ ] **Step 6: Convert Settings to Option A**

Remove Settings overlay, backdrop, role=dialog, aria-modal, wide sidebar, compact wrapped-tab branch, and fixed footer. Render:

Add these refs and handlers above the return. Extend the React import with useCallback and useRef:

    const tabListRef = useRef<HTMLElement>(null);
    const tabRefs = useRef<
      Partial<Record<SettingsTab, HTMLButtonElement | null>>
    >({});

    const handleTabKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLElement>) => {
        const currentIndex = TABS.findIndex((tab) => tab.id === s.activeTab);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
        else if (event.key === 'ArrowLeft') {
          nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        } else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = TABS.length - 1;
        else return;

        event.preventDefault();
        const nextTab = TABS[nextIndex];
        s.setActiveTab(nextTab.id);
        requestAnimationFrame(() => {
          const button = tabRefs.current[nextTab.id];
          button?.focus();
          button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      },
      [s.activeTab, s.setActiveTab],
    );

    const handleResetAll = useCallback(async () => {
      await s.resetGeneralSection();
      await s.resetRecordingSection();
      await s.resetAppearanceSection();
      await s.resetHotkeysSection();
      await s.resetAdvancedSection();
    }, [
      s.resetGeneralSection,
      s.resetRecordingSection,
      s.resetAppearanceSection,
      s.resetHotkeysSection,
      s.resetAdvancedSection,
    ]);

    <PortraitSurface
      title="Settings"
      titleId="markuprx-settings-title"
      backLabel="Back to MarkuprX"
      onBack={onClose}
      subtitle={
        <span
          aria-live="polite"
          role={s.saveStatus === 'error' ? 'alert' : undefined}
          title={s.saveError ?? undefined}
        >
          {s.saveStatus === 'saving'
            ? 'Saving'
            : s.saveStatus === 'saved'
              ? 'Saved'
              : s.saveStatus === 'error'
                ? 'Unable to save'
                : 'MarkuprX ' + (s.appVersion ? 'v' + s.appVersion : '')}
        </span>
      }
      headerActions={
        !s.analysisProviderViewState.ready ? (
          <button
            type="button"
            style={styles.byokBadge}
            onClick={() => s.setActiveTab('advanced')}
          >
            AI Setup
          </button>
        ) : undefined
      }
      navigation={
        <nav
          ref={tabListRef}
          role="tablist"
          aria-label="Settings sections"
          style={styles.sectionRail}
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              id={'markuprx-settings-tab-' + tab.id}
              type="button"
              role="tab"
              aria-controls="markuprx-settings-panel"
              aria-selected={s.activeTab === tab.id}
              tabIndex={s.activeTab === tab.id ? 0 : -1}
              style={{
                ...styles.railTab,
                ...(s.activeTab === tab.id ? styles.railTabActive : {}),
              }}
              onClick={() => s.setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      }
      contentLabel="Settings content"
    >
      <div
        id="markuprx-settings-panel"
        role="tabpanel"
        aria-labelledby={'markuprx-settings-tab-' + s.activeTab}
        style={styles.portraitPanel}
      >
        {renderTabContent}
        <div style={styles.portraitEndActions}>
          <DonateButton />
          <button type="button" style={styles.resetAllButton} onClick={handleResetAll}>
            Reset All to Defaults
          </button>
        </div>
      </div>
    </PortraitSurface>

Replace isCompact-dependent styles with portrait-only sectionRail, railTab, portraitPanel, and portraitEndActions. Give settingInfo minWidth: 0; fields/selectors maxWidth: 100%; setting controls flex: 1 1 190px; action rows flexWrap: wrap. Remove the window resize listener, isCompact, isAnimating, panelRef, and the obsolete 300-millisecond panel-animation effect from useSettingsPanel.

Use these structural values in settingsStyles.ts:

    sectionRail: {
      display: 'flex',
      gap: 6,
      padding: '8px 12px',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
    },
    railTab: {
      display: 'inline-flex',
      flex: '0 0 auto',
      alignItems: 'center',
      gap: 7,
      minHeight: 36,
      padding: '7px 10px',
      border: '1px solid transparent',
      borderRadius: 9,
      background: 'transparent',
      color: 'var(--text-tertiary)',
      whiteSpace: 'nowrap',
    },
    railTabActive: {
      borderColor: 'var(--accent-muted)',
      background: 'var(--accent-subtle)',
      color: 'var(--text-link)',
    },
    portraitPanel: {
      display: 'grid',
      gap: 24,
      minWidth: 0,
      padding: 14,
    },
    portraitEndActions: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingTop: 8,
      borderTop: '1px solid var(--border-subtle)',
    },

Replace hasChanges with:

    export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

    const [saveStatus, setSaveStatus] = useState<SettingsSaveStatus>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

At the start of handleSettingChange and handleHotkeyChange, set saveStatus to saving and clear saveError. At the end of each successful try block, set saveStatus to saved. Apply the same transition around all five section-reset functions and secure API-key save operations. In each catch block, use:

    const message = error instanceof Error
      ? error.message
      : 'Unable to save this setting.';
    setSaveStatus('error');
    setSaveError(message);
    console.error('Failed to save setting:', error);

Return saveStatus and saveError from useSettingsPanel. Keep the optimistic control value and all existing theme, provider-refresh, and hotkey-update side effects.

- [ ] **Step 7: Run Settings behavior, accessibility, and static checks**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "approved portrait surface|appearance settings|accessibility violations"

Expected: PASS.

Run: npm run typecheck && npm run lint

Expected: PASS.

- [ ] **Step 8: Commit and push**

    git add src/renderer/App.tsx src/renderer/components/PortraitSurface.tsx src/renderer/components/index.ts src/renderer/components/SettingsPanel.tsx src/renderer/components/settings/settingsStyles.ts src/renderer/components/settings/useSettingsPanel.ts src/renderer/styles/app-shell.css src/renderer/styles/portrait-surface.css tests/ui/markuprx-electron.spec.ts
    git commit -m "feat: add portrait settings surface"
    git push origin main

---

### Task 3: Portrait Session History

**Files:**
- Modify: src/renderer/components/SessionHistory.tsx:90-575,648-1125,1132-1753
- Modify: tests/ui/markuprx-electron.spec.ts: portrait helper area and completed-session history assertions

**Interfaces:**
- Consumes: PortraitSurface, SessionMetadata, existing list/search/sort/select/export/delete/open handlers.
- Produces: Session History region semantics, visible Open session action, More actions button, viewport-clamped action menu, loadError, actionError, and retryable loadSessions.

- [ ] **Step 1: Write failing empty and populated History assertions**

Add a focused test:

    test('renders Session History as a scrollable portrait surface', async () => {
      const launched = await launchApplication(harness);
      application = launched.application;
      const window = launched.mainWindow;

      await window.getByRole('button', { name: 'Open Session History' }).click();
      await expectPortraitWindow(application, window);
      await expect(window.getByRole('dialog', { name: 'Session History' })).toHaveCount(0);
      const history = window.getByRole('region', { name: 'Session History' });
      await expect(history.getByPlaceholder('Search sessions...')).toBeVisible();
      await expect(history.getByRole('button', { name: /Sort:/ })).toBeVisible();
      expect(await seriousAccessibilityViolations(window)).toEqual([]);
    });

In the existing completed-session test, replace historyDialog with the Session History region and add:

    await expect(historyRow.getByRole('button', { name: 'Open session' })).toBeVisible();
    await historyRow.getByRole('button', { name: 'More actions for session' }).click();
    const actionMenu = window.getByRole('menu', { name: 'Session actions' });
    await expect(actionMenu.getByRole('menuitem', { name: 'Open Folder' })).toBeVisible();
    await expect(actionMenu.getByRole('menuitem', { name: 'Export' })).toBeVisible();
    await expect(actionMenu.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
    const menuBox = await actionMenu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(460);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(680);

- [ ] **Step 2: Run the History tests and confirm modal/hidden-action failures**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "Session History|complete evidence"

Expected: FAIL because History is modal and card actions mount only during hover.

- [ ] **Step 3: Convert the top-level History structure**

Replace overlay/backdrop/panel/header/footer with PortraitSurface:

    <PortraitSurface
      title="Session History"
      titleId="markuprx-history-title"
      backLabel="Back to MarkuprX"
      onBack={onClose}
      subtitle={
        !isLoading
          ? filteredSessions.length + ' session' + (filteredSessions.length === 1 ? '' : 's')
          : 'Loading sessions'
      }
      contentLabel="Saved sessions"
    >
      <div style={styles.portraitBody}>
        {loadError && (
          <div role="alert" style={styles.errorBanner}>
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadSessions()}>Retry</button>
          </div>
        )}
        {actionError && (
          <div role="alert" style={styles.errorBanner}>
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)}>Dismiss</button>
          </div>
        )}
        <SearchInput value={search} onChange={setSearch} />
        <div style={styles.portraitToolbar}>
          <SortDropdown
            sortBy={sortBy}
            direction={sortDirection}
            onSortChange={setSortBy}
            onDirectionToggle={() => setSortDirection((value) => value === 'desc' ? 'asc' : 'desc')}
          />
          {selected.size > 0 && (
            <div style={styles.selectionActions}>
              <span style={styles.selectedCount}>
                {selected.size} selected
              </span>
              <button type="button" onClick={handleDeselectAll}>Clear</button>
              <button
                type="button"
                onClick={() => handleExportSessions(Array.from(selected))}
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSessions(Array.from(selected))}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <div ref={listRef} style={styles.content} role="list">
          {isLoading ? (
            <LoadingState />
          ) : filteredSessions.length === 0 ? (
            <EmptyState hasSearch={Boolean(search)} onClear={() => setSearch('')} />
          ) : (
            filteredSessions.map((session, index) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selected.has(session.id)}
                isFocused={focusedIndex === index}
                onSelect={(shift, ctrl) => handleSelectSession(session.id, shift, ctrl)}
                onOpen={() => handleOpenSession(session)}
                onDelete={() => handleDeleteSessions([session.id])}
                onExport={() => handleExportSessions([session.id])}
                onOpenFolder={() => handleOpenFolder(session)}
                onMoreActions={(anchor) => {
                  openSessionMenu(session.id, anchor.right - 220, anchor.bottom + 6);
                }}
                onContextMenu={(event) => handleContextMenu(event, session.id)}
              />
            ))
          )}
        </div>
      </div>
    </PortraitSurface>

Do not change the existing selected-count, Clear, Export, Delete, list-loading, empty-state, or session action handlers.

Move loadSessions out of the effect into a useCallback and add:

    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const loadSessions = useCallback(async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        if (!window.markuprx?.output?.listSessions) {
          throw new Error('Session history is unavailable.');
        }
        setSessions(await window.markuprx.output.listSessions());
      } catch (error) {
        setSessions([]);
        setLoadError(
          error instanceof Error ? error.message : 'Unable to load session history.',
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

The open-folder, export, and delete catches set actionError to a specific message. A delete result with failed IDs sets actionError to the number that could not be deleted. A later successful action clears actionError.

- [ ] **Step 4: Replace hover-only card actions**

Delete isHovered state and hover-only action mounting. Add an action row to every SessionCard:

    <div style={styles.cardActions}>
      <button
        type="button"
        style={styles.openSessionButton}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label="Open session"
      >
        Open
      </button>
      <button
        type="button"
        style={styles.moreActionsButton}
        onClick={(event) => {
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          onMoreActions(bounds);
        }}
        aria-label="More actions for session"
      >
        <span aria-hidden="true">•••</span>
      </button>
    </div>

Change SessionCardProps to replace onContextMenu with:

    onMoreActions: (anchor: DOMRect) => void;
    onContextMenu: (event: React.MouseEvent) => void;

Both entry points call one openSessionMenu(sessionId, x, y) helper. Clamp x to window.innerWidth minus menu width and 8 pixels; clamp y to window.innerHeight minus menu height and 8 pixels. Give the action menu role="menu", aria-label="Session actions", and each button role="menuitem".

Use this exact helper and route the existing context-menu handler through it:

    const openSessionMenu = useCallback(
      (sessionId: string, x: number, y: number) => {
        const margin = 8;
        const menuWidth = 220;
        const menuHeight = 230;
        setContextMenu({
          visible: true,
          sessionId,
          x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
          y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
        });
      },
      [],
    );

    const handleContextMenu = useCallback(
      (event: React.MouseEvent, sessionId: string) => {
        event.preventDefault();
        openSessionMenu(sessionId, event.clientX, event.clientY);
      },
      [openSessionMenu],
    );

- [ ] **Step 5: Apply portrait card and toolbar styles**

Set panel-level styles to relative/100-percent sizing rather than fixed viewport overlays. Use:

    portraitBody: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: 14,
      minWidth: 0,
    },
    portraitToolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sessionCard: {
      display: 'grid',
      gridTemplateColumns: '28px 72px minmax(0, 1fr)',
      gap: 10,
      padding: 12,
      border: '1px solid var(--border-subtle)',
      borderRadius: 12,
      position: 'relative',
    },
    cardActions: {
      gridColumn: '2 / -1',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
    }

Make metadata flex-wrap, set sessionContent and sessionName minWidth: 0, and remove the wide keyboard-hint footer. Keep keyboard shortcuts operational.

- [ ] **Step 6: Run History and static verification**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "Session History|complete evidence"

Expected: PASS.

Run: npm run typecheck && npm run lint

Expected: PASS.

- [ ] **Step 7: Commit and push**

    git add src/renderer/components/SessionHistory.tsx tests/ui/markuprx-electron.spec.ts
    git commit -m "feat: fit session history to portrait shell"
    git push origin main

---

### Task 4: Portrait Keyboard Shortcuts

**Files:**
- Modify: src/renderer/components/KeyboardShortcuts.tsx:31-787
- Modify: src/renderer/styles/portrait-surface.css
- Modify: tests/ui/markuprx-electron.spec.ts

**Interfaces:**
- Consumes: PortraitSurface, Shortcut, ShortcutCategory, existing search/rebind/conflict logic, and application Help menu.
- Produces: Keyboard Shortcuts region semantics and portrait shortcut/category CSS classes.

- [ ] **Step 1: Add an application-menu helper and failing Shortcuts test**

Add:

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

Add:

    test('renders Keyboard Shortcuts as a portrait surface', async () => {
      const launched = await launchApplication(harness);
      application = launched.application;
      const window = launched.mainWindow;

      await clickApplicationMenuItem(application, 'Help', 'Keyboard Shortcuts');
      await expectPortraitWindow(application, window);
      await expect(window.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toHaveCount(0);
      const shortcuts = window.getByRole('region', { name: 'Keyboard Shortcuts' });
      await expect(shortcuts.getByPlaceholder('Search shortcuts...')).toBeVisible();
      await expect(shortcuts.getByRole('heading', { name: 'Recording' })).toBeVisible();
      expect(await seriousAccessibilityViolations(window)).toEqual([]);
    });

- [ ] **Step 2: Run the Shortcuts test and confirm the old modal failure**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "Keyboard Shortcuts as a portrait"

Expected: FAIL because KeyboardShortcuts renders a fixed aria-modal dialog.

- [ ] **Step 3: Replace the modal shell with PortraitSurface**

Keep existing state, keyboard capture, conflict detection, filteredShortcuts, and ShortcutRow. Replace only the outer JSX:

    <PortraitSurface
      title="Keyboard Shortcuts"
      titleId="shortcuts-title"
      backLabel="Back to MarkuprX"
      onBack={onClose}
      subtitle="Select a customizable shortcut to rebind it"
      contentLabel="Keyboard shortcuts"
    >
      <div className="ff-shortcuts">
        <div className="ff-shortcuts__search">
          <label className="sr-only" htmlFor="markuprx-shortcut-search">
            Search shortcuts
          </label>
          <input
            id="markuprx-shortcut-search"
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shortcuts..."
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                searchInputRef.current?.focus();
              }}
              aria-label="Clear shortcut search"
            >
              Clear
            </button>
          )}
        </div>
        <div className="ff-shortcuts__groups">
          {CATEGORY_ORDER.map((category) => {
            const categoryShortcuts = groupedShortcuts[category];
            if (categoryShortcuts.length === 0) return null;
            const headingId = 'markuprx-shortcuts-' + category.toLowerCase();
            return (
              <section
                key={category}
                className="ff-shortcuts__group"
                aria-labelledby={headingId}
              >
                <h2 id={headingId}>{category}</h2>
                <div className="ff-shortcuts__rows">
                  {categoryShortcuts.map((shortcut) => (
                    <ShortcutRow
                      key={shortcut.id}
                      shortcut={shortcut}
                      isMac={isMac}
                      isEditing={editingId === shortcut.id}
                      onStartEdit={() => handleStartEdit(shortcut.id)}
                      onCancelEdit={handleCancelEdit}
                      onSaveEdit={(newKeys) => handleSaveEdit(shortcut.id, newKeys)}
                      recordedKeys={editingId === shortcut.id ? recordedKeys : null}
                      conflict={editingId === shortcut.id ? conflict : null}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PortraitSurface>

Keep the existing ShortcutRow implementation and editing handlers unchanged.

- [ ] **Step 4: Add portrait shortcut styles**

Replace KeyBadge's utility class list with className="ff-shortcut-key". Set ShortcutRow's root className to ff-shortcut-row plus is-editing and is-customizable modifiers. Set its existing copy column to ff-shortcut-row__copy, title row to ff-shortcut-row__title, and existing key/editor control column to ff-shortcut-row__controls. Keep the current editing buttons, badges, conflict text, handlers, and key-formatting branches in their current order.

Add:

    .ff-shortcuts {
      display: grid;
      gap: 18px;
      min-width: 0;
      padding: 14px;
    }

    .ff-shortcuts__search input {
      width: 100%;
      min-width: 0;
      min-height: 40px;
      padding: 9px 12px;
      border: 1px solid var(--border-default);
      border-radius: 10px;
      background: var(--surface-inset);
      color: var(--text-primary);
    }

    .ff-shortcuts__groups {
      display: grid;
      gap: 20px;
      min-width: 0;
    }

    .ff-shortcuts__group {
      display: grid;
      gap: 8px;
      min-width: 0;
    }

    .ff-shortcuts__rows {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .ff-shortcut-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: var(--surface-inset);
    }

    .ff-shortcut-row.is-editing {
      border-color: var(--accent-muted);
      background: var(--accent-subtle);
    }

    .ff-shortcut-row__copy,
    .ff-shortcut-row__controls {
      min-width: 0;
    }

    .ff-shortcut-row__copy p {
      margin: 3px 0 0;
      overflow-wrap: anywhere;
      color: var(--text-tertiary);
      font-size: 12px;
    }

    .ff-shortcut-row__controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
    }

    .ff-shortcut-key {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 26px;
      padding: 0 6px;
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font: 12px ui-monospace, SFMono-Regular, monospace;
    }

    @media (max-width: 340px) {
      .ff-shortcut-row {
        grid-template-columns: minmax(0, 1fr);
      }

      .ff-shortcut-row__controls {
        justify-content: flex-start;
      }
    }

Retain visible focus styling on customizable rows and editing controls.

- [ ] **Step 5: Run Shortcuts behavior and static verification**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "Keyboard Shortcuts as a portrait"

Expected: PASS.

Run: npm run typecheck && npm run lint

Expected: PASS.

- [ ] **Step 6: Commit and push**

    git add src/renderer/components/KeyboardShortcuts.tsx src/renderer/styles/portrait-surface.css tests/ui/markuprx-electron.spec.ts
    git commit -m "feat: fit keyboard shortcuts to portrait shell"
    git push origin main

---

### Task 5: Portrait Completion, Error, and Review Editor

**Files:**
- Modify: src/renderer/App.tsx:380-470
- Modify: src/renderer/components/SessionReview.tsx:40-1379
- Modify: src/renderer/contexts/RecordingContext.tsx:760-790
- Modify: src/renderer/styles/app-shell.css
- Modify: src/renderer/styles/portrait-surface.css
- Modify: tests/ui/markuprx-electron.spec.ts: completed-session workflow

**Interfaces:**
- Consumes: shared portrait BrowserWindow size, SessionReview props, reviewSave/copy/open-folder/close handlers, and existing FeedbackItemCard.
- Produces: portrait Review Editor region, wrapping toolbar, single item scroller, bounded lightbox, saveError, and Promise-aware SessionReviewProps.onSave.

- [ ] **Step 1: Change the completed-session UI assertions to require portrait layout**

Extend the node:fs/promises import in the UI test with rm so the isolated harness can exercise a failed review save.

After Report Ready appears, add:

    await expectPortraitWindow(application, mainWindow);

After opening Review Editor, add:

    const review = mainWindow.getByRole('region', { name: 'Review Editor' });
    await expect(review).toBeVisible();
    await expectPortraitWindow(application, mainWindow);
    const reviewLayout = await review.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      hasVerticalScroll: element.scrollHeight > element.clientHeight,
    }));
    expect(reviewLayout.scrollWidth).toBeLessThanOrEqual(reviewLayout.clientWidth);

Replace the current left-to-right toolbar ordering assertion with:

    for (const action of reviewActions) {
      expect(action.x).toBeGreaterThanOrEqual(0);
      expect(action.x + action.width).toBeLessThanOrEqual(460);
      expect(action.y).toBeGreaterThanOrEqual(0);
      expect(action.y + action.height).toBeLessThanOrEqual(680);
    }

At the end of the same completed-session workflow, close History, reopen Review Editor, remove only the temporary harness session directory, and prove a failed save keeps the edit visible:

    await mainWindow
      .getByRole('button', { name: 'Back to MarkuprX' })
      .click();
    await mainWindow.getByRole('button', { name: 'Open Review Editor' }).click();
    await rm(sessionDir, { recursive: true, force: true });
    await mainWindow.locator('p').filter({ hasText: editedComment }).first().dblclick();
    const failedEditor = mainWindow.getByPlaceholder('Enter feedback text...');
    const unsavedComment = 'This edit must remain visible after save fails.';
    await failedEditor.fill(unsavedComment);
    await failedEditor.press('Enter');
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(mainWindow.getByRole('alert')).toContainText(/save|folder/i);
    await expect(mainWindow.getByText(unsavedComment, { exact: true })).toBeVisible();

- [ ] **Step 2: Run the completed-session test and confirm the old 460-by-720/fixed-editor failure**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "complete evidence"

Expected: FAIL on the complete-state height or fixed Review Editor layout.

- [ ] **Step 3: Make complete and error content portrait-safe**

The shared size from Task 1 handles outer dimensions. In app-shell.css ensure report and error content never force width:

    .ff-shell__report,
    .ff-shell__error,
    .ff-shell__recent {
      min-width: 0;
      max-width: 100%;
    }

    .ff-shell__report-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    }

Keep all report, recording, narration, folder, copy, and Review Editor actions.

- [ ] **Step 4: Convert SessionReview from fixed viewport editor to portrait region**

In App.tsx derive:

    const showReviewSurface =
      recording.state === 'complete' &&
      Boolean(recording.reviewSession) &&
      recording.showReviewEditor;
    const showPrimarySurface =
      ui.currentView === 'main' && !showReviewSurface;
    const hasDedicatedPortraitSurface =
      ui.currentView !== 'main' || showReviewSurface;

Use hasDedicatedPortraitSurface for the ff-shell__card--portrait modifier. Render SessionReview once when showReviewSurface is true. Guard the existing idle, complete-summary, error, recent-session, and footer JSX with showPrimarySurface so none of it remains behind or below the Review Editor.

Wrap the editor in:

    <PortraitSurface
      title="Review Editor"
      titleId="markuprx-review-title"
      backLabel="Back to report"
      onBack={onClose}
      subtitle={hasChanges ? 'Unsaved changes' : items.length + ' feedback items'}
      headerActions={
        <button
          type="button"
          aria-expanded={showPreview}
          aria-controls="markuprx-review-preview"
          onClick={() => setShowPreview((value) => !value)}
        >
          Preview
        </button>
      }
      contentLabel="Feedback items"
      footer={
        <div className="ff-review-actions">
          <button type="button" onClick={onOpenFolder}>Open Folder</button>
          <button type="button" onClick={onCopy}>Copy</button>
          <button type="button" onClick={handleSave}>Save</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className="ff-review-items">
        {items.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>No feedback items</p>
            <p style={styles.emptySubtext}>
              Start a new recording to capture feedback
            </p>
          </div>
        ) : (
          items.map((item, index) => (
            <FeedbackItemCard
              key={item.id}
              item={item}
              index={index}
              isSelected={selectedIndex === index}
              isEditing={editingIndex === index}
              isDragging={dragIndex === index}
              dragOverIndex={dragOverIndex}
              onSelect={() => setSelectedIndex(index)}
              onStartEdit={() => setEditingIndex(index)}
              onSaveEdit={(newText) => handleSaveEdit(index, newText)}
              onCancelEdit={() => setEditingIndex(null)}
              onDelete={() => handleDelete(index)}
              onCategoryChange={(category) => handleCategoryChange(index, category)}
              onSeverityChange={(severity) => handleSeverityChange(index, severity)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onThumbnailClick={setLightboxImage}
            />
          ))
        )}
      </div>
      {showPreview && (
        <div id="markuprx-review-preview" className="ff-review-preview">
          <MarkdownPreview
            session={currentSession}
            projectName={session.metadata?.sourceName}
          />
        </div>
      )}
    </PortraitSurface>

Remove position: fixed, inset, zIndex, the 60/40 mainContent split, and the always-visible MarkdownPreview pane.

Change SessionReviewProps.onSave to:

    onSave: (session: Session) => Promise<void> | void;

Add state:

    const [saveError, setSaveError] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

Make handleSave async-safe:

    const handleSave = useCallback(async () => {
      try {
        await onSave(currentSession);
        setHasChanges(false);
        setSaveError(null);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Unable to save review.');
      }
    }, [currentSession, onSave]);

Render saveError with role="alert" above the item list and keep edits intact.

RecordingContext.reviewSave currently swallows output errors. Change its catch block to retain the shared error message and rethrow:

    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save review changes.';
      setErrorMessage(message);
      throw error instanceof Error ? error : new Error(message);
    }

- [ ] **Step 5: Add portrait Review styles and bound the lightbox**

Add:

    .ff-review-items {
      display: grid;
      gap: 12px;
      min-width: 0;
      padding: 14px;
    }

    .ff-review-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      padding: 10px 12px;
    }

    .ff-review-actions button {
      min-width: 0;
      min-height: 36px;
      padding: 7px 6px;
      overflow-wrap: anywhere;
    }

    .ff-review-preview {
      max-height: 260px;
      margin: 0 14px 14px;
      overflow: auto;
      border: 1px solid var(--border-default);
      border-radius: 12px;
    }

    .ff-contained-lightbox {
      position: absolute;
      inset: 12px;
      max-width: calc(100% - 24px);
      max-height: calc(100% - 24px);
      overflow: auto;
    }

Change ImageLightbox's root to className="ff-contained-lightbox", role="dialog", aria-modal="true", aria-label="Screenshot preview", and tabIndex={-1}. Focus its named Close button when it mounts and retain the existing Escape close behavior. Keep thumbnail aspect ratio with max-width: 100%, max-height: 100%, and object-fit: contain.

Change toastContainer from fixed to absolute, set left and right to 12, bottom to 56, alignItems to center, and maxWidth to calc(100% - 24px). Move the existing keyboard-shortcut hint into the end of ff-review-items so it scrolls naturally instead of being absolutely positioned.

- [ ] **Step 6: Run completed-session and static verification**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "complete evidence|combined release|forced process termination"

Expected: PASS.

Run: npm run typecheck && npm run lint

Expected: PASS.

- [ ] **Step 7: Commit and push**

    git add src/renderer/App.tsx src/renderer/components/SessionReview.tsx src/renderer/contexts/RecordingContext.tsx src/renderer/styles/app-shell.css src/renderer/styles/portrait-surface.css tests/ui/markuprx-electron.spec.ts
    git commit -m "feat: fit review and completion states to portrait shell"
    git push origin main

---

### Task 6: Contained Onboarding, Export, Recovery, and Transient Dialogs

**Files:**
- Create: src/renderer/hooks/useContainedDialogFocus.ts
- Modify: src/renderer/components/Onboarding.tsx:1153-1965
- Modify: src/renderer/components/ExportDialog.tsx:282-871
- Modify: src/renderer/components/CrashRecoveryDialog.tsx:120-550
- Modify: src/renderer/components/ModelDownloadDialog.tsx:140-470
- Modify: src/renderer/components/CountdownTimer.tsx:110-220
- Modify: src/renderer/components/SessionHistory.tsx:540-575
- Modify: src/renderer/styles/portrait-surface.css
- Modify: tests/ui/markuprx-electron.spec.ts

**Interfaces:**
- Consumes: existing transient component props and existing focus/Escape handlers.
- Produces: useContainedDialogFocus(active), ff-contained-dialog-layer, ff-contained-dialog, ff-contained-dialog__body, and ff-contained-dialog__actions classes plus expectContainedDialog(page, locator).

- [ ] **Step 1: Add contained-dialog assertions and failing onboarding/export tests**

Add:

    async function expectContainedDialog(page: Page, dialogName: string): Promise<void> {
      const dialog = page.getByRole('dialog', { name: dialogName });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(12);
      expect(box!.y).toBeGreaterThanOrEqual(12);
      expect(box!.x + box!.width).toBeLessThanOrEqual(448);
      expect(box!.y + box!.height).toBeLessThanOrEqual(668);
      const overflow = await dialog.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    }

In the onboarding test, call:

    await expectPortraitWindow(application, window);
    await expectContainedDialog(window, 'Setup wizard');

Add an export test:

    test('contains Export inside the portrait window', async () => {
      const launched = await launchApplication(harness);
      application = launched.application;
      const window = launched.mainWindow;

      await clickApplicationMenuItem(application, 'File', 'Export...');
      await expectPortraitWindow(application, window);
      await expectContainedDialog(window, 'Export Feedback');
      await expect(window.getByRole('button', { name: /Export as/ })).toBeVisible();
      const exportDialog = window.getByRole('dialog', { name: 'Export Feedback' });
      const focusable = exportDialog.locator(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      );
      const first = focusable.first();
      const last = focusable.last();
      await first.focus();
      await window.keyboard.press('Shift+Tab');
      await expect(last).toBeFocused();
      await window.keyboard.press('Tab');
      await expect(first).toBeFocused();
      expect(await seriousAccessibilityViolations(window)).toEqual([]);
    });

- [ ] **Step 2: Run the transient tests and confirm oversized dialog failures**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "first-run|contains Export"

Expected: FAIL when a panel exceeds the 12-pixel portrait inset or document width.

- [ ] **Step 3: Add shared contained-dialog CSS**

Create useContainedDialogFocus.ts:

    import { useEffect, useRef, type RefObject } from 'react';

    const FOCUSABLE_SELECTOR = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    export function useContainedDialogFocus<T extends HTMLElement>(
      active: boolean,
    ): RefObject<T> {
      const dialogRef = useRef<T>(null);

      useEffect(() => {
        if (!active || !dialogRef.current) return;
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement as HTMLElement | null;
        const controls = () => Array.from(
          dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((element) => !element.hidden);
        (controls()[0] ?? dialog).focus();

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key !== 'Tab') return;
          const items = controls();
          if (items.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
          }
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        };

        dialog.addEventListener('keydown', handleKeyDown);
        return () => {
          dialog.removeEventListener('keydown', handleKeyDown);
          if (previousFocus?.isConnected) previousFocus.focus();
        };
      }, [active]);

      return dialogRef;
    }

    .ff-contained-dialog-layer {
      position: absolute;
      inset: 0;
      z-index: 200;
      display: grid;
      place-items: center;
      min-width: 0;
      min-height: 0;
      padding: 12px;
      background: var(--bg-overlay);
      backdrop-filter: blur(8px);
    }

    .ff-contained-dialog {
      display: flex;
      flex-direction: column;
      width: min(100%, 436px);
      max-width: 100%;
      max-height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border: 1px solid var(--border-default);
      border-radius: 16px;
      background: var(--bg-elevated);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.42);
    }

    .ff-contained-dialog__body {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
    }

    .ff-contained-dialog__actions {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--border-default);
    }

- [ ] **Step 4: Apply the containment contract to every transient component**

For Onboarding, ExportDialog, CrashRecoveryDialog, ModelDownloadDialog, and SessionHistory's DeleteConfirmDialog:

- assign ff-contained-dialog-layer to the backdrop root;
- assign ff-contained-dialog to the semantic dialog panel;
- attach the ref returned by useContainedDialogFocus(isOpen) where an isOpen prop exists, or useContainedDialogFocus(true) for an already-mounted active dialog, and give that panel tabIndex={-1};
- assign ff-contained-dialog__body to the scrolling content;
- assign ff-contained-dialog__actions to the final button row;
- remove fixed pixel widths above 436, max-height values based on 80/90 vh, and body-level overflow;
- put role=dialog and aria-modal=true on the panel rather than the full-screen layer;
- use aria-label="Setup wizard" for Onboarding;
- use aria-labelledby="markuprx-export-title" for ExportDialog and assign that id to its heading;
- use aria-labelledby="markuprx-delete-sessions-title" for DeleteConfirmDialog and assign that id to its heading;
- preserve the existing recovery and model-download labelled-by ids;
- retain Escape behavior, disabled/busy states, and existing action handlers.

For CountdownTimer, keep its current centered transition but cap it with max-width: calc(100% - 24px), max-height: calc(100% - 24px), and overflow: auto.

For all inline style maps, set long path/message containers to minWidth: 0 and overflowWrap: anywhere.

- [ ] **Step 5: Extend recovery coverage**

In the forced-process-termination test, after the recovery dialog appears:

    await expectPortraitWindow(application, mainWindow);
    await expectContainedDialog(mainWindow, 'Recover Previous Session?');

Keep the existing recovery behavior and evidence assertions.

- [ ] **Step 6: Run transient, recovery, accessibility, and static verification**

Run: npm run build:desktop && npm run test:ui-electron -- --grep "first-run|contains Export|forced process termination"

Expected: PASS.

Run: npm run typecheck && npm run lint

Expected: PASS.

- [ ] **Step 7: Commit and push**

    git add src/renderer/hooks/useContainedDialogFocus.ts src/renderer/components/Onboarding.tsx src/renderer/components/ExportDialog.tsx src/renderer/components/CrashRecoveryDialog.tsx src/renderer/components/ModelDownloadDialog.tsx src/renderer/components/CountdownTimer.tsx src/renderer/components/SessionHistory.tsx src/renderer/styles/portrait-surface.css tests/ui/markuprx-electron.spec.ts
    git commit -m "feat: contain dialogs in portrait window"
    git push origin main

---

### Task 7: Native Tray Help, Contact, and Exit/Quit

**Files:**
- Create: src/main/trayContextMenu.ts
- Create: tests/unit/trayContextMenu.test.ts
- Modify: src/main/TrayManager.ts:20-300

**Interfaces:**
- Consumes: TrayState, NodeJS.Platform, shell.openExternal, app.quit, recording/settings callbacks.
- Produces: HELP_URL, CONTACT_URL, DONATE_URL, TrayMenuActions, and buildTrayContextMenuTemplate(options).

- [ ] **Step 1: Write the failing tray-template tests**

    import { describe, expect, it, vi } from 'vitest';
    import {
      CONTACT_URL,
      HELP_URL,
      buildTrayContextMenuTemplate,
    } from '../../src/main/trayContextMenu';

    function clickable(
      template: ReturnType<typeof buildTrayContextMenuTemplate>,
      label: string,
    ): () => void {
      const item = template.find((candidate) => candidate.label === label);
      if (!item || typeof item.click !== 'function') {
        throw new Error('Clickable tray item not found: ' + label);
      }
      return item.click as () => void;
    }

    describe('tray context menu', () => {
      it('adds Help, Contact, and platform-specific quit copy', async () => {
        const openExternal = vi.fn().mockResolvedValue(undefined);
        const quit = vi.fn();
        const template = buildTrayContextMenuTemplate({
          platform: 'darwin',
          state: 'idle',
          actions: {
            toggleRecording: vi.fn(),
            openSettings: vi.fn(),
            openExternal,
            quit,
            reportExternalError: vi.fn(),
          },
        });

        clickable(template, 'Help')();
        clickable(template, 'Contact')();
        clickable(template, 'Quit MarkuprX')();
        await Promise.resolve();

        expect(openExternal).toHaveBeenNthCalledWith(1, HELP_URL);
        expect(openExternal).toHaveBeenNthCalledWith(2, CONTACT_URL);
        expect(quit).toHaveBeenCalledOnce();
        expect(template.some((item) => item.label === 'Exit MarkuprX')).toBe(false);
      });

      it('uses Exit on Windows and disables recording while processing', () => {
        const template = buildTrayContextMenuTemplate({
          platform: 'win32',
          state: 'processing',
          actions: {
            toggleRecording: vi.fn(),
            openSettings: vi.fn(),
            openExternal: vi.fn().mockResolvedValue(undefined),
            quit: vi.fn(),
            reportExternalError: vi.fn(),
          },
        });
        expect(template.find((item) => item.label === 'Start Recording')?.enabled).toBe(false);
        expect(template.some((item) => item.label === 'Exit MarkuprX')).toBe(true);
      });

      it('reports external launch failures without throwing', async () => {
        const reportExternalError = vi.fn();
        const failure = new Error('no browser');
        const template = buildTrayContextMenuTemplate({
          platform: 'linux',
          state: 'idle',
          actions: {
            toggleRecording: vi.fn(),
            openSettings: vi.fn(),
            openExternal: vi.fn().mockRejectedValue(failure),
            quit: vi.fn(),
            reportExternalError,
          },
        });
        clickable(template, 'Help')();
        await vi.waitFor(() => expect(reportExternalError).toHaveBeenCalledWith('help', failure));
      });
    });

- [ ] **Step 2: Run the tray test and confirm the missing module failure**

Run: npm run test:unit -- --run tests/unit/trayContextMenu.test.ts

Expected: FAIL because src/main/trayContextMenu.ts does not exist.

- [ ] **Step 3: Add the pure tray template builder**

    import type { MenuItemConstructorOptions } from 'electron';
    import type { TrayState } from '../shared/types';

    export const DONATE_URL = 'https://ko-fi.com/eddiesanjuan';
    export const HELP_URL = 'https://markuprx.com';
    export const CONTACT_URL =
      'mailto:hello@markuprx.com?subject=MarkuprX%20Support';

    export interface TrayMenuActions {
      toggleRecording: () => void;
      openSettings: () => void;
      openExternal: (url: string) => Promise<void>;
      quit: () => void;
      reportExternalError: (
        destination: 'donate' | 'help' | 'contact',
        error: unknown,
      ) => void;
    }

    export interface TrayMenuOptions {
      platform: NodeJS.Platform;
      state: TrayState;
      actions: TrayMenuActions;
    }

    function externalAction(
      destination: 'donate' | 'help' | 'contact',
      url: string,
      actions: TrayMenuActions,
    ): () => void {
      return () => {
        void actions.openExternal(url).catch((error: unknown) => {
          actions.reportExternalError(destination, error);
        });
      };
    }

    export function buildTrayContextMenuTemplate({
      platform,
      state,
      actions,
    }: TrayMenuOptions): MenuItemConstructorOptions[] {
      const isRecording = state === 'recording';
      const isProcessing = state === 'processing';
      return [
        {
          label: 'Buy Developer a Coffee',
          click: externalAction('donate', DONATE_URL, actions),
        },
        { type: 'separator' },
        {
          label: isRecording ? 'Stop Recording' : 'Start Recording',
          enabled: !isProcessing,
          click: actions.toggleRecording,
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: actions.openSettings,
        },
        { type: 'separator' },
        {
          label: 'Help',
          click: externalAction('help', HELP_URL, actions),
        },
        {
          label: 'Contact',
          click: externalAction('contact', CONTACT_URL, actions),
        },
        { type: 'separator' },
        { label: 'About MarkuprX', role: 'about' },
        { type: 'separator' },
        {
          label: platform === 'darwin' ? 'Quit MarkuprX' : 'Exit MarkuprX',
          accelerator: 'CmdOrCtrl+Q',
          click: actions.quit,
        },
      ];
    }

- [ ] **Step 4: Use the helper from TrayManager**

Remove the local DONATE_URL and inline Menu.buildFromTemplate array. Build the menu with:

    const menu = Menu.buildFromTemplate(
      buildTrayContextMenuTemplate({
        platform: process.platform,
        state: this.currentState,
        actions: {
          toggleRecording: () => {
            this.clickCallbacks.forEach((callback) => callback());
          },
          openSettings: () => {
            this.settingsCallbacks.forEach((callback) => callback());
          },
          openExternal: (url) => shell.openExternal(url),
          quit: () => app.quit(),
          reportExternalError: (destination, error) => {
            console.error('[TrayManager] Failed to open ' + destination + ':', error);
          },
        },
      }),
    );

Retain the existing macOS mouse-up branch, right-button check, popUpContextMenu call, Windows/Linux setContextMenu call, and left-click callbacks.

- [ ] **Step 5: Run tray and static verification**

Run: npm run test:unit -- --run tests/unit/trayContextMenu.test.ts

Expected: PASS.

Run: npm run typecheck && npm run lint

Expected: PASS.

- [ ] **Step 6: Commit and push**

    git add src/main/trayContextMenu.ts src/main/TrayManager.ts tests/unit/trayContextMenu.test.ts
    git commit -m "feat: add tray help contact and exit actions"
    git push origin main

---

### Task 8: Complete Portrait Regression and Visual Verification

**Files:**
- Modify: tests/ui/markuprx-electron.spec.ts
- Create: tests/ui/markuprx-electron.spec.ts-snapshots/settings-portrait-darwin.png
- Create: tests/ui/markuprx-electron.spec.ts-snapshots/history-portrait-darwin.png
- Create: tests/ui/markuprx-electron.spec.ts-snapshots/shortcuts-portrait-darwin.png
- Create: tests/ui/markuprx-electron.spec.ts-snapshots/review-portrait-darwin.png
- Create: tests/ui/markuprx-electron.spec.ts-snapshots/onboarding-portrait-darwin.png

**Interfaces:**
- Consumes: expectPortraitWindow, expectContainedDialog, all converted surfaces, shared layout constants, and existing deterministic Electron harness.
- Produces: release-level portrait, scroll, accessibility, and visual-regression evidence.

- [ ] **Step 1: Add reusable scroll and viewport assertions**

Extend the node:fs/promises import with mkdir and writeFile. Add a deterministic long-history fixture:

    async function seedSessionHistory(
      outputRoot: string,
      count: number,
    ): Promise<void> {
      for (let index = 0; index < count; index += 1) {
        const ordinal = String(index + 1).padStart(2, '0');
        const sessionDir = join(outputRoot, 'portrait-fixture-' + ordinal);
        await mkdir(sessionDir, { recursive: true });
        await writeFile(
          join(sessionDir, 'metadata.json'),
          JSON.stringify({
            sessionId: 'portrait-fixture-' + ordinal,
            startTime: 1_700_000_000_000 + index * 60_000,
            endTime: 1_700_000_030_000 + index * 60_000,
            itemCount: index + 1,
            screenshotCount: index % 4,
            source: {
              id: 'window:portrait:' + ordinal,
              name: 'Portrait Fixture ' + ordinal,
            },
            environment: { os: 'test', version: '1' },
          }),
          'utf8',
        );
        await writeFile(
          join(sessionDir, 'feedback-report.md'),
          '> Portrait history fixture ' + ordinal + '\n',
          'utf8',
        );
      }
    }

    async function expectSinglePortraitScroller(
      page: Page,
      surfaceName: string,
    ): Promise<void> {
      const surface = page.getByRole('region', { name: surfaceName });
      const metrics = await surface.evaluate((element) => {
        const scrollers = Array.from(
          element.querySelectorAll<HTMLElement>('.ff-portrait-surface__scroller'),
        ).filter((candidate) => {
          const style = getComputedStyle(candidate);
          return style.overflowY === 'auto' || style.overflowY === 'scroll';
        });
        return {
          count: scrollers.length,
          documentOverflow:
            document.documentElement.scrollWidth > window.innerWidth ||
            document.body.scrollWidth > window.innerWidth,
        };
      });
      expect(metrics).toEqual({ count: 1, documentOverflow: false });
    }

Call it for Settings, Session History, Keyboard Shortcuts, and Review Editor. Assert every primary and destructive action used by each workflow has a non-null bounding box within 460 by 680.

In the existing launch test, call expectPortraitWindow immediately after the Start Session action is visible. In the deterministic recording-HUD test, read the active BrowserWindow bounds through application.evaluate and assert { width: 316, height: 90 }. In a processing path, poll the same bounds after Stop and assert { width: 320, height: 140 } before the complete state returns to expectPortraitWindow.

Add this focused long-list test:

    test('scrolls a long portrait session history', async () => {
      await seedSessionHistory(harness.outputRoot, 18);
      const launched = await launchApplication(harness);
      application = launched.application;
      const window = launched.mainWindow;

      await window.getByRole('button', { name: 'Open Session History' }).click();
      await expectPortraitWindow(application, window);
      const history = window.getByRole('region', { name: 'Session History' });
      const scroller = history.locator('.ff-portrait-surface__scroller');
      expect(await scroller.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      )).toBe(true);
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(history.getByText('Portrait Fixture 01', { exact: true }))
        .toBeVisible();
      await expectSinglePortraitScroller(window, 'Session History');
    });

For Settings, run the same overflow and axe assertions under light and dark appearance choices. Then use application.evaluate to call the active BrowserWindow webContents.setZoomFactor(2), assert the document still has no horizontal overflow, and restore setZoomFactor(1). Use page.emulateMedia with reducedMotion set to reduce and forcedColors set to active for a final keyboard/axe pass.

- [ ] **Step 2: Add deterministic screenshots**

After each surface reaches its stable state, add:

    await expect(window).toHaveScreenshot('settings-portrait-darwin.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });

Repeat with the declared filenames for History, Shortcuts, Review, and Onboarding. Mask session-specific paths, timestamps, and generated thumbnail contents before comparison. Generate snapshots only after the behavioral assertions pass.

- [ ] **Step 3: Run the UI suite and review snapshots**

Run: npm run build:desktop && npm run test:ui-electron -- --update-snapshots

Expected: PASS and create five 460-by-680 approved snapshots.

Open each snapshot and verify the shared header, no clipped control, no horizontal overflow, readable wrapping, and correct existing MarkuprX visual language.

- [ ] **Step 4: Run all automated verification**

Run: npm run test:unit -- --run

Expected: PASS.

Run: npm run test:integration -- --run

Expected: PASS.

Run: npm run test:e2e -- --run

Expected: PASS.

Run: npm run typecheck

Expected: PASS.

Run: npm run lint

Expected: PASS.

Run: npm run build

Expected: desktop, CLI, and MCP builds complete successfully.

Run: npm run test:ui-electron

Expected: PASS without snapshot changes.

- [ ] **Step 5: Package and smoke-test the desktop app**

Run: npm run package:mac:unsigned

Expected: unsigned macOS artifact is produced.

Run: npm run test:package-smoke

Expected: packaged MarkuprX launches and exits successfully.

Manually launch the packaged app, left-click the tray icon, visit every portrait surface, right-click the tray icon, open Help and Contact, then choose Quit MarkuprX. Confirm Help reaches markuprx.com, Contact opens the addressed support draft, and the app exits.

- [ ] **Step 6: Inspect the final diff and commit verification assets**

Run: git diff --check

Expected: no whitespace errors.

Run: git status --short

Expected: only intended source, test, and five snapshot files are present.

    git add tests/ui/markuprx-electron.spec.ts tests/ui/markuprx-electron.spec.ts-snapshots
    git commit -m "test: verify portrait application surfaces"
    git push origin main

- [ ] **Step 7: Confirm the remote is synchronized**

Run: git fetch origin && git status --short --branch

Expected: main is aligned with origin/main and the worktree is clean.
