# HOST_FUNCTIONS.md: WASI Host-Assisted Functions Specification

This document provides the technical specification for all host-assisted functions imported by `make-wasi` under the **`env`** WebAssembly import namespace.

Targeting **WASI Preview 1 (`wasm32-wasip1`)**, `make-wasi` operates in a sandboxed WebAssembly environment without native operating system `fork()`, `execve()`, or kernel process tables. Host-assisted functions bridge this gap by delegating recipe line execution and subshell output capturing to the host runtime (such as `busybox-wasi` in browser IDEs, or `node:child_process` in CLI tools).

---

## 1. Host Functions Overview Matrix

| Import Symbol | Function Signature | Calling Mechanism | Description |
| :--- | :--- | :--- | :--- |
| **`wasi_run_recipe`** | `(cmdPtr: i32, envpPtr: i32) -> i32` | `job.c:start_job_exec()` | Executes a single recipe line through the host shell. Returns exit status (0 = success). |
| **`wasi_capture_command`** | `(cmdPtr: i32, outBufPtr: i32, maxLen: i32) -> i32` | `function.c:func_shell_base()` | Executes a command and captures its stdout for `$(shell ...)` expansion. |

---

## 2. Function Specifications

### 2.1 `wasi_run_recipe(cmdPtr, envpPtr)`

- **Wasm Import Signature**: `env.wasi_run_recipe(cmdPtr: i32, envpPtr: i32) -> i32`
- **C Declaration**:
  ```c
  __attribute__((__import_module__("env"), __import_name__("wasi_run_recipe")))
  int wasi_run_recipe(const char *cmd_line, const char *const *envp);
  ```
- **Description**:
  Called by `src/job.c` in `start_job_exec()` whenever a target needs to execute a recipe line.
  - `cmdPtr`: Pointer to a NUL-terminated UTF-8 string containing the recipe command line to execute.
  - `envpPtr`: Pointer to a null-terminated array of pointers to `KEY=VALUE` environment strings (from GNU Make's child environment), or `0` if empty.
- **Host Execution Semantics**:
  - In a Unix shell environment (such as `busybox-wasi` `ash`), the host executes `sh -c "<cmd_line>"` in the active working directory with standard I/O streams inherited or redirected.
  - Returns the child process integer exit status (0 on success, 1..255 on error).
- **Return Value**:
  - `0`: Recipe completed successfully.
  - `1..255`: Recipe failed with the corresponding exit code. GNU Make will abort the build unless `-k` (`--keep-going`) or `-` prefix was specified.

---

### 2.2 `wasi_capture_command(cmdPtr, outBufPtr, maxLen)`

- **Wasm Import Signature**: `env.wasi_capture_command(cmdPtr: i32, outBufPtr: i32, maxLen: i32) -> i32`
- **C Declaration**:
  ```c
  __attribute__((__import_module__("env"), __import_name__("wasi_capture_command")))
  int wasi_capture_command(const char *cmd_line, char *out_buf, int max_len);
  ```
- **Description**:
  Called by `src/function.c` in `func_shell_base()` when evaluating GNU Make's `$(shell <cmd>)` function.
  - `cmdPtr`: Pointer to a NUL-terminated UTF-8 command line string.
  - `outBufPtr`: Pointer to a pre-allocated buffer in WebAssembly memory where captured stdout must be copied.
  - `maxLen`: Maximum number of bytes that can be written to `outBufPtr` (typically 65535 bytes).
- **Host Execution Semantics**:
  - The host executes the command line, captures its stdout stream, and writes the bytes into linear memory at `outBufPtr`.
- **Return Value**:
  - Returns the number of bytes written to `outBufPtr` ($\ge 0$).
  - Returns `-1` on execution failure.

---

## 3. Host Embedding Reference

The `make-wasi` package provides `src/host.js` exporting `createMakeBridge(hostContext)`. Embedders simply instantiate the bridge and attach it to the `env` import namespace:

```javascript
import { createMakeBridge } from 'make-wasi/host';

const envImports = createMakeBridge({
  getMemory: () => wasmInstance.exports.memory,
  cwd: '/workspace',
  runRecipe: (cmd, { cwd, env }) => {
    // Dispatch to shell worker or execute locally
    return 0; // return exit code
  },
  captureCommand: (cmd, { cwd }) => {
    // Return stdout string or Uint8Array
    return 'captured output\n';
  }
});
```
