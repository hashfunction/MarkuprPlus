import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

describe('continuous integration workflow', () => {
  it('accepts the repository workflow when every pushed commit runs the required checks', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-ci.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stdout: 'CI workflow verification passed.\n',
      stderr: '',
    });
  });

  it('uses a supported Node runtime and preserves each packaged native architecture', () => {
    const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
      concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
      env?: { NODE_VERSION?: string };
      jobs?: { build?: { steps?: Array<{
        env?: Record<string, string>;
        if?: string;
        name?: string;
        uses?: string;
        with?: Record<string, string>;
      }> } };
    };
    const buildSteps = workflow.jobs?.build?.steps || [];
    const packageStep = buildSteps.find(
      (step) => step.name === 'Package application (unsigned)',
    );
    const installStep = buildSteps.find((step) => step.name === 'Install dependencies');
    const nodeModulesCache = buildSteps.find(
      (step) => step.uses?.startsWith('actions/cache@')
        && String(step.with?.path || '').split(/\s+/).includes('node_modules'),
    );

    expect(workflow.env?.NODE_VERSION).toBe('22');
    expect(workflow.concurrency).toEqual({
      group: 'ci-${{ github.sha }}',
      'cancel-in-progress': false,
    });
    expect(packageStep?.env).toMatchObject({ USE_HARD_LINKS: 'false' });
    expect(installStep?.if).toBeUndefined();
    expect(nodeModulesCache).toBeUndefined();
  });
});
