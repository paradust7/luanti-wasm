#!/bin/bash -eux

# Build virtual file system
#
# The files luanti needs to function correctly.
#
# Shaders, fonts, games, etc

source common.sh

pushd "$BUILD_DIR"

rm -rf fsroot
mkdir fsroot
cp -a "luanti-install" fsroot/luanti


#############################################
pushd fsroot/luanti

rm -rf bin unix
# Emscripten strips empty directories. But bin/ needs to be present so that
# realpath() works on relative paths starting with bin/../
mkdir bin
echo "This is here to ensure bin exists" > bin/readme.txt

mkdir -p cache
cat > cache/common.conf << EOF
update_last_checked = disabled
no_mtg_notification = true
no_keycode_migration_warning = true
EOF

mkdir -p games

popd


# These live outside /luanti, outside of OPFS.
rm -rf certsroot
mkdir -p certsroot/etc/ssl/certs
# May be a symlink, use cat to copy contents
cat /etc/ssl/certs/ca-certificates.crt > certsroot/etc/ssl/certs/ca-certificates.crt


# Make fsroot.tar
rm -f fsroot.tar
pushd fsroot
tar cf ../fsroot.tar .
popd

# Make certs.tar
rm -f certs.tar
pushd certsroot
tar cf ../certs.tar .
popd

# Compress with ZSTD
rm -f fsroot.tar.zst
zstd --ultra -22 fsroot.tar

rm -f certs.tar.zst
zstd --ultra -22 certs.tar
