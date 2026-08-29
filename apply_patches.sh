#!/bin/bash -eu

BASE_DIR="$(dirname -- "$(readlink -f -- "$0")")"

if [ $# -ne 1 ]; then
    echo "Usage: $0 /path/to/emsdk"
    exit 1
fi

EMSDK_ROOT="$1"
cd "$EMSDK_ROOT"

patch -p1 < "$BASE_DIR/emsdk_align.patch"
patch -p1 < "$BASE_DIR/emsdk_dirperms.patch"
patch -p1 < "$BASE_DIR/emsdk_openat.patch"
patch -p1 < "$BASE_DIR/emsdk_libegl.patch"
patch -p1 < "$BASE_DIR/emsdk_jspi.patch"
patch -p1 < "$BASE_DIR/emsdk_wasmfs_opfs.patch"
patch -p1 < "$BASE_DIR/emsdk_wasmfs_opfs_subdir.patch"
