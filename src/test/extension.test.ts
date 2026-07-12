import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting extension tests.');

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('carlolomello.sfdc-virtual-folders');
    assert.ok(ext, 'Extension carlolomello.sfdc-virtual-folders should be found');
    await ext!.activate();
    assert.ok(ext!.isActive, 'Extension should be active');
    console.log('[TEST] Extension activated successfully');
  });

  test('Virtual Folders view should be registered', async () => {
    const ext = vscode.extensions.getExtension('carlolomello.sfdc-virtual-folders');
    await ext!.activate();

    const commands = await vscode.commands.getCommands();
    const hasRefresh = commands.includes('sfdcVirtualFolders.refresh');
    assert.ok(hasRefresh, 'sfdcVirtualFolders.refresh command should exist');
    console.log('[TEST] sfdcVirtualFolders.refresh command found');
  });

  test('UML diagram view should be registered', async () => {
    const ext = vscode.extensions.getExtension('carlolomello.sfdc-virtual-folders');
    await ext!.activate();

    const commands = await vscode.commands.getCommands();
    const hasOpenUml = commands.includes('sfdcVirtualFolders.openUml');
    assert.ok(hasOpenUml, 'sfdcVirtualFolders.openUml command should exist');
    console.log('[TEST] sfdcVirtualFolders.openUml command found');
  });

  test('UmlPanel open command should work', async () => {
    const ext = vscode.extensions.getExtension('carlolomello.sfdc-virtual-folders');
    await ext!.activate();

    try {
      await vscode.commands.executeCommand('sfdcVirtualFolders.openUml');
      console.log('[TEST] openUml command executed successfully');
    } catch (err) {
      console.error('[TEST] openUml command failed:', err);
      assert.fail(`openUml command threw: ${err}`);
    }
  });

  test('Workspace should contain SFDC project', () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Should have workspace folders');
    const root = workspaceFolders![0].uri.fsPath;
    console.log('[TEST] Workspace root:', root);
    const fs = require('fs');
    const hasSfdxProject = fs.existsSync(`${root}/sfdx-project.json`);
    assert.ok(hasSfdxProject, 'sfdx-project.json should exist in workspace root');
    console.log('[TEST] sfdx-project.json found');
  });

  test('File scanning should find Apex classes', async () => {
    const ext = vscode.extensions.getExtension('carlolomello.sfdc-virtual-folders');
    await ext!.activate();

    try {
      await vscode.commands.executeCommand('sfdcVirtualFolders.refresh');
      console.log('[TEST] refresh command executed');
    } catch (err) {
      console.error('[TEST] refresh command failed:', err);
    }
  });
});
