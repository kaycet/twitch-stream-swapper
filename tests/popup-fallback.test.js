import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the popup's category-fallback save, behind a minimal DOM stub.
 *
 * saveFallbackCategory() skips a write when the value has not changed --
 * every settings save restarts background polling, and typing Enter in the
 * input fires a save and then the same value's 'change' event on blur. It
 * returns false on that path so callers can skip their "updated" toast.
 *
 * Two of the three toast call sites were wired to that return value; the
 * Apply button was not, so it reported "Category fallback updated" after
 * doing nothing. Nothing covered any of the three.
 */

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function makeElement(id) {
  const handlers = new Map();
  return {
    id,
    value: '',
    checked: false,
    textContent: '',
    className: '',
    href: '',
    disabled: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    fire(type, event = {}) {
      const calls = (handlers.get(type) || []).map((fn) => fn({
        target: this,
        preventDefault() {},
        ...event,
      }));
      return Promise.all(calls);
    },
    focus() {},
    appendChild() {},
    removeChild() {},
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
  return {
    get,
    document: {
      getElementById: (id) => get(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag) => makeElement(tag),
      addEventListener() {},
      body: { className: '', appendChild() {} },
      head: { appendChild() {} },
      documentElement: { style: { setProperty() {}, removeProperty() {} } },
      activeElement: null,
    },
  };
}

describe('popup category fallback', () => {
  let store;
  let dom;
  let sent;

  const settle = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };

  async function boot(fallbackCategory) {
    vi.resetModules();
    store = new Map();
    sent = [];
    store.set('settings', {
      clientId: 'test-client-id',
      redirectEnabled: false,
      fallbackCategory,
      managedTwitchTabId: null,
      premiumStatus: false,
      stayOnRaid: true,
    });
    store.set('streams', []);

    dom = makeDom();
    globalThis.document = dom.document;
    globalThis.window = { addEventListener() {} };
    globalThis.confirm = () => true;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: async (msg) => { sent.push(msg); return {}; },
        onMessage: { addListener() {} },
      },
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
            for (const fn of (globalThis.chrome.storage.onChanged._fns || [])) fn(changes, 'local');
          },
          async remove() {},
        },
        onChanged: {
          _fns: [],
          addListener(fn) { this._fns.push(fn); },
        },
      },
      tabs: { query: (_q, cb) => cb([]), create: (_o, cb) => cb({ id: 5 }), get: (id, cb) => cb({ id }), update: (id, _p, cb) => cb({ id }) },
      windows: { update: (_i, _p, cb) => cb() },
    };

    const api = (await import('../utils/twitch-api.js')).default;
    api.initialize = async () => {};
    api.checkStreamsStatus = async () => ({});
    api.searchCategories = async () => [];

    await import('../popup.js');
    await settle();
  }

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.chrome;
    delete globalThis.confirm;
  });

  beforeEach(() => { sent = []; });

  const toast = () => dom.get('statusMessage').textContent;
  const setsSinceBoot = () => store.get('settings').fallbackCategory;

  it('Apply saves a new category and says so', async () => {
    await boot('');
    dom.get('fallbackCategoryInput').value = 'Art';

    await dom.get('fallbackApplyBtn').fire('click');
    await settle();

    expect(setsSinceBoot()).toBe('Art');
    expect(toast()).toBe('Category fallback updated');
  });

  it('Apply does not claim a save when the category is unchanged', async () => {
    await boot('Art');
    dom.get('fallbackCategoryInput').value = 'Art';

    const setSpy = vi.spyOn(globalThis.chrome.storage.local, 'set');
    await dom.get('fallbackApplyBtn').fire('click');
    await settle();

    const wroteSettings = setSpy.mock.calls.some(([items]) => 'settings' in items);
    expect(wroteSettings).toBe(false);
    expect(toast()).toBe('');
    setSpy.mockRestore();
  });

  it('Enter then the blur change event saves once and toasts once', async () => {
    await boot('');
    dom.get('fallbackCategoryInput').value = 'Chess';

    await dom.get('fallbackCategoryInput').fire('keydown', { key: 'Enter' });
    await settle();
    expect(setsSinceBoot()).toBe('Chess');
    expect(toast()).toBe('Category fallback updated');

    // Blur fires 'change' with the value Enter just persisted. Without the
    // no-op guard this saved again and restarted background polling.
    dom.get('statusMessage').textContent = '';
    const setSpy = vi.spyOn(globalThis.chrome.storage.local, 'set');
    await dom.get('fallbackCategoryInput').fire('change');
    await settle();

    expect(setSpy.mock.calls.some(([items]) => 'settings' in items)).toBe(false);
    expect(toast()).toBe('');
    setSpy.mockRestore();
  });

  it('an empty value neither saves nor toasts', async () => {
    await boot('Art');
    dom.get('fallbackCategoryInput').value = '   ';

    await dom.get('fallbackApplyBtn').fire('click');
    await settle();

    expect(setsSinceBoot()).toBe('Art');
    expect(toast()).toBe('Type a category name');
  });
});
