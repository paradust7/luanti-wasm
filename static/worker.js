var Module = typeof Module != "undefined" ? Module : {};

function workerPrint(text) {
    console.log(text);
    try {
        postMessage({ luantiLog: `${text}` });
    } catch (e) {
        // The line still reached the javascript console.
    }
}

Module['print'] = workerPrint;
Module['printErr'] = workerPrint;

importScripts('luanti.js');
