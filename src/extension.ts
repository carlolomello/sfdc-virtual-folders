import * as vscode from 'vscode';
import { VirtualFoldersProvider } from './views/virtualFoldersProvider';
import { TagViewProvider } from './views/tagViewProvider';
import { extractPathAnnotationFromText } from './services/apexMetadata';
import { applyOrUpdatePathAnnotation } from './services/pathAnnotation';

/**
 * Punto di ingresso dell'estensione.
 * Qui registriamo:
 * - le due TreeView (Virtual Folders, Virtual Tags)
 * - i comandi (refresh, toggle, setPath, filterTags)
 * - i watcher su file Apex/LWC e il focus automatico sull'editor.
 */

export function activate(context: vscode.ExtensionContext) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  console.log('[VirtualFolders] activate, workspaceRoot =', root);

  // Provider e TreeView per cartelle virtuali.
  const foldersProvider = new VirtualFoldersProvider(root);
  const foldersTreeView = vscode.window.createTreeView('sfdcVirtualApexFolders', {
    treeDataProvider: foldersProvider,
    dragAndDropController: foldersProvider,
    showCollapseAll: true
  });

  // Provider e TreeView per i TAG virtuali.
  const tagsProvider = new TagViewProvider(root);
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

  const setPathCommand = vscode.commands.registerCommand(
    'sfdcVirtualFolders.setPathForCurrentClass',
    async (uriFromContext?: vscode.Uri) => {
      let doc: vscode.TextDocument | undefined;
      if (uriFromContext) {
        doc = await vscode.workspace.openTextDocument(uriFromContext);
      } else {
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

      const currentPath = extractPathAnnotationFromText(doc.getText());
      const newPath = await vscode.window.showInputBox({
        title: 'Virtual path for this Apex class (@path ...)',
        prompt: 'Example: Root.Folder.Subfolder',
        value: currentPath ?? ''
      });

      if (newPath === undefined) {
        return;
      }

      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      await applyOrUpdatePathAnnotation(doc, editor, newPath.trim());
      await doc.save();

      foldersProvider.refresh();
      tagsProvider.refresh();
    }
  );

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

  // --------- Watcher su file Apex e LWC ---------

  if (root) {
    const apexWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, 'force-app/main/default/classes/**/*.cls')
    );

    apexWatcher.onDidCreate(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
    apexWatcher.onDidChange(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
    apexWatcher.onDidDelete(() => { foldersProvider.refresh(); tagsProvider.refresh(); });

    const lwcWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, 'force-app/main/default/lwc/**/*.*')
    );

    lwcWatcher.onDidCreate(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
    lwcWatcher.onDidChange(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
    lwcWatcher.onDidDelete(() => { foldersProvider.refresh(); tagsProvider.refresh(); });

    context.subscriptions.push(apexWatcher, lwcWatcher);

    // --------- Focus automatico sul file aperto (Apex o LWC) ---------

    const editorListener = vscode.window.onDidChangeActiveTextEditor(async editor => {
      console.log('[VirtualFolders] onDidChangeActiveTextEditor fired, editor =', editor?.document.fileName);
      if (!editor) {
        return;
      }

      const config = vscode.workspace.getConfiguration('sfdcVirtualFolders');
      const autoReveal = config.get<boolean>('autoRevealActiveClass', true);
      if (!autoReveal) {
        console.log('[VirtualFolders] autoRevealActiveClass = false, skipping reveal');
        return;
      }

      const item = foldersProvider.getItemForUri(editor.document.uri);
      console.log('[VirtualFolders] getItemForUri result =', item?.label);
      if (!item) {
        return;
      }

      try {
        // Selezione “soft”: aggiorna la selection ma non chiede il focus
        await foldersTreeView.reveal(item, { select: true, focus: false, expand: true });

        // Riporta il focus all'editor attivo (così la Search non viene “chiusa”)
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      } catch (err) {
        console.log('[VirtualFolders] reveal error', err);
      }
    });

    context.subscriptions.push(editorListener);
  }

  // Registrazione di tutte le risorse alla chiusura dell'estensione.
  context.subscriptions.push(
    foldersTreeView,
    foldersProvider,
    tagsTreeView,
    tagsProvider,
    refreshFoldersCommand,
    toggleCommand,
    setPathCommand,
    refreshTagsCommand,
    filterTagsCommand
  );
}

export function deactivate() {
  console.log('[VirtualFolders] deactivate');
}
