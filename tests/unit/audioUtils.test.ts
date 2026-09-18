import { describe, it, expect } from 'vitest';
import { extensionFromMimeType, encodeFloat32Wav, encodeFloat32Pcm16Wav } from '../../src/main/audio/audioUtils';

describe('extensionFromMimeType', () => {
  it('returns .webm for webm types', () => {
    expect(extensionFromMimeType('audio/webm')).toBe('.webm');
    expect(extensionFromMimeType('audio/webm;codecs=opus')).toBe('.webm');
    expect(extensionFromMimeType('video/webm')).toBe('.webm');
  });

  it('returns .ogg for ogg types', () => {
    expect(extensionFromMimeType('audio/ogg')).toBe('.ogg');
    expect(extensionFromMimeType('audio/ogg;codecs=opus')).toBe('.ogg');
  });

  it('returns .m4a for mp4/aac/m4a types', () => {
    expect(extensionFromMimeType('audio/mp4')).toBe('.m4a');
    expect(extensionFromMimeType('audio/aac')).toBe('.m4a');
    expect(extensionFromMimeType('audio/x-m4a')).toBe('.m4a');
  });

  it('returns .wav for wav types', () => {
    expect(extensionFromMimeType('audio/wav')).toBe('.wav');
    expect(extensionFromMimeType('audio/x-wav')).toBe('.wav');
  });

  it('returns .audio for unknown types', () => {
    expect(extensionFromMimeType('audio/flac')).toBe('.audio');
    expect(extensionFromMimeType('unknown')).toBe('.audio');
  });

  it('is case-insensitive', () => {
    expect(extensionFromMimeType('Audio/WEBM')).toBe('.webm');
    expect(extensionFromMimeType('AUDIO/WAV')).toBe('.wav');
  });
});

describe('encodeFloat32Wav', () => {
  it('produces valid WAV header', () => {
    const samples = Buffer.alloc(16);
    const wav = encodeFloat32Wav(samples, 16000, 1);

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  it('sets correct format fields for mono 16kHz', () => {
    const samples = Buffer.alloc(100);
    const wav = encodeFloat32Wav(samples, 16000, 1);

    expect(wav.readUInt16LE(20)).toBe(3); // IEEE float
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
    expect(wav.readUInt16LE(32)).toBe(4); // block align
    expect(wav.readUInt16LE(34)).toBe(32); // bits per sample
  });

  it('sets correct format fields for stereo 44100Hz', () => {
    const samples = Buffer.alloc(200);
    const wav = encodeFloat32Wav(samples, 44100, 2);

    expect(wav.readUInt16LE(22)).toBe(2); // channels
    expect(wav.readUInt32LE(24)).toBe(44100); // sample rate
    expect(wav.readUInt16LE(32)).toBe(8); // block align (2 * 4)
    expect(wav.readUInt32LE(28)).toBe(44100 * 8); // byte rate
  });

  it('has correct total length', () => {
    const dataSize = 160;
    const samples = Buffer.alloc(dataSize);
    const wav = encodeFloat32Wav(samples, 16000, 1);

    expect(wav.length).toBe(44 + dataSize);
    expect(wav.readUInt32LE(4)).toBe(36 + dataSize); // RIFF chunk size
    expect(wav.readUInt32LE(40)).toBe(dataSize); // data chunk size
  });

  it('preserves sample data after header', () => {
    const samples = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const wav = encodeFloat32Wav(samples, 16000, 1);

    expect(wav.slice(44)).toEqual(samples);
  });
});

describe('encodeFloat32Pcm16Wav', () => {
  it('produces valid WAV header with PCM format', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0]);
    const wav = encodeFloat32Pcm16Wav(samples, 16000, 1);

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(34)).toBe(16); // 16-bit
  });

  it('converts float samples to int16 correctly', () => {
    const samples = new Float32Array([0, 1.0, -1.0, 0.5]);
    const wav = encodeFloat32Pcm16Wav(samples, 16000, 1);

    expect(wav.readInt16LE(44)).toBe(0); // 0.0 -> 0
    expect(wav.readInt16LE(46)).toBe(0x7fff); // 1.0 -> 32767
    expect(wav.readInt16LE(48)).toBe(-0x8000); // -1.0 -> -32768
    expect(wav.readInt16LE(50)).toBe(Math.round(0.5 * 0x7fff)); // 0.5
  });

  it('clamps values outside [-1, 1]', () => {
    const samples = new Float32Array([2.0, -3.0]);
    const wav = encodeFloat32Pcm16Wav(samples, 16000, 1);

    expect(wav.readInt16LE(44)).toBe(0x7fff); // clamped to 1.0
    expect(wav.readInt16LE(46)).toBe(-0x8000); // clamped to -1.0
  });

  it('has correct data size for sample count', () => {
    const samples = new Float32Array(100);
    const wav = encodeFloat32Pcm16Wav(samples, 16000, 1);

    expect(wav.length).toBe(44 + 100 * 2);
    expect(wav.readUInt32LE(40)).toBe(200); // data chunk size
  });

  it('sets correct stereo parameters', () => {
    const samples = new Float32Array(8);
    const wav = encodeFloat32Pcm16Wav(samples, 44100, 2);

    expect(wav.readUInt16LE(22)).toBe(2); // channels
    expect(wav.readUInt16LE(32)).toBe(4); // block align (2 * 2)
    expect(wav.readUInt32LE(28)).toBe(44100 * 4); // byte rate
  });
});
