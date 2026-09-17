export type BrowserOpenCommand = 'workbench.action.browser.open' | 'simpleBrowser.api.open' | 'simpleBrowser.show';

export function selectBrowserOpenCommand(registeredCommands: readonly string[], hasSimpleBrowserExtension: boolean): BrowserOpenCommand | undefined {
  // CatPaw's bundled Simple Browser registers its API command during activation,
  // so it may not appear in getCommands() yet.
  if (hasSimpleBrowserExtension || registeredCommands.includes('simpleBrowser.api.open')) return 'simpleBrowser.api.open';
  if (registeredCommands.includes('workbench.action.browser.open')) return 'workbench.action.browser.open';
  if (registeredCommands.includes('simpleBrowser.show')) return 'simpleBrowser.show';
  return undefined;
}
