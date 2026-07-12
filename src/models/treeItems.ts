import * as vscode from 'vscode';
import * as path from 'path';

export type VirtualResourceType = 'APEX' | 'LWC' | 'TRIGGER';

function stableId(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Nodo dell'albero per la vista delle cartelle virtuali (@path).
 */
export class VirtualFolderItem extends vscode.TreeItem {
  static yellowFolderIcon: vscode.Uri | undefined;
  static greenFolderIcon: vscode.Uri | undefined;

  children?: VirtualFolderItem[];
  parent?: VirtualFolderItem;
  readonly kind: 'folder' | 'file';
  readonly folderSegments?: string[];
  readonly filePath?: string;
  readonly sourceType?: VirtualResourceType;

  constructor(options: {
    label: string;
    kind: 'folder' | 'file';
    collapsibleState: vscode.TreeItemCollapsibleState;
    folderSegments?: string[];
    filePath?: string;
    sourceType?: VirtualResourceType;
    parent?: VirtualFolderItem;
    id?: string;
    isLwcFolderRoot?: boolean;
    isLwcSubfolder?: boolean;
  }) {
    super(options.label, options.collapsibleState);
    this.kind = options.kind;
    this.folderSegments = options.folderSegments;
    this.filePath = options.filePath;
    this.sourceType = options.sourceType;
    this.parent = options.parent;

    if (options.kind === 'file' && options.filePath) {
      const uri = vscode.Uri.file(options.filePath);
      this.resourceUri = uri;
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [uri]
      };
      this.contextValue = 'virtualFile';
      this.id = options.id ?? `file:${stableId(path.normalize(options.filePath))}`;
    } else {
      const folderKey = options.folderSegments?.join('/') ?? String(options.label);
      this.id = options.id ?? `folder:${stableId(folderKey)}`;

      if (options.isLwcFolderRoot) {
        this.contextValue = 'lwcFolderRoot';
      } else if (options.isLwcSubfolder) {
        this.contextValue = 'lwcFolderSub';
      } else {
        this.contextValue = 'virtualFolder';
      }

      if (this.contextValue === 'virtualFolder' && VirtualFolderItem.yellowFolderIcon) {
        this.iconPath = VirtualFolderItem.yellowFolderIcon;
      } else if (
        (this.contextValue === 'lwcFolderRoot' || this.contextValue === 'tagLwcFolderRoot') &&
        VirtualFolderItem.greenFolderIcon
      ) {
        this.iconPath = VirtualFolderItem.greenFolderIcon;
      }
    }
  }
}

/**
 * Nodo dell'albero per la vista dei TAG virtuali (@tag).
 */
export class TagTreeItem extends vscode.TreeItem {
  children?: TagTreeItem[];
  readonly kind: 'tag' | 'file' | 'lwcRoot';
  readonly tagName?: string;
  readonly filePath?: string;

  constructor(options: {
    label: string;
    kind: 'tag' | 'file' | 'lwcRoot';
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
        title: 'Open Tagged File',
        arguments: [uri]
      };
      this.contextValue = 'taggedResource';
    } else if (options.kind === 'tag') {
      this.contextValue = 'virtualTagFolder';
      this.tooltip = `Tag: ${options.tagName}`;
    } else if (options.kind === 'lwcRoot') {
      this.contextValue = 'tagLwcFolderRoot';
      if (VirtualFolderItem.greenFolderIcon) {
        this.iconPath = VirtualFolderItem.greenFolderIcon;
      }
    }
  }
}