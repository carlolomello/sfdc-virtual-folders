import * as vscode from 'vscode';
import * as path from 'path';
import { TagTreeItem } from '../models/treeItems';
import { findApexClasses, readApexClassInfo, findLwcComponents } from '../services/apexMetadata';

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

    const apexFiles = findApexClasses(this.workspaceRoot);
    const lwcComponents = findLwcComponents(this.workspaceRoot);

    if (!apexFiles.length && !lwcComponents.length) {
      return [];
    }

    type TaggedResource = { label: string; filePath: string };
    type TaggedLwc = { name: string; folderPath: string; controllerPath: string; otherFiles: string[] };

    const tagMap = new Map<string, { apex: TaggedResource[]; lwc: TaggedLwc[] }>();

    const ensureEntry = (tagKey: string) => {
      if (!tagMap.has(tagKey)) {
        tagMap.set(tagKey, { apex: [], lwc: [] });
      }
      return tagMap.get(tagKey)!;
    };

    // Apex tags
    for (const file of apexFiles) {
      const info = readApexClassInfo(file);
      if (!info.tags.length) {
        continue;
      }
      const label = path.basename(file, '.cls');
      for (const tag of info.tags) {
        const key = tag.toLowerCase();
        const entry = ensureEntry(key);
        entry.apex.push({ label, filePath: file });
      }
    }

    // LWC tags (controller-based)
    for (const comp of lwcComponents) {
      if (!comp.tags.length) {
        continue;
      }
      for (const tag of comp.tags) {
        const key = tag.toLowerCase();
        const entry = ensureEntry(key);
        entry.lwc.push({
          name: comp.name,
          folderPath: comp.folderPath,
          controllerPath: comp.controllerPath,
          otherFiles: comp.otherFiles
        });
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
      const entry = tagMap.get(tagKey)!;

      const tagItem = new TagTreeItem({
        label: displayTag,
        kind: 'tag',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        tagName: displayTag
      });

      const children: TagTreeItem[] = [];

      // Apex resources
      for (const res of entry.apex.sort((a, b) => a.label.localeCompare(b.label))) {
        children.push(
          new TagTreeItem({
            label: res.label,
            kind: 'file',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            filePath: res.filePath
          })
        );
      }

      // LWC components (folder + files)
      for (const lwc of entry.lwc.sort((a, b) => a.name.localeCompare(b.name))) {
        const lwcRoot = new TagTreeItem({
          label: lwc.name,
          kind: 'lwcRoot',
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        });

        const allFiles = [lwc.controllerPath, ...lwc.otherFiles];
        lwcRoot.children = allFiles
          .map(filePath => {
            const rel = path.relative(lwc.folderPath, filePath) || path.basename(filePath);
            const label = rel.replace(/\\/g, '/');
            return new TagTreeItem({
              label,
              kind: 'file',
              collapsibleState: vscode.TreeItemCollapsibleState.None,
              filePath
            });
          })
          .sort((a, b) => String(a.label).localeCompare(String(b.label)));

        children.push(lwcRoot);
      }

      tagItem.children = children;
      result.push(tagItem);
    }

    return result;
  }
}
