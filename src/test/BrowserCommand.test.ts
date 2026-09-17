import assert from 'node:assert/strict';
import test from 'node:test';
import { selectBrowserOpenCommand } from '../app/browserCommand';

test('activates CatPaw bundled Simple Browser even before its commands are registered', () => {
  assert.equal(selectBrowserOpenCommand([], true), 'simpleBrowser.api.open');
});

test('prefers the bundled Simple Browser over an ambiguous integrated browser command', () => {
  assert.equal(selectBrowserOpenCommand(['workbench.action.browser.open'], true), 'simpleBrowser.api.open');
});
