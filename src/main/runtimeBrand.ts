import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEGACY_USER_DATA_DIRECTORY_NAME,
  PUBLIC_BRAND_NAME,
} from '../shared/publicBrand';

export interface RuntimeBrandApp {
  getPath(name: 'appData' | 'userData'): string;
  setName(name: string): void;
  setPath(name: 'userData', path: string): void;
}

interface RuntimeBrandDependencies {
  ensureDirectory?: (
    path: string,
    options: { recursive: true; mode: number },
  ) => unknown;
  joinPath?: (basePath: string, directoryName: string) => string;
}

export function configureRuntimeBrand(
  app: RuntimeBrandApp,
  preserveLegacyUserData: boolean,
  dependencies: RuntimeBrandDependencies = {},
): void {
  if (preserveLegacyUserData) {
    const legacyUserDataPath = (dependencies.joinPath ?? join)(
      app.getPath('appData'),
      LEGACY_USER_DATA_DIRECTORY_NAME,
    );
    (dependencies.ensureDirectory ?? mkdirSync)(legacyUserDataPath, {
      recursive: true,
      mode: 0o700,
    });
    app.setPath('userData', legacyUserDataPath);
  }
  app.setName(PUBLIC_BRAND_NAME);
}
