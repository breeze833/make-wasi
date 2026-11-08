# AGENTS.md: Developer and AI Agent Guidelines for `make-wasi`

This document provides architectural context, design invariants, coding conventions, and maintenance procedures for AI agents and human contributors working on `make-wasi`.

---

## 1. Project Mission & Architecture

`make-wasi` compiles **GNU Make (v4.4.1)** to WebAssembly targeting the **WASI Preview 1 (`wasm32-wasip1`)** environment.

It provides a standalone, zero-dependency WebAssembly binary (`bin/make.wasm`) and accompanying host integration layer (`src/host.js` and `bin/cli.js`), bringing full GNU Makefile evaluation (macro expansions, pattern rules, automatic variables, conditionals, and functions) to browser-based IDEs (such as [`wasm-c-ide`](https://github.com/breeze833/wasm-c-ide)), WebAssembly workers, and sandboxed runtimes.

---

## 2. Core Design Invariants

When modifying or extending the codebase, strictly adhere to these fundamental invariants:

1. **Strict Specification Alignment**:
   - `SPEC.md` is the architectural ground truth. Autonomous agents must strictly adhere to the architecture, build pipeline, and WASI host specifications defined in `SPEC.md`. Do not deviate, substitute architectures, or introduce Emscripten wrappers.
2. **Zero-Dependency Runtime**:
   - The compiled `make.wasm` binary and accompanying Node.js runner (`bin/cli.js`) must remain zero-dependency standard WebAssembly / WASI Preview 1.
3. **Single-Threaded WASI Preview 1 (`wasm32-wasip1`)**:
   - Target execution is pure WASI Preview 1 (`-mthread-model single`). Multithreading must not be enabled; do not require `wasm32-wasi-threads` or shared memory. Parallel job execution (`-jN > 1`) and pipe-based jobservers are disabled; make operates sequentially (`-j1`).
4. **Clean Upstream Separation**:
   - Upstream GNU Make source code must be fetched as a pristine release tarball and patched cleanly during the build. All platform adjustments must be formalized in `patches/` and `src/shim/`.
5. **Host-Assisted Recipe Execution**:
   - Because WASI Preview 1 has no kernel `fork()`/`exec()`, recipe line execution and `$(shell ...)` evaluations must delegate to the embedding environment via declared host imports (`wasi_run_recipe` or `wasi_host_spawn`), allowing seamless execution via shells like `busybox-wasi` (`ash`) or host process executors.
6. **Lean Binary Footprint**:
   - Keep `make.wasm` strictly optimized (< 1 MB uncompressed, < 250 KB gzipped). Internationalization (`--disable-nls`) and Guile scripting (`--without-guile`) are disabled to ensure minimal asset size.

---

## 3. Developer Collaboration & Revision Workflow

All agent-assisted development in this repository must strictly adhere to the developer's 4-phase revision workflow:

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: Specification Revision & Developer Confirmation     │
│  - Propose/update SPEC.md changes first                      │
│  - Await explicit developer review & approval                │
└──────────────────────────────┬───────────────────────────────┘
                               │ Approved
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 2: Specification-Compliant Implementation             │
│  - Strictly implement according to the confirmed SPEC.md     │
│  - Verify automated tests (npm test) with zero failures      │
└──────────────────────────────┬───────────────────────────────┘
                               │ Verified
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 3: Developer Manual Verification                      │
│  - Prompt developer to perform interactive verification      │
│  - Developer tests Makefiles via bin/cli.js                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Developer Confirmed
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 4: Explicitly Instructed Document Alignment & Commit  │
│  - Await developer's explicit instruction                    │
│  - Align secondary docs (README.md, package.json, etc.)      │
│  - Stage and commit changes to git repository                │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Directory Structure & Key Files

```
make-wasi/
├── SPEC.md                    # Technical specification & architectural ground truth
├── AGENTS.md                  # Developer & AI agent operating protocols (this file)
├── README.md                  # User-facing documentation and quick start
├── LICENSE                    # GPLv3 & MIT licenses
├── package.json               # Package metadata and test scripts
├── Makefile                   # Build, test, clean, and release targets
├── patches/                   # Clean platform patches for upstream GNU Make 4.4.1
│   └── make-wasi-4.4.1.patch
├── src/
│   ├── host.js                # Browser-safe, zero-dependency host bridge module
│   └── shim/                  # WASI Preview 1 compatibility shims & headers
│       ├── wasi_compat.h
│       ├── wasistubs.c
│       └── musl-compat/       # Vendored musl headers (pwd.h, etc.)
├── docs/                      # Technical documentation & host architecture
│   └── HOST_FUNCTIONS.md      # Specification of WASI host-assisted functions
├── examples/                  # Reference implementations for host embeddings
│   └── host-reference.js      # Complete standalone WASI host & runner
├── scripts/
│   └── build.sh               # Fetch, patch, configure, compile, and optimize
├── bin/
│   ├── make.wasm              # (Generated) Multicall WebAssembly binary
│   └── cli.js                 # Standalone Node.js CLI runner
├── dist/                      # (Generated) Packaged release archives
├── .github/
│   └── workflows/
│       └── release.yml        # CI/CD workflow with rolling latest tag & releases
└── test/
    ├── test-make.js           # Automated unit tests for Makefile evaluation, targets, variables
    └── test-recipes.js        # Automated unit tests for host recipe execution & shell integration
```

---

## 5. Development & Testing Commands

```bash
# Build make.wasm locally (requires wasi-sdk)
make build
# (or: ./scripts/build.sh)

# Run automated test suite
npm test
# (or: node test/test-make.js && node test/test-recipes.js)

# Package release tarball
make dist

# Clean build artifacts
make clean
```

---

## 6. Verification Checklist Before Committing Changes

Before completing tasks or submitting PRs, verify:

- [ ] Specification updated in `SPEC.md` and confirmed by the developer prior to code changes.
- [ ] Implementation strictly conforms to the confirmed `SPEC.md`.
- [ ] `make.wasm` compiles without missing symbols on `wasm32-wasip1`.
- [ ] Automated tests (`npm test`) pass with zero errors using `node:wasi`.
- [ ] Developer has conducted verification via `bin/cli.js` or target application.
- [ ] Binary size is verified and optimized with `wasm-opt -O2`.
- [ ] Secondary documentation (`README.md`, `package.json`, etc.) aligned upon explicit developer instruction.
- [ ] Git commit performed only when explicitly instructed by the developer.
