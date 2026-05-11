import * as vscode from 'vscode';
import * as path from 'path';
import { VirtualFolderItem } from '../models/treeItems';
import { findApexClasses, readApexClassInfo, findLwcComponents, LwcComponentInfo } from '../services/apexMetadata';
import { applyOrUpdatePathAnnotationOnFile } from '../services/pathAnnotation';

/**
 * Provider per la vista "Virtual Folders" basata sulle annotation @path.
 *
 * - Costruisce un albero logico a partire dai path virtuali.
 * - Supporta sia classi Apex (.cls) sia componenti LWC (controller .js/.ts + altri file).
 * - Implementa drag & drop per aggiornare @path (solo Apex per ora).
 * - Espone un metodo per trovare un item dato un URI (per il focus automatico).
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
    console.log('[VirtualFolders] provider constructor, workspaceRoot =', workspaceRoot, 'enabled =', this.enabled);
    this.refresh();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    this.refresh();
  }

  refresh(): void {
    console.log('[VirtualFolders] refresh() called, enabled =', this.enabled);
    if (!this.enabled) {
      this.rootNodes = [];
    } else {
      this.rootNodes = this.buildTree();
    }

    console.log('[VirtualFolders] refresh() built', this.rootNodes.length, 'root nodes');
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VirtualFolderItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: VirtualFolderItem): vscode.ProviderResult<VirtualFolderItem[]> {
    if (!this.workspaceRoot) {
      console.log('[VirtualFolders] getChildren: no workspaceRoot');
      return [];
    }

    if (!this.enabled) {
      console.log('[VirtualFolders] getChildren: disabled');
      return [];
    }

    if (!element) {
      console.log('[VirtualFolders] getChildren: returning', this.rootNodes.length, 'root nodes');
      return this.rootNodes;
    }

    console.log('[VirtualFolders] getChildren: element', element.label, 'has children', element.children?.length ?? 0);
    return element.children ?? [];
  }

  /**
   * Necessario per treeView.reveal: risale dai rootNodes per trovare il parent.
   */
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

  /**
   * Usato dal listener dell'editor per trovare il nodo relativo al file aperto.
   */
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

  // ---------------------- DRAG & DROP ----------------------

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
    console.log('[VirtualFolders] handleDrag, files =', files);
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
    console.log('[VirtualFolders] handleDrop, target =', target?.label, 'files =', filePaths);

    let targetSegments: string[] = [];
    if (target && target.kind === 'folder' && target.folderSegments) {
      targetSegments = target.folderSegments;
    } else if (target && target.kind === 'file') {
      vscode.window.showInformationMessage('Drop is only supported on virtual folders or root.');
      return;
    }

    for (const filePath of filePaths) {
      // La nuova annotation contiene solo le cartelle (no nome classe / componente).
      const newPath = targetSegments.length ? `${targetSegments.join('.')}` : '';
      console.log('[VirtualFolders] handleDrop: updating', filePath, 'to path', newPath);
      await applyOrUpdatePathAnnotationOnFile(filePath, newPath);
    }

    this.refresh();
  }

  dispose(): void {
    // niente da fare per ora
  }

  // ---------------------- BUILD TREE ----------------------

  private buildTree(): VirtualFolderItem[] {
    console.log('[VirtualFolders] buildTree called');

    const apexFiles = findApexClasses(this.workspaceRoot);
    const lwcComponents = findLwcComponents(this.workspaceRoot);

    if (!apexFiles.length && !lwcComponents.length) {
      // Mostra comunque una voce placeholder, così la view non sparisce
      const placeholder = new VirtualFolderItem({
        label: 'No Apex classes or LWC components found',
        kind: 'folder',
        collapsibleState: vscode.TreeItemCollapsibleState.None
      });
      placeholder.tooltip = 'No .cls files under force-app/main/default/classes or LWC under force-app/main/default/lwc.';
      console.log('[VirtualFolders] buildTree: no files, returning placeholder node');
      return [placeholder];
    }

    type Node = {
      children: Map<string, Node>;
      files: VirtualFolderItem[];
    };

    const rootNode: Node = { children: new Map(), files: [] };

    // --- Classi Apex ---
    for (const file of apexFiles) {
      const info = readApexClassInfo(file);
      const annotationPath = info.pathAnnotation;
      console.log('[VirtualFolders] APEX file', file, 'annotationPath =', annotationPath);

      const virtualPath = annotationPath ?? '';
      const segments = virtualPath
        .split('.')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      let current = rootNode;

      if (segments.length > 0) {
        for (const segment of segments) {
          if (!current.children.has(segment)) {
            current.children.set(segment, { children: new Map(), files: [] });
          }
          current = current.children.get(segment)!;
        }
      }

      const fileName = path.basename(file, '.cls');
      const apexLabel = fileName;

      const fileItem = new VirtualFolderItem({
        label: apexLabel,
        kind: 'file',
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        filePath: file
      });

      current.files.push(fileItem);
    }

    // --- Componenti LWC ---
    for (const comp of lwcComponents) {
      const annotationPath = comp.pathAnnotation;
      console.log('[VirtualFolders] LWC component', comp.name, 'annotationPath =', annotationPath);

      const virtualPath = annotationPath ?? '';
      const segments = virtualPath
        .split('.')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      let current = rootNode;

      if (segments.length > 0) {
        for (const segment of segments) {
          if (!current.children.has(segment)) {
            current.children.set(segment, { children: new Map(), files: [] });
          }
          current = current.children.get(segment)!;
        }
      }

      // Ultimo livello: il nome del componente come cartella virtuale
      const compSegment = comp.name;
      if (!current.children.has(compSegment)) {
        current.children.set(compSegment, { children: new Map(), files: [] });
      }
      const compNode = current.children.get(compSegment)!;

      const allFiles = [comp.controllerPath, ...comp.otherFiles];
      for (const filePath of allFiles) {
        const label = path.basename(filePath);
        const fileItem = new VirtualFolderItem({
          label,
          kind: 'file',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          filePath
        });
        compNode.files.push(fileItem);
      }
    }

    const items = this.convertNodeToItems(rootNode, []);
    console.log('[VirtualFolders] buildTree: final root items =', items.map(i => i.label));
    return items;
  }

  private convertNodeToItems(
    node: { children: Map<string, any>; files: VirtualFolderItem[] },
    parentSegments: string[]
  ): VirtualFolderItem[] {
    const result: VirtualFolderItem[] = [];

    for (const [folderName, childNode] of node.children.entries()) {
      const segments = [...parentSegments, folderName];
      const folderItem = new VirtualFolderItem({
        label: folderName,
        kind: 'folder',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        folderSegments: segments
      });
      folderItem.children = this.convertNodeToItems(childNode, segments);
      result.push(folderItem);
    }

    for (const fileItem of node.files) {
      result.push(fileItem);
    }

    return result;
  }
}
