import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// @react-three/fiber's <Canvas> uses react-use-measure internally, which
// requires a real ResizeObserver - jsdom does not implement one. A
// minimal no-op polyfill is sufficient for tests (we don't rely on real
// resize events, only on the Canvas being able to mount at all).
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

// React 19's testing utilities require this flag to be explicitly set for
// act(...) batching to work correctly outside of react-dom's own test
// environment detection (used by @react-three/test-renderer, which drives
// its own React root).
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
