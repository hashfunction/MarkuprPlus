import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const requestedProfile = process.env.MARKUPRPLUS_MAS_PROVISIONING_PROFILE;
if (!requestedProfile) {
  throw new Error(
    'MARKUPRPLUS_MAS_PROVISIONING_PROFILE must point to a Mac App Store distribution profile.',
  );
}

const profile = resolve(requestedProfile);
await access(profile).catch(() => {
  throw new Error(`Mac App Store provisioning profile does not exist: ${profile}`);
});

await new Promise((resolveProcess, rejectProcess) => {
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      'electron-builder',
      '--config',
      'electron-builder.mas.yml',
      `--config.mas.provisioningProfile=${profile}`,
    ],
    { stdio: 'inherit', env: process.env },
  );
  child.once('error', rejectProcess);
  child.once('exit', (code, signal) => {
    if (code === 0) {
      resolveProcess();
      return;
    }
    rejectProcess(new Error(
      `Mac App Store packaging failed (${signal ? `signal ${signal}` : `exit ${code}`}).`,
    ));
  });
});
