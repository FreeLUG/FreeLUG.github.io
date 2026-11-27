import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../assets/js/theme.js', import.meta.url), 'utf8');

function startTheme({ stored = null, dark = false, storageError = false } = {}) {
  const stylesheet = { media: '(prefers-color-scheme: dark)' };
  const icon = () => ({ hidden: true, toggleAttribute(name, value) { this[name] = value; } });
  const sun = icon();
  const moon = icon();
  const button = {
    hidden: true,
    querySelector: selector => selector === '.theme-icon-sun' ? sun : moon,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(event, handler) { this[event] = handler; }
  };
  const systemTheme = {
    matches: dark,
    addEventListener(event, handler) { this[event] = handler; }
  };
  const document = {
    getElementById: () => stylesheet,
    querySelector: () => button,
    addEventListener(event, handler) { this[event] = handler; }
  };
  const window = {
    matchMedia: () => systemTheme,
    addEventListener(event, handler) { this[event] = handler; }
  };
  const warnings = [];
  const localStorage = {
    getItem() { if (storageError) throw Error('unavailable'); return stored; },
    setItem(key, value) { if (storageError) throw Error('unavailable'); stored = value; }
  };
  runInNewContext(script, { document, window, localStorage, console: { warn: (...args) => warnings.push(args) } });
  document.DOMContentLoaded();
  return { stylesheet, button, sun, moon, systemTheme, window, localStorage, warnings, getStored: () => stored };
}

test('theme switch follows the device until clicked and persists either choice', () => {
  for (const [dark, expectedLabel, chosen, media] of [
    [false, 'Activer le thème sombre', 'dark', 'all'],
    [true, 'Activer le thème clair', 'light', 'not all']
  ]) {
    const state = startTheme({ dark });
    assert.equal(state.stylesheet.media, '(prefers-color-scheme: dark)');
    assert.equal(state.button.hidden, false);
    assert.equal(state.button['aria-label'], expectedLabel);
    assert.equal(state.button.title, expectedLabel);
    assert.equal(state.sun.hidden, !dark);
    assert.equal(state.moon.hidden, dark);
    state.button.click();
    assert.equal(state.sun.hidden, dark);
    assert.equal(state.moon.hidden, !dark);
    assert.equal(state.getStored(), chosen);
    assert.equal(state.stylesheet.media, media);
    const restored = startTheme({ stored: chosen, dark });
    assert.equal(restored.stylesheet.media, media);
    restored.button.click();
    assert.equal(restored.getStored(), dark ? 'dark' : 'light');
  }
});

test('system and other tabs update the control without overriding an explicit choice', () => {
  const state = startTheme();
  state.systemTheme.matches = true;
  state.systemTheme.change();
  assert.equal(state.button['aria-label'], 'Activer le thème clair');
  state.window.storage({ storageArea: state.localStorage, key: 'freelug-theme', newValue: 'light' });
  assert.equal(state.stylesheet.media, 'not all');
  state.window.storage({ storageArea: {}, key: null, newValue: null });
  assert.equal(state.stylesheet.media, 'not all');
  state.systemTheme.matches = false;
  state.systemTheme.change();
  assert.equal(state.button['aria-label'], 'Activer le thème sombre');
  state.window.storage({ storageArea: state.localStorage, key: 'freelug-theme', newValue: null });
  assert.equal(state.stylesheet.media, '(prefers-color-scheme: dark)');
});

test('the switch remains usable when browser storage is unavailable', () => {
  const state = startTheme({ storageError: true });
  state.button.click();
  assert.equal(state.stylesheet.media, 'all');
  assert.equal(state.button['aria-label'], 'Activer le thème clair');
  assert.equal(state.warnings.length, 2);
});
