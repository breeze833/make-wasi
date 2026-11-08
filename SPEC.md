# SPEC.md: Architectural Specification for `make-wasi`

---

## 1. Architectural Ground Truth & Mission Statement

`make-wasi` provides a zero-dependency distribution of **GNU Make (v4.4.1)** compiled for **WASI Preview 1 (`wasm32-wasip1`)**.

Designed specifically as a robust, sandboxed build engine for browser-based IDEs (such as [`wasm-c-ide`](https://github.com/breeze833/wasm-c-ide)), WebAssembly workers, and containerless runtime environments, `make-wasi` brings full GNU Makefile compliance—including complex macro expansion, pattern rules (`%.o: %.c`), automatic variables (`$@`, `$<`, `$^`), conditionals (`ifeq`/`endif`), and text-processing functions (`$(patsubst)`, `$(wildcard)`)—without requiring operating system `fork()`/`exec()` or multithreading.

---

## 2. Target Environment & WASI Platform Profile

- **Target Architecture**: WebAssembly 32-bit WASI Preview 1 (`wasm32-wasip1` / `wasm32-unknown-wasi`).
- **Threading Model**: Single-threaded (`-mthread-model single`). No dependency on `wasm32-wasi-threads` or SharedArrayBuffer in the core wasm binary.
- **Syscall Layer**: Standard WASI Preview 1 provided by `wasi-libc`.
- **Runtime Host Support**: Standard WASI runtimes supporting preopens (`node:wasi`, Wasmtime, Wasmer, browser-based WASI hosts).
- **Execution Model**: Single-process sequential DAG evaluation (`-j1`). Multi-process pipe jobservers and signal-based child process reaping are replaced with host-assisted synchronous recipe execution.

---

## 3. Repository Topology & Source File Organization

```
make-wasi/
├── SPEC.md                    # Technical specification & architectural ground truth (this file)
├── AGENTS.md                  # Developer & AI agent operating protocols
├── README.md                  # User-facing documentation and quick start
├── LICENSE                    # GPLv3 (GNU Make) & MIT (Host Bridge)
├── package.json               # Package metadata, exports, and npm test scripts
├── Makefile                   # Convenience Makefile (build, test, dist, clean)
├── patches/                   # Pristine platform patches for upstream GNU Make 4.4.1
│   └── make-wasi-4.4.1.patch  # Unified diff adapting job execution, dir.c, and signals
├── src/
│   ├── host.js                # Browser-safe, zero-dependency host bridge module
│   └── shim/                  # WASI Preview 1 compatibility shims & headers
│       ├── wasi_compat.h      # Prototypes and stubs for missing POSIX definitions
│       ├── wasistubs.c        # Stubbed system calls (signals, umask, chown)
│       └── musl-compat/       # Vendored musl headers (pwd.h, grp.h, paths.h)
├── docs/                      # Technical documentation
│   └── HOST_FUNCTIONS.md      # Specification of WASI host-assisted execution functions
├── examples/                  # Standalone reference embedding
│   └── host-reference.js      # Complete standalone WASI host & runner example
├── scripts/
│   └── build.sh               # Automated fetch, patch, configure, compile, and optimize
├── bin/
│   ├── make.wasm              # Standalone compiled WebAssembly binary (< 600 KB)
│   └── cli.js                 # Zero-dependency Node.js CLI runner
├── dist/                      # Packaged release archives (.tar.gz and .tgz)
├── .github/
│   └── workflows/
│       └── release.yml        # CI/CD workflow with rolling latest tag & versioned releases
└── test/
    ├── test-make.js           # Automated unit tests for Makefile evaluation, targets, variables
    └── test-recipes.js        # Automated unit tests for host recipe execution & shell integration
```

---

## 4. Feature Specification & Supported GNU Make Capabilities

`make-wasi` preserves full upstream GNU Make language syntax and execution semantics:

### 4.1 Target & Dependency DAG Evaluation
- Standard target-prerequisite rules (`target: prereq1 prereq2`).
- Timestamp (mtime) staleness evaluation via `wasi-libc` `stat()`.
- Phony targets (`.PHONY: all clean test`).
- Order-only prerequisites (`targets : normal-prerequisites | order-only-prerequisites`).
- Multiple targets and static pattern rules (`$(OBJS): build/%.o: src/%.c`).
- Pattern rules (`%.o: %.c`).
- Archive member targets (`lib.a(member.o)`).
- Suffix rules and implicit rule database.

### 4.2 Variables & Expansions
- Recursive (`=`) and simply expanded (`:=`, `::=`) variables.
- Conditional assignment (`?=`) and append assignment (`+=`).
- Automatic variables:
  - `$@`: The file name of the target.
  - `$<`: The name of the first prerequisite.
  - `$^`: The names of all prerequisites with spaces between them.
  - `$?`: The names of all prerequisites newer than target.
  - `$*`: The stem with which an implicit rule matched.
  - Directory and file variants: `$(@D)`, `$(@F)`, `$(<D)`, `$(<F)`, etc.
- Target-specific variable assignments (`target: CFLAGS += -O3`).
- Export and unexport variable directives.

### 4.3 Directives & Conditionals
- Conditional directives: `ifeq`, `ifneq`, `ifdef`, `ifndef`, `else`, `endif`.
- File inclusion: `include`, `-include`, `sinclude`.
- Override directive: `override variable = value`.
- Error and diagnostic directives: `$(error ...)`, `$(warning ...)`, `$(info ...)`.

### 4.4 Builtin String & List Functions
- String substitution and pattern matching: `$(subst ...)`, `$(patsubst ...)`.
- List filtering: `$(filter ...)`, `$(filter-out ...)`, `$(sort ...)`, `$(word ...)`, `$(words ...)`, `$(wordlist ...)`, `$(firstword ...)`, `$(lastword ...)`.
- File name manipulation: `$(dir ...)`, `$(notdir ...)`, `$(suffix ...)`, `$(basename ...)`, `$(addprefix ...)`, `$(addsuffix ...)`, `$(join ...)`, `$(wildcard ...)`, `$(realpath ...)`, `$(abspath ...)`.
- Control flow: `$(foreach ...)`, `$(if ...)`, `$(or ...)`, `$(and ...)`, `$(call ...)`.
- Subshell execution: `$(shell <command>)` (delegated to host runner with captured output).

### 4.5 Command-Line Flags
- `-f FILE`, `--file=FILE`: Specify input Makefile.
- `-C DIR`, `--directory=DIR`: Change working directory before executing.
- `-n`, `--just-print`, `--dry-run`: Print recipe lines without executing.
- `-q`, `--question`: Question mode; return 0 if target is up-to-date, non-zero otherwise.
- `-B`, `--always-make`: Unconditionally make all targets.
- `-k`, `--keep-going`: Continue as much as possible after recipe failure.
- `-s`, `--silent`, `--quiet`: Do not print recipe lines before executing.
- `-e`, `--environment-overrides`: Environment variables override assignments within Makefiles.
- `-v`, `--version`: Print GNU Make version and exit.
- `-h`, `--help`: Print CLI usage options and exit.

---

## 5. Host Integration & Recipe Execution Model

Because WASI Preview 1 does not provide `fork()`, `execve()`, or kernel process tables, recipe execution is delegated to the host embedding via standard WebAssembly imports.

### 5.1 Host Import Signatures

```c
/* Declared in src/shim/wasi_compat.h */

/* Execute a single recipe command line through the host shell (e.g. busybox ash).
   Returns the process integer exit code (0 for success, 1..255 on error). */
__attribute__((__import_module__("env"), __import_name__("wasi_run_recipe")))
int wasi_run_recipe(const char *cmd_line, const char *const *envp);

/* Execute a shell command and capture its stdout for $(shell ...) expansion.
   Writes up to max_len bytes to out_buf, returns number of bytes written, or -1 on error. */
__attribute__((__import_module__("env"), __import_name__("wasi_capture_command")))
int wasi_capture_command(const char *cmd_line, char *out_buf, int max_len);
```

### 5.2 Recipe Dispatch Flow
1. When GNU Make determines that a target must be updated, `start_job_exec()` processes the recipe line (expanding any macros, automatic variables, and prefixes like `@`, `-`, `+`).
2. Instead of calling `fork()` and `execvp()`, `start_job_exec()` calls `wasi_run_recipe(cmd_line, envp)`.
3. The embedding host (such as `busybox-wasi` in `wasm-c-ide` or `node:child_process` in `bin/cli.js`) executes the command in the active working directory, piping stdin, stdout, and stderr.
4. The host returns the integer exit status synchronously (using `Atomics.wait()` in browser worker contexts, or synchronous process execution in Node.js).
5. GNU Make stores the exit status in `wasi_status` and increments `dead_children`.
6. When `reap_children()` is called, it reaps the synchronous status, determines whether to abort or continue, and advances to the next recipe line.

---

## 6. WASI Platform Adaptations & Upstream Patches

The following adaptations are applied cleanly via `patches/make-wasi-4.4.1.patch`:

### 6.1 Job Execution (`src/job.c`)
- **Single-Process Branching**: Under `#ifdef __wasi__`, disable the POSIX `fork()`/`exec()` and `posix_spawn()` pipelines.
- **Synchronous Execution**: Integrate `wasi_run_recipe` directly into `start_job_exec()`, treating WASI similarly to single-process targets (`__MSDOS__`, `_AMIGA`).
- **Synchronous Reaping**: In `reap_children()`, immediately read and clear `wasi_status` without polling `waitpid()`.

### 6.2 Shell Expansion (`src/function.c`)
- Under `#ifdef __wasi__`, adapt `func_shell_base()` to invoke `wasi_capture_command()` or redirect output via a host temporary file, avoiding POSIX `pipe()` and `fork()`.

### 6.3 Directory & Flexible Array Member (`src/dir.c`)
- In `src/dir.c`, `struct dirent` in `wasi-libc` defines `char d_name[]` as a flexible array member.
- Replace `sizeof (*d) - sizeof (d->d_name) + len` with `offsetof (struct dirent, d_name) + len` to ensure standard C99 compliance on Clang and `wasi-libc`.

### 6.4 Missing POSIX Stubs (`src/shim/`)
- Provide stubs for `umask()`, `kill()`, `getrlimit()`, `setrlimit()`, and signal masks in `src/shim/wasistubs.c`.
- Vendor minimal musl headers (`pwd.h`, `grp.h`, `paths.h`) to resolve POSIX user and group lookups.

---

## 7. Build Pipeline & Release Specification

### 7.1 Compiler & Toolchain
- **Toolchain**: Clang from `wasi-sdk >= 26` (default: `29.0`) targeting `wasm32-wasip1`.
- **Optimization Flags**: `-O2 -mthread-model single -fno-sanitize=all`.
- **Linker Flags**: `wasm-ld --stack-first -z stack-size=1048576 --strip-debug`.
- **Post-Processing**: Binary optimization via `wasm-opt -O2` producing a final binary of ~400–550 KB.

### 7.2 Release Artifacts
Every build produces:
1. `bin/make.wasm`: Standalone WebAssembly binary targeting WASI Preview 1.
2. `bin/cli.js`: Zero-dependency Node.js CLI wrapper.
3. `src/host.js`: Zero-dependency, browser-safe host bridge for embedding in browser IDEs.
4. `dist/make-wasi-4.4.1.tgz`: Standard npm package tarball for installation in IDE projects.
5. `dist/make-wasi-4.4.1.tar.gz`: Standalone distribution archive containing prebuilt binaries, docs, and headers.
