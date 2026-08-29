Luanti-wasm
=============

This is an experimental port of Luanti to the web using emscripten/WebAssembly.


System Requirements
-------------------
This has only been tested on Ubuntu 20.04.

* Ubuntu: apt-get install -y build-essential cmake tclsh

Building
---------

    cd luanti-wasm
    ./build_all.sh

Installation
------------

If the build completes successfully, the www/ directory will contain the entire application. This 
includes an `.htaccess` file which sets headers that are required (by browsers) to load the app. 
If your webserver does not recognize `.htaccess` files, you may need to set the headers in
another way.

Persistent Storage
------------------

If the browser provides an origin private file system (OPFS), the whole `/luanti` tree is kept
there instead of in memory. A data pack is only downloaded and unpacked when its contents change.

What is mounted is the OPFS directory `luanti`, not the OPFS root. WasmFS has no way to root a
backend at a subdirectory, so `emsdk_wasmfs_opfs_subdir.patch` makes the OPFS backend do this.

Each pack records the URL it was installed from (`luanti/.packs/<name>.ver`) along with the list
of files it wrote (`luanti/.packs/<name>.files`). Since pack URLs contain the release id and are
served immutable, a new release invalidates the packs: the files the old version wrote are removed
and the new ones unpacked, leaving worlds and installed content alone.

Values passed to `setConf()` are applied as defaults, so a setting the player later changes in-game
is not overwritten on the next launch.

`launch()` calls `navigator.storage.persist()`. The browser may still evict the saved worlds under
storage pressure. Chrome and Safari decide whether to honor this silently, Firefox asks the user.

The `storage` URL parameter overrides this feature:

    ?storage=auto     use OPFS when available (default)
    ?storage=memory   never use OPFS

The CA certificate bundle installs to `/etc/ssl/certs`, outside of OPFS, so are unpacked (from
certs.pack) on every run.

Network Play
------------

By default, the proxy server is set to `wss://luanti.dustlabs.io/proxy` (see static/launcher.js).
This is necessary for network play, since websites cannot open normal TCP/UDP sockets. This proxy
is located in California. There are regional proxies which may perform better depending on your
location:

North America (Dallas) - wss://na1.dustlabs.io/mtproxy
South America (Sao Paulo) - wss://sa1.dustlabs.io/mtproxy
Europe (Frankfurt) - wss://eu1.dustlabs.io/mtproxy
Asia (Singapore) - wss://ap1.dustlabs.io/mtproxy
Australia (Melbourne) - wss://ap2.dustlabs.io/mtproxy

You could also roll your own own custom proxy server. The client code is here:

https://github.com/paradust7/webshims/blob/main/src/emsocket/proxy.js

Custom Emscripten
-----------------
The Emscripten SDK (emsdk) will be downloaded and installed the first time you build. To provide
your own instead, set $EMSDK before building (e.g. using `emsdk_env.sh`). An external Emscripten
may need to be patched by running this exactly once:

    ./apply_patches.sh /path/to/emsdk
