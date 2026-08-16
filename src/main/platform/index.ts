/**
 * Platform-specific integrations for markuprx
 *
 * Provides native OS features:
 * - Windows: Taskbar integration (jump lists, progress, overlay icons, thumbnail toolbar)
 * - macOS: Dock integration (handled by TrayManager and MenuManager)
 * - Linux: Unity launcher (future)
 */

export {
  WindowsTaskbar,
  createWindowsTaskbar,
  getWindowsTaskbar,
  type RecentSession,
  type TaskbarActionCallback,
} from './WindowsTaskbar';
