'use strict';

// These are relative paths
const RELEASE_DIR = '%__RELEASE_UUID__%'; // set by build_www.sh
const DEFAULT_PACKS_DIR = RELEASE_DIR + '/packs';

// Wrap the constructor of Worker so that every worker thread
// created by the module can use 'luantiLog' messages to dump
// output to the console.
//
// This is fine because emscripten's own 'message' listener
// ignores messages that don't have 'cmd'.
const NativeWorker = Worker;
globalThis.Worker = class extends NativeWorker {
    constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg && msg.luantiLog !== undefined) {
                consolePrint(msg.luantiLog, false);
            }
        });
    }
};

const rtCSS = `
body {
  font-family: arial;
  margin: 0;
  padding: none;
  background-color: black;
  /* Make sure scrollbar never appears */
  overflow: hidden;
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

/* Always painted over the canvas, top right corner. */
#settings_panel {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 20;
  font-size: 13px;
  text-align: left;
}

#settings_button {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  width: 28px;
  height: 24px;
  padding: 0;
  border: 0;
  /* Suppress the native button chrome, which draws its own light border */
  appearance: none;
  -webkit-appearance: none;
  background-color: transparent;
  /* The gear is drawn in currentColor */
  color: #313639;
  cursor: pointer;
}

/* Open, the console docks under the button, and it is black. So is the terminal
   of a server-only run. Flip the gear so it stays visible against either. */
#settings_button.over_console {
  color: white;
}

#settings_menu {
  margin-top: 4px;
  /* Wide enough for a full fd00:: address on one line */
  width: 240px;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid #888888;
  background-color: white;
  color: black;
}

#settings_exit, #settings_console_toggle {
  display: block;
  width: 100%;
  padding: 6px 0;
  cursor: pointer;
}

#settings_exit {
  margin-bottom: 6px;
}

#settings_address_label {
  margin-top: 10px;
  font-weight: bold;
  text-align: center;
}

#settings_address {
  display: block;
  margin-top: 4px;
  text-align: center;
  color: black;
  font-family: 'Lucida Console', Monaco, monospace;
  /* Addresses are IPv6 literals. Wrap rather than clip, so the whole of one
     is always readable even if the font is wider than expected. */
  word-break: break-all;
  /* A single click takes the whole address, not a word of it */
  user-select: all;
  -webkit-user-select: all;
  cursor: text;
}

#settings_address.unassigned {
  color: #888888;
  font-family: arial;
  font-style: italic;
  user-select: none;
  -webkit-user-select: none;
  cursor: default;
}

#settings_address_copy {
  display: block;
  margin: 6px auto 0;
  /* Fixed, so the button does not resize as its label changes */
  min-width: 62px;
  padding: 4px 8px;
  cursor: pointer;
}

#settings_invite_copy {
  display: block;
  margin: 6px auto 0;
  /* Fixed, so the button does not resize as its label changes */
  min-width: 90px;
  padding: 4px 8px;
  cursor: pointer;
}

/* When shown, the console docks to the right of the canvas.
   Its width is set by dragging #console_splitter. */
#console_dock {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  z-index: 10;
  background-color: black;
}

#console_splitter {
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 100%;
  background-color: #555555;
  cursor: col-resize;
  touch-action: none;
}

#console_splitter:hover {
  background-color: #888888;
}

#console_output {
  position: absolute;
  top: 0;
  left: 6px;
  right: 0;
  width: auto;
  height: 100%;
  box-sizing: border-box;
  border: 0px none;
  resize: none;
}

/* A server-only run has no game window, so the terminal gets the screen that
   the canvas would otherwise have had. Sized by fitTerminal(). */
#terminal_container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 4px;
  background-color: black;
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
    <div id="progressbar_div" style="display: none">
      <progress id="progressbar" value="0" max="100">0%</progress>
    </div>
  </div>

  </div>

  <div class="emscripten" id="canvas_container">
  </div>

  <div id="terminal_container" style="display: none">
  </div>

  <div id="console_dock" style="display: none">
    <div id="console_splitter" title="Drag to resize the console"></div>
    <textarea id="console_output" class="console" readonly></textarea>
  </div>

  <div id="settings_panel">
    <button id="settings_button" title="Settings" aria-label="Settings" aria-expanded="false" aria-haspopup="true" onclick="settingsToggle()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M22.86 10.28A11.0 11.0 0 0 1 22.86 13.72L19.29 13.75A7.5 7.5 0 0 1 18.39 15.92L20.90 18.47A11.0 11.0 0 0 1 18.47 20.90L15.92 18.39A7.5 7.5 0 0 1 13.75 19.29L13.72 22.86A11.0 11.0 0 0 1 10.28 22.86L10.25 19.29A7.5 7.5 0 0 1 8.08 18.39L5.53 20.90A11.0 11.0 0 0 1 3.10 18.47L5.61 15.92A7.5 7.5 0 0 1 4.71 13.75L1.14 13.72A11.0 11.0 0 0 1 1.14 10.28L4.71 10.25A7.5 7.5 0 0 1 5.61 8.08L3.10 5.53A11.0 11.0 0 0 1 5.53 3.10L8.08 5.61A7.5 7.5 0 0 1 10.25 4.71L10.28 1.14A11.0 11.0 0 0 1 13.72 1.14L13.75 4.71A7.5 7.5 0 0 1 15.92 5.61L18.47 3.10A11.0 11.0 0 0 1 20.90 5.53L18.39 8.08A7.5 7.5 0 0 1 19.29 10.25L22.86 10.28ZM15.40 12.00A3.4 3.4 0 0 0 8.60 12.00A3.4 3.4 0 0 0 15.40 12.00Z"/>
      </svg>
    </button>
    <div id="settings_menu" style="display: none">
      <button id="settings_exit" onclick="exitLuanti()" title="Shut the game down, as Ctrl-C would">Exit Luanti</button>
      <button id="settings_console_toggle" onclick="consoleToggle()">Show Console</button>
      <div id="settings_address_label">Virtual IP Address</div>
      <span id="settings_address" onclick="selectAddress()"></span>
      <button id="settings_address_copy" onclick="copyAddress()">Copy</button>
      <button id="settings_invite_copy" onclick="copyInviteLink()" title="Copy a link that lets someone join from desktop Luanti">Invite Link</button>
    </div>
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

var canvasContainer;
var terminalContainer;
var consoleDock;
var consoleOutput;
var progressBar;
var progressBarDiv;
var settingsPanel;
var settingsButton;
var settingsMenu;
var settingsExit;
var settingsConsoleToggle;
var settingsAddress;
var settingsAddressCopy;
var settingsInviteCopy;

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

    canvasContainer = document.getElementById('canvas_container');
    canvasContainer.appendChild(mtCanvas);
    terminalContainer = document.getElementById('terminal_container');

    // Nothing is ever drawn on a server-only run, so the canvas would only sit
    // there black. The terminal takes its place.
    if (terminalMode) {
        canvasContainer.style.display = 'none';
        terminalContainer.style.display = 'block';
    }

    setupResizeHandlers();
    setupEscapeHandlers();
    setupClipboardHandlers();

    consoleDock = document.getElementById('console_dock');
    consoleOutput = document.getElementById('console_output');
    setupConsoleSplitter();
    // Triggers the first and all future updates
    consoleUpdate();

    settingsPanel = document.getElementById('settings_panel');
    settingsButton = document.getElementById('settings_button');
    settingsMenu = document.getElementById('settings_menu');
    settingsExit = document.getElementById('settings_exit');
    settingsConsoleToggle = document.getElementById('settings_console_toggle');
    settingsAddress = document.getElementById('settings_address');
    settingsAddressCopy = document.getElementById('settings_address_copy');
    settingsInviteCopy = document.getElementById('settings_invite_copy');
    setupSettingsMenu();

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
        const display = (PB_bytes_downloaded == PB_bytes_needed) ? "none" : "block";
        if (progressBarDiv.style.display != display) {
            progressBarDiv.style.display = display;
            // The header just changed height, and the terminal sits below it.
            fitTerminal();
        }
        const pct = PB_bytes_needed ? Math.round(100 * PB_bytes_downloaded / PB_bytes_needed) : 0;
        progressBar.value = `${pct}`;
        progressBar.innerText = `${pct}%`;
    }
}

// Singleton
var mtLauncher = null;

// Set once main() has returned. See emloop_exited().
var mtExited = false;

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

    // Forget a condition that is never going to be satisfied. Anything waiting
    // on it stops waiting, and it can be added again to try once more.
    removeCondition(name) {
        this.conditions.delete(name);
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

// True when this page was opened from an invite link. Such a page only
// tells a desktop player where to connect, and never runs the game.
function isInvitePage() {
    return new URLSearchParams(window.location.search).has('join');
}

function loadWasm() {
    // Nothing on an invite page runs the game, so the module, which is a
    // large download, is not fetched for one.
    if (isInvitePage()) {
        return;
    }
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

var emloop_init_fs;
var emloop_install_pack;
var emloop_remove_pack;
var emloop_disk_usage;
var emloop_delete_world;
var emloop_zip_world;
var emloop_install_zip;
var emloop_set_conf;
var emloop_invoke_main;
var emloop_request_exit;
var emloop_terminal_input;
var emloop_terminal_resize;
var irrlicht_resize;
var irrlicht_set_clipboard;
var irrlicht_paste;
var emsocket_init;
var emsocket_set_proxy;
var emsocket_get_address;
var emsocket_get_joincode;

// Called when the wasm module is ready
function emloop_ready() {
    emloop_init_fs = cwrap("emloop_init_fs", null, ["number"]);
    emloop_install_pack = cwrap("emloop_install_pack", null, ["number", "number", "number", "number"]);
    emloop_remove_pack = cwrap("emloop_remove_pack", null, ["number"]);
    emloop_disk_usage = cwrap("emloop_disk_usage", null, ["number", "number"]);
    emloop_delete_world = cwrap("emloop_delete_world", null, ["number"]);
    emloop_zip_world = cwrap("emloop_zip_world", null, ["number"]);
    emloop_install_zip = cwrap("emloop_install_zip", null,
                               ["number", "number", "number", "number", "number", "number"]);
    emloop_set_conf = cwrap("emloop_set_conf", null, ["number", "number"]);
    emloop_invoke_main = cwrap("emloop_invoke_main", null, ["number", "number"]);
    emloop_request_exit = cwrap("emloop_request_exit", null, []);
    emloop_terminal_input = cwrap("emloop_terminal_input", null, ["number", "number"]);
    emloop_terminal_resize = cwrap("emloop_terminal_resize", null, ["number", "number"]);
    irrlicht_resize = cwrap("irrlicht_resize", null, ["number", "number"]);
    irrlicht_set_clipboard = cwrap("irrlicht_set_clipboard", null, ["number"]);
    irrlicht_paste = cwrap("irrlicht_paste", null, []);
    emsocket_init = cwrap("emsocket_init", null, []);
    emsocket_set_proxy = cwrap("emsocket_set_proxy", null, ["number"]);
    emsocket_get_address = cwrap("emsocket_get_address", "number", ["number", "number"]);
    emsocket_get_joincode = cwrap("emsocket_get_joincode", "number", ["number", "number"]);
    mtScheduler.setCondition("wasmReady");
}

// Ask the wasm module to mount /luanti. It answers with emloop_fs_ready().
function initFs() {
    emloop_init_fs(mtLauncher.storageAvailable ? 1 : 0);
}

// Resolves to true once the wasm module reports that /luanti is backed by OPFS.
var mtFsActiveResolve;
const mtFsActive = new Promise((resolve) => { mtFsActiveResolve = resolve; });

// Called by the wasm module once /luanti has a backend. `active` is 1 if that
// backend is OPFS, meaning the tree survives a page reload.
function emloop_fs_ready(active) {
    mtLauncher.storageActive = (active != 0);
    consolePrint(mtLauncher.storageActive
        ? "Persistent storage (OPFS) is enabled"
        : "Persistent storage is not available; worlds will be lost when this page closes");
    mtFsActiveResolve(mtLauncher.storageActive);
    mtScheduler.setCondition("fsReady");
}

// Called by the wasm module while a pack is being unpacked.
function emloop_pack_progress(name, fraction) {
    if (mtLauncher && mtLauncher.onprogress) {
        mtLauncher.onprogress(`install:${name}`, fraction);
    }
}

// Called by the wasm module once a pack has finished unpacking.
function emloop_pack_installed(name) {
    if (!mtLauncher) {
        return;
    }
    if (mtLauncher.onprogress) {
        mtLauncher.onprogress(`install:${name}`, 1.0);
    }
    mtLauncher.notePackInstalled(name);
}

// Called by the wasm module while a pack is being deleted.
function emloop_pack_remove_progress(name, fraction) {
    if (mtLauncher && mtLauncher.onprogress) {
        mtLauncher.onprogress(`remove:${name}`, fraction);
    }
}

// Called by the wasm module once a pack has been deleted, or once it turned
// out there was nothing to delete.
function emloop_pack_removed(name, ok) {
    if (!mtLauncher) {
        return;
    }
    if (ok && mtLauncher.onprogress) {
        mtLauncher.onprogress(`remove:${name}`, 1.0);
    }
    mtLauncher.notePackRemoved(name, ok != 0);
}

// Called by the wasm module with how much space something takes up, in bytes.
// A negative count means there was nothing to measure.
function emloop_usage_result(kind, name, bytes) {
    if (mtLauncher) {
        mtLauncher.noteUsage(kind, name, (bytes >= 0) ? bytes : null);
    }
}

// Called by the wasm module while a world is being deleted.
function emloop_world_delete_progress(dir, fraction) {
    if (mtLauncher && mtLauncher.onprogress) {
        mtLauncher.onprogress(`delete:${dir}`, fraction);
    }
}

// Called by the wasm module once a world has been deleted, or once it turned
// out there was nothing to delete.
function emloop_world_deleted(dir, ok) {
    if (!mtLauncher) {
        return;
    }
    if (ok && mtLauncher.onprogress) {
        mtLauncher.onprogress(`delete:${dir}`, 1.0);
    }
    mtLauncher.noteWorldDeleted(dir, ok != 0);
}

// Called by the wasm module while a world is being packed into a zip.
function emloop_zip_progress(dir, fraction) {
    if (mtLauncher && mtLauncher.onprogress) {
        mtLauncher.onprogress(`zip:${dir}`, fraction);
    }
}

// Called by the wasm module while a world or game is being installed from a
// zip. `phase` is 'delete' while what was installed under the same name is
// being cleared out, and 'install' while the archive is being unpacked.
function emloop_zip_install_progress(kind, name, phase, fraction) {
    if (mtLauncher && mtLauncher.onprogress) {
        mtLauncher.onprogress(
            `${(phase == 'delete') ? 'wipe' : 'unzip'}:${name}`, fraction);
    }
}

// Called by the wasm module once a world or game from a zip is installed, or
// once it turned out it could not be.
function emloop_zip_installed(kind, name, ok) {
    if (!mtLauncher) {
        return;
    }
    if (ok && mtLauncher.onprogress) {
        mtLauncher.onprogress(`unzip:${name}`, 1.0);
    }
    mtLauncher.noteZipInstalled(kind, name, ok != 0);
}

// Called when main() has returned.
function emloop_exited(status) {
    mtExited = true;
    syncExitState();
    if (mtLauncher && mtLauncher.onexit) {
        mtLauncher.onexit(status);
    }
}

// Called by the wasm module once a world has been zipped. Null means error.
function emloop_world_zipped(dir, ptr, size) {
    if (!mtLauncher) {
        return;
    }
    let blob = null;
    if (ptr) {
        // The memory belongs to the caller, so make a copy.
        blob = new Blob([HEAPU8.slice(ptr, ptr + size)], {type: 'application/zip'});
        if (mtLauncher.onprogress) {
            mtLauncher.onprogress(`zip:${dir}`, 1.0);
        }
    }
    mtLauncher.noteWorldZipped(dir, blob);
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

// The console docks on the right, sharing the screen with the canvas.
const CONSOLE_MIN_WIDTH = 150;   // Smallest useful console
const CONSOLE_MIN_CANVAS = 200;  // Never let the console swallow the whole canvas
var consoleWidth = 0;

function consoleShown() {
    return consoleDock && consoleDock.style.display != 'none';
}

// Sets the console width (in px), clamped to what the screen can give it.
function setConsoleWidth(width) {
    const maxWidth = Math.max(CONSOLE_MIN_WIDTH,
                              document.documentElement.clientWidth - CONSOLE_MIN_CANVAS);
    consoleWidth = Math.round(Math.min(Math.max(width, CONSOLE_MIN_WIDTH), maxWidth));
    consoleDock.style.width = `${consoleWidth}px`;
}

function consoleToggle() {
    const show = !consoleShown();
    consoleDock.style.display = show ? 'block' : 'none';
    // Default to about a third of the screen, then remember the dragged width.
    setConsoleWidth(consoleWidth || Math.round(document.documentElement.clientWidth / 3));
    syncConsoleState();
    fixGeometry(true);
}

///////////////////////////////////////////////////////////////
// Terminal
//
// Hosting with --server never opens a game window: SDL is not initialized,
// nothing is ever drawn, and the canvas would only sit there black. Such a run
// is its console and nothing else, so the page gives the whole screen to a
// terminal instead.
//
// The terminal is a byte stream in both directions, and it is the module's
// stdin, stdout and stderr. What is typed goes to the module exactly as
// xterm.js produces it, escape sequences and all, and is neither echoed nor
// line-edited here: what appears on the screen is what the module writes back,
// the way a tty behaves. The log a server prints reaches the screen the same
// way, by being printed -- see the terminal section of mainloop.cpp -- so
// nothing has to be copied here from the page's own console.
//
// Module output arrives as bytes rather than as text. Decoding it here would
// mean splitting a character in half whenever one straddled two writes, so the
// bytes go to xterm.js as they are and it does the decoding.

// Set by launch() for a run with no game window.
var terminalMode = false;

// The xterm.js Terminal, once its script has loaded and it has been opened.
var xTerminal = null;
var xTerminalFit = null;

// Whether what was written last ended its line. The page prints the odd line of
// its own (see consolePrint), and one of those would otherwise land in the
// middle of whatever the module has on the screen.
var terminalAtLineStart = true;

// What was written before xterm.js finished loading. A server says a good deal
// on the way up and none of it is worth losing, so it is held here and replayed
// by startTerminal().
var terminalBacklog = [];

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Could not load ${src}`));
        document.head.appendChild(script);
    });
}

// xterm.js is a large download and an ordinary game never shows a terminal, so
// it is only fetched for a run that is going to use one.
function loadXterm() {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = RELEASE_DIR + '/xterm/xterm.css';
    document.head.appendChild(css);
    return Promise.all([
        loadScript(RELEASE_DIR + '/xterm/xterm.js'),
        loadScript(RELEASE_DIR + '/xterm/addon-fit.js'),
    ]);
}

async function startTerminal() {
    await loadXterm();
    xTerminal = new Terminal({
        cursorBlink: true,
        // What a tty's line discipline does with ONLCR. Without it a printed
        // "\n" would step down a line without returning to the left margin,
        // and the log would come out as a staircase. A program that wants the
        // other behaviour turns ONLCR off; ncurses is the one to watch for.
        convertEol: true,
        // The same face the console dock uses.
        fontFamily: "'Lucida Console', Monaco, monospace",
        fontSize: 14,
        scrollback: 10000,
        theme: { background: '#000000', foreground: '#ffffff' },
    });
    xTerminalFit = new FitAddon.FitAddon();
    xTerminal.loadAddon(xTerminalFit);
    xTerminal.open(terminalContainer);

    // Raw, the way a tty delivers input.
    xTerminal.onData(sendTerminalInput);

    // The module is told the size for the same reason a program is sent
    // SIGWINCH: it is what decides how to lay the screen out.
    xTerminal.onResize(({cols, rows}) => {
        if (emloop_terminal_resize) {
            emloop_terminal_resize(cols, rows);
        }
    });

    // Sized before anything is written, so that what is written wraps to the
    // width it is going to be read at.
    fitTerminal();

    // Everything written before the terminal was ready, so the whole run is on
    // the screen and not just the part of it that came after this loaded.
    for (const chunk of terminalBacklog) {
        xTerminal.write(chunk);
    }
    terminalBacklog = [];

    xTerminal.focus();
}

// Put `data` on the screen exactly as given: a string from the page, or a
// Uint8Array of what the module printed. xterm.js takes either.
function terminalWrite(data) {
    if (!data || !data.length) {
        return;
    }
    if (xTerminal) {
        xTerminal.write(data);
    } else {
        terminalBacklog.push(data);
    }
    const last = (typeof data === 'string')
        ? data.charCodeAt(data.length - 1)
        : data[data.length - 1];
    terminalAtLineStart = (last == 10) || (last == 13);
}

// Everything the module writes to stdout and stderr, byte for byte. Called from
// wasm, which is where the log of a server run comes from.
//
// The bytes are copied out of the heap rather than passed on as a view of it:
// the module's memory is shared, and xterm.js holds what it is given until it
// has drawn it.
function emloop_terminal_output(ptr, len) {
    terminalWrite(HEAPU8.slice(ptr, ptr + len));
}

// One line the page printed itself, rather than the module. It shares the
// screen with what the module has written, so it takes a line of its own rather
// than landing in the middle of a prompt.
function terminalPrintLine(text) {
    if (!terminalMode) {
        return;
    }
    terminalWrite((terminalAtLineStart ? '' : '\n') + text + '\n');
}

// Hand what was typed to the module as raw bytes.
function sendTerminalInput(data) {
    if (!emloop_terminal_input || !data) {
        return;
    }
    // Not stringToNewUTF8: a terminal can produce a NUL byte (Ctrl+Space), and
    // a C string would end there.
    const bytes = new TextEncoder().encode(data);
    const buf = _malloc(bytes.length);
    HEAPU8.set(bytes, buf);
    emloop_terminal_input(buf, bytes.length);
    _free(buf);
}

// The terminal fills what is left of the window below the header, which is the
// area the canvas would have had.
function fitTerminal() {
    if (!xTerminal) {
        return;
    }
    const headerHeight = document.getElementById('header').offsetHeight;
    terminalContainer.style.top = `${headerHeight}px`;
    terminalContainer.style.height =
        `${document.documentElement.clientHeight - headerHeight}px`;
    xTerminalFit.fit();
}

// The settings menu hangs off the gear button in the top right corner.
// It holds the console toggle and the address other players use to reach
// this instance.

function syncConsoleState() {
    const shown = consoleShown();
    if (settingsConsoleToggle) {
        settingsConsoleToggle.innerText = shown ? 'Hide Console' : 'Show Console';
    }
    if (settingsButton) {
        settingsButton.classList.toggle('over_console', shown || terminalMode);
    }
}

// Disabled before the module loads and after it has exited.
function syncExitState() {
    if (settingsExit) {
        settingsExit.disabled = (!emloop_request_exit || mtExited);
    }
}

// Shut the run down the way Ctrl-C would. main() returns once the game notices,
// which arrives back here as emloop_exited().
function exitLuanti() {
    if (!emloop_request_exit || mtExited) {
        return;
    }
    settingsHide();
    emloop_request_exit();
}

function setupSettingsMenu() {
    syncConsoleState();
    syncExitState();

    // The terminal already shows everything the console dock would, on the
    // screen the dock would have taken a slice of.
    if (terminalMode) {
        settingsConsoleToggle.style.display = 'none';
    }

    // Close the menu when a click lands anywhere else. Capture phase, because
    // the canvas swallows the events it receives.
    document.addEventListener('pointerdown', (e) => {
        if (settingsShown() && !settingsPanel.contains(e.target)) {
            settingsHide();
        }
    }, true);
}

function settingsShown() {
    return settingsMenu && settingsMenu.style.display != 'none';
}

function settingsToggle() {
    if (settingsShown()) {
        settingsHide();
    } else {
        settingsShow();
    }
}

function settingsShow() {
    settingsMenu.style.display = 'block';
    settingsButton.setAttribute('aria-expanded', 'true');
    syncConsoleState();
    syncExitState();
    refreshAddress();
}

function settingsHide() {
    settingsMenu.style.display = 'none';
    settingsButton.setAttribute('aria-expanded', 'false');
}

// Room for any address the proxy hands out, which are far shorter than this.
const ADDRESS_BUF_SIZE = 256;

// A join code is 16 hex characters. This leaves room to spare.
const JOINCODE_BUF_SIZE = 64;

// Set once emsocket_init() has started the I/O thread. Asking for the address
// before that would block the browser thread on a reply that never comes.
var emsocketStarted = false;

// The address is assigned by the proxy, is empty until the proxy answers, and
// can change afterwards, so it is read afresh every time the menu opens.
function readAddress() {
    if (!emsocketStarted || !emsocket_get_address) {
        return '';
    }
    const buf = _malloc(ADDRESS_BUF_SIZE);
    try {
        if (emsocket_get_address(buf, ADDRESS_BUF_SIZE) != 0) {
            return '';
        }
        return UTF8ToString(buf);
    } finally {
        _free(buf);
    }
}

// The join code that goes with the address, issued by the proxy at the same
// time. Empty until the proxy answers.
function readJoinCode() {
    if (!emsocketStarted || !emsocket_get_joincode) {
        return '';
    }
    const buf = _malloc(JOINCODE_BUF_SIZE);
    try {
        if (emsocket_get_joincode(buf, JOINCODE_BUF_SIZE) != 0) {
            return '';
        }
        return UTF8ToString(buf);
    } finally {
        _free(buf);
    }
}

// What readAddress() last returned, kept so the copy button does not have to
// parse it back out of the element.
var settingsAddressText = '';

// What readJoinCode() last returned. Unlike the address it is never shown,
// only put in the link the invite button copies.
var settingsJoinCode = '';

function refreshAddress() {
    const previous = settingsAddressText;
    settingsAddressText = readAddress();
    settingsAddress.innerText = settingsAddressText || 'Not assigned yet';
    settingsAddress.classList.toggle('unassigned', settingsAddressText == '');
    settingsAddressCopy.disabled = (settingsAddressText == '');
    setCopyLabel('Copy');
    // The join code is issued with the address and changes only when it
    // does. Reading it costs a round trip to the I/O thread, so the menu
    // does not pay for one every time it opens.
    if (settingsAddressText != previous || settingsJoinCode == '') {
        settingsJoinCode = settingsAddressText ? readJoinCode() : '';
    }
    settingsInviteCopy.disabled = (settingsJoinCode == '');
    setInviteLabel('Invite Link');
}

// Puts the whole address in the document selection, so it can be copied by
// hand when the clipboard API is unavailable.
function selectAddress() {
    if (!settingsAddressText) {
        return;
    }
    const range = document.createRange();
    range.selectNodeContents(settingsAddress);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

var copyLabelTimer = 0;
function setCopyLabel(text) {
    clearTimeout(copyLabelTimer);
    settingsAddressCopy.innerText = text;
    if (text != 'Copy') {
        copyLabelTimer = setTimeout(() => { setCopyLabel('Copy'); }, 1500);
    }
}

function copyAddress() {
    const address = settingsAddressText;
    if (!address) {
        return;
    }
    // Select it as well, so it can still be copied by hand if the clipboard
    // is refused (navigator.clipboard needs a secure context).
    selectAddress();
    const copied = () => { setCopyLabel('Copied'); };
    const failed = () => { setCopyLabel('Ctrl-C'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(copied, failed);
        return;
    }
    try {
        document.execCommand('copy') ? copied() : failed();
    } catch (err) {
        failed();
    }
}

var inviteLabelTimer = 0;
function setInviteLabel(text) {
    clearTimeout(inviteLabelTimer);
    settingsInviteCopy.innerText = text;
    if (text != 'Invite Link') {
        inviteLabelTimer = setTimeout(() => { setInviteLabel('Invite Link'); }, 1500);
    }
}

// The link that lets someone join this game from desktop Luanti. Opening it
// tells them which address and port to connect to, and is what gets them
// through the proxy.
function inviteLink(joinCode) {
    return `${window.location.origin}${window.location.pathname}?join=${joinCode}`;
}

function copyInviteLink() {
    const joinCode = settingsJoinCode;
    if (!joinCode) {
        return;
    }
    const copied = () => { setInviteLabel('Copied'); };
    const failed = () => { setInviteLabel('Failed'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteLink(joinCode)).then(copied, failed);
        return;
    }
    // No clipboard API (it needs a secure context), so fall back to copying
    // the document selection, which means putting the link in the document.
    const holder = document.createElement('span');
    holder.style.position = 'fixed';
    holder.style.opacity = '0';
    holder.innerText = inviteLink(joinCode);
    document.body.appendChild(holder);
    try {
        const range = document.createRange();
        range.selectNodeContents(holder);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy') ? copied() : failed();
        selection.removeAllRanges();
    } catch (err) {
        failed();
    } finally {
        holder.remove();
    }
}

// Where a desktop player points Luanti. The port that goes with it was
// opened by the proxy that answered the join query, so the address has to be
// that proxy's own, which is not in general the host serving this page.
function joinHost(proxyUrl) {
    return new URL(proxyUrl).hostname;
}

// Asks the proxy which UDP port an invite link leads to.
//
// The answer is only half of what this does: it also tells the proxy that
// this browser's address is the one allowed to use that port, which is what
// lets desktop Luanti through. Resolves with the port number.
function queryJoinCode(proxyUrl, joinCode) {
    return new Promise((resolve, reject) => {
        if (!/^[0-9a-f]{16}$/.test(joinCode)) {
            reject(new Error("That invite link is malformed."));
            return;
        }
        const ws = new WebSocket(proxyUrl);
        let settled = false;
        const settle = (port, err) => {
            if (settled) {
                return;
            }
            settled = true;
            ws.onopen = ws.onerror = ws.onclose = ws.onmessage = null;
            ws.close();
            if (err) {
                reject(err);
            } else {
                resolve(port);
            }
        };
        ws.onopen = () => { ws.send('JOIN ' + joinCode); };
        ws.onerror = () => { settle(0, new Error("Could not reach the server.")); };
        ws.onclose = () => { settle(0, new Error("The server closed before answering.")); };
        ws.onmessage = (e) => {
            const parts = (typeof e.data === 'string') ? e.data.split(' ') : [];
            if (parts.length === 3 && parts[0] === 'JOIN' && parts[1] === 'OK') {
                const port = Number(parts[2]);
                if (Number.isInteger(port) && port > 0 && port < 65536) {
                    settle(port, null);
                    return;
                }
            }
            // The usual reason: the host closed their game, so the invite
            // went with it.
            settle(0, new Error("That invite is no longer valid. Ask for a new link."));
        };
    });
}

// Resizing the canvas on every pointermove is expensive, so coalesce into frames.
var geometryPending = false;
function scheduleGeometry() {
    if (geometryPending) {
        return;
    }
    geometryPending = true;
    window.requestAnimationFrame(() => {
        geometryPending = false;
        fixGeometry(true);
    });
}

function setupConsoleSplitter() {
    const splitter = document.getElementById('console_splitter');
    var dragging = false;

    splitter.addEventListener('pointerdown', (e) => {
        dragging = true;
        splitter.setPointerCapture(e.pointerId);
        e.preventDefault(); // Don't start a text selection
    });

    splitter.addEventListener('pointermove', (e) => {
        if (!dragging) {
            return;
        }
        setConsoleWidth(document.documentElement.clientWidth - e.clientX);
        scheduleGeometry();
    });

    const stopDrag = (e) => {
        if (!dragging) {
            return;
        }
        dragging = false;
        splitter.releasePointerCapture(e.pointerId);
        fixGeometry(true);
    };
    splitter.addEventListener('pointerup', stopDrag);
    splitter.addEventListener('pointercancel', stopDrag);
}

var enableTracing = false;

// All console printing goes through this function.
// Use 'echo' to avoid double-printing to javascript console.
function consolePrint(text, echo = true) {
    if (enableTracing) {
        console.trace(text);
    } else if (echo) {
        console.log(text);
    }
    consoleText.push(text + "\n");
    consoleDirty = true;
    terminalPrintLine(text);
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
    // A server-only run has no canvas to size: the terminal has the screen.
    if (terminalMode) {
        fitTerminal();
        return;
    }

    var canvas = mtCanvas;
    var screenX;
    var screenY;

    // Prevent other elements from getting focus
    canvas.focus();

    // The console takes its width off the left-hand canvas area.
    if (consoleShown()) {
        setConsoleWidth(consoleWidth); // Re-clamp, in case the window shrank
    }
    var dockWidth = consoleShown() ? consoleWidth : 0;

    var isFullScreen = document.fullscreenElement ? true : false;
    if (isFullScreen) {
        screenX = screen.width - dockWidth;
        screenY = screen.height;
    } else {
        var headerHeight = document.getElementById('header').offsetHeight;
        screenX = document.documentElement.clientWidth - dockWidth;
        screenY = document.documentElement.clientHeight - headerHeight;
    }

    // Size of the viewport (after scaling)
    var realX = screenX;
    var realY = screenY;

    // Keep the canvas in the area left of the console, instead of centered
    // on the full width (which would put it under the console).
    canvasContainer.style.width = `${realX}px`;
    canvasContainer.style.marginLeft = '0';

    // Native canvas resolution
    var dpr = window.devicePixelRatio || 1;
    var resX = Math.floor(dpr * realX);
    var resY = Math.floor(dpr * realY);
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

    // Force confirmation if the game is still running.
    window.addEventListener('beforeunload', (e) => {
        if (!mtExited) {
            e.preventDefault();
        }
    });
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

// Emscripten's SDL does not implement clipboard support. So we capture browser
// pastes here and push them into the module ourselves.
//
// The sequence must be handled carefully to prevent Ctrl+V from pasting the
// old state of the clipboard:
//
// - User presses Ctrl+V
// - Capture 'keydown' for Ctrl+V and prevent it from going to SDL. Let the
//   browser's default handler process it.
// - If we're allowed to paste, the browser will generate a 'paste' event
//   with the clipboard contents.
// - Transfer contents to module.
// - Generate synthetic Ctrl+V to trigger Luanti's paste.
//

// How long to wait for the 'paste' event before giving up.
const PASTE_EVENT_TIMEOUT_MS = 150;

var pasteTimer = null;       // waiting for the 'paste' event of a Ctrl+V
var pasteKeyHeld = false;    // the V of a swallowed Ctrl+V is still down
var ignorePasteUntil = 0;    // a 'paste' that lost the race above is stale

// Cmd+V is caught as well. SDL reports it as GUI+V, which Luanti does not
// treat as a paste, so on macOS this is the only thing that makes it work.
function isPasteKey(e) {
    return e.code === 'KeyV' && (e.ctrlKey || e.metaKey) && !e.altKey;
}

// Don't intercept pastes into one of the page's regular fields.
function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           target.isContentEditable;
}

// Send `text` to Luanti and generate a synthetic paste event.
function doPaste(text) {
    if (pasteTimer !== null) {
        clearTimeout(pasteTimer);
        pasteTimer = null;
    }
    if (text) {
        const ptr = stringToNewUTF8(text);
        irrlicht_set_clipboard(ptr);
        _free(ptr);
    }
    irrlicht_paste();
}

function setupClipboardHandlers() {
    // There is no Irrlicht device to paste into on a server-only run, and the
    // terminal does its own copy and paste.
    if (terminalMode) {
        return;
    }

    // Capture phase, and registered before the wasm module installs its own
    // handlers, so this runs first and can keep the keypress from SDL.
    window.addEventListener('keydown', (e) => {
        if (!e.isTrusted || !isPasteKey(e)) return;
        if (!irrlicht_paste) return; // module isn't up yet
        if (isEditableTarget(e.target)) return;

        // Note there is no preventDefault() here: the default action is what
        // makes the browser deliver the 'paste' event.
        e.stopImmediatePropagation();
        pasteKeyHeld = true;
        if (pasteTimer === null) {
            pasteTimer = setTimeout(() => {
                pasteTimer = null;
                ignorePasteUntil = now() + PASTE_EVENT_TIMEOUT_MS;
                doPaste(null);
            }, PASTE_EVENT_TIMEOUT_MS);
        }
    }, true);

    // The release of a key SDL never saw pressed. Luanti has already had the
    // matching pair from irrlicht_paste().
    window.addEventListener('keyup', (e) => {
        if (!e.isTrusted || !pasteKeyHeld || e.code !== 'KeyV') return;
        pasteKeyHeld = false;
        e.stopImmediatePropagation();
    }, true);

    // Fires for Ctrl+V, and for a paste from the browser's own context menu.
    document.addEventListener('paste', (e) => {
        if (!irrlicht_paste) return;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        // The fallback above already pasted for this keypress.
        if (now() < ignorePasteUntil) return;
        doPaste(e.clipboardData ? e.clipboardData.getData('text/plain') : null);
    });
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
        this.world = '';
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
        if (this.world) args.push('--world', this.world);
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
        if (this.world) params.append('world', this.world);
        const extra_packs = [];
        this.packs.forEach(v => {
            if (v != 'base' && v != this.gameid) {
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
        if (params.has('world')) r.world = params.get('world');
        if (r.gameid && r.gameid != 'base') {
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

// Persistent storage
//
// When the browser has an origin private file system (OPFS), the whole /luanti
// tree lives there instead of in memory: worlds, minetest.conf, the cache and
// anything installed from ContentDB survive a reload, and a data pack only has
// to be downloaded and unpacked when its contents actually change.
//
// The wasm module does the mounting, because OPFS writes are only possible from
// a worker. The page can still read it though, and doing so here means an
// already-installed pack is never fetched in the first place.
//
// The OPFS tree mirrors the tree the module sees: the OPFS directory `luanti`
// is what gets mounted at /luanti (see emsdk_wasmfs_opfs_subdir.patch), so a
// path below is the module's own path without the leading slash.

// Mirrors PACK_DB_DIR in mainloop.cpp.
const PACK_DB_DIR = 'luanti/.packs';

// Where Luanti keeps its worlds. The build runs in place, so path_user is the
// Luanti root and this is the only place getAvailableWorlds() looks.
const WORLDS_DIR = 'luanti/worlds';
const WORLDS_PATH = '/' + WORLDS_DIR;

// Where Luanti looks for games. Mirrors GAMES_DIR in mainloop.cpp.
const GAMES_DIR = 'luanti/games';

// Luanti settings file
const CONF_FILE = 'luanti/minetest.conf';

// These packs install outside /luanti (the CA certificate bundle lands in
// /etc/ssl/certs, which is always in memory), so they cannot be remembered and
// must be unpacked on every run.
const VOLATILE_PACKS = new Set(['certs']);

// These packs are part of the release rather than the content: they are built
// alongside luanti.wasm and only make sense with it, so they always come from
// the directory the release was published in, whatever packs directory the
// page has since picked out for games.
const RELEASE_PACKS = new Set(['base', 'certs']);

// The version recorded for a game installed from a zip, in place of the pack
// version a downloaded game carries. No pack is ever served under this, which
// is what says a game is the player's own rather than one of ours: there is
// nowhere to fetch it from and no newer version of it to offer.
// Mirrors LOCAL_PACK_VERSION in mainloop.cpp.
const LOCAL_PACK_VERSION = 'local';

// A minetest.conf key and value as the module's parser reads them: one line
// each, and nothing that would look like the start of another entry.
function confPair(key, value) {
    key = key.toString().trim();
    value = value.toString();
    if (key === '' || key.includes('=') || key[0] === '#' ||
            /[\r\n]/.test(key) || /[\r\n]/.test(value)) {
        throw new Error(`Invalid minetest.conf entry: ${key}`);
    }
    return [key, value];
}

// A pack name becomes part of a URL and of a file name. Keep it boring.
// Mirrors validPackName() in mainloop.cpp.
function validPackName(name) {
    return /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(name);
}

function opfsSupported() {
    return (typeof navigator !== 'undefined' && navigator.storage &&
            typeof navigator.storage.getDirectory === 'function' &&
            typeof FileSystemDirectoryHandle !== 'undefined' &&
            typeof FileSystemFileHandle !== 'undefined');
}

async function opfsListNames(dir) {
    const names = [];
    if (typeof dir.keys === 'function') {
        for await (const name of dir.keys()) {
            names.push(name);
        }
    } else {
        for await (const [name] of dir) {
            names.push(name);
        }
    }
    return names;
}

// Walks `path` from `dir`, one component at a time, since OPFS only ever hands
// out a single child at a time.
async function opfsGetDirectory(dir, path, create) {
    for (const part of path.split('/')) {
        if (part) {
            dir = await dir.getDirectoryHandle(part, { create });
        }
    }
    return dir;
}

// Returns the OPFS root, or null if this browser/origin has no usable one.
async function openStorageRoot() {
    if (!opfsSupported()) {
        return null;
    }
    let root;
    try {
        root = await navigator.storage.getDirectory();
        // Creating the pack database doubles as a check that this origin is
        // actually allowed to write, and creates the directory the module
        // mounts at /luanti before it tries to.
        await opfsGetDirectory(root, PACK_DB_DIR, true);
    } catch (err) {
        consolePrint(`Could not open persistent storage: ${err}`);
        return null;
    }
    return root;
}

// What a pack URL says about the contents it serves. Pack paths carry the
// release id and are served immutable, so the path identifies the contents.
// The origin is left out, so that a pack stays installed when the same release
// is later fetched from a different mirror.
function packVersion(packUrl) {
    try {
        return new URL(packUrl, window.location.href).pathname;
    } catch (err) {
        return packUrl;
    }
}

// The packs recorded as installed, as [{name, version}] sorted by name, or
// null if the pack database cannot be read.
async function readInstalledPacks(root) {
    let entries;
    try {
        const dir = await opfsGetDirectory(root, PACK_DB_DIR, false);
        entries = await opfsListNames(dir);
    } catch (err) {
        return null;
    }
    const packs = [];
    for (const entry of entries) {
        // Only `.ver` is written once an install has fully succeeded.
        if (!entry.endsWith('.ver')) {
            continue;
        }
        const name = entry.slice(0, -'.ver'.length);
        if (!validPackName(name)) {
            continue;
        }
        const version = await readPackVersion(root, name);
        if (version !== null) {
            packs.push({name: name, version: version});
        }
    }
    packs.sort((a, b) => (a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0));
    return packs;
}

// The worlds saved in `root`, as [{dir, path, name, gameid, mtime}] sorted by
// name.
//
// A world is a directory under worlds/ holding a world.mt, which says what game
// it belongs to and, if the player renamed it, what to call it. Worlds without
// one are old enough that Luanti has to guess at the game, and are left out.
// Mirrors getAvailableWorlds() in subgames.cpp.
async function readWorlds(root) {
    let dir, names;
    try {
        dir = await opfsGetDirectory(root, WORLDS_DIR, false);
        names = await opfsListNames(dir);
    } catch (err) {
        return [];
    }
    const worlds = [];
    for (const name of names) {
        let worldDir, conf;
        try {
            worldDir = await dir.getDirectoryHandle(name, { create: false });
            const handle = await worldDir.getFileHandle('world.mt');
            conf = parseConf(await (await handle.getFile()).text());
        } catch (err) {
            // A file, or a directory that is not a world.
            continue;
        }
        const gameid = conf.get('gameid');
        if (!gameid) {
            continue;
        }
        worlds.push({
            dir: name,
            path: WORLDS_PATH + '/' + name,
            name: conf.get('world_name') || name,
            gameid: gameid,
            mtime: await newestFileTime(worldDir),
        });
    }
    worlds.sort((a, b) => (a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0));
    return worlds;
}

// When anything directly inside `dir` was last written, in milliseconds since
// the epoch, or 0 if that cannot be told. A world's map and player databases
// are only written while it is being served, so for a world directory this is
// near enough to when it was last played.
async function newestFileTime(dir) {
    let newest = 0;
    let names;
    try {
        names = await opfsListNames(dir);
    } catch (err) {
        return 0;
    }
    for (const name of names) {
        try {
            const file = await (await dir.getFileHandle(name)).getFile();
            if (file.lastModified > newest) {
                newest = file.lastModified;
            }
        } catch (err) {
            // A subdirectory rather than a file. Nothing to read a time from.
        }
    }
    return newest;
}

// The `key = value` pairs in a Luanti config file, as a Map. Comments and the
// group syntax the settings menu writes are skipped over rather than parsed:
// nothing this reads for is ever written as a group.
function parseConf(text) {
    const conf = new Map();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const eq = line.indexOf('=');
        if (line === '' || line[0] === '#' || eq < 0) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        if (value === '"""') {
            // A multi-line value. Its lines are not keys, so skip past them.
            while (++i < lines.length && lines[i].trim() !== '"""') {
            }
            continue;
        }
        conf.set(key, value);
    }
    return conf;
}

// Read the contents of file at `path` (relative to directory handle `root`)
async function opfsReadFile(root, path) {
    const cut = path.lastIndexOf('/');
    try {
        const dir = await opfsGetDirectory(root, path.slice(0, cut), false);
        const handle = await dir.getFileHandle(path.slice(cut + 1));
        return await (await handle.getFile()).text();
    } catch (err) {
        return null;
    }
}

// The settings a previous run left in minetest.conf, as a Map, or null if
// there is no readable file. Luanti rewrites this file as the player changes
// settings in-game, so it is where an in-game choice can be read back.
async function readSavedConf(root) {
    const text = await opfsReadFile(root, CONF_FILE);
    return (text === null) ? null : parseConf(text);
}

// What the game `name` says about itself in its game.conf, as a Map, or null
// if persistent storage holds no such game.
async function readGameConf(root, name) {
    const text = await opfsReadFile(root, GAMES_DIR + '/' + name + '/game.conf');
    return (text === null) ? null : parseConf(text);
}

// The version of `name` recorded by a previous run, or null if it is not
// installed. Written by emloop_install_pack once unpacking succeeded.
async function readPackVersion(root, name) {
    try {
        const dir = await opfsGetDirectory(root, PACK_DB_DIR, false);
        const handle = await dir.getFileHandle(name + '.ver');
        return (await (await handle.getFile()).text()).trim();
    } catch (err) {
        return null;
    }
}

// Firefox creates files in persistent storage about ten times slower than
// other browsers do, and unpacking a game means creating thousands of them,
// which takes minutes. Firefox forks carry the same engine and the same cost,
// and they all say Firefox here.
function isFirefox() {
    return /Firefox\//.test(navigator.userAgent);
}

function getDefaultStorage() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("storage")) {
        // Persistent storage is unusably slow on Firefox, so nothing is kept
        // there unless the parameter below asks for it.
        return isFirefox() ? 'memory' : 'auto';
    }
    const storage = params.get("storage");
    if (storage != 'auto' && storage != 'memory') {
        alert(`Invalid storage parameter: ${storage}`);
        return 'auto';
    }
    return storage;
}

class LuantiLauncher {
    #storageProbe = null;

    // Games installed from a ZIP the player dropped on the page. Persistent
    // storage remembers these by the version recorded for the pack; this is
    // what carries one through a visit that is not storing anything.
    #localPacks = new Set();

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
        this.onexit = null; // function(status) when main() returns
        this.addedPacks = new Set();
        // pack name -> a promise settled once the module has unpacked it.
        this.packInstalls = new Map();
        // pack name -> a promise settled once the module has deleted it.
        this.packRemovals = new Map();
        // 'kind:name' -> a promise settled once the module has measured it.
        this.usageQueries = new Map();
        // world directory -> a promise settled once the module has deleted it.
        this.worldDeletions = new Map();
        // world directory -> a promise settled once the module has packed it.
        this.worldZips = new Map();
        // 'kind:name' -> a promise settled once the module has installed it
        // from a zip.
        this.zipInstalls = new Map();
        this.proxyUrl = "wss://luanti.dustlabs.io/proxy";
        this.packsDir = DEFAULT_PACKS_DIR;
        this.packsDirIsCors = false;
        this.conf = new Map();
        this.confOverrides = new Map();
        // 'auto' | 'memory'
        this.storageMode = getDefaultStorage();
        // Set once the OPFS probe finishes / once the wasm module has mounted.
        this.storageRoot = null;
        this.storageAvailable = false;
        this.storageActive = false;

        mtScheduler.addCondition("storageProbed");
        this.#storageProbe = this.#probeStorage();

        mtScheduler.addCondition("wasmReady", loadWasm);
        mtScheduler.addCondition("fsReady", initFs, ['wasmReady', 'storageProbed']);
        mtScheduler.addCondition("launch_called");
        mtScheduler.addCondition("ready", this.#notifyReady.bind(this), ['fsReady']);
        mtScheduler.addCondition("main_called", callMain, ['ready', 'launch_called']);
        this.addPack('base');
        this.addPack('certs');
    }

    async #probeStorage() {
        if (this.storageMode != 'memory') {
            this.storageRoot = await openStorageRoot();
            this.storageAvailable = (this.storageRoot !== null);
        }
        mtScheduler.setCondition("storageProbed");
    }

    // True once the wasm module has confirmed /luanti is backed by OPFS.
    // Only meaningful after 'onready'.
    isPersistent() {
        return this.storageActive;
    }

    // True once launch() has handed the page over to the game. Nothing can be
    // installed or removed after that: the module is running Luanti.
    isLaunched() {
        return mtScheduler.isSet("launch_called");
    }

    // The packs left in persistent storage by this or an earlier visit, as
    // [{name, version}] sorted by name. Empty without persistent storage,
    // since nothing outlives the page then.
    //
    // This waits for the module to mount /luanti, so it resolves no earlier
    // than 'onready'.
    async listInstalledPacks() {
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            return [];
        }
        return (await readInstalledPacks(this.storageRoot)) || [];
    }

    // The worlds saved in persistent storage, as [{dir, path, name, gameid}]
    // sorted by name. Empty without persistent storage, since a world made
    // then only lives as long as the page does.
    //
    // Like listInstalledPacks(), this resolves no earlier than 'onready'.
    async listWorlds() {
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            return [];
        }
        return await readWorlds(this.storageRoot);
    }

    // The language saved in minetest.conf, or null if there is none to read:
    // no persistent storage, no file yet, or a code this build does not have.
    //
    // Unlike listWorlds() this does not wait for the module to mount /luanti,
    // so that the page can fill in its language selector without waiting for
    // the wasm module to load. The file is whatever the last run left behind
    // either way, since mounting does not write it.
    async savedLang() {
        await this.#storageProbe;
        if (!this.storageAvailable) {
            return null;
        }
        const conf = await readSavedConf(this.storageRoot);
        const lang = conf ? conf.get('language') : null;
        // Luanti writes an empty value for "whatever the system says", which
        // is not something the selector can show.
        return (lang && SUPPORTED_LANGUAGES_MAP.has(lang)) ? lang : null;
    }

    // What a language selector on the page should start on: the language the
    // player last played in, so that a change made in-game is carried over,
    // and otherwise the default for this visit.
    //
    // A ?lang= parameter asks for a language for this visit specifically, so
    // it wins over what was saved.
    async initialLang() {
        if (!new URLSearchParams(window.location.search).has("lang")) {
            const saved = await this.savedLang();
            if (saved !== null) {
                return saved;
            }
        }
        return getDefaultLanguage();
    }

    // The version the current packs directory would install for `name`. A pack
    // recorded under a different version is out of date, and adding it again
    // replaces what is installed.
    availablePackVersion(name) {
        return packVersion(this.#packsDirFor(name) + '/' + name + '.pack');
    }

    // The directory `name` is served from.
    #packsDirFor(name) {
        return RELEASE_PACKS.has(name) ? DEFAULT_PACKS_DIR : this.packsDir;
    }

    // Take `name` back out of persistent storage: everything it installed is
    // deleted, and it stops counting as installed. Worlds and anything the
    // player installed themselves are not part of a pack, and stay.
    //
    // The module does the deleting, because /luanti is mounted there: deleting
    // underneath the mount from here would leave it still seeing the files.
    // How far along it is arrives through onprogress as `remove:<name>`.
    async removePack(name) {
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("Cannot remove packs after launch");
        }
        if (!validPackName(name)) {
            throw new Error(`Invalid pack name: ${name}`);
        }
        await this.#storageProbe;
        // Waiting on the mount also waits for the module to be callable.
        if (!this.storageAvailable || !(await mtFsActive)) {
            throw new Error("There is no persistent storage to remove from");
        }
        const removal = this.#packRemoval(name);
        const namePtr = stringToNewUTF8(name);
        emloop_remove_pack(namePtr);
        _free(namePtr);
        if (!(await removal.promise)) {
            throw new Error(`Could not remove ${name}`);
        }
        // Adding it again has to download and unpack it afresh, from the
        // server: a game that came from a zip is not there any more either.
        this.#localPacks.delete(name);
        this.addedPacks.delete(name);
        this.packInstalls.delete(name);
        mtScheduler.removeCondition("fetched:" + name);
        mtScheduler.removeCondition("installed:" + name);
    }

    // How much space `name` is taking up in persistent storage, in bytes, or
    // null if that cannot be told. `kind` is 'pack' for an installed pack,
    // which counts only what the pack itself laid down, or 'world' for a saved
    // world, which counts everything in it.
    //
    // The module does the adding up, on the worker that runs main(). Walking a
    // whole tree from the page would mean a round trip to the OPFS worker for
    // every single file, and the page would be sitting still throughout.
    async diskUsage(kind, name) {
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            return null;
        }
        // After launch the module is running the game and no longer answering.
        if (mtScheduler.isSet("launch_called")) {
            return null;
        }
        const key = `${kind}:${name}`;
        const existing = this.usageQueries.get(key);
        if (existing) {
            return existing.promise;
        }
        const entry = {};
        entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
        this.usageQueries.set(key, entry);
        const kindPtr = stringToNewUTF8(kind);
        const namePtr = stringToNewUTF8(name);
        emloop_disk_usage(kindPtr, namePtr);
        _free(kindPtr);
        _free(namePtr);
        return entry.promise;
    }

    // Internal. Called once the module has measured something.
    noteUsage(kind, name, bytes) {
        const key = `${kind}:${name}`;
        const entry = this.usageQueries.get(key);
        if (entry) {
            this.usageQueries.delete(key);
            entry.resolve(bytes);
        }
    }

    // Delete the saved world in the `dir` directory, and everything in it.
    // There is no undoing this, and no copy anywhere else.
    //
    // The module does the deleting, for the same reason it does the deleting
    // of a pack: /luanti is mounted there. How far along it is arrives through
    // onprogress as `delete:<dir>`.
    async deleteWorld(dir) {
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("Cannot delete worlds after launch");
        }
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            throw new Error("There is no persistent storage to delete from");
        }
        if (this.worldDeletions.has(dir)) {
            throw new Error(`Already deleting ${dir}`);
        }
        const entry = {};
        entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
        this.worldDeletions.set(dir, entry);
        const dirPtr = stringToNewUTF8(dir);
        emloop_delete_world(dirPtr);
        _free(dirPtr);
        if (!(await entry.promise)) {
            throw new Error(`Could not delete ${dir}`);
        }
    }

    // Internal. Called once the module is done deleting `dir`, with whether
    // there was anything there to delete.
    noteWorldDeleted(dir, ok) {
        const entry = this.worldDeletions.get(dir);
        if (entry) {
            this.worldDeletions.delete(dir);
            entry.resolve(ok);
        }
    }

    // Pack the saved world in the `dir` directory into a zip archive, and
    // resolve to it as a Blob for the page to hand to the player.
    //
    // Reading and compressing happen in the module, which is the only place
    // that can read the world without a round trip per file. How far along it
    // is arrives through onprogress as `zip:<dir>`.
    async zipWorld(dir) {
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("Cannot pack worlds after launch");
        }
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            throw new Error("There is no persistent storage to read from");
        }
        if (this.worldZips.has(dir)) {
            throw new Error(`Already packing ${dir}`);
        }
        const entry = {};
        entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
        this.worldZips.set(dir, entry);
        const dirPtr = stringToNewUTF8(dir);
        emloop_zip_world(dirPtr);
        _free(dirPtr);
        const blob = await entry.promise;
        if (!blob) {
            throw new Error(`Could not pack ${dir}`);
        }
        return blob;
    }

    // Internal. Called once the module is done packing `dir`, with the archive
    // or with null if it could not be made.
    noteWorldZipped(dir, blob) {
        const entry = this.worldZips.get(dir);
        if (entry) {
            this.worldZips.delete(dir);
            entry.resolve(blob);
        }
    }

    // What persistent storage holds for the game `name`, as {name, title}, or
    // null if there is no such game. A game the player installed from a zip of
    // their own has no catalog entry to be named from, so this is where the
    // page finds a name for it.
    async gameInfo(name) {
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            return null;
        }
        const conf = await readGameConf(this.storageRoot, name);
        if (!conf) {
            return null;
        }
        // "name" is what game.conf called the title before it was renamed, and
        // games old enough to still use it are the ones least likely to be in
        // the catalog.
        return {name: name, title: conf.get('title') || conf.get('name') || name};
    }

    // Whether persistent storage already holds a world directory called `dir`,
    // whether or not what is in it is a world Luanti would list. Installing
    // over one replaces everything in it, so what matters is that the
    // directory is taken, not that it holds a world worth keeping.
    async worldExists(dir) {
        await this.#storageProbe;
        if (!this.storageAvailable || !(await mtFsActive)) {
            return false;
        }
        try {
            await opfsGetDirectory(this.storageRoot, WORLDS_DIR + '/' + dir, false);
            return true;
        } catch (err) {
            return false;
        }
    }

    // Install a world or a game from a zip archive, replacing whatever is
    // installed under the same name: the old directory is deleted first, so
    // that files the old one had and the new one does not are not left behind
    // to be loaded alongside it.
    //
    // `kind` is 'world' or 'game'. `name` is the directory to install as, `dir`
    // for a world and the game's own folder name for a game. `prefix` is the
    // folder inside the archive that holds it, which is '' when the archive is
    // that folder itself. `count` is how many entries lie below that prefix,
    // which the progress reported along the way counts off. `data` is the
    // archive, as an ArrayBuffer or a typed array.
    //
    // A game is recorded as installed under LOCAL_PACK_VERSION, so that it is
    // listed, measured and uninstalled like a downloaded one, and never looked
    // for on the server.
    //
    // The module does the unpacking, for the same reason it does a pack's:
    // /luanti is mounted there, and unpacking from here would mean a round trip
    // to the worker that owns persistent storage for every file in the
    // archive. How far along it is arrives through onprogress as `wipe:<name>`
    // while what was there is cleared out, and `unzip:<name>` while the archive
    // is unpacked.
    async installZip(kind, name, prefix, count, data) {
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("Cannot install after launch");
        }
        if (kind != 'world' && kind != 'game') {
            throw new Error(`Invalid install kind: ${kind}`);
        }
        if (kind == 'game' && !validPackName(name)) {
            throw new Error(`Invalid game name: ${name}`);
        }
        await this.#storageProbe;
        // Waiting on the mount also waits for the module to be callable. This
        // works without persistent storage, where the install lasts as long as
        // the page does and no longer.
        await mtFsActive;
        const key = `${kind}:${name}`;
        if (this.zipInstalls.has(key)) {
            throw new Error(`Already installing ${name}`);
        }
        const bytes = (data instanceof Uint8Array) ? data : new Uint8Array(data);
        // The module takes ownership of this and frees it when it is done.
        const buf = _malloc(bytes.byteLength);
        if (!buf) {
            throw new Error(`Not enough memory to unpack ${name}`);
        }
        HEAPU8.set(bytes, buf);
        const entry = {};
        entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
        this.zipInstalls.set(key, entry);
        const kindPtr = stringToNewUTF8(kind);
        const namePtr = stringToNewUTF8(name);
        const prefixPtr = stringToNewUTF8(prefix);
        emloop_install_zip(kindPtr, namePtr, prefixPtr, count, buf, bytes.byteLength);
        _free(kindPtr);
        _free(namePtr);
        _free(prefixPtr);
        if (!(await entry.promise)) {
            throw new Error(`Could not install ${name}`);
        }
        if (kind == 'game') {
            this.#localPacks.add(name);
        }
    }

    // Internal. Called once the module is done installing from a zip, with
    // whether it worked.
    noteZipInstalled(kind, name, ok) {
        const key = `${kind}:${name}`;
        const entry = this.zipInstalls.get(key);
        if (entry) {
            this.zipInstalls.delete(key);
            entry.resolve(ok);
        }
    }

    // Ask the browser not to evict the saved worlds. Chrome decides silently
    // from site engagement; Firefox prompts, so call this from a click handler.
    async requestPersistence() {
        if (!navigator.storage || !navigator.storage.persist) {
            return false;
        }
        try {
            return await navigator.storage.persist();
        } catch (err) {
            return false;
        }
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

    // Set a key/value pair in minetest.conf
    // Overrides previous values of the same key.
    //
    // These are applied as defaults: with persistent storage a key the player
    // has since changed in-game keeps its saved value.
    setConf(key, value) {
        const [k, v] = confPair(key, value);
        this.conf.set(k, v);
    }

    // Set a key/value pair in minetest.conf, replacing what is saved there.
    //
    // For the settings the launcher is the authority on rather than the
    // player, such as which game the main menu should open with.
    overrideConf(key, value) {
        const [k, v] = confPair(key, value);
        this.confOverrides.set(k, v);
    }

    #renderConf(conf) {
        let lines = [];
        for (const [k, v] of conf.entries()) {
            lines.push(`${k} = ${v}\n`);
        }
        return lines.join('');
    }

    // Sets language in minetest.conf
    setLang(lang) {
        if (!SUPPORTED_LANGUAGES_MAP.has(lang)) {
            alert(`Invalid code in setLang: ${lang}`);
        }
        this.overrideConf("language", lang);
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

    // The promise for `name`, created on first use. Settled by
    // notePackInstalled() once the pack is usable.
    #packInstall(name) {
        let entry = this.packInstalls.get(name);
        if (!entry) {
            entry = {};
            entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
            this.packInstalls.set(name, entry);
        }
        return entry;
    }

    // Internal. Called once `name` has been unpacked, or once it turned out
    // that persistent storage already holds it.
    notePackInstalled(name) {
        this.#packInstall(name).resolve();
    }

    // The promise for the removal of `name`, created when one is asked for.
    // Unlike an install, a pack can be removed more than once, so the promise
    // only lasts as long as the removal it belongs to.
    #packRemoval(name) {
        const entry = {};
        entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
        this.packRemovals.set(name, entry);
        return entry;
    }

    // Internal. Called once the module is done deleting `name`, with whether
    // there was anything there to delete.
    notePackRemoved(name, ok) {
        const entry = this.packRemovals.get(name);
        if (entry) {
            this.packRemovals.delete(name);
            entry.resolve(ok);
        }
    }

    // Download `name` and unpack it into /luanti. With persistent storage a
    // pack that is already there is left alone and not downloaded again.
    //
    // Resolves once the pack is installed and ready to be used, and rejects if
    // it could not be downloaded.
    async addPack(name) {
        if (mtScheduler.isSet("launch_called")) {
            throw new Error("Cannot add packs after launch");
        }
        if (this.addedPacks.has(name))
            return this.#packInstall(name).promise;
        if (!validPackName(name)) {
            throw new Error(`Invalid pack name: ${name}`);
        }
        this.addedPacks.add(name);
        const installDone = this.#packInstall(name).promise;

        const fetchedCond = "fetched:" + name;
        const installedCond = "installed:" + name;
        const packUrl = this.#packsDirFor(name) + '/' + name + '.pack';
        // A release pack is served from the page's own origin.
        const isCors = this.packsDirIsCors && !RELEASE_PACKS.has(name);
        // A pack recorded under this version in persistent storage is
        // already unpacked, and is left alone.
        const version = VOLATILE_PACKS.has(name) ? '' : this.availablePackVersion(name);

        let chunks = [];
        let received = 0;
        let alreadyInstalled = false;
        // This is done here instead of at the bottom, because it needs to
        // be delayed until after the 'fsReady' condition.
        // TODO: Add the ability to `await` a condition instead.
        const installPack = () => {
            if (alreadyInstalled) {
                mtScheduler.setCondition(installedCond);
                if (this.onprogress) {
                    this.onprogress(`download:${name}`, 1.0);
                    this.onprogress(`install:${name}`, 1.0);
                }
                // The module is never asked to unpack it, so it will not be
                // the one to report the pack as installed.
                this.notePackInstalled(name);
                return;
            }
            // Install
            const data = _malloc(received);
            let offset = 0;
            for (const arr of chunks) {
                HEAPU8.set(arr, data + offset);
                offset += arr.byteLength;
            }
            chunks = [];
            if (this.onprogress) {
                this.onprogress(`download:${name}`, 1.0);
                this.onprogress(`install:${name}`, 0.0);
            }
            const namePtr = stringToNewUTF8(name);
            const versionPtr = stringToNewUTF8(version);
            // Takes ownership of `data`. Unpacking happens on the worker that
            // runs main(), and reports back through emloop_pack_installed().
            emloop_install_pack(namePtr, versionPtr, data, received);
            _free(namePtr);
            _free(versionPtr);
            mtScheduler.setCondition(installedCond);
        };
        mtScheduler.addCondition(fetchedCond, null);
        mtScheduler.addCondition(installedCond, installPack, ["fsReady", fetchedCond]);
        mtScheduler.addDep("main_called", installedCond);

        // A game the player installed from a zip of their own is in place
        // already and is served from nowhere, so there is nothing to fetch.
        if (this.#localPacks.has(name)) {
            consolePrint(`Pack ${name} was installed from a zip`);
            alreadyInstalled = true;
            mtScheduler.setCondition(fetchedCond);
            return installDone;
        }
        if (version) {
            await this.#storageProbe;
            // Only trust what the probe found once the module has confirmed
            // that it really did mount OPFS at /luanti.
            const installed = (this.storageAvailable && await mtFsActive)
                ? await readPackVersion(this.storageRoot, name) : null;
            // What a previous visit installed from a zip, which is remembered
            // the same way but has no version to compare against.
            if (installed === LOCAL_PACK_VERSION) {
                consolePrint(`Pack ${name} was installed from a zip`);
                this.#localPacks.add(name);
                alreadyInstalled = true;
                mtScheduler.setCondition(fetchedCond);
                return installDone;
            }
            if (installed !== null && installed === version) {
                consolePrint(`Pack ${name} is already installed`);
                alreadyInstalled = true;
                mtScheduler.setCondition(fetchedCond);
                return installDone;
            }
        }

        let resp;
        try {
            resp = await fetch(packUrl, isCors ? { credentials: 'omit' } : {});
            if (!resp.ok) {
                // Whatever the server sent instead is not a pack.
                throw new Error(`${packUrl}: HTTP ${resp.status}`);
            }
        } catch (err) {
            // Leave nothing waiting on a pack that is not coming, so that the
            // rest of the page keeps working and adding it again retries.
            this.addedPacks.delete(name);
            mtScheduler.removeCondition(fetchedCond);
            mtScheduler.removeCondition(installedCond);
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
        return installDone;
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
        if (this.storageActive) {
            // Without this the saved worlds are only kept on a best-effort
            // basis and the browser may evict them. launch() is called from a
            // user gesture, which is the right moment for the permission
            // prompt Firefox shows here.
            this.requestPersistence();
        }
        // A server has no game window, so the page shows a terminal where the
        // canvas would have been. activateBody() reads this.
        terminalMode = this.args.server;
        if (terminalMode) {
            // What the page has printed up to here. From this point on the
            // module prints to the terminal itself.
            terminalWrite(consoleText.join(''));
        }
        activateBody();
        fixGeometry();
        if (terminalMode) {
            startTerminal().catch((err) => {
                consolePrint(`Could not start the terminal: ${err.message}`);
            });
        }
        if (this.conf.size > 0 || this.confOverrides.size > 0) {
            const defaults = this.#renderConf(this.conf);
            const overrides = this.#renderConf(this.confOverrides);
            console.log("minetest.conf defaults: ", defaults);
            console.log("minetest.conf overrides: ", overrides);
            const defaultsBuf = stringToNewUTF8(defaults);
            const overridesBuf = stringToNewUTF8(overrides);
            emloop_set_conf(defaultsBuf, overridesBuf);
            _free(defaultsBuf);
            _free(overridesBuf);
        }
        // Setup emsocket
        // TODO: emsocket should export the helpers for this
        emsocket_init();
        emsocketStarted = true;
        const proxyBuf = stringToNewUTF8(this.proxyUrl);
        emsocket_set_proxy(proxyBuf);
        _free(proxyBuf);
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

// The default for this visit, worked out once: the pages ask for it more than
// once now, and a bad ?lang= parameter is only worth complaining about once.
let defaultLanguage = null;

function getDefaultLanguage() {
    if (defaultLanguage === null) {
        defaultLanguage = findDefaultLanguage();
    }
    return defaultLanguage;
}

function findDefaultLanguage() {
    const url_params = new URLSearchParams(window.location.search);
    if (url_params.has("lang")) {
        const lang = url_params.get("lang");
        if (SUPPORTED_LANGUAGES_MAP.has(lang)) {
            return lang;
        }
        alert(`Invalid lang parameter: ${lang}`);
        return 'en';
    }

    const fuzzy = [];
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
