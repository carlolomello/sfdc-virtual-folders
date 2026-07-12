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
exports.normalizeFolderFilter = normalizeFolderFilter;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const treeItems_1 = require("../models/treeItems");
const apexMetadata_1 = require("../services/apexMetadata");
const pathAnnotation_1 = require("../services/pathAnnotation");
function normalizeFolderFilter(value) {
    const normalized = String(value ?? 'ALL').trim().toUpperCase();
    if (normalized === 'APEX') {
        return 'APEX';
    }
    if (normalized === 'LWC') {
        return 'LWC';
    }
    if (normalized === 'TRIGGER') {
        return 'TRIGGER';
    }
    return 'ALL';
}
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
    filter = 'ALL';
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
    getFilter() {
        return this.filter;
    }
    setFilter(filter) {
        const normalized = normalizeFolderFilter(filter);
        if (this.filter === normalized) {
            return;
        }
        this.filter = normalized;
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
        return element.parent;
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
            .filter(item => item.kind === 'file' && item.filePath && (item.filePath.endsWith('.cls') || item.filePath.endsWith('.trigger')))
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
        const triggerFiles = (0, apexMetadata_1.findApexTriggers)(this.workspaceRoot);
        const lwcComponents = (0, apexMetadata_1.findLwcComponents)(this.workspaceRoot);
        if (!apexFiles.length && !triggerFiles.length && !lwcComponents.length) {
            const placeholder = new treeItems_1.VirtualFolderItem({
                label: 'No Apex classes, triggers, or LWC components found',
                kind: 'folder',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                id: 'placeholder:no-files'
            });
            return [placeholder];
        }
        const createNode = () => ({
            children: new Map(),
            files: []
        });
        const rootNode = createNode();
        const getOrCreateChild = (node, segment) => {
            let child = node.children.get(segment);
            if (!child) {
                child = createNode();
                node.children.set(segment, child);
            }
            return child;
        };
        // Apex
        for (const file of apexFiles) {
            const info = (0, apexMetadata_1.readApexClassInfo)(file);
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
        // Triggers
        for (const file of triggerFiles) {
            const info = (0, apexMetadata_1.readApexClassInfo)(file);
            const virtualPath = (info.pathAnnotation ?? '').split('.').map(s => s.trim()).filter(Boolean);
            let current = rootNode;
            for (const segment of virtualPath) {
                current = getOrCreateChild(current, segment);
            }
            current.files.push({
                label: path.basename(file, '.trigger'),
                filePath: file,
                sourceType: 'TRIGGER'
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
        const shouldIncludeFile = (file) => {
            return this.filter === 'ALL' || this.filter === file.sourceType;
        };
        const convertNodeToItems = (node, parentSegments, parent) => {
            const result = [];
            for (const [folderName, childNode] of node.children.entries()) {
                const segments = [...parentSegments, folderName];
                const folderItem = new treeItems_1.VirtualFolderItem({
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
                result.push(new treeItems_1.VirtualFolderItem({
                    label: file.label,
                    kind: 'file',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    filePath: file.filePath,
                    sourceType: file.sourceType,
                    parent,
                    id: `file:${path.normalize(file.filePath).replace(/\\/g, '/')}`
                }));
            }
            return result.sort((a, b) => String(a.label).localeCompare(String(b.label)));
        };
        return convertNodeToItems(rootNode, []);
    }
}
exports.VirtualFoldersProvider = VirtualFoldersProvider;
//# sourceMappingURL=virtualFoldersProvider.js.map