const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const timers = new Map();
  const listeners = new Map();
  const viewportListeners = new Map();
  const scrolls = [];
  let nextTimer = 0;
  const container = {
    scrollTop: 200,
    getBoundingClientRect: () => ({ top: 8, bottom: 400 }),
    scrollTo({ top }) { scrolls.push(top); this.scrollTop = top; }
  };
  const field = { scrollIntoView() { scrolls.push("all ancestors"); } };
  const control = {
    matches: selector => selector.startsWith(".modal-card input"),
    closest: selector => selector === ".modal-card" ? container : selector === "[data-modal-scroll]" ? null : field,
    getBoundingClientRect: () => ({ top: 290, bottom: 334 })
  };
  const document = {
    activeElement: control,
    body: { scrollTop: 0, classList: { add() {}, remove() {}, toggle() {} } },
    documentElement: { scrollTop: 0, style: { setProperty() {} } },
    querySelector: () => null,
    addEventListener: (type, fn) => listeners.set(type, fn)
  };
  const window = {
    innerHeight: 800,
    scrollY: 0,
    visualViewport: {
      height: 400, offsetTop: 0,
      addEventListener: (type, fn) => viewportListeners.set(type, fn)
    },
    addEventListener() {},
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    scrollTo: () => scrolls.push("outer page reset")
  };
  const context = vm.createContext({
    window, document, console, navigator: {},
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    isRestoringScroll: false, scrollActivityTimer: null, scrollSaveTimer: null
  });
  for (const name of ["core", "browser-runtime"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${name}.js`), "utf8"), context);
  }
  vm.runInContext("installModalKeyboardFocusGuards()", context);
  return {
    context, control, container, scrolls, listeners, viewportListeners, window, document,
    run: code => vm.runInContext(code, context),
    flush() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(fn => fn());
    }
  };
}

test("visible activity inputs do not move any scroll container on focus", () => {
  const f = fixture();
  f.listeners.get("focusin")({ target: f.control });
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("obscured inputs move only the modal by the minimum needed above the keyboard", () => {
  const f = fixture();
  f.control.getBoundingClientRect = () => ({ top: 500, bottom: 544 });
  f.run("scrollFocusedModalControlIntoView(document.activeElement, 0)");
  f.flush();
  assert.deepEqual(f.scrolls, [360]);
});

test("viewport panning never recentres the old activity input", () => {
  const f = fixture();
  f.control.getBoundingClientRect = () => ({ top: -100, bottom: -56 });
  f.viewportListeners.get("scroll")();
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("touching or scrolling cancels focus timers even when Safari retains the old focus", () => {
  for (const type of ["pointerdown", "touchstart", "touchmove", "wheel"]) {
    const f = fixture();
    f.control.getBoundingClientRect = () => ({ top: -100, bottom: -56 });
    f.listeners.get("focusin")({ target: f.control });
    f.listeners.get(type)?.({ target: {} });
    f.viewportListeners.get("resize")();
    f.flush();
    assert.deepEqual(f.scrolls, [], type);
  }
});

test("a newly focused input re-enables keyboard visibility after a manual scroll", () => {
  const f = fixture();
  f.listeners.get("touchstart")?.({ target: {} });
  f.control.getBoundingClientRect = () => ({ top: 500, bottom: 544 });
  f.listeners.get("focusin")({ target: f.control });
  // The real input moves with its modal scroll, so subsequent callbacks are no-ops.
  f.container.scrollTo = ({ top }) => {
    f.scrolls.push(top);
    f.container.scrollTop = top;
    f.control.getBoundingClientRect = () => ({ top: 340, bottom: 384 });
  };
  f.flush();
  assert.deepEqual(f.scrolls, [360]);
});

test("saving scroll position must not reset the browser's keyboard pan", () => {
  const f = fixture();
  f.window.scrollY = 120;
  f.run("queueScrollSave()");
  assert.deepEqual(f.scrolls, []);
});

test("focus callbacks for a removed activity modal cannot scroll its replacement", () => {
  const f = fixture();
  f.listeners.get("focusin")({ target: f.control });
  f.control.isConnected = false;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("nested modal fields reveal within their own list, not the modal or page", () => {
  const f = fixture();
  const list = {
    scrollTop: 50,
    getBoundingClientRect: () => ({ top: 200, bottom: 350 }),
    scrollTo: ({ top }) => f.scrolls.push(top)
  };
  f.control.closest = selector => selector === ".modal-card" ? f.container : list;
  f.control.getBoundingClientRect = () => ({ top: 360, bottom: 404 });
  f.run("scrollFocusedModalControlIntoView(document.activeElement, 0)");
  f.flush();
  assert.deepEqual(f.scrolls, [120]);
  assert.equal(f.container.scrollTop, 200);
});

test("keyboard visibility accounts for a panned visual viewport", () => {
  const f = fixture();
  f.window.visualViewport.offsetTop = 100;
  f.container.getBoundingClientRect = () => ({ top: 108, bottom: 492 });
  f.control.getBoundingClientRect = () => ({ top: 500, bottom: 544 });
  f.run("scrollFocusedModalControlIntoView(document.activeElement, 0)");
  f.flush();
  assert.deepEqual(f.scrolls, [268]);
});

test("oversized text areas spanning the visible region must not oscillate", () => {
  const f = fixture();
  f.control.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
  f.listeners.get("focusin")({ target: f.control });
  f.flush();
  assert.deepEqual(f.scrolls, []);
});
