BASE_DIR="$(dirname -- "$(readlink -f -- "$0")")"
cd "$BASE_DIR"

# Debug / Release
export BUILD_KIND="${BUILD_KIND:-release}"

# Setup emscripten (if not already)
if [ ! -d emsdk ]; then
    ./install_emsdk.sh
fi

pushd emsdk
source ./emsdk_env.sh
popd

case $BUILD_KIND in
  debug)
    export LUANTI_BUILD_TYPE="Debug"
    export COMMON_CFLAGS="-O0 -g -gsource-map"
    export COMMON_LDFLAGS="-sSAFE_HEAP=1 -sASSERTIONS=2"
    export BUILD_SUFFIX="-debug"
    ;;
  profile)
    export LUANTI_BUILD_TYPE="Release"
    export COMMON_CFLAGS="--profiling -O2 -g -gsource-map"
    export COMMON_LDFLAGS=""
    export BUILD_SUFFIX="-profile"
    ;;
  release)
    export LUANTI_BUILD_TYPE="Release"
    export COMMON_CFLAGS="-O2"
    export COMMON_LDFLAGS=""
    export BUILD_SUFFIX=""
    ;;
  *)
    echo "Unknown build kind: $BUILD_KIND"
    exit 1
esac

SOURCES_DIR="$BASE_DIR/sources"
BUILD_DIR="$BASE_DIR/build$BUILD_SUFFIX"
INSTALL_DIR="$BUILD_DIR/install"
WWW_DIR="$BASE_DIR/www"
mkdir -p "$SOURCES_DIR" "$BUILD_DIR" "$INSTALL_DIR"

export MAKEFLAGS="-j$(nproc)"

export CFLAGS="$COMMON_CFLAGS -pthread -fwasm-exceptions -sJSPI"
export CXXFLAGS="$COMMON_CFLAGS -pthread -fwasm-exceptions -sJSPI"
export LDFLAGS="$COMMON_LDFLAGS -pthread -fwasm-exceptions -sJSPI"

export EMSDK_ROOT="$EMSDK"
export EMSDK_SYSLIB="${EMSDK_ROOT}/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten"
export EMSDK_SYSINCLUDE="${EMSDK_ROOT}/upstream/emscripten/cache/sysroot/include"

export LUANTI_REPO="$SOURCES_DIR/luanti"

function getsource() {
  local url="$1"
  local hsh="$2"
  local filename="$(basename -- "${url%%\?*}")"

  pushd "$SOURCES_DIR"
  if [ ! -f "$filename" ]; then
    wget "$url" -O "$filename"
  fi
  if ! sha256sum "$filename" | grep -q "$hsh"; then
    echo "Wrong sha256 checksum for $filename"
    exit 1
  fi
  popd
}

function do_unpack() {
  local filename="$1"
  case "$filename" in
    *.tar.gz|*.tar.bz2|*.tar.xz|*.tgz)
        tar xvf "$filename"
        ;;
    *.zip)
        unzip "$filename"
        ;;
    *)
        echo "Not sure how to unpack: $filename"
        exit 1
        ;;
  esac
}

function strip_ext() {
  local filename="$1"
  case "$filename" in
    *.tar.gz)  echo "${filename%.tar.gz}" ;;
    *.tar.xz)  echo "${filename%.tar.xz}" ;;
    *.tar.bz2) echo "${filename%.tar.bz2}" ;;
    *.zip)     echo "${filename%.zip}" ;;
    *)         echo "$filename" ;;
  esac
}

# Usage:
#
#   unpack_source $prefix
#
# Finds the tar/zip file in sources/ with a specific prefix,
# and untars/unzips it to the build directory, renamed as $prefix.
function unpack_source() {
  local prefix="$1"
  pushd "$SOURCES_DIR"
  shopt -s nullglob
  local matches=("$prefix"*)
  shopt -u nullglob
  local count="${#matches[@]}"
  popd

  if [ $count -eq 0 ] ; then
    echo "unpack_source $prefix: Could not find source tar/zip file"
    exit 1
  elif [ $count -ne 1 ]; then
    echo "unpack_source $prefix: Ambiguous prefix (count=$count)"
    exit 1
  fi
  local filename="${matches[0]}"
  local dirname="$(strip_ext "$filename")"

  pushd "$BUILD_DIR"
  rm -rf "$prefix" "$dirname"
  do_unpack "$SOURCES_DIR/$filename"
  if [ ! -d "$dirname" ]; then
    echo "Unpacking $filename did not produce the expected directory"
    exit 1
  fi
  if [ "$dirname" != "$prefix" ]; then
    mv "$dirname" "$prefix"
  fi
  popd
}

function getrepo() {
  local dirname="$1"
  local url="$2"
  local rev="$3"

  pushd "$SOURCES_DIR"
  if [ ! -d "$dirname" ]; then
    git clone "$url" "$dirname"
    pushd "$dirname"
    git checkout "$rev"
    popd
  fi
  popd

  pushd "$SOURCES_DIR/$dirname"
  local oldrev=`git rev-parse HEAD`
  if [ "$oldrev" != "$rev" ]; then
    set +x
    echo "---------------------------------------------------------------"
    echo "ERROR: sources/$dirname is on wrong revision"
    echo "--------------------------------------------------------------"
    echo "Detected revision: $oldrev"
    echo "Expected revision: $rev"
    echo "---------------------------------------------------------------"
    echo "Please pull/checkout to the correct revision, or delete repo"
    echo "before proceeding (it will be re-cloned)"
    exit 1
  fi
  popd
}
