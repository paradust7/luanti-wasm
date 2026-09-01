#!/bin/bash -eux

source common.sh

unpack_source curl

# Wrap socket ops
"$SOURCES_DIR/webshims/src/emsocket/wrap.py" "$BUILD_DIR/curl"

pushd "$BUILD_DIR"

rm -rf curl-build
mkdir curl-build
pushd curl-build

# For emsocket.h
export CFLAGS="$CFLAGS -I${INSTALL_DIR}/include --use-port=zlib"
export CXXFLAGS="$CXXFLAGS -I${INSTALL_DIR}/include --use-port=zlib"
export LDFLAGS="$LDFLAGS -L${INSTALL_DIR}/lib -lemsocket -sDEFAULT_TO_CXX --use-port=zlib"

emcmake cmake \
  -DCURL_ZLIB=ON \
  -DOPENSSL_SSL_LIBRARY="$INSTALL_DIR/lib/libssl.a" \
  -DOPENSSL_CRYPTO_LIBRARY="$INSTALL_DIR/lib/libcrypto.a" \
  -DOPENSSL_INCLUDE_DIR="$INSTALL_DIR/include" \
  -DBUILD_CURL_EXE=OFF \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR" \
  "$BUILD_DIR/curl"

emmake make
emmake make install

echo "curl OK"
