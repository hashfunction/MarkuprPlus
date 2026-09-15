import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSON5 from 'json5';
import { z } from 'zod';

const configSchema = z.record(z.string(), z.unknown());
const accountSchema = z.object({ host: z.string(), login: z.string() });
const identitySchema = z.object({
  loggedInUsers: z.array(accountSchema).optional(),
  lastLoggedInUser: accountSchema.optional(),
});

async function readConfiguration(path: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
  try {
    return configSchema.parse(JSON5.parse(text));
  } catch {
    // Parser messages may contain credentials from the source configuration.
    throw new Error(`GitHub Copilot CLI could not read ${path}. Fix this configuration and try again.`);
  }
}

export async function prepareCopilotEnvironment(
  temporaryDirectory: string,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
): Promise<NodeJS.ProcessEnv> {
  const originalHome = environment.COPILOT_HOME || join(homeDirectory, '.copilot');
  const config = await readConfiguration(join(originalHome, 'config.json'));
  const settings = await readConfiguration(join(originalHome, 'settings.json'));
  const identity = identitySchema.safeParse(config);
  if (!identity.success) {
    throw new Error('GitHub Copilot CLI login configuration is invalid. Run copilot login and try again.');
  }

  const isolatedHome = join(temporaryDirectory, 'copilot-home');
  await mkdir(isolatedHome, { mode: 0o700 });
  // Only account identifiers are needed to reuse the OS credential store.
  // Never copy plugins, hooks, MCP servers, permissions, or trusted folders.
  await writeFile(join(isolatedHome, 'config.json'), JSON.stringify(identity.data), {
    encoding: 'utf8', mode: 0o600,
  });
  const model = settings.model ?? config.model;
  await writeFile(join(isolatedHome, 'settings.json'), JSON.stringify({
    ...(typeof model === 'string' && model.trim() ? { model } : {}),
    disableAllHooks: true,
    memory: false,
    ide: { autoConnect: false },
  }), { encoding: 'utf8', mode: 0o600 });

  return {
    COPILOT_HOME: isolatedHome,
    COPILOT_CUSTOM_INSTRUCTIONS_DIRS: undefined,
    COPILOT_DISABLE_TERMINAL_TITLE: 'true',
  };
}
