import { describe, expect, it } from 'vitest';

import { shouldRerollCategoryFallback, applyFallbackPatch } from '../utils/fallback-mode.js';

describe('shouldRerollCategoryFallback', () => {
  it('rerolls when forced', () => {
    expect(shouldRerollCategoryFallback({
      force: true,
      isFallbackActive: true,
      currentChannel: 'somechannel',
      runtimeCategory: 'Just Chatting',
      settingsCategory: 'Just Chatting',
    })).toBe(true);
  });

  it('does not reroll on each poll when already in fallback on a channel page', () => {
    expect(shouldRerollCategoryFallback({
      force: false,
      isFallbackActive: true,
      currentChannel: 'somechannel',
      runtimeCategory: 'Just Chatting',
      settingsCategory: 'Just Chatting',
    })).toBe(false);
  });

  it('rerolls if the configured category changed', () => {
    expect(shouldRerollCategoryFallback({
      force: false,
      isFallbackActive: true,
      currentChannel: 'somechannel',
      runtimeCategory: 'Just Chatting',
      settingsCategory: 'Fortnite',
    })).toBe(true);
  });

  it('rerolls when not in fallback', () => {
    expect(shouldRerollCategoryFallback({
      force: false,
      isFallbackActive: false,
      currentChannel: 'somechannel',
      runtimeCategory: null,
      settingsCategory: 'Just Chatting',
    })).toBe(true);
  });

  it('rerolls when in fallback but not on a channel page (e.g. directory/home)', () => {
    expect(shouldRerollCategoryFallback({
      force: false,
      isFallbackActive: true,
      currentChannel: null,
      runtimeCategory: 'Just Chatting',
      settingsCategory: 'Just Chatting',
    })).toBe(true);
  });
});

/**
 * applyFallbackPatch backs setFallbackRuntime's "skip no-op writes" check.
 * In the steady state (a list stream is live, or fallback is parked on a
 * channel) the worker re-applied identical state every poll, and each write
 * fired storage.onChanged in every context once per poll, forever.
 */
describe('applyFallbackPatch', () => {
  const base = () => ({
    active: true,
    category: 'Just Chatting',
    username: 'somechannel',
    reason: 'auto',
    updatedAt: 123,
  });

  it('reports changed=false when the patch re-applies current state', () => {
    const { changed } = applyFallbackPatch(base(), {
      active: true,
      category: 'Just Chatting',
      username: 'somechannel',
      reason: 'auto',
    });
    expect(changed).toBe(false);
  });

  it('reports changed=false for the repeated deactivate of an already-inactive state', () => {
    const inactive = { ...base(), active: false };
    expect(applyFallbackPatch(inactive, { active: false }).changed).toBe(false);
  });

  it('reports a flipped active flag', () => {
    const { fallback, changed } = applyFallbackPatch(base(), { active: false });
    expect(changed).toBe(true);
    expect(fallback.active).toBe(false);
    // Untouched fields carry over.
    expect(fallback.category).toBe('Just Chatting');
  });

  it('reports a changed username (user navigated the managed tab elsewhere)', () => {
    const { fallback, changed } = applyFallbackPatch(base(), {
      active: true,
      category: 'Just Chatting',
      username: 'otherchannel',
      reason: 'auto',
    });
    expect(changed).toBe(true);
    expect(fallback.username).toBe('otherchannel');
  });

  it('treats null as a meaningful value but undefined as "leave alone"', () => {
    const { fallback: cleared, changed: clearedChanged } = applyFallbackPatch(base(), { category: null });
    expect(clearedChanged).toBe(true);
    expect(cleared.category).toBe(null);

    const { fallback: kept, changed: keptChanged } = applyFallbackPatch(base(), { active: true });
    expect(keptChanged).toBe(false);
    expect(kept.category).toBe('Just Chatting');
  });

  it('ignores a non-boolean active, matching setFallbackRuntime semantics', () => {
    const { fallback, changed } = applyFallbackPatch(base(), { active: undefined });
    expect(changed).toBe(false);
    expect(fallback.active).toBe(true);
  });

  it('handles a missing current state (first activation always changes)', () => {
    const { fallback, changed } = applyFallbackPatch(null, { active: true, category: 'Fortnite' });
    expect(changed).toBe(true);
    expect(fallback).toMatchObject({ active: true, category: 'Fortnite' });
  });

  it('does not mutate the current state object', () => {
    const current = base();
    applyFallbackPatch(current, { active: false, category: 'Fortnite' });
    expect(current.active).toBe(true);
    expect(current.category).toBe('Just Chatting');
  });
});



