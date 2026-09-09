'use strict';

// Holds the lock that keeps two windows from running Luanti out of the same
// persistent storage at once. See StorageLock in launcher.js.
//
// The lock is an exclusive sync access handle, and those can only be opened
// from a worker, which is why this script exists.
//
// The handle is released when this worker is closed, reloaded, or killed.

let handle = null;

// Opens the lock file, creating it and the directories above it if this is the
// first run, and takes the handle that is the lock.
async function lock(path) {
    if (handle) {
        return;
    }
    const parts = path.split('/');
    const name = parts.pop();
    let dir = await navigator.storage.getDirectory();
    for (const part of parts) {
        if (part) {
            dir = await dir.getDirectoryHandle(part, { create: true });
        }
    }
    const file = await dir.getFileHandle(name, { create: true });
    handle = await file.createSyncAccessHandle();
}

onmessage = async (event) => {
    const msg = event.data;
    if (msg.cmd == 'lock') {
        try {
            await lock(msg.path);
            postMessage({ cmd: 'lock', ok: true });
        } catch (err) {
            // NoModificationAllowedError is another window holding it.
            postMessage({ cmd: 'lock', ok: false, error: err.name });
        }
        return;
    }
    if (msg.cmd == 'unlock') {
        if (handle) {
            try {
                handle.close();
            } catch (err) {
                // Nothing to be done, and the handle goes when this worker does.
            }
            handle = null;
        }
        postMessage({ cmd: 'unlock', ok: true });
    }
};
