import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const nativeRuntimeHook = require('../../scripts/prepare-whisper-runtime.cjs') as {
  sharpRuntimePackages(platform: string, arch: string): string[];
  whisperBuildConfiguration?: (platform: string, arch: string) => {
    binaryName: string;
    expectedArchitecture: string;
    makeVariables: string[];
  } | null;
  nativeBinaryArchitectures?: (binary: Buffer) => string[];
};

describe('native runtime packaging matrix', () => {
  it.each([
    ['darwin', 'x64', ['@img/sharp-darwin-x64', '@img/sharp-libvips-darwin-x64']],
    ['darwin', 'arm64', ['@img/sharp-darwin-arm64', '@img/sharp-libvips-darwin-arm64']],
    ['win32', 'x64', ['@img/sharp-win32-x64']],
    ['linux', 'x64', ['@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64']],
  ])('selects the Sharp runtime for %s/%s', (platform, arch, expected) => {
    expect(nativeRuntimeHook.sharpRuntimePackages(platform, arch)).toEqual(expected);
  });

  it('does not guess an unsupported package architecture', () => {
    expect(nativeRuntimeHook.sharpRuntimePackages('darwin', 'universal')).toEqual([]);
    expect(nativeRuntimeHook.sharpRuntimePackages('freebsd', 'x64')).toEqual([]);
  });

  it.each([
    ['x64', 'x86_64'],
    ['arm64', 'arm64'],
  ])('cross-compiles the macOS Whisper executable for %s', (arch, compilerArch) => {
    expect(nativeRuntimeHook.whisperBuildConfiguration?.('darwin', arch)).toEqual({
      binaryName: 'main',
      expectedArchitecture: arch,
      makeVariables: [
        `UNAME_M=${compilerArch}`,
        `UNAME_P=${compilerArch}`,
        `CC=xcrun clang -arch ${compilerArch}`,
        `CXX=xcrun clang++ -arch ${compilerArch}`,
      ],
    });
  });

  it('reads thin Mach-O architecture headers without trusting the host CPU', () => {
    const x64MachO = Buffer.alloc(32);
    x64MachO.writeUInt32LE(0xfeedfacf, 0);
    x64MachO.writeUInt32LE(0x01000007, 4);
    const arm64MachO = Buffer.alloc(32);
    arm64MachO.writeUInt32LE(0xfeedfacf, 0);
    arm64MachO.writeUInt32LE(0x0100000c, 4);

    expect(nativeRuntimeHook.nativeBinaryArchitectures?.(x64MachO)).toEqual(['x64']);
    expect(nativeRuntimeHook.nativeBinaryArchitectures?.(arm64MachO)).toEqual(['arm64']);
  });

  it('reads Windows PE and Linux ELF architecture headers', () => {
    const windowsX64 = Buffer.alloc(128);
    windowsX64.write('MZ', 0, 'ascii');
    windowsX64.writeUInt32LE(64, 0x3c);
    windowsX64.write('PE\0\0', 64, 'binary');
    windowsX64.writeUInt16LE(0x8664, 68);

    const linuxArm64 = Buffer.alloc(64);
    linuxArm64.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    linuxArm64.writeUInt16LE(0x00b7, 18);

    expect(nativeRuntimeHook.nativeBinaryArchitectures?.(windowsX64)).toEqual(['x64']);
    expect(nativeRuntimeHook.nativeBinaryArchitectures?.(linuxArm64)).toEqual(['arm64']);
  });

  it('returns no architecture for malformed or unsupported executables', () => {
    expect(nativeRuntimeHook.nativeBinaryArchitectures?.(Buffer.from('not executable'))).toEqual([]);
    expect(nativeRuntimeHook.nativeBinaryArchitectures?.(Buffer.alloc(2))).toEqual([]);
  });
});
