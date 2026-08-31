import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');
const nodeRequire = createRequire(import.meta.url);
const parseYaml = (source: string): unknown =>
  (nodeRequire('js-yaml') as { load: (input: string) => unknown }).load(source);

describe('public packaging identity', () => {
  it('ships MarkuprPlus while retaining machine-facing compatibility', () => {
    const packageJson = JSON.parse(read('package.json'));
    const builder = read('electron-builder.yml');
    const builderConfig = parseYaml(builder);

    expect(packageJson.name).toBe('markuprx');
    expect(packageJson.productName).toBe('MarkuprPlus');
    expect(packageJson.homepage).toBe('https://markuprplus.com');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/hashfunction/MarkuprPlus.git',
    });
    expect(packageJson.bugs).toEqual({
      url: 'https://github.com/hashfunction/MarkuprPlus/issues',
    });
    expect(packageJson.bin).toEqual({
      markuprx: './dist/cli/index.mjs',
      'markuprx-mcp': './dist/mcp/index.mjs',
    });
    expect(packageJson.mcpName).toBe('com.markuprx/markuprx');
    expect(packageJson.scripts['generate:icons']).toContain(
      'node scripts/generate-tray-icons.mjs',
    );

    expect(builderConfig).toMatchObject({
      appId: 'com.eddiesanjuan.markuprx',
      productName: 'MarkuprPlus',
      executableName: 'MarkuprPlus',
      afterSign: 'scripts/notarize.cjs',
      mac: {
        notarize: false,
      },
      extraResources: [
        {
          from: 'assets',
          to: 'assets',
          filter: [
            'tray-{idle,recording,complete,error}{,Template,@2x,Template@2x}.png',
            'tray-processing{,-0,-1,-2,-3}{,Template,@2x,Template@2x}.png',
          ],
        },
      ],
      dmg: {
        title: 'Install MarkuprPlus${arch}',
        artifactName: 'markuprplus-${version}-${arch}.dmg',
      },
      win: {
        extraResources: [{
          from: 'build',
          to: 'build',
          filter: ['overlay-*.png', 'toolbar-*.png'],
        }],
        fileAssociations: [{
          ext: 'markuprx',
          name: 'MarkuprPlus Session',
          description: 'MarkuprPlus feedback session file',
        }],
      },
      nsis: {
        shortcutName: 'MarkuprPlus',
        artifactName: 'markuprplus-Setup-${version}.exe',
      },
      linux: {
        icon: 'build/icon.png',
        artifactName: 'markuprplus-${version}-${arch}.${ext}',
      },
    });
    expect((builderConfig as { win: Record<string, unknown> }).win)
      .not.toHaveProperty('publisherName');
    expect(builder).toContain(
      '# Publisher identity is derived from the signing certificate common name.',
    );
    expect(builder).not.toContain('- "**/*"');
  });

  it('points Windows shell actions at the public executable while preserving registry keys', () => {
    const installer = read('build/installer.nsh');

    expect(installer).toContain(
      'Software\\Classes\\Directory\\Background\\shell\\markuprx',
    );
    expect(installer).toContain('Software\\Classes\\Directory\\shell\\markuprx');
    expect(installer.match(/\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}/g) ?? [])
      .toHaveLength(4);
    expect(installer).not.toContain('$INSTDIR\\markuprx.exe');
  });

  it('aligns DMG artwork with Finder item centers without duplicate labels', () => {
    const builderConfig = parseYaml(read('electron-builder.yml')) as {
      dmg: { contents: Array<{ x: number; y: number; type: string }> };
    };
    const background = read('assets/svg-source/dmg-background.svg');

    expect(builderConfig.dmg.contents).toEqual([
      { x: 180, y: 170, type: 'file' },
      { x: 480, y: 170, type: 'link', path: '/Applications' },
    ]);
    expect(background).toContain('<circle cx="180" cy="170"');
    expect(background).toContain('<circle cx="480" cy="170"');
    expect(background).not.toContain('stroke-dasharray');
    expect(background).not.toMatch(/<text[^>]*>\s*(MarkuprPlus|Applications)\s*<\/text>/);
  });

  it('keeps active packaging surfaces free of the legacy public display name', () => {
    const activePackagingFiles = [
      'package.json',
      'electron-builder.yml',
      'assets/svg-source/dmg-background.svg',
      'assets/DMG_BACKGROUND_INSTRUCTIONS.md',
      'build/DMG_BACKGROUND_SPEC.md',
      'scripts/generate-icons.mjs',
      'scripts/generate-installer-images.cjs',
      'scripts/generate-og-image.mjs',
      'scripts/notarize.cjs',
      'scripts/lib/startup-probe.mjs',
      'scripts/smoke-packaged-app.mjs',
      'scripts/verify-brand.mjs',
      'scripts/verify-package.mjs',
    ];
    const stale = activePackagingFiles.filter((file) => read(file).includes('MarkuprX'));

    expect(stale).toEqual([]);
  });

  it('adds a current MarkuprPlus release section without rewriting release history', () => {
    const changelog = read('CHANGELOG.md');

    expect(changelog).toMatch(
      /^# Changelog\n\nAll notable changes to MarkuprPlus will be documented in this file\./,
    );
    expect(changelog).toContain('## Unreleased — MarkuprPlus');
    expect(changelog).toContain(
      '- Rebranded the public desktop experience and documentation as MarkuprPlus.',
    );
    expect(changelog).toContain(
      '- Preserved existing `markuprx` CLI, MCP, IPC, storage, and package compatibility.',
    );
    expect(changelog).toContain(
      '- Added a portrait-first taskbar popover experience and new README screenshot gallery.',
    );
    expect(changelog).toContain(
      '- Windows publisher identity is derived from the signing certificate; '
      + 'signed releases must verify the actual certificate subject.',
    );
    expect(changelog.indexOf('## Unreleased — MarkuprPlus')).toBeLessThan(
      changelog.indexOf('## 3.0.0'),
    );
    expect(changelog).toContain('**MarkuprX Initial Public Release**');
  });

  it('uses the public app name in clean-install automation while retaining legacy cleanup', () => {
    const script = read('scripts/one-click-clean-test.sh');

    expect(script).toContain('MarkuprPlus.app/Contents/MacOS/MarkuprPlus');
    expect(script).toContain('/Applications/MarkuprPlus.app');
    expect(script).toContain('release/mac-arm64/MarkuprPlus.app');
    expect(script).toContain('APP_DEST="/Applications/MarkuprPlus.app"');
    expect(script).not.toContain("-name '*.app'");
    expect(script).toContain('markuprx.app/Contents/MacOS/markuprx');
    expect(script).toContain('/Applications/markuprx.app');
  });

  it('uses public branding in notarization output and fails closed', () => {
    const script = read('scripts/notarize.cjs');

    expect(script).toContain("log.info('MarkuprPlus Notarization')");
    expect(script).not.toContain("log.info('markuprx Notarization')");

    // notarytool reads the bundle identifier from the signed app, so the hook
    // must not carry a second copy of it. electron-builder.yml stays the single
    // source of truth and is asserted above.
    expect(script).not.toContain('appBundleId');

    // A tagged release must never silently produce an unnotarized artifact.
    expect(script).toContain('MARKUPRX_REQUIRE_NOTARIZATION');
    expect(script).toContain('Developer ID Application');
  });

  it('signs disk images before notarizing and stapling them', () => {
    const script = read('scripts/notarize-dmg.mjs');

    expect(script).toContain("run('codesign', signArguments)");
    expect(script).toContain("run('codesign', ['--verify', '--verbose=2', diskImage])");
    expect(script).toContain('Developer ID Application');
    expect(script.indexOf("run('codesign', signArguments)")).toBeLessThan(
      script.indexOf("run('xcrun', ['notarytool', 'submit'"),
    );
  });

  it('runs fail-closed package verification after every public packaging command', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    const packagingCommands = [
      'package',
      'package:mac',
      'package:mac:unsigned',
      'package:win',
      'package:linux',
      'dist:mac',
      'dist:mac:universal',
      'dist:mac:x64',
      'dist:mac:arm64',
      'dist:win',
      'dist:win:portable',
      'dist:win:nsis',
    ];

    for (const command of packagingCommands) {
      expect(scripts[command], command).toMatch(/&& npm run verify:package$/);
    }
  });

  it('expands Linux artifact names with electron-builder architecture semantics', () => {
    const builderConfig = parseYaml(read('electron-builder.yml')) as {
      linux: { artifactName: string };
    };
    const { expandMacro } = nodeRequire('app-builder-lib/out/util/macroExpander.js') as {
      expandMacro: (
        pattern: string,
        arch: string,
        appInfo: Record<string, string>,
        extra: Record<string, string>,
      ) => string;
    };
    const { Arch, getArtifactArchName } = nodeRequire('builder-util/out/arch') as {
      Arch: { x64: number };
      getArtifactArchName: (arch: number, extension: string) => string;
    };
    const appInfo = {
      name: 'markuprx',
      productName: 'MarkuprPlus',
      sanitizedProductName: 'MarkuprPlus',
      version: '3.0.0',
    };
    const expand = (extension: string) => expandMacro(
      builderConfig.linux.artifactName,
      getArtifactArchName(Arch.x64, extension),
      appInfo,
      { ext: extension, os: 'linux' },
    );

    expect(expand('AppImage')).toBe('markuprplus-3.0.0-x86_64.AppImage');
    expect(expand('deb')).toBe('markuprplus-3.0.0-amd64.deb');
  });
});
