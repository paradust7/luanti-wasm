#!/bin/bash -eux

BASE_DIR="$(dirname -- "$(readlink -f -- "$0")")"

cd "$BASE_DIR"

# Node check
NODE_FULL_PATH="$(which node)"
INSTALLED_NODE_VERSION=`"$NODE_FULL_PATH" --version || true`
if [[ "$INSTALLED_NODE_VERSION" != v24.* ]]; then
    set +eux
    echo
    echo "Configure will fail unless Node.js v24.18.0 (or newer) is installed and in the PATH"
    echo "Visit https://nodejs.org/en/download for install instructions"
    echo "A newer version may also work. Update install_emsdk.sh as needed."
    echo
    exit 1
fi

rm -rf emsdk
git clone https://github.com/emscripten-core/emsdk.git

pushd emsdk
./emsdk install 6.0.8
./emsdk activate 6.0.8
popd

./apply_patches.sh emsdk

pushd emsdk
sed -i "s|^NODE_JS = .*|NODE_JS = '$NODE_FULL_PATH'|" .emscripten
popd

# Rebuild library to incorporate "emsdk_align.patch"
pushd emsdk
upstream/emscripten/embuilder build libhtml5 --force
popd
