/**
 * Standalone, zero-dependency host bridge module for make-wasi.
 * Compatible with both Node.js and browser environments (Web Workers / Main Thread).
 *
 * Provides:
 *   - createMakeBridge(hostContext): Builds WebAssembly `env` imports for GNU Make
 *   - readCString, readCStringArray: Fast string reading utilities
 */

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

export function readCString(memory, ptr) {
  if (!ptr || !memory) return '';
  const buf = new Uint8Array(memory.buffer);
  let end = ptr;
  while (end < buf.length && buf[end] !== 0) {
    end++;
  }
  return textDecoder.decode(buf.subarray(ptr, end));
}

export function readCStringArray(memory, ptr) {
  if (!ptr || !memory) return [];
  const view = new DataView(memory.buffer);
  const result = [];
  let cur = ptr;
  while (true) {
    const strPtr = view.getUint32(cur, true);
    if (!strPtr) break;
    result.push(readCString(memory, strPtr));
    cur += 4;
  }
  return result;
}

/**
 * Creates the `env` import object for GNU Make WebAssembly module.
 *
 * @param {Object} hostContext
 * @param {Function} hostContext.getMemory - Function returning the WebAssembly.Memory instance
 * @param {string} [hostContext.cwd] - Active working directory
 * @param {Function} [hostContext.runRecipe] - Custom recipe runner: (cmd, { cwd, env }) => exitCode
 * @param {Function} [hostContext.captureCommand] - Custom $(shell ...) runner: (cmd, { cwd, env }) => string | Uint8Array
 * @returns {Object} WebAssembly `env` import dictionary
 */
export function createMakeBridge(hostContext = {}) {
  const getMem = () => {
    if (typeof hostContext.getMemory === 'function') {
      return hostContext.getMemory();
    }
    return hostContext.memory || null;
  };

  return {
    wasi_run_recipe: (cmdPtr, envpPtr) => {
      try {
        const mem = getMem();
        const cmd = readCString(mem, cmdPtr);
        if (!cmd || cmd.trim().length === 0) {
          return 0;
        }

        const cwd = hostContext.cwd || (typeof process !== 'undefined' ? process.cwd() : '/');

        // Parse environment variables if provided
        let env = null;
        if (envpPtr && mem) {
          const envList = readCStringArray(mem, envpPtr);
          if (envList.length > 0) {
            env = {};
            for (const entry of envList) {
              const eqIdx = entry.indexOf('=');
              if (eqIdx > 0) {
                env[entry.substring(0, eqIdx)] = entry.substring(eqIdx + 1);
              }
            }
          }
        }

        // 1. Delegate to custom host recipe handler if provided (e.g. browser worker / busybox-wasi)
        if (typeof hostContext.runRecipe === 'function') {
          const res = hostContext.runRecipe(cmd, { cwd, env });
          return typeof res === 'number' ? res : 0;
        }

        // 2. Node.js fallback via child_process
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
          const { spawnSync } = awaitImportNodeChildProcess();
          const mergedEnv = env ? { ...process.env, ...env } : process.env;
          const res = spawnSync('/bin/sh', ['-c', cmd], {
            cwd,
            stdio: 'inherit',
            env: mergedEnv
          });
          return res.status !== null ? res.status : (res.error ? 127 : 0);
        }

        return 0;
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error(`[make-wasi] wasi_run_recipe error: ${err.message || String(err)}`);
        }
        return 1;
      }
    },

    wasi_capture_command: (cmdPtr, outBufPtr, maxLen) => {
      try {
        const mem = getMem();
        const cmd = readCString(mem, cmdPtr);
        if (!cmd) return 0;

        const cwd = hostContext.cwd || (typeof process !== 'undefined' ? process.cwd() : '/');

        let stdoutData = '';

        // 1. Delegate to custom capture handler if provided
        if (typeof hostContext.captureCommand === 'function') {
          const out = hostContext.captureCommand(cmd, { cwd });
          stdoutData = typeof out === 'string' ? out : (out ? textDecoder.decode(out) : '');
        } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
          // 2. Node.js fallback
          const { spawnSync } = awaitImportNodeChildProcess();
          const res = spawnSync('/bin/sh', ['-c', cmd], {
            cwd,
            encoding: 'utf-8',
            stdio: ['inherit', 'pipe', 'inherit']
          });
          stdoutData = res.stdout || '';
        }

        const encoded = textEncoder.encode(stdoutData);
        const toWrite = Math.min(encoded.length, maxLen);
        const buf = new Uint8Array(mem.buffer);
        buf.set(encoded.subarray(0, toWrite), outBufPtr);
        return toWrite;
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error(`[make-wasi] wasi_capture_command error: ${err.message || String(err)}`);
        }
        return -1;
      }
    }
  };
}

let cachedNodeChildProcess = null;
function awaitImportNodeChildProcess() {
  if (cachedNodeChildProcess) return cachedNodeChildProcess;
  try {
    // Dynamic import pattern avoiding browser bundler static analysis
    const req = typeof module !== 'undefined' && module.require ? module.require : null;
    if (req) {
      cachedNodeChildProcess = req('node:child_process');
      return cachedNodeChildProcess;
    }
    // ES module import in Node
    import('node:child_process').then(cp => { cachedNodeChildProcess = cp; });
    // Synchronous fallback using global require if available
    if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.getBuiltinModule) {
      cachedNodeChildProcess = globalThis.process.getBuiltinModule('node:child_process');
      return cachedNodeChildProcess;
    }
  } catch (_) {}
  throw new Error('child_process is not available in this environment');
}
