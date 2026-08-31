import { describe, expect, it } from 'vitest';
import {
  CLI_BRIDGE_SETUP_COMMANDS,
  getCliBridgeStatusPresentation,
} from '../../src/renderer/components/settings/CliBridgeSetup';

describe('CLI bridge setup presentation', () => {
  it('provides deterministic install, start, and token commands', () => {
    expect(CLI_BRIDGE_SETUP_COMMANDS).toEqual([
      'npm install -g markuprplus',
      'markuprplus bridge install',
      'markuprplus bridge token',
    ]);
  });

  it('presents connected state without including secret material', () => {
    expect(getCliBridgeStatusPresentation({
      state: 'connected',
      paired: true,
      providers: [{
        id: 'codex-cli',
        name: 'Codex CLI',
        installed: true,
        authenticated: true,
        ready: true,
      }],
    })).toEqual({
      label: 'Connected',
      detail: '1 of 1 CLI providers ready',
      tone: 'success',
    });
  });

  it('keeps offline, incompatible, and not-paired states actionable', () => {
    expect(getCliBridgeStatusPresentation({
      state: 'offline',
      paired: true,
      diagnostic: 'Start MarkuprPlus CLI Bridge.',
    })).toEqual({
      label: 'Bridge offline',
      detail: 'Start MarkuprPlus CLI Bridge.',
      tone: 'warning',
    });
    expect(getCliBridgeStatusPresentation({
      state: 'incompatible',
      paired: true,
      diagnostic: 'Update MarkuprPlus CLI Bridge.',
    }).label).toBe('Update required');
    expect(getCliBridgeStatusPresentation(null).label).toBe('Checking bridge…');
  });
});
