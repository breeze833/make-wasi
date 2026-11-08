import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../bin/cli.js');
const testDir = path.resolve(__dirname, '../build/test-make-sandbox');

fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

function runMake(args = [], makefileContent = '', initialFiles = {}) {
  const runId = Math.random().toString(36).substring(2, 8);
  const dir = path.join(testDir, `case-${runId}`);
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

console.log('Testing make-wasi: Core GNU Makefile language capabilities...');

// 1. Basic default target
{
  const res = runMake([], `
all:
\t@echo "Running all"
`);
  assert.strictEqual(res.exitCode, 0, 'Basic default target must succeed');
  assert.match(res.stdout, /Running all/);
  console.log('✔ Test 1: Basic default target');
}

// 2. Variables and automatic variables ($@, $<, $^)
{
  const res = runMake(['build'], `
CC = echo
CFLAGS := -O2
SRCS = a.c b.c
OBJS = a.o b.o

build: $(OBJS)
\t$(CC) $(CFLAGS) $^ -o $@

%.o: %.c
\t$(CC) $(CFLAGS) -c $< -o $@
`, {
    'a.c': 'int a = 1;',
    'b.c': 'int b = 2;'
  });

  assert.strictEqual(res.exitCode, 0);
  assert.match(res.stdout, /echo -O2 -c a.c -o a.o/);
  assert.match(res.stdout, /echo -O2 -c b.c -o b.o/);
  assert.match(res.stdout, /echo -O2 a.o b.o -o build/);
  console.log('✔ Test 2: Variables and automatic variables ($@, $<, $^)');
}

// 3. Conditional directives (ifeq / else / endif)
{
  const res = runMake([], `
MODE ?= release

ifeq ($(MODE),release)
  OPT = -O3
else
  OPT = -g
endif

all:
\t@echo "Opt is $(OPT)"
`);
  assert.strictEqual(res.exitCode, 0);
  assert.match(res.stdout, /Opt is -O3/);
  console.log('✔ Test 3: Conditionals (ifeq / else / endif)');
}

// 4. Builtin text functions: $(patsubst), $(wildcard), $(filter)
{
  const res = runMake([], `
SOURCES := src/main.c src/utils.c test.txt
C_SRCS := $(filter %.c, $(SOURCES))
OBJS := $(patsubst src/%.c, build/%.o, $(C_SRCS))

all:
\t@echo "OBJS: $(OBJS)"
`);
  assert.strictEqual(res.exitCode, 0);
  assert.match(res.stdout, /OBJS:\s+build\/main.o\s+build\/utils.o/);
  console.log('✔ Test 4: Builtin functions: $(patsubst), $(filter)');
}

// 5. Order-only prerequisites (|)
{
  const res = runMake(['all'], `
all: build/app.o

build:
\tmkdir -p build

build/app.o: app.c | build
\techo "compile" $< -o $@
`, {
    'app.c': 'void app(void) {}'
  });
  assert.strictEqual(res.exitCode, 0);
  assert.match(res.stdout, /compile app.c -o build\/app.o/);
  console.log('✔ Test 5: Order-only prerequisites (|)');
}

// 6. -n (dry-run) flag
{
  const res = runMake(['-n'], `
all:
\techo "Should print but not affect files"
`);
  assert.strictEqual(res.exitCode, 0);
  assert.match(res.stdout, /echo "Should print but not affect files"/);
  console.log('✔ Test 6: -n (dry-run) flag prints recipe without execution side effects');
}

// 7. Include directive
{
  const res = runMake([], `
include config.mk
all:
\t@echo "Target name is $(APP_NAME)"
`, {
    'config.mk': 'APP_NAME = DemoApp\n'
  });
  assert.strictEqual(res.exitCode, 0);
  assert.match(res.stdout, /Target name is DemoApp/);
  console.log('✔ Test 7: include directive');
}

console.log('All make language tests passed successfully!\n');
