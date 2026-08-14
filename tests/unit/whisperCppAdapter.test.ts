import { describe, expect, it } from 'vitest';
import {
  buildWhisperCppArguments,
  parseWhisperCppJson,
  toAsarUnpackedPath,
} from '../../src/main/transcription/WhisperCppRunner';

describe('Whisper.cpp adapter', () => {
  it('keeps paths with spaces as individual execFile arguments', () => {
    expect(buildWhisperCppArguments({
      modelPath: '/Users/example/Application Support/markupr/ggml-tiny.bin',
      wavPath: '/private/tmp/markupr audio/input.wav',
      outputBasePath: '/private/tmp/markupr audio/result',
      language: 'en',
      threads: 4,
      translateToEnglish: false,
    })).toEqual([
      '-m', '/Users/example/Application Support/markupr/ggml-tiny.bin',
      '-f', '/private/tmp/markupr audio/input.wav',
      '-l', 'en',
      '-t', '4',
      '-oj',
      '-of', '/private/tmp/markupr audio/result',
    ]);
  });

  it('parses whisper.cpp JSON offsets into absolute transcript seconds', () => {
    const segments = parseWhisperCppJson(JSON.stringify({
      transcription: [
        {
          offsets: { from: 250, to: 1_750 },
          text: ' The save button overlaps the footer. ',
        },
      ],
    }), 100);

    expect(segments).toEqual([{
      text: 'The save button overlaps the footer.',
      startTime: 100.25,
      endTime: 101.75,
      confidence: 0.9,
    }]);
  });

  it('ignores blank and malformed transcription entries', () => {
    expect(parseWhisperCppJson(JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 100 }, text: '  ' },
        { offsets: { from: 'bad', to: 100 }, text: 'invalid timestamp' },
      ],
    }), 0)).toEqual([]);
  });

  it('maps packaged runtime paths out of app.asar', () => {
    expect(toAsarUnpackedPath('/Applications/markupR.app/Contents/Resources/app.asar/node_modules/whisper-node'))
      .toBe('/Applications/markupR.app/Contents/Resources/app.asar.unpacked/node_modules/whisper-node');
    expect(toAsarUnpackedPath('/workspace/node_modules/whisper-node'))
      .toBe('/workspace/node_modules/whisper-node');
  });
});
