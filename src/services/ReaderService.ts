import * as vscode from 'vscode';
import { ReaderDocument } from '../types/reader';

export class ReaderService {
  public async openFile(): Promise<ReaderDocument | undefined> {
    const selected = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Text files': ['txt'] }, openLabel: 'Open TXT' });
    if (!selected?.[0]) return undefined;
    return this.readUri(selected[0].toString());
  }

  public async readUri(uri: string): Promise<ReaderDocument> {
    const target = vscode.Uri.parse(uri);
    const bytes = await vscode.workspace.fs.readFile(target);
    return { title: target.path.split('/').pop() ?? 'Untitled.txt', uri, text: new TextDecoder('utf-8').decode(bytes) };
  }
}
