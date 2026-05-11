"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirtualFoldersProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const treeItems_1 = require("../models/treeItems");
const apexMetadata_1 = require("../services/apexMetadata");
const pathAnnotation_1 = require("../services/pathAnnotation");
/**
 * Provider per la vista "Virtual Folders" basata sulle annotation @path.
 *
 * - Costruisce un albero logico a partire dai path virtuali.
 * - Supporta sia classi Apex (.cls) sia componenti LWC (controller .js/.ts + altri file).
 * - Implementa drag & drop per aggiornare @path (solo Apex per ora).
 * - Espone un metodo per trovare un item dato un URI (per il focus automatico).
 */
class VirtualFoldersProvider {
    workspaceRoot;
    static MIME_TYPE = 'application/vnd.sfdcVirtualFolders.apexClass';
    dragMimeTypes = [VirtualFoldersProvider.MIME_TYPE];
    dropMimeTypes = [VirtualFoldersProvider.MIME_TYPE];
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    rootNodes = [];
    enabled;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.enabled = vscode.workspace
            .getConfiguration('sfdcVirtualFolders')
            .get('enabled', true);
        console.log('[VirtualFolders] provider constructor, workspaceRoot =', workspaceRoot, 'enabled =', this.enabled);
        this.refresh();
    }
    setEnabled(value) {
        this.enabled = value;
        this.refresh();
    }
    refresh() {
        console.log('[VirtualFolders] refresh() called, enabled =', this.enabled);
        if (!this.enabled) {
            this.rootNodes = [];
        }
        else {
            this.rootNodes = this.buildTree();
        }
        console.log('[VirtualFolders] refresh() built', this.rootNodes.length, 'root nodes');
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
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
    getParent(element) {
        const findParent = (items, parent) => {
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
    getItemForUri(uri) {
        const target = path.normalize(uri.fsPath);
        const visit = (items) => {
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
    async handleDrag(source, dataTransfer, _token) {
        const files = source
            .filter(item => item.kind === 'file' && item.filePath && item.filePath.endsWith('.cls'))
            .map(item => item.filePath);
        if (!files.length) {
            return;
        }
        const payload = JSON.stringify(files);
        dataTransfer.set(VirtualFoldersProvider.MIME_TYPE, new vscode.DataTransferItem(payload));
        console.log('[VirtualFolders] handleDrag, files =', files);
    }
    async handleDrop(target, dataTransfer, _token) {
        const item = dataTransfer.get(VirtualFoldersProvider.MIME_TYPE);
        if (!item) {
            return;
        }
        const payload = await item.asString();
        const filePaths = JSON.parse(payload);
        console.log('[VirtualFolders] handleDrop, target =', target?.label, 'files =', filePaths);
        let targetSegments = [];
        if (target && target.kind === 'folder' && target.folderSegments) {
            targetSegments = target.folderSegments;
        }
        else if (target && target.kind === 'file') {
            vscode.window.showInformationMessage('Drop is only supported on virtual folders or root.');
            return;
        }
        for (const filePath of filePaths) {
            // La nuova annotation contiene solo le cartelle (no nome classe / componente).
            const newPath = targetSegments.length ? `${targetSegments.join('.')}` : '';
            console.log('[VirtualFolders] handleDrop: updating', filePath, 'to path', newPath);
            await (0, pathAnnotation_1.applyOrUpdatePathAnnotationOnFile)(filePath, newPath);
        }
        this.refresh();
    }
    dispose() {
        // niente da fare per ora
    }
    // ---------------------- BUILD TREE ----------------------
    buildTree() {
        console.log('[VirtualFolders] buildTree called');
        const apexFiles = (0, apexMetadata_1.findApexClasses)(this.workspaceRoot);
        const lwcComponents = (0, apexMetadata_1.findLwcComponents)(this.workspaceRoot);
        if (!apexFiles.length && !lwcComponents.length) {
            // Mostra comunque una voce placeholder, così la view non sparisce
            const placeholder = new treeItems_1.VirtualFolderItem({
                label: 'No Apex classes or LWC components found',
                kind: 'folder',
                collapsibleState: vscode.TreeItemCollapsibleState.None
            });
            placeholder.tooltip = 'No .cls files under force-app/main/default/classes or LWC under force-app/main/default/lwc.';
            console.log('[VirtualFolders] buildTree: no files, returning placeholder node');
            return [placeholder];
        }
        const rootNode = { children: new Map(), files: [] };
        // --- Classi Apex ---
        for (const file of apexFiles) {
            const info = (0, apexMetadata_1.readApexClassInfo)(file);
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
                    current = current.children.get(segment);
                }
            }
            const fileName = path.basename(file, '.cls');
            const apexLabel = fileName;
            const fileItem = new treeItems_1.VirtualFolderItem({
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
                    current = current.children.get(segment);
                }
            }
            // Ultimo livello: il nome del componente come cartella virtuale
            const compSegment = comp.name;
            if (!current.children.has(compSegment)) {
                current.children.set(compSegment, { children: new Map(), files: [] });
            }
            const compNode = current.children.get(compSegment);
            const allFiles = [comp.controllerPath, ...comp.otherFiles];
            for (const filePath of allFiles) {
                const label = path.basename(filePath);
                const fileItem = new treeItems_1.VirtualFolderItem({
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
    convertNodeToItems(node, parentSegments) {
        const result = [];
        for (const [folderName, childNode] of node.children.entries()) {
            const segments = [...parentSegments, folderName];
            const folderItem = new treeItems_1.VirtualFolderItem({
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
exports.VirtualFoldersProvider = VirtualFoldersProvider;
//# sourceMappingURL=virtualFoldersProvider.js.map