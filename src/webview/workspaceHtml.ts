import * as vscode from 'vscode';
export function getWorkspaceHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
  const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'workspace.css'));
  const gameCore = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'game-core.js'));
  const games = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'games.js'));
  const app = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'workspace.js'));
  const webPreserved = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'web-preserved.js'));
  const webFull = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'web-full.js'));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource}; connect-src 'none'; frame-src http: https:;"><link rel="stylesheet" href="${css}"><title>Workspace</title></head><body><main id="app"></main><script nonce="${nonce}" src="${gameCore}"></script><script nonce="${nonce}" src="${games}"></script><script nonce="${nonce}" src="${app}"></script><script nonce="${nonce}" src="${webPreserved}"></script><script nonce="${nonce}" src="${webFull}"></script></body></html>`;
}
