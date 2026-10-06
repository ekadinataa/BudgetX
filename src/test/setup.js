import '@testing-library/jest-dom'

// Node 25+ exposes an unavailable native localStorage; tests need jsdom's storage.
if (globalThis.jsdom) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: globalThis.jsdom.window.localStorage })
}
