#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const workflowPath = '.github/workflows/ci.yml';
const workflow = load(readFileSync(workflowPath, 'utf8'));
const violations = [];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function jobRuns(jobName) {
  const steps = workflow.jobs?.[jobName]?.steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step) => step?.run)
    .filter((run) => typeof run === 'string');
}

function requireCommand(jobName, command) {
  const present = jobRuns(jobName).some((run) =>
    run.split(/\r?\n/).some((line) => line.trim() === command));
  if (!present) violations.push(`${jobName}: missing ${command}`);
}

const triggers = workflow.on;
if (!triggers || typeof triggers !== 'object' || !hasOwn(triggers, 'push')) {
  violations.push('workflow: missing push trigger');
} else {
  const push = triggers.push;
  if (push && typeof push === 'object'
    && (hasOwn(push, 'branches') || hasOwn(push, 'branches-ignore'))) {
    violations.push('workflow: push trigger must cover every branch');
  }
}

if (!triggers || typeof triggers !== 'object' || !hasOwn(triggers, 'pull_request')) {
  violations.push('workflow: missing pull_request trigger');
}

requireCommand('validate', 'npm run verify:brand');
requireCommand('validate', 'npm run lint');
requireCommand('validate', 'npm run typecheck');
requireCommand('validate', 'npm audit --omit=dev --audit-level=high');
requireCommand('test', 'npm run test:ci');
requireCommand('electron-ui', 'npm run build:desktop');
requireCommand('electron-ui', 'npm run test:ui-electron');
requireCommand('build', 'npm run build');
requireCommand('build', 'npm run verify:package');
requireCommand('build', 'npm run test:package-smoke');

const buildOperatingSystems = workflow.jobs?.build?.strategy?.matrix?.os;
for (const operatingSystem of ['macos-latest', 'windows-latest']) {
  if (!Array.isArray(buildOperatingSystems) || !buildOperatingSystems.includes(operatingSystem)) {
    violations.push(`build: missing ${operatingSystem} matrix entry`);
  }
}

const summaryDependencies = workflow.jobs?.['ci-success']?.needs;
for (const jobName of ['validate', 'test', 'electron-ui', 'build']) {
  if (!Array.isArray(summaryDependencies) || !summaryDependencies.includes(jobName)) {
    violations.push(`ci-success: missing ${jobName} dependency`);
  }
}

if (violations.length > 0) {
  console.error('CI workflow verification failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('CI workflow verification passed.');
}
