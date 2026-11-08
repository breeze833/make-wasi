import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../bin/cli.js');
const testDir = path.resolve(__dirname, '../build/test-recipes-sandbox');

fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

function runMake(args = [], makefileContent = '', initialFiles = {}, customDir = null) {
  const dir = customDir || path.join(testDir, `case-${Math.random().toString(36).substring(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });

  if (makefileContent) {
    fs.writeFileSync(path.join(dir, 'Makefile'), makefileContent);
  }

  for (const [relPath, content] of Object.entries(initialFiles)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  const res = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, PATH: '/bin:/usr/bin' }
  });

  return {
    exitCode: res.status !== null ? res.status : 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    dir
  };
}

console.log('Testing make-wasi: Recipe execution & shell integration...');

// 1. Real file generation via recipe
{
  const res = runMake(['all'], `
all: output.txt

output.txt: input.txt
\tcat input.txt > output.txt
`, {
    'input.txt': 'Hello from make-wasi!\n'
  });

  assert.strictEqual(res.exitCode, 0);
  const outContent = fs.readFileSync(path.join(res.dir, 'output.txt'), 'utf-8');
  assert.strictEqual(outContent.trim(), 'Hello from make-wasi!');
  console.log('✔ Test 1: Real file generation via recipe');
}

// 2. Incremental build and mtime staleness evaluation
{
  const testSubdir = path.join(testDir, 'incremental-case');
  fs.mkdirSync(testSubdir, { recursive: true });
  fs.writeFileSync(path.join(testSubdir, 'src.txt'), 'version 1\n');
  fs.writeFileSync(path.join(testSubdir, 'Makefile'), `
all: build.txt

build.txt: src.txt
\tcp src.txt build.txt
`);

  // First run: builds target
  const res1 = runMake(['all'], null, {}, testSubdir);
  assert.strictEqual(res1.exitCode, 0);
  assert.match(res1.stdout, /cp src.txt build.txt/);

  // Second run: target is up to date, nothing should be done
  const res2 = runMake(['all'], null, {}, testSubdir);
  assert.strictEqual(res2.exitCode, 0);
  assert.match(res2.stdout, /Nothing to be done for 'all'/);

  // Touch prerequisite with newer timestamp
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(testSubdir, 'src.txt'), future, future);

  // Third run: rebuilds target because prerequisite is newer
  const res3 = runMake(['all'], null, {}, testSubdir);
  assert.strictEqual(res3.exitCode, 0);
  assert.match(res3.stdout, /cp src.txt build.txt/);

  console.log('✔ Test 2: Incremental build and mtime staleness evaluation');
}

// 3. Error propagation & exit code handling
{
  const res = runMake(['all'], `
all:
\t@echo "About to fail"
\tfalse
\t@echo "Should not reach here"
`);
  assert.notStrictEqual(res.exitCode, 0, 'Make must exit with non-zero on recipe failure');
  assert.match(res.stdout, /About to fail/);
  assert.doesNotMatch(res.stdout, /Should not reach here/);
  console.log('✔ Test 3: Error propagation stops recipe chain');
}

// 4. -k (keep-going) continues independent targets
{
  const res = runMake(['-k', 'all'], `
all: target_a target_b

target_a:
\tfalse

target_b:
\t@echo "target_b succeeded"
`);
  assert.notStrictEqual(res.exitCode, 0, 'Make exits with error when a target fails');
  assert.match(res.stdout, /target_b succeeded/, 'Independent target_b must still be executed under -k');
  console.log('✔ Test 4: -k (keep-going) executes independent targets after error');
}

// 5. Subshell command execution $(shell ...)
{
  const res = runMake([], `
DATE_VAL := $(shell date +%Y)
all:
\t@echo "Current year is $(DATE_VAL)"
`);
  assert.strictEqual(res.exitCode, 0);
  const currentYear = new Date().getFullYear().toString();
  assert.match(res.stdout, new RegExp(`Current year is ${currentYear}`));
  console.log('✔ Test 5: Subshell expansion $(shell ...) captures host output');
}

console.log('All recipe execution tests passed successfully!\n');
