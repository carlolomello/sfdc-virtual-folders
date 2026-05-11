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
        this.refresh();
    }
    setEnabled(value) {
        this.enabled = value;
        this.refresh();
    }
    refresh() {
        if (!this.enabled) {
            this.rootNodes = [];
        }
        else {
            this.rootNodes = this.buildTree();
        }
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.workspaceRoot || !this.enabled) {
            return [];
        }
        if (!element) {
            return this.rootNodes;
        }
        return element.children ?? [];
    }
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
    async handleDrag(source, dataTransfer, _token) {
        const files = source
            .filter(item => item.kind === 'file' && item.filePath && item.filePath.endsWith('.cls'))
            .map(item => item.filePath);
        if (!files.length) {
            return;
        }
        const payload = JSON.stringify(files);
        dataTransfer.set(VirtualFoldersProvider.MIME_TYPE, new vscode.DataTransferItem(payload));
    }
    async handleDrop(target, dataTransfer, _token) {
        const item = dataTransfer.get(VirtualFoldersProvider.MIME_TYPE);
        if (!item) {
            return;
        }
        const payload = await item.asString();
        const filePaths = JSON.parse(payload);
        let targetSegments = [];
        if (target && target.kind === 'folder' && target.folderSegments) {
            targetSegments = target.folderSegments;
        }
        else if (target && target.kind === 'file') {
            vscode.window.showInformationMessage('Drop is only supported on virtual folders or root.');
            return;
        }
        for (const filePath of filePaths) {
            const newPath = targetSegments.length ? `${targetSegments.join('.')}` : '';
            await (0, pathAnnotation_1.applyOrUpdatePathAnnotationOnFile)(filePath, newPath);
        }
        this.refresh();
    }
    dispose() {
        // nothing for now
    }
    buildTree() {
        const apexFiles = (0, apexMetadata_1.findApexClasses)(this.workspaceRoot);
        const lwcComponents = (0, apexMetadata_1.findLwcComponents)(this.workspaceRoot);
        if (!apexFiles.length && !lwcComponents.length) {
            const placeholder = new treeItems_1.VirtualFolderItem({
                label: 'No Apex classes or LWC components found',
                kind: 'folder',
                collapsibleState: vscode.TreeItemCollapsibleState.None
            });
            return [placeholder];
        }
        const rootNode = { children: new Map(), files: [] };
        // Apex
        for (const file of apexFiles) {
            const info = (0, apexMetadata_1.readApexClassInfo)(file);
            const virtualPath = (info.pathAnnotation ?? '').split('.').map(s => s.trim()).filter(Boolean);
            let current = rootNode;
            for (const segment of virtualPath) {
                if (!current.children.has(segment)) {
                    current.children.set(segment, { children: new Map(), files: [] });
                }
                current = current.children.get(segment);
            }
            const fileItem = new treeItems_1.VirtualFolderItem({
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
                current = current.children.get(segment);
            }
            const compSegment = comp.name;
            let childNode = current.children.get(compSegment);
            if (!childNode) {
                childNode = { children: new Map(), files: [], isLwcRoot: true };
                current.children.set(compSegment, childNode);
            }
            else {
                // LWC vince sempre se esiste con questo nome
                childNode.isLwcRoot = true;
            }
            const compNode = childNode;
            const allFiles = [comp.controllerPath, ...comp.otherFiles];
            for (const filePath of allFiles) {
                const rel = path.relative(comp.folderPath, filePath) || path.basename(filePath);
                const label = rel.replace(/\\\\/g, '/');
                const fileItem = new treeItems_1.VirtualFolderItem({
                    label,
                    kind: 'file',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    filePath
                });
                compNode.files.push(fileItem);
            }
        }
        const convertNodeToItems = (node, parentSegments) => {
            const result = [];
            for (const [folderName, childNode] of node.children.entries()) {
                const segments = [...parentSegments, folderName];
                const folderItem = new treeItems_1.VirtualFolderItem({
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
exports.VirtualFoldersProvider = VirtualFoldersProvider;
//# sourceMappingURL=virtualFoldersProvider.js.map