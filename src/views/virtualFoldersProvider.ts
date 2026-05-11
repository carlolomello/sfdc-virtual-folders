import * as vscode from 'vscode';
import * as path from 'path';
import { VirtualFolderItem } from '../models/treeItems';
import { findApexClasses, readApexClassInfo, findLwcComponents } from '../services/apexMetadata';
import { applyOrUpdatePathAnnotationOnFile } from '../services/pathAnnotation';

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
    const findParent = (items: VirtualFolderItem[], parent: VirtualFolderItem | null): VirtualFolderItem | null => {
      for (const item of items) {
        if (item === element) {
          return parent;
        }
        if (item.children && item.children.length) {
          const found = findParent(item.children, item);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };

    return findParent(this.rootNodes, null) ?? undefined;
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
        collapsibleState: vscode.TreeItemCollapsibleState.None
      });
      return [placeholder];
    }

    type Node = {
      children: Map<string, Node>;
      files: VirtualFolderItem[];
      isLwcRoot?: boolean;
    };

    const rootNode: Node = { children: new Map(), files: [] };

    // Apex
    for (const file of apexFiles) {
      const info = readApexClassInfo(file);
      const virtualPath = (info.pathAnnotation ?? '').split('.').map(s => s.trim()).filter(Boolean);
      let current = rootNode;
      for (const segment of virtualPath) {
        if (!current.children.has(segment)) {
          current.children.set(segment, { children: new Map(), files: [] });
        }
        current = current.children.get(segment)!;
      }
      const fileItem = new VirtualFolderItem({
        label: path.basename(file, '.cls'),
        kind: 'file',
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        filePath: file
      });
      current.files.push(fileItem);
    }

    // --- Componenti LWC ---
    for (const comp of lwcComponents) {
      const virtualPath = (comp.pathAnnotation ?? '')
        .split('.')
        .map(s => s.trim())
        .filter(Boolean);

      let current = rootNode;
      for (const segment of virtualPath) {
        if (!current.children.has(segment)) {
          current.children.set(segment, { children: new Map(), files: [] });
        }
        current = current.children.get(segment)!;
      }

      const compSegment = comp.name;
      let childNode = current.children.get(compSegment);
      if (!childNode) {
        childNode = { children: new Map(), files: [], isLwcRoot: true };
        current.children.set(compSegment, childNode);
      } else {
        // LWC vince sempre se esiste con questo nome
        childNode.isLwcRoot = true;
      }
      const compNode = childNode;

      const allFiles = [comp.controllerPath, ...comp.otherFiles];
      for (const filePath of allFiles) {
        const rel = path.relative(comp.folderPath, filePath) || path.basename(filePath);
        const label = rel.replace(/\\\\/g, '/');
        const fileItem = new VirtualFolderItem({
          label,
          kind: 'file',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          filePath
        });
        compNode.files.push(fileItem);
      }
    }

    const convertNodeToItems = (node: Node, parentSegments: string[]): VirtualFolderItem[] => {
      const result: VirtualFolderItem[] = [];

      for (const [folderName, childNode] of node.children.entries()) {
        const segments = [...parentSegments, folderName];
        const folderItem = new VirtualFolderItem({
          label: folderName,
          kind: 'folder',
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          folderSegments: segments,
          isLwcFolderRoot: !!childNode.isLwcRoot,
          isLwcSubfolder: false
        });
        folderItem.children = convertNodeToItems(childNode, segments);
        result.push(folderItem);
      }

      for (const fileItem of node.files) {
        result.push(fileItem);
      }

      return result;
    };

    return convertNodeToItems(rootNode, []);
  }
}
