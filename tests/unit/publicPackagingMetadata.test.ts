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

    expect(builderConfig).toMatchObject({
      appId: 'com.eddiesanjuan.markuprx',
      productName: 'MarkuprPlus',
      executableName: 'MarkuprPlus',
      extraResources: [
        { from: 'assets', to: 'assets', filter: ['tray-*.png'] },
        {
          from: 'build',
          to: 'build',
          filter: ['overlay-*.png', 'toolbar-*.png'],
        },
      ],
      dmg: {
        title: 'Install MarkuprPlus ${arch}',
        artifactName: 'markuprplus-${version}-${arch}.dmg',
      },
      win: {
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
      linux: { icon: 'build/icon.png' },
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

  it('uses public branding in notarization output while retaining the bundle identifier', () => {
    const script = read('scripts/notarize.cjs');

    expect(script).toContain("log.info('MarkuprPlus Notarization')");
    expect(script).toContain("const appBundleId = 'com.eddiesanjuan.markuprx'");
    expect(script).not.toContain("log.info('markuprx Notarization')");
  });
});
