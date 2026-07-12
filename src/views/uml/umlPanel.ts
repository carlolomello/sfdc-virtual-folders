import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { UmlNodeData, UmlRelationship, UmlLayoutState, UmlResourceItem } from './umlModels';
import { scanResources, buildNodesAndRelationships } from './umlService';
import { loadLayout, saveLayout, buildEmptyLayout } from './umlLayoutStore';

export class UmlPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sfdcUmlDiagram';

  private _view?: vscode.WebviewView;
  private _workspaceRoot: string | undefined;
  private _currentLayout: UmlLayoutState = buildEmptyLayout();

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
        vscode.Uri.joinPath(this._extensionUri, 'resources'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'generate':
          await this._handleGenerate(msg.files as string[]);
          break;
        case 'nodeMoved':
          this._handleNodeMoved(msg.id as string, msg.x as number, msg.y as number);
          break;
        case 'svgData':
          await this._handleSvgData(msg.format as string, msg.dataUrl as string);
          break;
      }
    });

    this._loadAndSendInit();
  }

  refresh(): void {
    this._loadAndSendInit();
  }

  private async _loadAndSendInit(): Promise<void> {
    if (!this._view) {return;}

    const saved = loadLayout(this._workspaceRoot);
    this._currentLayout = saved ?? buildEmptyLayout();
    const scanned = scanResources(this._workspaceRoot);

    const items: UmlResourceItem[] = scanned.items.map(i => ({
      id: i.id,
      label: i.label,
      filePath: i.filePath,
      kind: i.kind,
    }));

    const selectedFiles = this._currentLayout.selectedFiles.filter(f =>
      scanned.items.some(i => i.id === f)
    );

    let nodes: UmlNodeData[] = [];
    let relationships: UmlRelationship[] = [];

    if (selectedFiles.length > 0) {
      const result = buildNodesAndRelationships(selectedFiles);
      nodes = result.nodes;
      relationships = result.relationships;
    }

    this._view.webview.postMessage({
      type: 'init',
      items,
      selectedFiles,
      nodes,
      relationships,
      layoutNodes: this._currentLayout.nodes,
    });
  }

  private async _handleGenerate(files: string[]): Promise<void> {
    if (!this._view) {return;}

    this._currentLayout.selectedFiles = files;
    const { nodes, relationships } = buildNodesAndRelationships(files);
    saveLayout(this._workspaceRoot, this._currentLayout);

    this._view.webview.postMessage({
      type: 'render',
      nodes,
      relationships,
      layoutNodes: this._currentLayout.nodes,
    });
  }

  private _handleNodeMoved(id: string, x: number, y: number): void {
    this._currentLayout.nodes[id] = { x, y };
    saveLayout(this._workspaceRoot, this._currentLayout);
  }

  private async _handleSvgData(format: string, dataUrl: string): Promise<void> {
    const ext = format === 'pdf' ? 'pdf' : 'png';

    const uri = await vscode.window.showSaveDialog({
      filters: { [ext.toUpperCase()]: [ext] },
      defaultUri: vscode.Uri.joinPath(
        this._extensionUri,
        `uml-diagram.${ext}`
      ),
    });

    if (!uri) {return;}

    try {
      const base64 = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`UML diagram saved as ${ext.toUpperCase()}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save ${ext.toUpperCase()}: ${err}`);
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'uml', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    const jointUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@joint', 'core', 'dist', 'joint.min.js')
    );

    html = html.replace(
      '</head>',
      `<script src="${jointUri}"></script>\n</head>`
    );

    return html;
  }
}
