import * as vscode from 'vscode';
import { VirtualFoldersProvider, FolderFilter } from './views/virtualFoldersProvider';
import { TagViewProvider } from './views/tagViewProvider';
import { extractPathAnnotationFromText } from './services/apexMetadata';
import { applyOrUpdatePathAnnotation } from './services/pathAnnotation';
import { VirtualFolderItem } from './models/treeItems';

/**
 * Punto di ingresso dell'estensione.
 * Qui registriamo:
 * - le due TreeView (Virtual Folders, Virtual Tags)
 * - i comandi (refresh, toggle, setPath, filterTags)
 * - i watcher su file Apex/LWC e il focus automatico sull'editor.
 */

const SALESFORCE_COMMAND_MAP: Record<string, string> = {
  'sfdcVirtualFolders.deploySource': 'sf.metadata.deploy.source.path',
  'sfdcVirtualFolders.retrieveSource': 'sf.metadata.retrieve.source.path',
  'sfdcVirtualFolders.diffSource': 'sf.metadata.source.diff',
  'sfdcVirtualFolders.deleteSource': 'sf.metadata.delete.source',
};

export async function activate(context: vscode.ExtensionContext) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  console.log('[VirtualFolders] activate, workspaceRoot =', root);

  // --------- Colori folder Apex e LWC ---------
  // Va PRIMA dei provider, perché i provider costruiscono gli item subito.
  const yellow = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icons', 'folder-yellow.svg');
  const green = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icons', 'folder-green.svg');
  VirtualFolderItem.yellowFolderIcon = yellow;
  VirtualFolderItem.greenFolderIcon = green;

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

      if (doc.languageId !== 'apex' && !doc.fileName.endsWith('.cls') && !doc.fileName.endsWith('.trigger')) {
        vscode.window.showInformationMessage('This command works only on Apex class or trigger files.');
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

  const filterFoldersTypeCommand = vscode.commands.registerCommand('sfdcVirtualFolders.filterType', async () => {
    const items: { label: string; description: string; value: FolderFilter }[] = [
      { label: 'ALL', description: 'Show Apex, Triggers and LWC', value: 'ALL' },
      { label: 'Apex', description: 'Only Apex classes', value: 'APEX' },
      { label: 'Triggers', description: 'Only Apex triggers', value: 'TRIGGER' },
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

    const triggerWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, 'force-app/main/default/triggers/**/*.trigger')
    );

    triggerWatcher.onDidCreate(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
    triggerWatcher.onDidChange(() => { foldersProvider.refresh(); tagsProvider.refresh(); });
    triggerWatcher.onDidDelete(() => { foldersProvider.refresh(); tagsProvider.refresh(); });

    context.subscriptions.push(apexWatcher, lwcWatcher, triggerWatcher);
  }

  const editorListener = vscode.window.onDidChangeActiveTextEditor(async editor => {
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
    } catch (err) {
      console.log('[VirtualFolders] reveal error', err);
    }
  });

  // --------- Wrapper comandi Salesforce (con detection a runtime) ---------
  // I command ID Salesforce possono cambiare con gli aggiornamenti del SF Extension Pack.
  // Usiamo wrapper nostri che delegano al comando reale solo se esiste.

  const availableCommands = await vscode.commands.getCommands();

  for (const [ourId, salesforceId] of Object.entries(SALESFORCE_COMMAND_MAP)) {
    const exists = availableCommands.includes(salesforceId);

    const disposable = vscode.commands.registerCommand(ourId, async (...args: unknown[]) => {
      if (exists) {
        return vscode.commands.executeCommand(salesforceId, ...args);
      }
      vscode.window.showErrorMessage(
        `Comando Salesforce "${salesforceId}" non trovato. ` +
        'Aggiorna il Salesforce Extension Pack o verifica la compatibilità.'
      );
    });

    context.subscriptions.push(disposable);
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
    filterTagsCommand,
    filterFoldersTypeCommand,
    editorListener
  );
}

export function deactivate() {
  console.log('[VirtualFolders] deactivate');
}
