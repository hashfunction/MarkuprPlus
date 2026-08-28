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

function findStep(jobName, stepName) {
  const steps = workflow.jobs?.[jobName]?.steps;
  return Array.isArray(steps)
    ? steps.find((step) => step?.name === stepName)
    : undefined;
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

if (String(workflow.env?.NODE_VERSION || '') !== '22') {
  violations.push('workflow: NODE_VERSION must be 22');
}

if (workflow.concurrency?.group !== 'ci-${{ github.sha }}'
  || workflow.concurrency?.['cancel-in-progress'] !== false) {
  violations.push('workflow: every commit must retain a non-cancelled CI run');
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

const packageStep = findStep('build', 'Package application (unsigned)');
if (packageStep?.env?.USE_HARD_LINKS !== 'false') {
  violations.push('build: package step must disable hard links');
}

const installStep = findStep('build', 'Install dependencies');
if (installStep?.run !== 'npm ci' || hasOwn(installStep, 'if')) {
  violations.push('build: dependencies must be installed unconditionally with npm ci');
}
const nodeModulesCache = workflow.jobs?.build?.steps?.find((step) => (
  String(step?.uses || '').startsWith('actions/cache@')
    && String(step?.with?.path || '').split(/\s+/).includes('node_modules')
));
if (nodeModulesCache) {
  violations.push('build: node_modules must not be restored across Node runtimes');
}

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
