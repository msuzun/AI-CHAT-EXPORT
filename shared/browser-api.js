// Firefox's browser namespace returns promises; Chromium exposes them on chrome.
if (typeof globalThis.browser !== 'undefined') {
  globalThis.Ext = globalThis.browser;
} else {
  globalThis.Ext = globalThis.chrome;
}
