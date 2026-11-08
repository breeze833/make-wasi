#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build"
PATCHES_DIR="${ROOT_DIR}/patches"
SHIM_DIR="${ROOT_DIR}/src/shim"
BIN_DIR="${ROOT_DIR}/bin"

MAKE_VER="4.4.1"
MAKE_TARBALL="make-${MAKE_VER}.tar.gz"
MAKE_SHA256="dd16fb1d67bfab79a72f5e8390735c49e3e8e70b4945a15ab1f81ddb78658fb3"
MAKE_DIR="${BUILD_DIR}/make-${MAKE_VER}"

mkdir -p "${BUILD_DIR}" "${BIN_DIR}"

echo "=========================================================="
echo " Building make-wasi (GNU Make v${MAKE_VER}) for wasm32-wasip1"
echo "=========================================================="

# 1. Locate wasi-sdk toolchain
WASI_SDK_VERSION="${WASI_SDK_VERSION:-29.0}"
WASI_SDK_MAJOR="${WASI_SDK_VERSION%%.*}"

if [ -z "${WASI_SDK_PATH:-}" ] || [ ! -x "${WASI_SDK_PATH}/bin/clang" ]; then
  if [ -x "${ROOT_DIR}/../busybox-wasi/build/wasi-sdk/bin/clang" ]; then
    export WASI_SDK_PATH="${ROOT_DIR}/../busybox-wasi/build/wasi-sdk"
  elif [ -x "${BUILD_DIR}/wasi-sdk/bin/clang" ]; then
    export WASI_SDK_PATH="${BUILD_DIR}/wasi-sdk"
  else
    echo "wasi-sdk not found. Downloading wasi-sdk-${WASI_SDK_VERSION}..."
    mkdir -p "${BUILD_DIR}/wasi-sdk-tmp"
    curl -sSL "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_MAJOR}/wasi-sdk-${WASI_SDK_VERSION}-x86_64-linux.tar.gz" | tar -xz -C "${BUILD_DIR}/wasi-sdk-tmp"
    mv "${BUILD_DIR}"/wasi-sdk-tmp/wasi-sdk-${WASI_SDK_VERSION}* "${BUILD_DIR}/wasi-sdk"
    rm -rf "${BUILD_DIR}/wasi-sdk-tmp"
    export WASI_SDK_PATH="${BUILD_DIR}/wasi-sdk"
  fi
fi

if [ ! -x "${WASI_SDK_PATH}/bin/clang" ]; then
  echo "Error: wasi-sdk clang not found at ${WASI_SDK_PATH}/bin/clang" >&2
  exit 1
fi

echo "Using wasi-sdk: ${WASI_SDK_PATH}"

# 2. Download and verify GNU Make tarball
TARBALL_PATH="${BUILD_DIR}/${MAKE_TARBALL}"
if [ ! -f "${TARBALL_PATH}" ]; then
  echo "Downloading ${MAKE_TARBALL}..."
  curl -fsSL "https://ftp.gnu.org/gnu/make/${MAKE_TARBALL}" -o "${TARBALL_PATH}"
fi

echo "Verifying archive integrity..."
echo "${MAKE_SHA256}  ${TARBALL_PATH}" | sha256sum -c -

# 3. Clean extraction
echo "Extracting pristine source..."
rm -rf "${MAKE_DIR}"
tar -C "${BUILD_DIR}" -xzf "${TARBALL_PATH}"

# 4. Source patches
echo "Applying WASI Preview 1 patches..."
patch -p1 -d "${MAKE_DIR}" < "${PATCHES_DIR}/make-wasi-${MAKE_VER}.patch"

# 5. Configure GNU Make
echo "Configuring GNU Make for wasm32-wasip1..."
CFLAGS_WASM="-O2 -mthread-model single -fno-sanitize=all \
  -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_PROCESS_CLOCKS \
  -I${SHIM_DIR} -idirafter ${SHIM_DIR}/musl-compat -Wno-deprecated-non-prototype"

(
  cd "${MAKE_DIR}"
  export CC="${WASI_SDK_PATH}/bin/clang --target=wasm32-wasip1 ${CFLAGS_WASM}"
  export AR="${WASI_SDK_PATH}/bin/llvm-ar"
  export RANLIB="${WASI_SDK_PATH}/bin/llvm-ranlib"
  export LIBS="-lwasi-emulated-signal -lwasi-emulated-getpid -lwasi-emulated-process-clocks"
  ./configure \
    --host=wasm32-wasip1 \
    --disable-nls \
    --without-guile \
    --disable-dependency-tracking > "${BUILD_DIR}/configure.log" 2>&1
)

echo "#define HAVE_UMASK 1" >> "${MAKE_DIR}/src/config.h"

# 6. Compile GNU Make
echo "Compiling make objects..."
CORES=$(nproc 2>/dev/null || echo 4)
make -C "${MAKE_DIR}" -j"${CORES}" > "${BUILD_DIR}/make.log" 2>&1 || true

# 7. Compile WASI shims
echo "Compiling WASI shims..."
"${WASI_SDK_PATH}/bin/clang" --target=wasm32-wasip1 -O2 \
  -D_WASI_EMULATED_SIGNAL -I"${SHIM_DIR}" \
  -c "${SHIM_DIR}/wasistubs.c" -o "${BUILD_DIR}/wasistubs.o"

# 8. Link final make.wasm
echo "Linking make.wasm..."
OUTPUT_WASM="${BIN_DIR}/make.wasm"

MAKE_OBJS=$(find "${MAKE_DIR}/src" -name "*.o" | sort)

"${WASI_SDK_PATH}/bin/clang" --target=wasm32-wasip1 -O2 \
  -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_PROCESS_CLOCKS \
  -Wl,--stack-first -Wl,-z,stack-size=1048576 -Wl,--strip-debug \
  ${MAKE_OBJS} \
  "${BUILD_DIR}/wasistubs.o" \
  "${MAKE_DIR}/lib/libgnu.a" \
  -lwasi-emulated-signal -lwasi-emulated-getpid -lwasi-emulated-process-clocks \
  -o "${OUTPUT_WASM}"

# 9. Optimize with wasm-opt if available
if command -v wasm-opt >/dev/null 2>&1; then
  echo "Optimizing with wasm-opt -O2..."
  wasm-opt -O2 "${OUTPUT_WASM}" -o "${OUTPUT_WASM}.opt"
  mv "${OUTPUT_WASM}.opt" "${OUTPUT_WASM}"
fi

WASM_SIZE=$(wc -c < "${OUTPUT_WASM}")
WASM_KB=$((WASM_SIZE / 1024))
echo "Successfully generated: ${OUTPUT_WASM} (${WASM_KB} KB)"
