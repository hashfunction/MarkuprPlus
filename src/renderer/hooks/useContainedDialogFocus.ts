import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ActiveDialogEntry {
  dialog: HTMLElement;
}

const activeDialogs: ActiveDialogEntry[] = [];

function topmostContainedDialog(): HTMLElement | null {
  for (let index = activeDialogs.length - 1; index >= 0; index -= 1) {
    const entry = activeDialogs[index];
    if (entry.dialog.isConnected) return entry.dialog;
  }
  return null;
}

export function registerContainedDialog(dialog: HTMLElement): () => boolean {
  const entry = { dialog };
  activeDialogs.push(entry);
  return () => {
    const index = activeDialogs.lastIndexOf(entry);
    if (index < 0) return false;
    const wasTopmostRegistration = index === activeDialogs.length - 1;
    activeDialogs.splice(index, 1);
    return wasTopmostRegistration;
  };
}

export function isTopmostContainedDialog(dialog: HTMLElement): boolean {
  return topmostContainedDialog() === dialog;
}

export function hasActiveContainedDialog(): boolean {
  return topmostContainedDialog() !== null;
}

function isAvailableFocusable(element: HTMLElement, dialog: HTMLElement): boolean {
  if (!element.isConnected || !dialog.contains(element) || element.tabIndex < 0) return false;
  if (element.matches(':disabled')) return false;
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false;
  }

  return element.getClientRects().length > 0;
}

function availableControls(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => isAvailableFocusable(element, dialog));
}

export function useContainedDialogFocus<T extends HTMLElement>(
  active: boolean,
): RefObject<T> {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    if (!active || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unregisterDialog = registerContainedDialog(dialog);
    const focusFirst = () => {
      if (!isTopmostContainedDialog(dialog)) return;
      (availableControls(dialog)[0] ?? dialog).focus({ preventScroll: true });
    };
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostContainedDialog(dialog) || event.key !== 'Tab') return;

      const controls = availableControls(dialog);
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopmostContainedDialog(dialog)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && dialog.contains(target)
        && (isAvailableFocusable(target, dialog)
          || (target === dialog && availableControls(dialog).length === 0))
      ) {
        return;
      }
      focusFirst();
    };

    let focusFrame: number | null = null;
    const observer = new MutationObserver(() => {
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null;
        if (!isTopmostContainedDialog(dialog)) return;
        const activeElement = document.activeElement;
        if (
          !(activeElement instanceof HTMLElement)
          || !dialog.contains(activeElement)
          || (activeElement !== dialog && !isAvailableFocusable(activeElement, dialog))
        ) {
          focusFirst();
        }
      });
    });
    observer.observe(dialog, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'aria-hidden',
        'class',
        'disabled',
        'hidden',
        'inert',
        'style',
        'tabindex',
      ],
    });

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      observer.disconnect();
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      const wasTopmost = unregisterDialog();
      if (!wasTopmost) return;

      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      const revealedDialog = topmostContainedDialog();
      const activeElement = document.activeElement;
      const revealedControls = revealedDialog ? availableControls(revealedDialog) : [];
      const hasValidRevealedFocus = Boolean(
        revealedDialog
        && activeElement instanceof HTMLElement
        && revealedDialog.contains(activeElement)
        && (
          isAvailableFocusable(activeElement, revealedDialog)
          || (activeElement === revealedDialog && revealedControls.length === 0)
        ),
      );
      if (
        revealedDialog
        && !hasValidRevealedFocus
      ) {
        (revealedControls[0] ?? revealedDialog).focus({ preventScroll: true });
      }
    };
  }, [active]);

  return dialogRef;
}
