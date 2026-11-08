#!/usr/bin/env node

import { WASI } from 'node:wasi';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createMakeBridge } from '../src/host.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(__dirname, 'make.wasm');

if (!fs.existsSync(wasmPath)) {
  console.error(`Error: make.wasm not found at ${wasmPath}.`);
  console.error('Please build make.wasm first (e.g. npm run build).');
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const makeArgs = ['make', ...rawArgs];

const wasi = new WASI({
  version: 'preview1',
  args: makeArgs,
  env: process.env,
  preopens: {
    '.': process.cwd(),
    '/tmp': '/tmp'
  }
});

const wasmBuffer = fs.readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBuffer);

let memory = null;

const hostContext = {
  getMemory: () => memory,
  cwd: process.cwd(),
  runRecipe: (cmd, { cwd, env }) => {
    const mergedEnv = env ? { ...process.env, ...env } : process.env;
    const res = spawnSync('/bin/sh', ['-c', cmd], {
      cwd,
      stdio: 'inherit',
      env: mergedEnv
    });
    return res.status !== null ? res.status : (res.error ? 127 : 0);
  },
  captureCommand: (cmd, { cwd }) => {
    const res = spawnSync('/bin/sh', ['-c', cmd], {
      cwd,
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'inherit']
    });
    return res.stdout || '';
  }
};

const rawImports = wasi.getImportObject();
const envImports = createMakeBridge(hostContext);

const importObject = {
  ...rawImports,
  env: {
    ...rawImports.env,
    ...envImports
  }
};

const instance = new WebAssembly.Instance(wasmModule, importObject);
if (instance.exports.memory) {
  memory = instance.exports.memory;
}

try {
  const exitCode = wasi.start(instance);
  if (typeof exitCode === 'number') {
    process.exit(exitCode);
  }
} catch (err) {
  if (err && typeof err.code === 'number') {
    process.exit(err.code);
  }
  throw err;
}
