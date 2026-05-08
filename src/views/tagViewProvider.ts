import * as vscode from 'vscode';
import * as path from 'path';
import { TagTreeItem } from '../models/treeItems';
import { findApexClasses, readApexClassInfo } from '../services/apexMetadata';

/**
 * Provider per la vista "Virtual Apex Tags" basata sui @tag nelle classi Apex.
 *
 * - Raggruppa le classi per tag.
 * - Supporta un semplice filtro per mostrare solo alcuni tag.
 */
export class TagViewProvider implements vscode.TreeDataProvider<TagTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<TagTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: TagTreeItem[] = [];
  private filterText: string = '';

  constructor(private workspaceRoot: string | undefined) {
    this.refresh();
  }

  dispose(): void {}

  setFilter(filter: string) {
    this.filterText = filter;
    this.refresh();
  }

  refresh(): void {
    this.rootNodes = this.buildTree();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TagTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TagTreeItem): vscode.ProviderResult<TagTreeItem[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    if (!element) {
      return this.rootNodes;
    }

    return element.children ?? [];
  }

  private buildTree(): TagTreeItem[] {
    if (!this.workspaceRoot) {
      return [];
    }

    const files = findApexClasses(this.workspaceRoot);
    if (!files.length) {
      return [];
    }

    const tagMap = new Map<string, string[]>();

    for (const file of files) {
      const info = readApexClassInfo(file);
      if (!info.tags.length) {
        continue;
      }

      for (const tag of info.tags) {
        const key = tag.toLowerCase();
        if (!tagMap.has(key)) {
          tagMap.set(key, []);
        }
        tagMap.get(key)!.push(file);
      }
    }

    let activeTags = Array.from(tagMap.keys());
    if (this.filterText.trim().length > 0) {
      const tokens = this.filterText
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0);
      if (tokens.length > 0) {
        activeTags = activeTags.filter(tagKey => tokens.includes(tagKey));
      }
    }

    const result: TagTreeItem[] = [];

    for (const tagKey of activeTags.sort()) {
      const displayTag = tagKey;
      const filesForTag = tagMap.get(tagKey)!;

      const tagItem = new TagTreeItem({
        label: displayTag,
        kind: 'tag',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        tagName: displayTag
      });

      tagItem.children = filesForTag
        .sort()
        .map(filePath => {
          const fileName = path.basename(filePath, '.cls');
          return new TagTreeItem({
            label: fileName,
            kind: 'file',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            filePath
          });
        });

      result.push(tagItem);
    }

    return result;
  }
}
