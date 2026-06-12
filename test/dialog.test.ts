import { describe, it, expect } from 'vitest';
import { resolveDialogAction, type DialogArm } from '../src/browser.js';

describe('resolveDialogAction', () => {
  it('dismisses alert/confirm/prompt when unarmed', () => {
    for (const type of ['alert', 'confirm', 'prompt']) {
      const r = resolveDialogAction(null, type);
      expect(r.handledWith).toBe('dismiss');
      expect(r.armed).toBe(false);
    }
  });

  it('accepts beforeunload when unarmed so navigation proceeds', () => {
    const r = resolveDialogAction(null, 'beforeunload');
    expect(r.handledWith).toBe('accept');
    expect(r.armed).toBe(false);
  });

  it('applies an armed accept with prompt text', () => {
    const arm: DialogArm = { action: 'accept', promptText: 'hello', remaining: 1 };
    const r = resolveDialogAction(arm, 'prompt');
    expect(r.handledWith).toBe('accept');
    expect(r.promptText).toBe('hello');
    expect(r.armed).toBe(true);
  });

  it('armed instruction overrides the beforeunload default', () => {
    const arm: DialogArm = { action: 'dismiss', remaining: 2 };
    const r = resolveDialogAction(arm, 'beforeunload');
    expect(r.handledWith).toBe('dismiss');
    expect(r.armed).toBe(true);
  });

  it('treats a spent arm as unarmed', () => {
    const arm: DialogArm = { action: 'accept', remaining: 0 };
    const r = resolveDialogAction(arm, 'confirm');
    expect(r.handledWith).toBe('dismiss');
    expect(r.armed).toBe(false);
  });
});
