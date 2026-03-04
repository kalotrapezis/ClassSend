// Polyfill wrapper for pdf.worker.mjs
// PDF.js v5 uses newer JS APIs inside the worker thread. These do NOT inherit
// from the main thread, so each polyfill must be applied here before the real
// worker module is loaded.

if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

if (typeof Promise.try === 'undefined') {
  Promise.try = function (fn) {
    return new Promise((resolve, reject) => {
      try { resolve(fn()); } catch (e) { reject(e); }
    });
  };
}

if (typeof Map.prototype.getOrInsertComputed === 'undefined') {
  Map.prototype.getOrInsertComputed = function (key, computeFn) {
    if (!this.has(key)) this.set(key, computeFn(key));
    return this.get(key);
  };
}

if (typeof URL.parse === 'undefined') {
  URL.parse = function (url, base) {
    try { return new URL(url, base); } catch (e) { return null; }
  };
}

// Load the real worker after polyfills are in place.
// Top-level await ensures polyfills are applied before pdf.worker.mjs runs.
await import('./pdf.worker.mjs');
