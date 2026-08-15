'use strict';

// These are relative paths
const RELEASE_DIR = '%__RELEASE_UUID__%'; // set by build_www.sh
const DEFAULT_PACKS_DIR = RELEASE_DIR + '/packs';

const rtCSS = `
body {
  font-family: arial;
  margin: 0;
  padding: none;
  background-color: black;
}

.emscripten {
  color: #aaaaaa;
  padding-right: 0;
  margin-left: auto;
  margin-right: auto;
  display: block;
}

div.emscripten {
  text-align: center;
  width: 100%;
}

/* the canvas *must not* have any border or padding, or mouse coords will be wrong */
canvas.emscripten {
  border: 0px none;
  background-color: black;
}

#controls {
  display: inline-block;
  vertical-align: top;
	height: 25px;
}

.console {
  width: 100%;
  margin: 0 auto;
  margin-top: 0px;
  border-left: 0px;
  border-right: 0px;
  padding-left: 0px;
  padding-right: 0px;
  display: block;
  background-color: black;
  color: white;
  font-family: 'Lucida Console', Monaco, monospace;
  outline: none;
}
`;

const rtHTML = `
  <div id="header">

  <div class="emscripten">
    <span id="controls">
      <span>
        <select id="resolution" onchange="fixGeometry()">
          <option value="high">High Res</option>
          <option value="medium">Medium</option>
          <option value="low">Low Res</option>
        </select>
      </span>
      <span>
        <select id="aspectRatio" onchange="fixGeometry()">
          <option value="any">Fit Screen</option>
          <option value="4:3">4:3</option>
          <option value="16:9">16:9</option>
          <option value="5:4">5:4</option>
          <option value="21:9">21:9</option>
          <option value="32:9">32:9</option>
          <option value="1:1">1:1</option>
        </select>
      </span>
      <span><input id="console_button" type="button" value="Show Console" onclick="consoleToggle()"></span>
      <span>(full screen: try F11 or Command+Shift+F)</span>
    </span>
    <div id="progressbar_div" style="display: none">
      <progress id="progressbar" value="0" max="100">0%</progress>
    </div>
  </div>

  </div>

  <div class="emscripten" id="canvas_container">
  </div>

  <div id="footer">
    <textarea id="console_output" class="console" rows="8" style="display: none; height: 200px"></textarea>
  </div>
`;

// The canvas needs to be created before the wasm module is loaded.
// It is not attached to the document until activateBody()
const mtCanvas = document.createElement('canvas');
mtCanvas.className = "emscripten";
mtCanvas.id = "canvas";
mtCanvas.oncontextmenu = (event) => {
  event.preventDefault();
};
mtCanvas.tabIndex = "-1";
mtCanvas.width = 1024;
mtCanvas.height = 600;

var consoleButton;
var consoleOutput;
var progressBar;
var progressBarDiv;

function activateBody() {
    const extraCSS = document.createElement("style");
    extraCSS.innerText = rtCSS;
    document.head.appendChild(extraCSS);

    // Replace the entire body
    document.body.style = '';
    document.body.className = '';
    document.body.innerHTML = '';

    const mtContainer = document.createElement('div');
    mtContainer.innerHTML = rtHTML;
    document.body.appendChild(mtContainer);

    const canvasContainer = document.getElementById('canvas_container');
    canvasContainer.appendChild(mtCanvas);

    setupResizeHandlers();
    setupEscapeHandlers();

    consoleButton = document.getElementById('console_button');
    consoleOutput = document.getElementById('console_output');
    // Triggers the first and all future updates
    consoleUpdate();

    progressBar = document.getElementById('progressbar');
    progressBarDiv = document.getElementById('progressbar_div');
    updateProgressBar(0, 0);
}

var PB_bytes_downloaded = 0;
var PB_bytes_needed = 0;
function updateProgressBar(doneBytes, neededBytes) {
    PB_bytes_downloaded += doneBytes;
    PB_bytes_needed += neededBytes;
    if (progressBar) {
        progressBarDiv.style.display = (PB_bytes_downloaded == PB_bytes_needed) ? "none" : "block";
        const pct = PB_bytes_needed ? Math.round(100 * PB_bytes_downloaded / PB_bytes_needed) : 0;
        progressBar.value = `${pct}`;
        progressBar.innerText = `${pct}%`;
    }
}

// Singleton
var mtLauncher = null;

class LaunchScheduler {
    constructor() {
        this.conditions = new Map();
        window.requestAnimationFrame(this.invokeCallbacks.bind(this));
    }

    isSet(name) {
        return this.conditions.get(name)[0];
    }

    addCondition(name, startCallback = null, deps = []) {
        this.conditions.set(name, [false, new Set(), startCallback]);
        for (const depname of deps) {
            this.addDep(name, depname);
        }
    }

    addDep(name, depname) {
        if (!this.isSet(depname)) {
            this.conditions.get(name)[1].add(depname);
        }
    }

    setCondition(name) {
        if (this.isSet(name)) {
            throw new Error('Scheduler condition set twice');
        }
        this.conditions.get(name)[0] = true;
        this.conditions.forEach(v => {
            v[1].delete(name);
        });
        window.requestAnimationFrame(this.invokeCallbacks.bind(this));
    }

    clearCondition(name, newCallback = null, deps = []) {
        if (!this.isSet(name)) {
            throw new Error('clearCondition called on unset condition');
        }
        const arr = this.conditions.get(name);
        arr[0] = false;
        arr[1] = new Set(deps);
        arr[2] = newCallback;
    }

    invokeCallbacks() {
        const callbacks = [];
        this.conditions.forEach(v => {
            if (!v[0] && v[1].size == 0 && v[2] !== null) {
                callbacks.push(v[2]);
                v[2] = null;
            }
        });
        callbacks.forEach(cb => cb());
    }
}
const mtScheduler = new LaunchScheduler();

function loadWasm() {
    // Start loading the wasm module
    // The module will call emloop_ready when it is loaded
    // and waiting for main() arguments.
    const mtModuleScript = document.createElement("script");
    mtModuleScript.type = "text/javascript";
    mtModuleScript.src = RELEASE_DIR + "/luanti.js";
    mtModuleScript.async = true;
    document.head.appendChild(mtModuleScript);
}

function callMain() {
    const fullargs = [ './luanti', ...mtLauncher.args.toArray() ];
    const [argc, argv] = makeArgv(fullargs);
    emloop_invoke_main(argc, argv);
    mtScheduler.setCondition("main_called");
}

var emloop_install_pack;
var emloop_set_conf;
var emloop_invoke_main;
var irrlicht_resize;
var emsocket_init;
var emsocket_set_proxy;
var emsocket_set_vpn;

// Called when the wasm module is ready
function emloop_ready() {
    emloop_install_pack = cwrap("emloop_install_pack", null, ["number", "number", "number"]);
    emloop_set_conf = cwrap("emloop_set_conf", null, ["number"]);
    emloop_invoke_main = cwrap("emloop_invoke_main", null, ["number", "number"]);
    irrlicht_resize = cwrap("irrlicht_resize", null, ["number", "number"]);
    emsocket_init = cwrap("emsocket_init", null, []);
    emsocket_set_proxy = cwrap("emsocket_set_proxy", null, ["number"]);
    emsocket_set_vpn = cwrap("emsocket_set_vpn", null, ["number"]);
    mtScheduler.setCondition("wasmReady");
}

function makeArgv(args) {
    // Assuming 4-byte pointers
    const argv = _malloc((args.length + 1) * 4);
    let i;
    for (i = 0; i < args.length; i++) {
        HEAPU32[(argv >>> 2) + i] = stringToNewUTF8(args[i]);
    }
    HEAPU32[(argv >>> 2) + i] = 0; // argv[argc] == NULL
    return [i, argv];
}

var consoleText = [];
var consoleLengthMax = 1000;
var consoleTextLast = 0;
var consoleDirty = false;
function consoleUpdate() {
    if (consoleDirty) {
        if (consoleText.length > consoleLengthMax) {
            consoleText = consoleText.slice(-consoleLengthMax);
        }
        consoleOutput.value = consoleText.join('');
        consoleOutput.scrollTop = consoleOutput.scrollHeight; // focus on bottom
        consoleDirty = false;
    }
    window.requestAnimationFrame(consoleUpdate);
}

function consoleToggle() {
    consoleOutput.style.display = (consoleOutput.style.display == 'block') ? 'none' : 'block';
    consoleButton.value = (consoleOutput.style.display == 'none') ? 'Show Console' : 'Hide Console';
    fixGeometry();
}

var enableTracing = false;
function consolePrint(text) {
    if (enableTracing) {
        console.trace(text);
    }
    consoleText.push(text + "\n");
    consoleDirty = true;
    if (mtLauncher && mtLauncher.onprint) {
        mtLauncher.onprint(text);
    }
}

var Module = {
    preRun: [],
    postRun: [],
    print: consolePrint,
    canvas: mtCanvas,
    setStatus: function(text) {
        if (text) Module.print('[wasm module status] ' + text);
    },
    totalDependencies: 0,
    monitorRunDependencies: function(left) {
        this.totalDependencies = Math.max(this.totalDependencies, left);
        if (!mtLauncher || !mtLauncher.onprogress) return;
        mtLauncher.onprogress('wasm_module', (this.totalDependencies-left) / this.totalDependencies);
    }
};

Module['printErr'] = Module['print'];

// Custom worker script to direct stdout/stderr to the main thread.
Module['mainScriptUrlOrBlob'] = RELEASE_DIR + '/worker.js';

Module['onFullScreen'] = () => { fixGeometry(); };
window.onerror = function(event) {
    consolePrint('Exception thrown, see JavaScript console');
};

function resizeCanvas(width, height) {
    irrlicht_resize(width, height);
}

function now() {
    return (new Date()).getTime();
}

// Only allow fixGeometry to be called every 250ms
// Firefox calls this way too often, causing flicker.
var fixGeometryPause = 0;
function fixGeometry(override) {
    if (!override && now() < fixGeometryPause) {
        return;
    }
    const resolutionSelect = document.getElementById('resolution');
    const aspectRatioSelect = document.getElementById('aspectRatio');
    var canvas = mtCanvas;
    var resolution = resolutionSelect.value;
    var aspectRatio = aspectRatioSelect.value;
    var screenX;
    var screenY;

    // Prevent the controls from getting focus
    canvas.focus();

    var isFullScreen = document.fullscreenElement ? true : false;
    if (isFullScreen) {
        screenX = screen.width;
        screenY = screen.height;
    } else {
        // F11-style full screen
        var controls = document.getElementById('controls');
        var maximized = !window.screenTop && !window.screenY;
        controls.style = maximized ? 'display: none' : '';

        var headerHeight = document.getElementById('header').offsetHeight;
        var footerHeight = document.getElementById('footer').offsetHeight;
        screenX = document.documentElement.clientWidth - 6;
        screenY = document.documentElement.clientHeight - headerHeight - footerHeight - 6;
    }

    // Size of the viewport (after scaling)
    var realX;
    var realY;
    if (aspectRatio == 'any') {
        realX = screenX;
        realY = screenY;
    } else {
        var ar = aspectRatio.split(':');
        var innerRatio = parseInt(ar[0]) / parseInt(ar[1]);
        var outerRatio = screenX / screenY;
        if (innerRatio <= outerRatio) {
            realX = Math.floor(innerRatio * screenY);
            realY = screenY;
        } else {
            realX = screenX;
            realY = Math.floor(screenX / innerRatio);
        }
    }

    // Native canvas resolution
    var resX;
    var resY;
    var dpr = window.devicePixelRatio || 1;
    if (resolution == 'high') {
        resX = Math.floor(dpr * realX);
        resY = Math.floor(dpr * realY);
    } else if (resolution == 'medium') {
        resX = Math.floor(dpr * realX / 1.5);
        resY = Math.floor(dpr * realY / 1.5);
    } else {
        resX = Math.floor(dpr * realX / 2.0);
        resY = Math.floor(dpr * realY / 2.0);
    }
    var styleWidth = realX + "px";
    var styleHeight = realY + "px";
    canvas.style.setProperty("width", styleWidth, "important");
    canvas.style.setProperty("height", styleHeight, "important");
    resizeCanvas(resX, resY);
}

function setupResizeHandlers() {
    window.addEventListener('resize', () => { fixGeometry(); });

    // Needed to prevent special keys from triggering browser actions, like
    // F5 causing page reload.
    document.addEventListener('keydown', (e) => {
        // Allow F11 to go full screen
        if (e.code == "F11") {
            // Prevent F11 from propagating, since that is also Luanti's full screen key.
            // If Launti tries to switch to full screen, it messes up the canvas.
            e.stopPropagation();

            // On Firefox, F11 is animated. The window smoothly grows to
            // full screen over several seconds. During this transition, the 'resize'
            // event is triggered hundreds of times. To prevent flickering, have
            // fixGeometry ignore repeated calls, and instead resize every 500ms
            // for 2.5 seconds. By then it should be finished.
            fixGeometryPause = now() + 2000;
            for (var delay = 100; delay <= 2600; delay += 500) {
                setTimeout(() => { fixGeometry(true); }, delay);
            }
            return;
        }
        ignoreBrowserKeys(e);
    });

    document.addEventListener('keyup', (e) => {
        if (e.code == "F11") {
            e.stopPropagation();
        }
    });
}

const BROWSER_IGNORE_KEYS = new Set([
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F12",
    "Tab", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

// Prevent the browser from acting on these keys.
function ignoreBrowserKeys(e) {
    if (BROWSER_IGNORE_KEYS.has(e.code)) {
        e.preventDefault();
    }
}

// While the pointer is locked, the browser keeps ESC for itself: it releases
// the lock and never delivers the keydown to the page. Luanti therefore misses
// the keypress that is supposed to open the in-game menu, and the player has to
// press ESC a second time (which does work, because by then the pointer is no
// longer locked).
//
// Fix that by treating an unlock that the game did not ask for as the ESC press
// that was swallowed. The synthetic event goes to the same window listener SDL
// installs, so it travels the normal input path.
const ESC_DEDUPE_MS = 250;

// Timestamps used to keep the real and the synthetic ESC from both getting
// through on browsers that do deliver the keydown. Otherwise the menu would
// open and immediately close again.
var pointerlockExitTime = 0; // last exitPointerLock() by the wasm module
var realEscapeTime = 0;      // last ESC keydown delivered by the browser
var fakeEscapeTime = 0;      // last ESC keydown synthesized here

function setupEscapeHandlers() {
    // Remember unlocks the game asked for (emscripten_exit_pointerlock calls
    // this), so they can be told apart from the user pressing ESC.
    const exitPointerLock = document.exitPointerLock.bind(document);
    document.exitPointerLock = () => {
        if (document.pointerLockElement) {
            pointerlockExitTime = now();
        }
        exitPointerLock();
    };

    // Capture phase, and registered before the wasm module installs its own
    // handlers, so this runs first and can swallow the event if needed.
    window.addEventListener('keydown', (e) => {
        if (e.code != 'Escape' || !e.isTrusted) return;
        realEscapeTime = now();
        if (realEscapeTime - fakeEscapeTime < ESC_DEDUPE_MS) {
            // Luanti already got a synthetic ESC for this unlock.
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement) return;
        if (now() - pointerlockExitTime < ESC_DEDUPE_MS) return; // game asked for it
        if (now() - realEscapeTime < ESC_DEDUPE_MS) return; // keydown got through
        sendEscapeKey();
    });

    // Force confirmation before leaving page
    window.addEventListener('beforeunload', (e) => { e.preventDefault(); });
}

function sendEscapeKey() {
    fakeEscapeTime = now();
    const init = {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', init));
    }, 30);
}

class LuantiArgs {
    constructor() {
        this.go = false;
        this.server = false;
        this.name = '';
        this.password = '';
        this.gameid = '';
        this.address = '';
        this.port = '';
        this.packs = [];
        this.extra = [];
    }

    toArray() {
        const args = [];
        if (this.go) args.push('--go');
        if (this.server) args.push('--server');
        if (this.name) args.push('--name', this.name);
        if (this.password) args.push('--password', this.password);
        if (this.gameid) args.push('--gameid', this.gameid);
        if (this.address) args.push('--address', this.address);
        if (this.port) args.push('--port', this.port.toString());
        if (this.trace) args.push('--trace');
        if (this.verbose) args.push('--verbose');
        args.push(...this.extra);
        return args;
    }

    toQueryString() {
        const params = new URLSearchParams();
        if (this.go) params.append('go', '');
        if (this.server) params.append('server', '');
        if (this.name) params.append('name', this.name);
        if (this.password) params.append('password', this.password);
        if (this.gameid) params.append('gameid', this.gameid);
        if (this.address) params.append('address', this.address);
        if (this.port) params.append('port', this.port.toString());
        if (this.trace) params.append('trace', '');
        if (this.verbose) params.append('verbose', '');
        const extra_packs = [];
        this.packs.forEach(v => {
            if (v != 'base' && v != 'minetest_game' && v != 'devtest' && v != this.gameid) {
                extra_packs.push(v);
            }
        });
        if (extra_packs.length) {
            params.append('packs', extra_packs.join(','));
        }
        if (this.extra.length) {
            params.append('extra', this.extra.join(','));
        }
        return params.toString();
    }

    static fromQueryString(qs) {
        const r = new LuantiArgs();
        const params = new URLSearchParams(qs);
        if (params.has('go')) r.go = true;
        if (params.has('server')) r.server = true;
        if (params.has('name')) r.name = params.get('name');
        if (params.has('password')) r.password = params.get('password');
        if (params.has('gameid')) r.gameid = params.get('gameid');
        if (params.has('address')) r.address = params.get('address');
        if (params.has('port')) r.port = parseInt(params.get('port'));
        if (params.has('verbose')) r.verbose = true;
        if (params.has('trace')) r.trace = true;
        if (r.gameid && r.gameid != 'minetest_game' && r.gameid != 'devtest' && r.gameid != 'base') {
            r.packs.push(r.gameid);
        }
        if (params.has('packs')) {
            params.get('packs').split(',').forEach(p => {
                if (!r.packs.includes(p)) {
                    r.packs.push(p);
                }
            });
        }
        if (params.has('extra')) {
            r.extra = params.get('extra').split(',');
        }
        return r;
    }
}

class LuantiLauncher {
    constructor() {
        if (mtLauncher !== null) {
            throw new Error("There can be only one launcher");
        }
        mtLauncher = this;
        this.args = null;
        this.onprogress = null; // function(name, percent done)
        this.onready = null; // function()
        this.onerror = null; // function(message)
        this.onprint = null; // function(text)
        this.addedPacks = new Set();
        this.vpn = null;
        this.serverCode = null;
        this.clientCode = null;
        this.proxyUrl = "wss://luanti.dustlabs.io/proxy";
        this.packsDir = DEFAULT_PACKS_DIR;
        this.packsDirIsCors = false;
        this.conf = new Map();

        mtScheduler.addCondition("wasmReady", loadWasm);
        mtScheduler.addCondition("launch_called");
        mtScheduler.addCondition("ready", this.#notifyReady.bind(this), ['wasmReady']);
        mtScheduler.addCondition("main_called", callMain, ['ready', 'launch_called']);
        this.addPack('base');
    }

    setProxy(url) {
        this.proxyUrl = url;
    }

    /*
     * Set the url for the pack files directory
     * This can be relative or absolute.
     */
    setPacksDir(url, is_cors) {
        this.packsDir = url;
        this.packsDirIsCors = is_cors;
    }

    #notifyReady() {
        mtScheduler.setCondition("ready");
        if (this.onready) this.onready();
    }

    isReady() {
        return mtScheduler.isSet("ready");
    }

    // Must be set before launch()
    setVPN(serverCode, clientCode) {
        this.serverCode = serverCode;
        this.clientCode = clientCode;
        this.vpn = serverCode ? serverCode : clientCode;
    }

    // Set a key/value pair in minetest.conf
    // Overrides previous values of the same key
    setConf(key, value) {
        key = key.toString();
        value = value.toString();
        this.conf.set(key, value);
    }

    #renderConf() {
        let lines = [];
        for (const [k, v] of this.conf.entries()) {
            lines.push(`${k} = ${v}\n`);
        }
        return lines.join('');
    }

    setLang(lang) {
        if (!SUPPORTED_LANGUAGES_MAP.has(lang)) {
            alert(`Invalid code in setLang: ${lang}`);
        }
        this.setConf("language", lang);
    }

    // Returns pack status:
    //   0 - pack has not been added
    //   1 - pack is downloading
    //   2 - pack has been installed
    checkPack(name) {
       if (!this.addedPacks.has(name)) {
           return 0;
       }
       if (mtScheduler.isSet("installed:" + name)) {
           return 2;
       }
       return 1;
    }

    addPacks(packs) {
        for (const pack of packs) {
            this.addPack(pack);
        }
    }

    async addPack(name) {
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("Cannot add packs after launch");
        }
        if (name == 'minetest_game' || name == 'devtest' || this.addedPacks.has(name))
            return;
        this.addedPacks.add(name);

        const fetchedCond = "fetched:" + name;
        const installedCond = "installed:" + name;

        let chunks = [];
        let received = 0;
        // This is done here instead of at the bottom, because it needs to
        // be delayed until after the 'wasmReady' condition.
        // TODO: Add the ability to `await` a condition instead.
        const installPack = () => {
            // Install
            const data = _malloc(received);
            let offset = 0;
            for (const arr of chunks) {
                HEAPU8.set(arr, data + offset);
                offset += arr.byteLength;
            }
            emloop_install_pack(stringToNewUTF8(name), data, received);
            _free(data);
            mtScheduler.setCondition(installedCond);
            if (this.onprogress) {
                this.onprogress(`download:${name}`, 1.0);
                this.onprogress(`install:${name}`, 1.0);
            }
        };
        mtScheduler.addCondition(fetchedCond, null);
        mtScheduler.addCondition(installedCond, installPack, ["wasmReady", fetchedCond]);
        mtScheduler.addDep("main_called", installedCond);

        const packUrl = this.packsDir + '/' + name + '.pack';
        let resp;
        try {
            resp = await fetch(packUrl, this.packsDirIsCors ? { credentials: 'omit' } : {});
        } catch (err) {
            if (this.onerror) {
                this.onerror(`${err}`);
            } else {
                alert(`Error while loading ${packUrl}. Please refresh page`);
            }
            throw new Error(`${err}`);
        }
        // This could be null if the header is missing
        var contentLength = resp.headers.get('Content-Length');
        if (contentLength) {
            contentLength = parseInt(contentLength);
            updateProgressBar(0, contentLength);
        }
        let reader = resp.body.getReader();
        while (true) {
            const {done, value} = await reader.read();
            if (done) {
                break;
            }
            chunks.push(value);
            received += value.byteLength;
            if (contentLength) {
                updateProgressBar(value.byteLength, 0);
                if (this.onprogress) {
                    this.onprogress(`download:${name}`, received / contentLength);
                }
            }
        }
        mtScheduler.setCondition(fetchedCond);
    }

    // Launch luanti.exe <args>
    //
    // This must be called from a keyboard or mouse event handler,
    // after the 'onready' event has fired. (For this reason, it cannot
    // be called from the `onready` handler)
    launch(args) {
        if (!this.isReady()) {
            throw new Error("launch called before onready");
        }
        if (!(args instanceof LuantiArgs)) {
            throw new Error("launch called without LuantiArgs");
        }
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("launch called twice");
        }
        this.args = args;
        if (this.args.gameid) {
            this.addPack(this.args.gameid);
        }
        this.addPacks(this.args.packs);
        activateBody();
        fixGeometry();
        if (this.conf.size > 0) {
            const contents = this.#renderConf();
            console.log("minetest.conf is: ", contents);
            const confBuf = stringToNewUTF8(contents);
            emloop_set_conf(confBuf);
            _free(confBuf);
        }
        // Setup emsocket
        // TODO: emsocket should export the helpers for this
        emsocket_init();
        const proxyBuf = stringToNewUTF8(this.proxyUrl);
        emsocket_set_proxy(proxyBuf);
        _free(proxyBuf);
        if (this.vpn) {
            const vpnBuf = stringToNewUTF8(this.vpn);
            emsocket_set_vpn(vpnBuf);
            _free(vpnBuf);
        }
        mtScheduler.setCondition("launch_called");
    }
}

// Pulled from builtin/mainmenu/settings/dlg_settings.lua
const SUPPORTED_LANGUAGES = [
	['be', "Беларуская [be]"],
	['bg', "Български [bg]"],
	['ca', "Català [ca]"],
	['cs', "Česky [cs]"],
	['cy', "Cymraeg [cy]"],
	['da', "Dansk [da]"],
	['de', "Deutsch [de]"],
	['el', "Ελληνικά [el]"],
	['en', "English [en]"],
	['eo', "Esperanto [eo]"],
	['es', "Español [es]"],
	['et', "Eesti [et]"],
	['eu', "Euskara [eu]"],
	['fi', "Suomi [fi]"],
	['fil', "Wikang Filipino [fil]"],
	['fr', "Français [fr]"],
	['gd', "Gàidhlig [gd]"],
	['gl', "Galego [gl]"],
	['hu', "Magyar [hu]"],
	['id', "Bahasa Indonesia [id]"],
	['it', "Italiano [it]"],
	['ja', "日本語 [ja]"],
	['jbo', "Lojban [jbo]"],
	['kk', "Қазақша [kk]"],
	['ko', "한국어 [ko]"],
	['ky', "Kırgızca / Кыргызча [ky]"],
	['lt', "Lietuvių [lt]"],
	['lv', "Latviešu [lv]"],
	['mn', "Монгол [mn]"],
	['mr', "मराठी [mr]"],
	['ms', "Bahasa Melayu [ms]"],
	['nb', "Norsk Bokmål [nb]"],
	['nl', "Nederlands [nl]"],
	['nn', "Norsk Nynorsk [nn]"],
	['oc', "Occitan [oc]"],
	['pl', "Polski [pl]"],
	['pt', "Português [pt]"],
	['pt_BR', "Português do Brasil [pt_BR]"],
	['ro', "Română [ro]"],
	['ru', "Русский [ru]"],
	['sk', "Slovenčina [sk]"],
	['sl', "Slovenščina [sl]"],
	['sr_Cyrl', "Српски [sr_Cyrl]"],
	['sr_Latn', "Srpski (Latinica) [sr_Latn]"],
	['sv', "Svenska [sv]"],
	['sw', "Kiswahili [sw]"],
	['tr', "Türkçe [tr]"],
	['tt', "Tatarça [tt]"],
	['uk', "Українська [uk]"],
	['vi', "Tiếng Việt [vi]"],
	['zh_CN', "中文 (简体) [zh_CN]"],
	['zh_TW', "正體中文 (繁體) [zh_TW]"],
];

const SUPPORTED_LANGUAGES_MAP = new Map(SUPPORTED_LANGUAGES);

function getDefaultLanguage() {
    const fuzzy = [];

    const url_params = new URLSearchParams(window.location.search);
    if (url_params.has("lang")) {
        const lang = url_params.get("lang");
        if (SUPPORTED_LANGUAGES_MAP.has(lang)) {
            return lang;
        }
        alert(`Invalid lang parameter: ${lang}`);
        return 'en';
    }

    for (let candidate of navigator.languages) {
        candidate = candidate.replaceAll('-', '_');

        if (SUPPORTED_LANGUAGES_MAP.has(candidate)) {
            return candidate;
        }

        // Try stripping off the country code
        const parts = candidate.split('_');
        if (parts.length > 2) {
            const rcandidate = parts.slice(0, 2).join('_');
            if (SUPPORTED_LANGUAGES_MAP.has(rcandidate)) {
                return rcandidate;
            }
        }

        // Try just matching the language code
        if (parts.length > 1) {
            if (SUPPORTED_LANGUAGES_MAP.has(parts[0])) {
                return parts[0];
            }
        }

        // Try fuzzy match (ignore country code of both)
        for (let entry of SUPPORTED_LANGUAGES) {
            if (entry[0].split('_')[0] == parts[0]) {
                fuzzy.push(entry[0]);
            }
        }
    }

    if (fuzzy.length > 0) {
        return fuzzy[0];
    }

    return 'en';
}
