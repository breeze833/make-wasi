#!/usr/bin/env node

/**
 * Standalone Reference Host Implementation for make-wasi
 *
 * Demonstrates how to instantiate make.wasm with createMakeBridge
 * and execute Makefiles programmatically in Node.js or browser environments.
 */

import { WASI } from 'node:wasi';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createMakeBridge } from '../src/host.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.resolve(__dirname, '../bin/make.wasm');
const exampleDir = path.resolve(__dirname, '../build/example-sandbox');

fs.rmSync(exampleDir, { recursive: true, force: true });
fs.mkdirSync(exampleDir, { recursive: true });

// Create a sample Makefile
const sampleMakefile = `
# Sample Makefile for make-wasi Reference Host
CC = gcc
CFLAGS = -O2 -Wall
TARGET = app

all: $(TARGET)

$(TARGET): main.o utils.o
\t@echo "[LINK] Linking $@"
\t@echo "Done!"

%.o: %.c
\t@echo "[CC] Compiling $< -> $@"

clean:
\t@echo "[CLEAN] Cleaning artifacts"

.PHONY: all clean
`;

fs.writeFileSync(path.join(exampleDir, 'Makefile'), sampleMakefile);
fs.writeFileSync(path.join(exampleDir, 'main.c'), 'int main(void) { return 0; }\n');
fs.writeFileSync(path.join(exampleDir, 'utils.c'), 'void util(void) {}\n');

console.log('--- Running make-wasi Reference Host Example ---');

const wasi = new WASI({
  version: 'preview1',
  args: ['make', 'all'],
  env: process.env,
  preopens: {
    '.': exampleDir,
    '/tmp': '/tmp'
  }
});

const wasmBuffer = fs.readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBuffer);

let memory = null;

const hostContext = {
  getMemory: () => memory,
  cwd: exampleDir,
  runRecipe: (cmd, { cwd, env }) => {
    console.log(`[Host Recipe Dispatch] ${cmd}`);
    return 0; // Simulate successful command
  },
  captureCommand: (cmd, { cwd }) => {
    return 'demo-output\n';
  }
};

const rawImports = wasi.getImportObject();
const envImports = createMakeBridge(hostContext);

const instance = new WebAssembly.Instance(wasmModule, {
  ...rawImports,
  env: {
    ...rawImports.env,
    ...envImports
  }
});

memory = instance.exports.memory;

const exitCode = wasi.start(instance);
console.log(`--- Finished with exit code: ${exitCode} ---`);
process.exit(exitCode || 0);
