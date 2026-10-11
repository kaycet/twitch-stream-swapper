import { describe, expect, it } from 'vitest';
import { changedSettingKeys, OPTIONS_FORM_KEYS } from '../utils/settings-sync.js';

/**
 * Tests for utils/settings-sync.js — the diff the Options page uses to
 * re-sync form controls after an external settings write. Without it, a
 * change made in the popup (or by the background worker) while Options was
 * open went stale in the form, and the next general autosave wrote the
 * stale values back — e.g. enabling Auto-Swap in the popup, then changing
 * the check interval in Options, silently turned Auto-Swap off again.
 */

const baseSettings = () => ({
  checkInterval: 60000,
  redirectEnabled: false,
  promptBeforeSwitch: false,
  fallbackCategory: 'Just Chatting',
  notificationsEnabled: false,
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  theme: 'default',
  customTheme: { accent: '#9147FF', bg: '#0E0E10' },
  premiumStatus: false,
  clientId: '',
  managedTwitchTabId: null,
});

describe('changedSettingKeys', () => {
  it('reports a flipped boolean field', () => {
    const prev = baseSettings();
    const next = { ...baseSettings(), redirectEnabled: true };
    expect(changedSettingKeys(prev, next)).toEqual(['redirectEnabled']);
  });

  it('reports nothing when values are equal, including rebuilt objects', () => {
    // Fresh objects with equal content: the page's own save produces exactly
    // this shape, and it must not count as an external change.
    expect(changedSettingKeys(baseSettings(), baseSettings())).toEqual([]);
  });

  it('compares nested objects by content', () => {
    const prev = baseSettings();
    const next = {
      ...baseSettings(),
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
    };
    expect(changedSettingKeys(prev, next)).toEqual(['quietHours']);
  });

  it('ignores fields outside the watched set', () => {
    const prev = baseSettings();
    // The popup binds a managed tab when enabling Auto-Swap; only the
    // rendered field should be reported, not the tab id.
    const next = { ...baseSettings(), managedTwitchTabId: 42, clientId: 'abcdef123456' };
    expect(changedSettingKeys(prev, next)).toEqual([]);
  });

  it('reports multiple changed fields in watched-key order', () => {
    const prev = baseSettings();
    const next = {
      ...baseSettings(),
      premiumStatus: true,
      fallbackCategory: '',
      theme: 'midnight',
    };
    expect(changedSettingKeys(prev, next)).toEqual(['fallbackCategory', 'theme', 'premiumStatus']);
  });

  it('handles a missing previous snapshot', () => {
    const next = { ...baseSettings(), redirectEnabled: true };
    const changed = changedSettingKeys(null, next);
    // Every watched key present in `next` differs from "nothing known yet"…
    expect(changed).toContain('redirectEnabled');
    expect(changed).toContain('checkInterval');
    // …but unwatched keys still never appear.
    expect(changed).not.toContain('managedTwitchTabId');
  });

  it('skips watched keys absent from the incoming settings', () => {
    const prev = baseSettings();
    expect(changedSettingKeys(prev, { redirectEnabled: false }, OPTIONS_FORM_KEYS)).toEqual([]);
    expect(changedSettingKeys(prev, { redirectEnabled: true }, OPTIONS_FORM_KEYS)).toEqual(['redirectEnabled']);
  });
});
