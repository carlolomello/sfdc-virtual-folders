import * as vscode from 'vscode';

/**
 * Nodo dell'albero per la vista delle cartelle virtuali (@path).
 */
export class VirtualFolderItem extends vscode.TreeItem {
  children?: VirtualFolderItem[];
  readonly kind: 'folder' | 'file';
  readonly folderSegments?: string[];
  readonly filePath?: string;

  constructor(options: {
    label: string;
    kind: 'folder' | 'file';
    collapsibleState: vscode.TreeItemCollapsibleState;
    folderSegments?: string[];
    filePath?: string;
  }) {
    super(options.label, options.collapsibleState);
    this.kind = options.kind;
    this.folderSegments = options.folderSegments;
    this.filePath = options.filePath;

    if (options.kind === 'file' && options.filePath) {
      const uri = vscode.Uri.file(options.filePath);
      this.resourceUri = uri;
      this.command = {
        command: 'vscode.open',
        title: 'Open Apex Class',
        arguments: [uri]
      };
      this.contextValue = 'apexClass';
    } else {
      this.contextValue = 'virtualFolder';
    }
  }
}

/**
 * Nodo dell'albero per la vista dei TAG virtuali (@tag).
 */
export class TagTreeItem extends vscode.TreeItem {
  children?: TagTreeItem[];
  readonly kind: 'tag' | 'file';
  readonly tagName?: string;
  readonly filePath?: string;

  constructor(options: {
    label: string;
    kind: 'tag' | 'file';
    collapsibleState: vscode.TreeItemCollapsibleState;
    tagName?: string;
    filePath?: string;
  }) {
    super(options.label, options.collapsibleState);
    this.kind = options.kind;
    this.tagName = options.tagName;
    this.filePath = options.filePath;

    if (options.kind === 'file' && options.filePath) {
      const uri = vscode.Uri.file(options.filePath);
      this.resourceUri = uri;
      this.command = {
        command: 'vscode.open',
        title: 'Open Apex Class',
        arguments: [uri]
      };
      this.contextValue = 'taggedApexClass';
    } else if (options.kind === 'tag') {
      this.contextValue = 'apexTagFolder';
      this.tooltip = `Tag: ${options.tagName}`;
    }
  }
}
