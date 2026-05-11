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
exports.TagViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const treeItems_1 = require("../models/treeItems");
const apexMetadata_1 = require("../services/apexMetadata");
class TagViewProvider {
    workspaceRoot;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    rootNodes = [];
    filterText = '';
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.refresh();
    }
    dispose() { }
    setFilter(filter) {
        this.filterText = filter;
        this.refresh();
    }
    refresh() {
        this.rootNodes = this.buildTree();
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.workspaceRoot) {
            return [];
        }
        if (!element) {
            return this.rootNodes;
        }
        return element.children ?? [];
    }
    buildTree() {
        if (!this.workspaceRoot) {
            return [];
        }
        const apexFiles = (0, apexMetadata_1.findApexClasses)(this.workspaceRoot);
        const lwcComponents = (0, apexMetadata_1.findLwcComponents)(this.workspaceRoot);
        if (!apexFiles.length && !lwcComponents.length) {
            return [];
        }
        const tagMap = new Map();
        const ensureEntry = (tagKey) => {
            if (!tagMap.has(tagKey)) {
                tagMap.set(tagKey, { apex: [], lwc: [] });
            }
            return tagMap.get(tagKey);
        };
        // Apex tags
        for (const file of apexFiles) {
            const info = (0, apexMetadata_1.readApexClassInfo)(file);
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
        const result = [];
        for (const tagKey of activeTags.sort()) {
            const displayTag = tagKey;
            const entry = tagMap.get(tagKey);
            const tagItem = new treeItems_1.TagTreeItem({
                label: displayTag,
                kind: 'tag',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                tagName: displayTag
            });
            const children = [];
            // Apex resources
            for (const res of entry.apex.sort((a, b) => a.label.localeCompare(b.label))) {
                children.push(new treeItems_1.TagTreeItem({
                    label: res.label,
                    kind: 'file',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    filePath: res.filePath
                }));
            }
            // LWC components (folder + files)
            for (const lwc of entry.lwc.sort((a, b) => a.name.localeCompare(b.name))) {
                const lwcRoot = new treeItems_1.TagTreeItem({
                    label: lwc.name,
                    kind: 'lwcRoot',
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                });
                const allFiles = [lwc.controllerPath, ...lwc.otherFiles];
                lwcRoot.children = allFiles
                    .map(filePath => {
                    const rel = path.relative(lwc.folderPath, filePath) || path.basename(filePath);
                    const label = rel.replace(/\\/g, '/');
                    return new treeItems_1.TagTreeItem({
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
exports.TagViewProvider = TagViewProvider;
//# sourceMappingURL=tagViewProvider.js.map