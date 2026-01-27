Minetest-wasm
=============

This is an experimental port of Minetest to the web using emscripten/WebAssembly.


System Requirements
-------------------

You will need to install the following minimal dependencies depending on your operating system:

**Fedora**

```bash
dnf install -y git make cmake gcc patch zstd tcl perl-FindBin
```

**Ubuntu**

```bash
apt-get install -y build-essential cmake tclsh
```

Building
---------

```bash
cd minetest-wasm
./build_all.sh
```

Installation
------------

If the build completes successfully, the www/ directory will contain the entire application. This 
includes an `.htaccess` file which sets headers that are required (by browsers) to load the app. 
If your webserver does not recognize `.htaccess` files, you may need to set the headers in
another way.

Network Play
------------

By default, the proxy server is set to `wss://minetest.dustlabs.io/proxy` (see static/launcher.js).
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
