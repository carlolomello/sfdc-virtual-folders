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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const virtualFoldersProvider_1 = require("./views/virtualFoldersProvider");
const tagViewProvider_1 = require("./views/tagViewProvider");
const apexMetadata_1 = require("./services/apexMetadata");
const pathAnnotation_1 = require("./services/pathAnnotation");
const treeItems_1 = require("./models/treeItems");
/**
 * Punto di ingresso dell'estensione.
 * Qui registriamo:
 * - le due TreeView (Virtual Folders, Virtual Tags)
 * - i comandi (refresh, toggle, setPath, filterTags)
 * - i watcher su file Apex/LWC e il focus automatico sull'editor.
 */
function activate(context) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    console.log('[VirtualFolders] activate, workspaceRoot =', root);
    // --------- Colori folder Apex e LWC ---------
    // Va PRIMA dei provider, perché i provider costruiscono gli item subito.
    const yellow = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icons', 'folder-yellow.svg');
    const green = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icons', 'folder-green.svg');
    treeItems_1.VirtualFolderItem.yellowFolderIcon = yellow;
    treeItems_1.VirtualFolderItem.greenFolderIcon = green;
    // Provider e TreeView per cartelle virtuali.
    const foldersProvider = new virtualFoldersProvider_1.VirtualFoldersProvider(root);
    const foldersTreeView = vscode.window.createTreeView('sfdcVirtualApexFolders', {
        treeDataProvider: foldersProvider,
        dragAndDropController: foldersProvider,
        showCollapseAll: true
    });
    // Provider e TreeView per i TAG virtuali.
    const tagsProvider = new tagViewProvider_1.TagViewProvider(root);
    const tagsTreeView = vscode.window.createTreeView('sfdcVirtualApexTags', {
        treeDataProvider: tagsProvider,
        showCollapseAll: true
    });
    // --------- Comandi FOLDERS ---------
    const refreshFoldersCommand = vscode.commands.registerCommand('sfdcVirtualFolders.refresh', () => {
        console.log('[VirtualFolders] refresh command called');
        foldersProvider.refresh();
    });
    const toggleCommand = vscode.commands.registerCommand('sfdcVirtualFolders.toggleEnabled', async () => {
        const config = vscode.workspace.getConfiguration('sfdcVirtualFolders');
        const current = config.get('enabled', true);
        const next = !current;
        await config.update('enabled', next, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`Virtual Folders ${next ? 'enabled' : 'disabled'} for this workspace.`);
        foldersProvider.setEnabled(next);
    });
    const setPathCommand = vscode.commands.registerCommand('sfdcVirtualFolders.setPathForCurrentClass', async (uriFromContext) => {
        let doc;
        if (uriFromContext) {
            doc = await vscode.workspace.openTextDocument(uriFromContext);
        }
        else {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                doc = editor.document;
            }
        }
        if (!doc) {
            vscode.window.showInformationMessage('No Apex class selected.');
            return;
        }
        if (doc.languageId !== 'apex' && !doc.fileName.endsWith('.cls')) {
            vscode.window.showInformationMessage('This command works only on Apex class files (.cls).');
            return;
        }
        const currentPath = (0, apexMetadata_1.extractPathAnnotationFromText)(doc.getText());
        const newPath = await vscode.window.showInputBox({
            title: 'Virtual path for this Apex class (@path ...)',
            prompt: 'Example: Root.Folder.Subfolder',
            value: currentPath ?? ''
        });
        if (newPath === undefined) {
            return;
        }
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        await (0, pathAnnotation_1.applyOrUpdatePathAnnotation)(doc, editor, newPath.trim());
        await doc.save();
        foldersProvider.refresh();
        tagsProvider.refresh();
    });
    // --------- Comandi TAGS ---------
    const refreshTagsCommand = vscode.commands.registerCommand('sfdcVirtualTags.refresh', () => {
        tagsProvider.refresh();
    });
    const filterTagsCommand = vscode.commands.registerCommand('sfdcVirtualTags.filter', async () => {
        const input = await vscode.window.showInputBox({
            title: 'Filter tags (comma-separated)',
            prompt: 'Example: feature1, feature2'
        });
        if (input === undefined) {
            return;
        }
        tagsProvider.setFilter(input);
    });
    const filterFoldersTypeCommand = vscode.commands.registerCommand('sfdcVirtualFolders.filterType', async () => {
        const items = [
            { label: 'ALL', description: 'Show Apex and LWC', value: 'ALL' },
            { label: 'Apex', description: 'Only Apex classes', value: 'APEX' },
            { label: 'LWC', description: 'Only Lightning Web Components', value: 'LWC' }
        ];
        const picked = await vscode.window.showQuickPick(items, {
            title: 'Filter Virtual Folders by type'
        });
        if (!picked) {
            return;
        }
        foldersProvider.setFilter(picked.value);
    });
    // --------- Watcher su file Apex e LWC ---------
    if (root) {
        const apexWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'force-app/main/default/classes/**/*.cls'));
        apexWatcher.onDidCreate(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
        apexWatcher.onDidChange(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
        apexWatcher.onDidDelete(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
        const lwcWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'force-app/main/default/lwc/**/*.*'));
        lwcWatcher.onDidCreate(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
        lwcWatcher.onDidChange(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
        lwcWatcher.onDidDelete(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
        context.subscriptions.push(apexWatcher, lwcWatcher);
    }
    const editorListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        console.log('[VirtualFolders] onDidChangeActiveTextEditor fired, editor =', editor?.document.fileName);
        if (!editor) {
            return;
        }
        const config = vscode.workspace.getConfiguration('sfdcVirtualFolders');
        const autoReveal = config.get('autoRevealActiveClass', true);
        if (!autoReveal) {
            console.log('[VirtualFolders] autoRevealActiveClass = false, skipping reveal');
            return;
        }
        // IMPORTANTE:
        // Se la view Virtual Folders non è visibile, non fare reveal.
        // Questo evita che VS Code ti tolga dalla Search e apra forzatamente Virtual Folders.
        if (!foldersTreeView.visible) {
            console.log('[VirtualFolders] tree view not visible, skipping reveal');
            return;
        }
        const item = foldersProvider.getItemForUri(editor.document.uri);
        console.log('[VirtualFolders] getItemForUri result =', item?.label);
        if (!item) {
            return;
        }
        try {
            await foldersTreeView.reveal(item, {
                select: true,
                focus: false,
                expand: true
            });
        }
        catch (err) {
            console.log('[VirtualFolders] reveal error', err);
        }
    });
    // Registrazione di tutte le risorse alla chiusura dell'estensione.
    context.subscriptions.push(foldersTreeView, foldersProvider, tagsTreeView, tagsProvider, refreshFoldersCommand, toggleCommand, setPathCommand, refreshTagsCommand, filterTagsCommand, filterFoldersTypeCommand, editorListener);
}
function deactivate() {
    console.log('[VirtualFolders] deactivate');
}
//# sourceMappingURL=extension.js.map