#!/bin/bash -eux

source common.sh

INCREMENTAL=${INCREMENTAL:-false}

pushd "$BUILD_DIR"
if ! $INCREMENTAL; then
  rm -rf luanti
fi
mkdir -p luanti
pushd luanti

export EMSDK_PORTS="--use-port=zlib --use-port=libjpeg --use-port=libpng --use-port=freetype --use-port=ogg --use-port=vorbis --use-port=sqlite3"
export EMSDK_CANVAS="-sPROXY_TO_PTHREAD=1 -sOFFSCREENCANVAS_SUPPORT=1 -sJSPI"
export EMSDK_MODULE="-sINCOMING_MODULE_JS_API=mainScriptUrlOrBlob,canvas,monitorRunDependencies,preRun,postRun,print,printErr,setStatus,onFullScreen"
export EMSDK_EXTRA="-sUSE_SDL=2 $EMSDK_PORTS $EMSDK_CANVAS $EMSDK_MODULE"
export CFLAGS="$CFLAGS $EMSDK_EXTRA"
export CXXFLAGS="$CXXFLAGS $EMSDK_EXTRA"
export LDFLAGS="$LDFLAGS $EMSDK_EXTRA -sPTHREAD_POOL_SIZE=22 -s EXPORTED_RUNTIME_METHODS=ccall,cwrap -s INITIAL_MEMORY=2013265920 -sMIN_WEBGL_VERSION=2 -sUSE_WEBGL2 -sWASMFS=1"
export LDFLAGS="$LDFLAGS -L$INSTALL_DIR/lib -larchive -lssl -lcrypto -lemsocket -lwebsocket.js"

# Create a dummy .o file to use as a substitute for the OpenGLES2 / EGL libraries,
# since Emscripten doesn't actually provide those. (the symbols are resolved through
# javascript stubs).
echo > dummy.c
emcc -c dummy.c -o dummy.o
DUMMY_OBJECT="$(pwd)/dummy.o"
mkdir -p dummy_dir
DUMMY_INCLUDE_DIR="$(pwd)/dummy_dir"

if ! $INCREMENTAL; then
    emcmake cmake \
      -DCMAKE_VERBOSE_MAKEFILE=ON \
      -DENABLE_SYSTEM_GMP=OFF \
      -DENABLE_GETTEXT=TRUE \
      -DRUN_IN_PLACE=TRUE \
      -DENABLE_GLES=TRUE \
      -DENABLE_UPDATE_CHECKER=0 \
      -DFREETYPE_LIBRARY="$DUMMY_OBJECT" \
      -DPNG_LIBRARY="$DUMMY_OBJECT" \
      -DVORBISFILE_LIBRARY="$DUMMY_OBJECT" \
      -DSQLITE3_LIBRARY="$DUMMY_OBJECT" \
      -DCMAKE_BUILD_TYPE="$LUANTI_BUILD_TYPE" \
      -DOPENGLES2_INCLUDE_DIR="$DUMMY_INCLUDE_DIR" \
      -DOPENGLES2_LIBRARY="$DUMMY_OBJECT" \
      -DZSTD_LIBRARY="$INSTALL_DIR/lib/libzstd.a" \
      -DZSTD_INCLUDE_DIR="$INSTALL_DIR/include" \
      -DEGL_LIBRARY="$DUMMY_OBJECT" \
      -DEGL_INCLUDE_DIR="$DUMMY_INCLUDE_DIR" \
      -DCURL_LIBRARY="$INSTALL_DIR/lib/libcurl.a" \
      -DCURL_INCLUDE_DIR="$INSTALL_DIR/include" \
      -DCMAKE_INSTALL_PREFIX="$BUILD_DIR/luanti-install" \
      -G "Unix Makefiles" \
      "$SOURCES_DIR/luanti"
fi

rm -rf "$BUILD_DIR/luanti-install"
emmake make install
