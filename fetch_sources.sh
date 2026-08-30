#!/bin/bash -eux

source common.sh

#
# To prevent spurious build failures (due to transient network issues),
# these external archive files are checked into the repository under
# sources/, but it is always possible to re-download them with:
#
#    $ rm -rf sources
#    $ ./fetch_sources.sh
#

getsource "https://www.openssl.org/source/openssl-1.1.1n.tar.gz" 40dceb51a4f6a5275bde0e6bf20ef4b91bfc32ed57c0552e2e8e15463372b17a
getsource "https://curl.se/download/curl-7.82.0.tar.bz2" 46d9a0400a33408fd992770b04a44a7434b3036f2e8089ac28b57573d59d371f
getsource "https://www.libarchive.org/downloads/libarchive-3.6.1.tar.xz" 5a411aceb978f43e626f0c2d1812ddd8807b645ed892453acabd532376c148e6

# These are never checked into the repo, since they are separate git repos.
# Be sure to add new entries here to .gitignore
getrepo zstd "https://github.com/facebook/zstd.git" f8745da6ff1ad1e7bab384bd1f9d742439278e99

# These repos are part of the fork
getrepo webshims "https://github.com/paradust7/webshims.git" 0767fdedd87f61a28a34f6444b669caf563a9fd5
getrepo luanti "https://github.com/paradust7/luanti.git" dff2985f6bc28099c69c781f00b0f2b626e4fd00
