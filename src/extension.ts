import * as vscode from 'vscode';

import { AppStateStore } from './app/AppStateStore';
import { WorkspaceViewProvider } from './app/WorkspaceViewProvider';
import { MockChatService } from './services/MockChatService';
import { MockAIService } from './services/MockAIService';
import { ReaderService } from './services/ReaderService';
import { WebService } from './services/WebService';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new WorkspaceViewProvider(context.extensionUri, new AppStateStore(context.globalState), new MockChatService(), new MockAIService(context.globalState), new ReaderService(), new WebService());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WorkspaceViewProvider.viewType, provider),
    vscode.commands.registerCommand('workspace.quickHide', () => provider.quickHide())
  );
}

export function deactivate(): void {
  // The extension does not retain resources outside VS Code subscriptions.
}
