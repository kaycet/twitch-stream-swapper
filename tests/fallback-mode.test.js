import { describe, expect, it } from 'vitest';

import { shouldRerollCategoryFallback } from '../utils/fallback-mode.js';

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



