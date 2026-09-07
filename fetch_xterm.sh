#!/bin/bash -eux

source common.sh

#
# xterm.js provides the terminal shown when Luanti is hosted as a server only.
# Such a run never opens a window, so there is nothing to draw on the canvas
# and the console becomes the whole interface. See the terminal section of
# static/launcher.js.
#
# Like the archives fetched by fetch_sources.sh, the npm tarballs are pinned by
# version and checksum and checked into the repository under sources/, so that
# a build never depends on the registry being reachable. Re-download them with:
#
#    $ rm -f sources/xterm-*.tgz sources/addon-fit-*.tgz
#    $ ./fetch_xterm.sh
#
# What lands in sources/xterm is only what the page loads: the UMD bundles, the
# stylesheet, and the licenses they have to be distributed under. build_www.sh
# copies that directory into the release.
#

XTERM_VERSION=6.0.0
XTERM_FIT_VERSION=0.11.0

getsource "https://registry.npmjs.org/@xterm/xterm/-/xterm-$XTERM_VERSION.tgz" \
    908e66e04af6c8dc6b00dd3b54de088e2e81e5ed866284fd6c2fb3c2d1c7a3f6
getsource "https://registry.npmjs.org/@xterm/addon-fit/-/addon-fit-$XTERM_FIT_VERSION.tgz" \
    26003b4517a132b64e4ff228fd88a5fda3fff5e606c76093f6dcff772e9ecec0

XTERM_DIR="$SOURCES_DIR/xterm"
rm -rf "$XTERM_DIR"
mkdir -p "$XTERM_DIR"

# An npm tarball keeps everything under package/. Extracting to stdout is what
# lets each file land under the name the page asks for.
install_from_tarball() {
  local tarball="$1"
  local member="$2"
  local dest="$3"
  tar xzf "$SOURCES_DIR/$tarball" -O "package/$member" > "$XTERM_DIR/$dest"
}

install_from_tarball "xterm-$XTERM_VERSION.tgz" lib/xterm.js xterm.js
install_from_tarball "xterm-$XTERM_VERSION.tgz" css/xterm.css xterm.css
install_from_tarball "xterm-$XTERM_VERSION.tgz" LICENSE LICENSE.xterm

# The fit addon works out how many rows and columns fit the screen. Without it
# the terminal would keep whatever size it was created at.
install_from_tarball "addon-fit-$XTERM_FIT_VERSION.tgz" lib/addon-fit.js addon-fit.js
install_from_tarball "addon-fit-$XTERM_FIT_VERSION.tgz" LICENSE LICENSE.addon-fit

echo "Installed xterm.js $XTERM_VERSION into $XTERM_DIR"
