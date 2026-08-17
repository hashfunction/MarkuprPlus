import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, ipcMain } from 'electron';
import {
  clearLegacyCaptureArtifacts,
  ensurePrivateCaptureArea,
  privateCaptureAreaPath,
} from '../../src/main/security/PrivateCaptureStorage';
import { AudioCaptureServiceImpl } from '../../src/main/audio/AudioCapture';
import {
  clearScreenRecordingArtifacts,
  registerCaptureHandlers,
} from '../../src/main/ipc/captureHandlers';
import { MarkedIssueArtifactStore } from '../../src/main/capture/MarkedIssueArtifactStore';
import { sessionController } from '../../src/main/SessionController';
import { IPC_CHANNELS } from '../../src/shared/types';

const temporaryRoots: string[] = [];

async function temporaryUserData(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'markuprplus-private-capture-'));
  temporaryRoots.push(root);
  vi.mocked(app.getPath).mockImplementation((name: string) => (
    name === 'userData' ? root : join(root, name)
  ));
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe('private capture storage', () => {
  it('creates private app-owned area directories', async () => {
    const userData = await temporaryUserData();
    const audio = await ensurePrivateCaptureArea('audio');

    expect(audio).toBe(await realpath(privateCaptureAreaPath('audio')));
    expect((await stat(join(userData, 'capture-recovery'))).mode & 0o777).toBe(0o700);
    expect((await stat(audio)).mode & 0o777).toBe(0o700);
  });

  it('rejects an aliased capture root without touching its target', async () => {
    const userData = await temporaryUserData();
    const external = join(userData, 'external');
    await mkdir(external);
    await writeFile(join(external, 'keep.txt'), 'keep');
    await symlink(external, join(userData, 'capture-recovery'), 'dir');

    await expect(ensurePrivateCaptureArea('recordings')).rejects.toThrow(/capture recovery root/i);
    await expect(readFile(join(external, 'keep.txt'), 'utf8')).resolves.toBe('keep');
  });

  it('fails audio startup before renderer capture when the private root is aliased', async () => {
    const userData = await temporaryUserData();
    const external = join(userData, 'external-start');
    await mkdir(external);
    await writeFile(join(external, 'keep.txt'), 'keep');
    await symlink(external, join(userData, 'capture-recovery'), 'dir');
    const service = new AudioCaptureServiceImpl();
    const send = vi.fn();
    service.setMainWindow({ webContents: { send } } as never);

    await expect(service.start()).rejects.toThrow(/capture recovery root/i);
    expect(send).not.toHaveBeenCalled();
    await expect(readFile(join(external, 'keep.txt'), 'utf8')).resolves.toBe('keep');
  });

  it('clears audio links without following them and reports non-file blockers', async () => {
    const userData = await temporaryUserData();
    const audio = await ensurePrivateCaptureArea('audio');
    const external = join(userData, 'external-audio');
    await mkdir(external);
    await writeFile(join(external, 'keep.raw'), 'external');
    const alias = join(audio, 'audio-link.raw');
    await symlink(join(external, 'keep.raw'), alias);
    const service = new AudioCaptureServiceImpl();

    await expect(service.clearRecoveryBuffers()).resolves.toBeUndefined();
    await expect(lstat(alias)).rejects.toThrow();
    await expect(readFile(join(external, 'keep.raw'), 'utf8')).resolves.toBe('external');

    const blocker = join(audio, 'audio-blocker.raw');
    await mkdir(blocker);
    await expect(service.clearRecoveryBuffers()).rejects.toThrow(/not removable/i);
    await expect(stat(blocker)).resolves.toBeDefined();
  });

  it('removes every app-owned audio artifact and continues after an early blocker', async () => {
    await temporaryUserData();
    const audio = await ensurePrivateCaptureArea('audio');
    const blocker = join(audio, 'audio-000.raw');
    const orphan = join(audio, 'orphan-narration.bin');
    await mkdir(blocker);
    await writeFile(orphan, 'private narration');
    const service = new AudioCaptureServiceImpl();

    await expect(service.clearRecoveryBuffers()).rejects.toThrow();
    await expect(lstat(orphan)).rejects.toThrow();
  });

  it('clears recording links without following them and reports non-file blockers', async () => {
    const userData = await temporaryUserData();
    const recordings = await ensurePrivateCaptureArea('recordings');
    const external = join(userData, 'external-recording');
    await mkdir(external);
    await writeFile(join(external, 'keep.webm'), 'external');
    const stem = '123e4567-e89b-42d3-a456-426614174000';
    const alias = join(recordings, `${stem}.webm`);
    await symlink(join(external, 'keep.webm'), alias);

    await expect(clearScreenRecordingArtifacts()).resolves.toBeUndefined();
    await expect(lstat(alias)).rejects.toThrow();
    await expect(readFile(join(external, 'keep.webm'), 'utf8')).resolves.toBe('external');

    const blocker = join(recordings, `${stem}.mp4`);
    await mkdir(blocker);
    await expect(clearScreenRecordingArtifacts()).rejects.toThrow(/not removable/i);
    await expect(stat(blocker)).resolves.toBeDefined();
  });

  it('removes unrecognized artifacts from the private recording root', async () => {
    await temporaryUserData();
    const recordings = await ensurePrivateCaptureArea('recordings');
    const orphan = join(recordings, 'orphan-recording.bin');
    await writeFile(orphan, 'private recording');

    await expect(clearScreenRecordingArtifacts()).resolves.toBeUndefined();
    await expect(lstat(orphan)).rejects.toThrow();
  });

  it('removes unrecognized sessions from the private marked screenshot root', async () => {
    const userData = await temporaryUserData();
    const marked = await ensurePrivateCaptureArea('marked-issues');
    const orphan = join(marked, 'orphan-session');
    await mkdir(orphan);
    await writeFile(join(orphan, 'candidate.png'), 'private screenshot');
    const store = new MarkedIssueArtifactStore(
      join(userData, 'capture-recovery', 'marked-issues'),
    );

    await expect(store.cleanupStaleSessions([])).resolves.toBeUndefined();
    await expect(lstat(orphan)).rejects.toThrow();
  });

  it('creates screen recordings exclusively with private file permissions', async () => {
    await temporaryUserData();
    const sessionId = '123e4567-e89b-42d3-a456-426614174000';
    vi.spyOn(sessionController, 'getSession').mockReturnValue({
      id: sessionId,
      metadata: {},
    } as never);
    registerCaptureHandlers({
      getMainWindow: () => null,
      getPopover: () => null,
      getSettingsManager: () => null,
      getWindowsTaskbar: () => null,
      getHasCompletedOnboarding: () => true,
      setHasCompletedOnboarding: () => undefined,
    });
    const start = vi.mocked(ipcMain.handle).mock.calls
      .find(([channel]) => channel === IPC_CHANNELS.SCREEN_RECORDING_START)?.[1] as
      | ((event: unknown, id: string, mimeType: string) => Promise<{ path?: string; success: boolean }>)
      | undefined;

    expect(start).toBeTypeOf('function');
    const result = await start!({}, sessionId, 'video/webm');
    expect(result?.success).toBe(true);
    expect(result?.path).toBeTruthy();
    expect((await stat(result!.path!)).mode & 0o777).toBe(0o600);

    await clearScreenRecordingArtifacts();
    await expect(lstat(result!.path!)).rejects.toThrow();
  });

  it('clears recognized legacy temp artifacts without touching aliases or unrelated files', async () => {
    const userData = await temporaryUserData();
    const legacyTemp = join(userData, 'temp');
    const audio = join(legacyTemp, 'markuprx-audio');
    const recordings = join(legacyTemp, 'markuprx-recordings');
    const marked = join(legacyTemp, 'markuprx-marked-issues');
    const markedSession = join(marked, '123e4567-e89b-42d3-a456-426614174000');
    const external = join(userData, 'external-legacy');
    await Promise.all([
      mkdir(audio, { recursive: true }),
      mkdir(recordings, { recursive: true }),
      mkdir(markedSession, { recursive: true }),
      mkdir(external, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(audio, 'audio-2026-08-17.raw'), 'legacy audio'),
      writeFile(join(recordings, '123e4567-e89b-42d3-a456-426614174000.webm'), 'legacy video'),
      writeFile(join(markedSession, 'candidate-1.png'), 'legacy screenshot'),
      writeFile(join(audio, 'unrelated.txt'), 'preserve'),
      writeFile(join(external, 'keep.raw'), 'external'),
    ]);
    await symlink(join(external, 'keep.raw'), join(audio, 'audio-linked.raw'));

    await expect(clearLegacyCaptureArtifacts()).resolves.toBeUndefined();

    await expect(lstat(join(audio, 'audio-2026-08-17.raw'))).rejects.toThrow();
    await expect(lstat(join(audio, 'audio-linked.raw'))).rejects.toThrow();
    await expect(lstat(join(recordings, '123e4567-e89b-42d3-a456-426614174000.webm')))
      .rejects.toThrow();
    await expect(lstat(markedSession)).rejects.toThrow();
    await expect(readFile(join(audio, 'unrelated.txt'), 'utf8')).resolves.toBe('preserve');
    await expect(readFile(join(external, 'keep.raw'), 'utf8')).resolves.toBe('external');
  });

  it('rejects a legacy temp-root alias without deleting through it', async () => {
    const userData = await temporaryUserData();
    const legacyTemp = join(userData, 'temp');
    const external = join(userData, 'external-legacy-root');
    await Promise.all([
      mkdir(legacyTemp, { recursive: true }),
      mkdir(external, { recursive: true }),
    ]);
    await writeFile(join(external, 'keep.raw'), 'external');
    await symlink(external, join(legacyTemp, 'markuprx-audio'), 'dir');
    const recordings = join(legacyTemp, 'markuprx-recordings');
    const laterArtifact = join(recordings, '123e4567-e89b-42d3-a456-426614174000.webm');
    await mkdir(recordings);
    await writeFile(laterArtifact, 'legacy video');

    await expect(clearLegacyCaptureArtifacts()).rejects.toThrow(/legacy audio root/i);
    await expect(readFile(join(external, 'keep.raw'), 'utf8')).resolves.toBe('external');
    await expect(lstat(laterArtifact)).rejects.toThrow();
  });
});
