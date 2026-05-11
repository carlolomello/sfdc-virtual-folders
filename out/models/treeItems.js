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
exports.TagTreeItem = exports.VirtualFolderItem = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Nodo dell'albero per la vista delle cartelle virtuali (@path).
 */
class VirtualFolderItem extends vscode.TreeItem {
    children;
    kind;
    folderSegments;
    filePath;
    constructor(options) {
        super(options.label, options.collapsibleState);
        this.kind = options.kind;
        this.folderSegments = options.folderSegments;
        this.filePath = options.filePath;
        if (options.kind === 'file' && options.filePath) {
            const uri = vscode.Uri.file(options.filePath);
            this.resourceUri = uri;
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [uri]
            };
            this.contextValue = 'virtualFile';
        }
        else {
            this.contextValue = 'virtualFolder';
        }
    }
}
exports.VirtualFolderItem = VirtualFolderItem;
/**
 * Nodo dell'albero per la vista dei TAG virtuali (@tag).
 */
class TagTreeItem extends vscode.TreeItem {
    children;
    kind;
    tagName;
    filePath;
    constructor(options) {
        super(options.label, options.collapsibleState);
        this.kind = options.kind;
        this.tagName = options.tagName;
        this.filePath = options.filePath;
        if (options.kind === 'file' && options.filePath) {
            const uri = vscode.Uri.file(options.filePath);
            this.resourceUri = uri;
            this.command = {
                command: 'vscode.open',
                title: 'Open Tagged File',
                arguments: [uri]
            };
            this.contextValue = 'taggedResource';
        }
        else if (options.kind === 'tag') {
            this.contextValue = 'virtualTagFolder';
            this.tooltip = `Tag: ${options.tagName}`;
        }
    }
}
exports.TagTreeItem = TagTreeItem;
//# sourceMappingURL=treeItems.js.map