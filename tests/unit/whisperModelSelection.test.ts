import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WhisperService,
  resolveDownloadedWhisperModelPath,
} from '../../src/main/transcription/WhisperService';

describe('Whisper model selection', () => {
  const temporaryDirectories: string[] = [];

  async function createModelsDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'markupr-whisper-'));
    temporaryDirectories.push(directory);
    return directory;
  }

  async function createModel(directory: string, filename: string): Promise<string> {
    const path = join(directory, filename);
    await writeFile(path, Buffer.alloc(16, 1));
    return path;
  }

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it('selects Tiny when it is the only valid downloaded model', async () => {
    const directory = await createModelsDirectory();
    const tinyPath = await createModel(directory, 'ggml-tiny.bin');

    expect(resolveDownloadedWhisperModelPath(directory)).toBe(tinyPath);
  });

  it('uses the established quality preference when several models exist', async () => {
    const directory = await createModelsDirectory();
    await createModel(directory, 'ggml-tiny.bin');
    const smallPath = await createModel(directory, 'ggml-small.bin');
    await createModel(directory, 'ggml-base.bin');

    expect(resolveDownloadedWhisperModelPath(directory)).toBe(smallPath);
  });

  it('ignores zero-byte models and uses Large when it is the only valid model', async () => {
    const directory = await createModelsDirectory();
    await writeFile(join(directory, 'ggml-medium.bin'), Buffer.alloc(0));
    const largePath = await createModel(directory, 'ggml-large-v3.bin');

    expect(resolveDownloadedWhisperModelPath(directory)).toBe(largePath);
  });

  it('refreshes auto-discovery when a model appears after construction', async () => {
    const directory = await createModelsDirectory();
    const service = new WhisperService({ modelsDirectory: directory });

    expect(service.isModelAvailable()).toBe(false);

    const tinyPath = await createModel(directory, 'ggml-tiny.bin');

    expect(service.isModelAvailable()).toBe(true);
    expect(service.getConfig().modelPath).toBe(tinyPath);
  });

  it('preserves an explicit model path instead of auto-selecting another model', async () => {
    const directory = await createModelsDirectory();
    const explicitPath = await createModel(directory, 'custom.bin');
    await createModel(directory, 'ggml-medium.bin');
    const service = new WhisperService({
      modelPath: explicitPath,
      modelsDirectory: directory,
    });

    expect(service.isModelAvailable()).toBe(true);
    expect(service.getConfig().modelPath).toBe(explicitPath);
  });
});
