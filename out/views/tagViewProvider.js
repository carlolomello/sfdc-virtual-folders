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
/**
 * Provider per la vista "Virtual Tags" basata sui @tag in classi Apex e componenti LWC.
 *
 * - Raggruppa le risorse per tag.
 * - Supporta un semplice filtro per mostrare solo alcuni tag.
 */
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
        // --- Tag dalle classi Apex ---
        for (const file of apexFiles) {
            const info = (0, apexMetadata_1.readApexClassInfo)(file);
            if (!info.tags.length) {
                continue;
            }
            const label = path.basename(file, '.cls');
            for (const tag of info.tags) {
                const key = tag.toLowerCase();
                if (!tagMap.has(key)) {
                    tagMap.set(key, []);
                }
                tagMap.get(key).push({ label, filePath: file });
            }
        }
        // --- Tag dai componenti LWC (controller) ---
        for (const comp of lwcComponents) {
            if (!comp.tags.length) {
                continue;
            }
            for (const tag of comp.tags) {
                const key = tag.toLowerCase();
                if (!tagMap.has(key)) {
                    tagMap.set(key, []);
                }
                tagMap.get(key).push({ label: comp.name, filePath: comp.controllerPath });
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
            const resourcesForTag = tagMap.get(tagKey);
            const tagItem = new treeItems_1.TagTreeItem({
                label: displayTag,
                kind: 'tag',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                tagName: displayTag
            });
            tagItem.children = resourcesForTag
                .sort((a, b) => a.label.localeCompare(b.label))
                .map(res => {
                return new treeItems_1.TagTreeItem({
                    label: res.label,
                    kind: 'file',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    filePath: res.filePath
                });
            });
            result.push(tagItem);
        }
        return result;
    }
}
exports.TagViewProvider = TagViewProvider;
//# sourceMappingURL=tagViewProvider.js.map