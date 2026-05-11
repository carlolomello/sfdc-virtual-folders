import * as vscode from 'vscode';
import * as path from 'path';
import { VirtualFolderItem, VirtualResourceType } from '../models/treeItems';
import { findApexClasses, readApexClassInfo, findLwcComponents } from '../services/apexMetadata';
import { applyOrUpdatePathAnnotationOnFile } from '../services/pathAnnotation';

export type FolderFilter = 'ALL' | 'APEX' | 'LWC';

export function normalizeFolderFilter(value: unknown): FolderFilter {
  const normalized = String(value ?? 'ALL').trim().toUpperCase();

  if (normalized === 'APEX') {
    return 'APEX';
  }

  if (normalized === 'LWC') {
    return 'LWC';
  }

  return 'ALL';
}

/**
 * Provider per la vista "Virtual Folders" basata sulle annotation @path.
 */
export class VirtualFoldersProvider implements
  vscode.TreeDataProvider<VirtualFolderItem>,
  vscode.TreeDragAndDropController<VirtualFolderItem>,
  vscode.Disposable {

  static readonly MIME_TYPE = 'application/vnd.sfdcVirtualFolders.apexClass';

  readonly dragMimeTypes = [VirtualFoldersProvider.MIME_TYPE];
  readonly dropMimeTypes = [VirtualFoldersProvider.MIME_TYPE];

  private _onDidChangeTreeData = new vscode.EventEmitter<VirtualFolderItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: VirtualFolderItem[] = [];
  private enabled: boolean;
  private filter: FolderFilter = 'ALL';

  constructor(private workspaceRoot: string | undefined) {
    this.enabled = vscode.workspace
      .getConfiguration('sfdcVirtualFolders')
      .get('enabled', true);
    this.refresh();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    this.refresh();
  }

  getFilter(): FolderFilter {
    return this.filter;
  }

  setFilter(filter: FolderFilter | string) {
    const normalized = normalizeFolderFilter(filter);

    if (this.filter === normalized) {
      return;
    }

    this.filter = normalized;
    this.refresh();
  }

  refresh(): void {
    if (!this.enabled) {
      this.rootNodes = [];
    } else {
      this.rootNodes = this.buildTree();
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VirtualFolderItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: VirtualFolderItem): vscode.ProviderResult<VirtualFolderItem[]> {
    if (!this.workspaceRoot || !this.enabled) {
      return [];
    }

    if (!element) {
      return this.rootNodes;
    }

    return element.children ?? [];
  }

  getParent(element: VirtualFolderItem): vscode.ProviderResult<VirtualFolderItem> {
    return element.parent;
  }

  getItemForUri(uri: vscode.Uri): VirtualFolderItem | undefined {
    const target = path.normalize(uri.fsPath);
    const visit = (items: VirtualFolderItem[]): VirtualFolderItem | undefined => {
      for (const item of items) {
        if (item.kind === 'file' && item.filePath && path.normalize(item.filePath) === target) {
          return item;
        }
        if (item.children && item.children.length) {
          const found = visit(item.children);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };
    return visit(this.rootNodes);
  }

  async handleDrag(
    source: readonly VirtualFolderItem[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const files = source
      .filter(item => item.kind === 'file' && item.filePath && item.filePath.endsWith('.cls'))
      .map(item => item.filePath as string);

    if (!files.length) {
      return;
    }

    const payload = JSON.stringify(files);
    dataTransfer.set(
      VirtualFoldersProvider.MIME_TYPE,
      new vscode.DataTransferItem(payload)
    );
  }

  async handleDrop(
    target: VirtualFolderItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const item = dataTransfer.get(VirtualFoldersProvider.MIME_TYPE);
    if (!item) {
      return;
    }

    const payload = await item.asString();
    const filePaths: string[] = JSON.parse(payload);

    let targetSegments: string[] = [];
    if (target && target.kind === 'folder' && target.folderSegments) {
      targetSegments = target.folderSegments;
    } else if (target && target.kind === 'file') {
      vscode.window.showInformationMessage('Drop is only supported on virtual folders or root.');
      return;
    }

    for (const filePath of filePaths) {
      const newPath = targetSegments.length ? `${targetSegments.join('.')}` : '';
      await applyOrUpdatePathAnnotationOnFile(filePath, newPath);
    }

    this.refresh();
  }

  dispose(): void {
    // nothing for now
  }

  private buildTree(): VirtualFolderItem[] {
    const apexFiles = findApexClasses(this.workspaceRoot);
    const lwcComponents = findLwcComponents(this.workspaceRoot);

    if (!apexFiles.length && !lwcComponents.length) {
      const placeholder = new VirtualFolderItem({
        label: 'No Apex classes or LWC components found',
        kind: 'folder',
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        id: 'placeholder:no-files'
      });
      return [placeholder];
    }

    type FileEntry = {
      label: string;
      filePath: string;
      sourceType: VirtualResourceType;
    };

    type Node = {
      children: Map<string, Node>;
      files: FileEntry[];
      isLwcRoot?: boolean;
    };

    const createNode = (): Node => ({
      children: new Map(),
      files: []
    });

    const rootNode = createNode();

    const getOrCreateChild = (node: Node, segment: string): Node => {
      let child = node.children.get(segment);

      if (!child) {
        child = createNode();
        node.children.set(segment, child);
      }

      return child;
    };

    // Apex
    for (const file of apexFiles) {
      const info = readApexClassInfo(file);
      const virtualPath = (info.pathAnnotation ?? '').split('.').map(s => s.trim()).filter(Boolean);
      let current = rootNode;

      for (const segment of virtualPath) {
        current = getOrCreateChild(current, segment);
      }

      current.files.push({
        label: path.basename(file, '.cls'),
        filePath: file,
        sourceType: 'APEX'
      });
    }

    // LWC
    for (const comp of lwcComponents) {
      const virtualPath = (comp.pathAnnotation ?? '').split('.').map(s => s.trim()).filter(Boolean);
      let current = rootNode;

      for (const segment of virtualPath) {
        current = getOrCreateChild(current, segment);
      }

      const compNode = getOrCreateChild(current, comp.name);
      compNode.isLwcRoot = true;

      const allFiles = [comp.controllerPath, ...comp.otherFiles];
      for (const filePath of allFiles) {
        const rel = path.relative(comp.folderPath, filePath) || path.basename(filePath);
        const label = rel.replace(/\\/g, '/');

        compNode.files.push({
          label,
          filePath,
          sourceType: 'LWC'
        });
      }
    }

    const shouldIncludeFile = (file: FileEntry): boolean => {
      return this.filter === 'ALL' || this.filter === file.sourceType;
    };

    const convertNodeToItems = (
      node: Node,
      parentSegments: string[],
      parent?: VirtualFolderItem
    ): VirtualFolderItem[] => {
      const result: VirtualFolderItem[] = [];

      for (const [folderName, childNode] of node.children.entries()) {
        const segments = [...parentSegments, folderName];

        const folderItem = new VirtualFolderItem({
          label: folderName,
          kind: 'folder',
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          folderSegments: segments,
          isLwcFolderRoot: !!childNode.isLwcRoot,
          isLwcSubfolder: false,
          parent,
          id: `folder:${segments.join('/')}`
        });

        folderItem.children = convertNodeToItems(childNode, segments, folderItem);

        if (folderItem.children.length > 0) {
          result.push(folderItem);
        }
      }

      for (const file of node.files) {
        if (!shouldIncludeFile(file)) {
          continue;
        }

        result.push(
          new VirtualFolderItem({
            label: file.label,
            kind: 'file',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            filePath: file.filePath,
            sourceType: file.sourceType,
            parent,
            id: `file:${path.normalize(file.filePath).replace(/\\/g, '/')}`
          })
        );
      }

      return result.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    };

    return convertNodeToItems(rootNode, []);
  }
}
