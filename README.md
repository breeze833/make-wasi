# make-wasi

A zero-dependency distribution of **GNU Make (v4.4.1)** compiled for **WASI Preview 1 (`wasm32-wasip1`)**.

Designed as a lightweight, sandboxed build system and Makefile runner for browser-based IDEs (such as [wasm-c-ide](https://github.com/breeze833/wasm-c-ide)), WebAssembly workers, and containerless runtime environments.

---

## Features

- **Pure WASI Preview 1 (`wasm32-wasip1`)**: Single-threaded, zero POSIX thread dependencies, standards compliant.
- **Full GNU Makefile Capabilities**:
  - Timestamp (mtime) dependency DAG evaluation.
  - Phony targets (`.PHONY`) and order-only prerequisites (`|`).
  - Pattern rules (`%.o: %.c`) and implicit rule database.
  - Automatic variables: `$@`, `$<`, `$^`, `$?`, `$*`, `$(@D)`, `$(@F)`, etc.
  - Recursive (`=`), immediate (`:=`), conditional (`?=`), and append (`+=`) variable assignments.
  - Conditionals: `ifeq`, `ifneq`, `ifdef`, `ifndef`, `else`, `endif`.
  - Built-in text & list manipulation functions: `$(patsubst ...)`, `$(wildcard ...)`, `$(filter ...)`, `$(filter-out ...)`, `$(sort ...)`, `$(subst ...)`, `$(dir ...)`, `$(notdir ...)`, `$(addprefix ...)`.
  - Subshell evaluation: `$(shell ...)`.
- **Host-Assisted Recipe Execution**:
  - Bridges recipe lines to the host shell (e.g. `busybox-wasi` `ash`) via a declared host import (`wasi_run_recipe`) without requiring kernel `fork()`/`exec()`.
- **Compact Footprint**:
  - Standalone binary (`bin/make.wasm`) under 600 KB uncompressed (~180 KB gzipped).
- **Zero-Dependency CLI Runner & Reference Host**:
  - Includes `bin/cli.js` runnable out of the box with Node.js `node:wasi`.
  - Includes `examples/host-reference.js` providing a standalone reference implementation for browser and Node.js embedding.

---

## Quick Start

### Running with Node.js

```bash
# Run make with default target
node bin/cli.js

# Run a specific target
node bin/cli.js clean

# Run with custom makefile
node bin/cli.js -f custom.mk all
```

---

## Building from Source

### Prerequisites
- Clang targeting `wasm32-wasi` from standard `wasi-sdk` (recommended: `wasi-sdk >= 26`, default: `29.0`).
- Node.js (>= 18) for test verification.
- `binaryen` (`wasm-opt`) for size optimization (optional).

### Build Commands

```bash
# Build binary using wasi-sdk toolchain
make build
# (outputs bin/make.wasm)

# Run test suite
npm test

# Create release packages (.tar.gz and .tgz in dist/)
make dist
```

---

## CI/CD & Automated Releases

A GitHub Actions workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) is configured to:
- Automatically rebuild and run the full test suite on each push to `main` and on Pull Requests.
- Reset and force-update the rolling **`latest`** git tag so GitHub's automatic source zip archive always matches the latest commit on `main`.
- Publish precompiled release artifacts (`make.wasm`, `cli.js`, `make-wasi-4.4.1.tar.gz`, `make-wasi-4.4.1.tgz`) to the **`latest`** GitHub release.
- Automatically publish versioned GitHub releases when pushing a version tag (e.g., `v4.4.1`).

---

## License

- **GNU Make**: Licensed under GNU General Public License v3 or later ([GPL-3.0-or-later](LICENSE)).
- **Host Bridge & Runtime**: Licensed under the MIT License.
