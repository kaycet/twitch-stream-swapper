import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the Options page's general autosave, driven through a minimal
 * DOM stub.
 *
 * options.js had no coverage at all, which is how two wiring bugs shipped:
 *
 * 1. Binding a managed tab only on the off->on transition. A stored
 *    redirectEnabled of true with a null managedTwitchTabId (tab creation
 *    blocked, or an upgrade from a build predating the field) is never
 *    repaired from here, and the background worker's missing-tab check is
 *    gated on `managedTwitchTabId != null` so it never notices either.
 *    Auto-Swap reads "ON" and does nothing until the popup is next opened.
 *
 * 2. Awaiting that binding BEFORE the settings write. On the pagehide flush
 *    the document is already going away, chrome.tabs callbacks never fire,
 *    and the whole save was lost — not just the binding. That is the exact
 *    dropped-save flushPendingAutoSave() exists to prevent.
 */

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function makeElement(id) {
  const handlers = new Map();
  return {
    id,
    value: '',
    checked: false,
    textContent: '',
    href: '',
    disabled: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    // Test-only: run the page's own listeners, so autosave is scheduled by
    // the real code path rather than poked at directly.
    fire(type, event = {}) {
      for (const fn of handlers.get(type) || []) fn({ target: this, ...event });
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function makeDom() {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const document = {
    getElementById: (id) => get(id),
    querySelectorAll: () => [],
    createElement: (tag) => ({ ...makeElement(tag), dataset: {} }),
    addEventListener() {},
    body: { className: '' },
    head: { appendChild() {} },
    documentElement: { style: { setProperty() {}, removeProperty() {} } },
    activeElement: null,
  };
  return { document, elements, get };
}

function makeChrome(store) {
  const storageListeners = [];
  return {
    chrome: {
      runtime: { lastError: null, onMessage: { addListener() {} }, sendMessage: async () => ({}) },
      storage: {
        local: {
          async get(keys) {
            const out = {};
            for (const key of (Array.isArray(keys) ? keys : [keys])) {
              if (store.has(key)) out[key] = clone(store.get(key));
            }
            return out;
          },
          async set(items) {
            const changes = {};
            for (const [key, value] of Object.entries(items)) {
              changes[key] = { oldValue: clone(store.get(key)), newValue: clone(value) };
              store.set(key, clone(value));
            }
            for (const fn of storageListeners) fn(changes, 'local');
          },
          async remove() {},
        },
        onChanged: { addListener: (fn) => storageListeners.push(fn) },
      },
      tabs: {
        query: vi.fn((_query, cb) => cb([])),
        create: vi.fn((_opts, cb) => cb({ id: 77 })),
      },
    },
  };
}

describe('Options general autosave', () => {
  let store;
  let dom;
  let pagehide;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  async function boot(settings) {
    vi.resetModules();
    store = new Map();
    store.set('settings', settings);

    dom = makeDom();
    globalThis.document = dom.document;
    globalThis.confirm = () => true;
    globalThis.alert = () => {};
    globalThis.window = {
      addEventListener: (type, fn) => { if (type === 'pagehide') pagehide = fn; },
    };
    globalThis.chrome = makeChrome(store).chrome;

    const api = (await import('../utils/twitch-api.js')).default;
    api.initialize = async () => {};
    api.getCategoryId = async () => 'id';

    await import('../options.js');
    await settle();

    // Mirror the stored settings into the form, the way render() does for a
    // real page, so autosave reads back what is actually persisted.
    const stored = store.get('settings');
    dom.get('checkInterval').value = String(stored.checkInterval);
    dom.get('redirectEnabled').checked = !!stored.redirectEnabled;
    dom.get('promptBeforeSwitch').checked = !!stored.promptBeforeSwitch;
    dom.get('fallbackEnabled').checked = !!stored.fallbackCategory;
    dom.get('fallbackCategory').value = stored.fallbackCategory || '';
    dom.get('notificationsEnabled').checked = !!stored.notificationsEnabled;
    dom.get('quietHoursEnabled').checked = !!stored.quietHours?.enabled;
    dom.get('quietHoursStart').value = stored.quietHours?.start || '22:00';
    dom.get('quietHoursEnd').value = stored.quietHours?.end || '08:00';
    dom.get('theme').value = stored.theme || 'default';
  }

  const baseSettings = (over = {}) => ({
    checkInterval: 60000,
    redirectEnabled: false,
    promptBeforeSwitch: false,
    fallbackCategory: '',
    notificationsEnabled: true,
    quietHours: { enabled: false, start: '22:00', end: '08:00' },
    theme: 'default',
    customTheme: {},
    premiumStatus: false,
    clientId: '',
    managedTwitchTabId: null,
    ...over,
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.chrome;
    delete globalThis.confirm;
    delete globalThis.alert;
    pagehide = undefined;
  });

  beforeEach(() => {
    pagehide = undefined;
  });

  it('binds a managed tab when Auto-Swap is switched on', async () => {
    await boot(baseSettings());

    dom.get('redirectEnabled').checked = true;
    dom.get('redirectEnabled').fire('change');
    pagehide();
    await settle();

    expect(store.get('settings').redirectEnabled).toBe(true);
    expect(store.get('settings').managedTwitchTabId).toBe(77);
  });

  it('repairs an enabled Auto-Swap that has no managed tab', async () => {
    // redirectEnabled true with a null binding: reachable when
    // pickManagedTwitchTabId() returned null, or on upgrade from a build
    // that predates managedTwitchTabId.
    await boot(baseSettings({ redirectEnabled: true, managedTwitchTabId: null }));

    // Autosave for an unrelated control — Auto-Swap itself does not move.
    dom.get('checkInterval').value = '300000';
    dom.get('checkInterval').fire('change');
    pagehide();
    await settle();

    expect(store.get('settings').checkInterval).toBe(300000);
    expect(store.get('settings').redirectEnabled).toBe(true);
    expect(store.get('settings').managedTwitchTabId).toBe(77);
  });

  it('leaves an existing binding alone', async () => {
    await boot(baseSettings({ redirectEnabled: true, managedTwitchTabId: 42 }));

    dom.get('checkInterval').value = '120000';
    dom.get('checkInterval').fire('change');
    pagehide();
    await settle();

    expect(store.get('settings').managedTwitchTabId).toBe(42);
    expect(globalThis.chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('unbinds when Auto-Swap is switched off', async () => {
    await boot(baseSettings({ redirectEnabled: true, managedTwitchTabId: 42 }));

    dom.get('redirectEnabled').checked = false;
    dom.get('redirectEnabled').fire('change');
    pagehide();
    await settle();

    expect(store.get('settings').redirectEnabled).toBe(false);
    expect(store.get('settings').managedTwitchTabId).toBe(null);
  });

  it('still persists the form when the tab binding never resolves', async () => {
    await boot(baseSettings());

    // The pagehide case: the document is going away, so chrome.tabs
    // callbacks never fire. The settings write must not be queued behind
    // them.
    globalThis.chrome.tabs.query.mockImplementation(() => {});
    globalThis.chrome.tabs.create.mockImplementation(() => {});

    dom.get('redirectEnabled').checked = true;
    dom.get('checkInterval').value = '600000';
    dom.get('redirectEnabled').fire('change');
    pagehide();
    await settle();

    expect(store.get('settings').redirectEnabled).toBe(true);
    expect(store.get('settings').checkInterval).toBe(600000);
  });
});
