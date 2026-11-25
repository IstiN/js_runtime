#!/usr/bin/env bash
# build_all.sh — builds the vendored QuickJS (engines/quickjs) for every target.
#
# Usage: build_all.sh [--ndk <dir>] [target ...]
#   targets: host | armeabi-v7a | arm64-v8a | x86_64   (default: all four)
#   --ndk <dir>  Android NDK; falls back to $ANDROID_NDK_HOME (required for
#                the Android targets).
# Outputs (only inside build/):
#   build/<target>/libquickjs.a        for every target
#   build/host/qjs_harness             host only (from tool/qjs_harness.c)
# Prints "OK <target> <path>" per artifact; exits 1 on the first error.
#
# quickjs-libc is not built: the JSR bootstrap defines its own console and
# timers (same decision as the android POC). libbf is needed for the bignum
# part of quickjs.c.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QJS_DIR="$REPO_ROOT/engines/quickjs"
HARNESS_C="$REPO_ROOT/tool/qjs_harness.c"
BUILD_ROOT="$REPO_ROOT/build"
API=24  # android minSdk of the JSR family

SOURCES=(quickjs.c libregexp.c libunicode.c cutils.c libbf.c)
flags=(-O2 -D_GNU_SOURCE -Wno-implicit-const-int-float-conversion -Wno-array-bounds
       -DCONFIG_VERSION='"2024-01-13"')

NDK=""
targets=()
while [ $# -gt 0 ]; do
    case "$1" in
        --ndk) NDK="$2"; shift 2 ;;
        -*) echo "build_all.sh: unknown option $1" >&2; exit 1 ;;
        *) targets+=("$1"); shift ;;
    esac
done
[ ${#targets[@]} -eq 0 ] && targets=(host armeabi-v7a arm64-v8a x86_64)
: "${NDK:=${ANDROID_NDK_HOME:-}}"

current_target=""
on_error() { echo "build_all.sh: FAILED (target: $current_target)" >&2; }
trap on_error ERR

# compile <out-dir> <src.c> — with the compiler chosen for $current_target.
compile() {
    mkdir -p "$1/obj"
    local obj="$1/obj/$(basename "$2" .c).o"
    "$CC" "${flags[@]}" -I"$QJS_DIR" -c "$2" -o "$obj"
    OBJS+=("$obj")
}

archive() {  # archive <out-dir> <compiler-toolchain-bin-dir|host>
    mkdir -p "$1"
    local out="$1/libquickjs.a"
    rm -f "$out"
    if [ "$2" = host ]; then ar rcs "$out" "${OBJS[@]}";
    else "$2/llvm-ar" rcs "$out" "${OBJS[@]}"; fi
    OBJS=()
    echo "OK $current_target $out"
}

for t in "${targets[@]}"; do
    current_target="$t"
    OBJS=()
    case "$t" in
        host)
            CC=cc
            for s in "${SOURCES[@]}"; do compile "$BUILD_ROOT/host" "$QJS_DIR/$s"; done
            archive "$BUILD_ROOT/host" host
            mkdir -p "$BUILD_ROOT/host"
            out="$BUILD_ROOT/host/qjs_harness"
            ldlibs=()
            [ "$(uname -s)" = Linux ] && ldlibs=(-lm)
            "$CC" "${flags[@]}" -I"$QJS_DIR" "$HARNESS_C" "$BUILD_ROOT/host/libquickjs.a" ${ldlibs[@]+"${ldlibs[@]}"} -o "$out"
            echo "OK host $out"
            ;;
        armeabi-v7a|arm64-v8a|x86_64)
            [ -n "$NDK" ] || { echo "build_all.sh: target $t needs --ndk <dir> or \$ANDROID_NDK_HOME" >&2; exit 1; }
            [ -d "$NDK" ] || { echo "build_all.sh: NDK not found at $NDK" >&2; exit 1; }
            case "$(uname -s)" in
                Darwin) host_tag=darwin-x86_64 ;;
                Linux)  host_tag=linux-x86_64 ;;
                *) echo "build_all.sh: unsupported host OS $(uname -s)" >&2; exit 1 ;;
            esac
            bin="$NDK/toolchains/llvm/prebuilt/$host_tag/bin"
            [ -d "$bin" ] || { echo "build_all.sh: NDK toolchain not found at $bin" >&2; exit 1; }
            case "$t" in
                armeabi-v7a) triple=armv7a-linux-androideabi ;;
                arm64-v8a)   triple=aarch64-linux-android ;;
                x86_64)      triple=x86_64-linux-android ;;
            esac
            CC="$bin/${triple}${API}-clang"
            for s in "${SOURCES[@]}"; do compile "$BUILD_ROOT/$t" "$QJS_DIR/$s"; done
            archive "$BUILD_ROOT/$t" "$bin"
            ;;
        *) echo "build_all.sh: unknown target $t" >&2; exit 1 ;;
    esac
done
