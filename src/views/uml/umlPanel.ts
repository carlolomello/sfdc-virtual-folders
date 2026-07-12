import * as vscode from 'vscode';
import * as fs from 'fs';
import type { UmlNodeData, UmlRelationship, UmlLayoutState, UmlResourceItem } from './umlModels';
import { scanResources, buildNodesAndRelationships } from './umlService';
import { loadLayout, saveLayout, buildEmptyLayout } from './umlLayoutStore';

// Singleton per il pannello UML (tab laterale col grafico)
let _panelInstance: vscode.WebviewPanel | undefined;
let _panelLayout: UmlLayoutState = buildEmptyLayout();
let _panelExtUri: vscode.Uri | undefined;

export class UmlPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sfdcUmlDiagram';

  private _view: vscode.WebviewView | undefined;
  private _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  // ---- WebviewView (sidebar) ----

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    console.log('[VIRTUAL UML] resolveWebviewView called');
    this._view = webviewView;

    try {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
          vscode.Uri.joinPath(this._extensionUri, 'resources'),
        ],
      };
      webviewView.webview.html = this._getSidebarHtml();

      webviewView.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
        if (msg.type === 'openPanel') {
          vscode.commands.executeCommand('sfdcVirtualFolders.openUml');
        }
      });
    } catch (err: unknown) {
      console.error('[VIRTUAL UML] resolveWebviewView error:', err);
    }
  }

  private _getSidebarHtml(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const scanned = scanResources(root);

    const toHtml = (items: { id: string; label: string }[]) =>
      items.map(i => `<label><input type="checkbox" class="res" data-id="${i.id}"> ${i.label}</label>`).join('\n');

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
body{font-family:sans-serif;font-size:12px;padding:8px;color:var(--vscode-sideBar-foreground)}
h3{margin:0 0 4px;font-size:14px;font-weight:600}
p.desc{font-size:11px;color:var(--vscode-descriptionForeground);margin:0 0 8px}
label{display:block;padding:2px 0}
button{margin-top:8px;width:100%;padding:6px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;cursor:pointer;border-radius:2px}
.s{margin-bottom:8px}
.st{font-size:11px;font-weight:600;text-transform:uppercase;color:var(--vscode-descriptionForeground);margin-bottom:4px}
hr{border:none;border-top:1px solid var(--vscode-panel-border);margin:12px 0}
.legend-item{font-size:11px;padding:1px 0;color:var(--vscode-descriptionForeground)}
.legend-item span{display:inline-block;width:20px;height:2px;vertical-align:middle;margin-right:6px}
.legend-item span.dashed{border-top:2px dashed;height:0}
.legend-item span.dotted{border-top:2px dotted;height:0}
</style></head><body>
<h3>VIRTUAL UML</h3>
<p class="desc">Select resources and generate a UML diagram</p>

<div class="s"><div class="st">Apex (${scanned.apexItems.length})</div>${toHtml(scanned.apexItems) || '<p style="color:var(--vscode-descriptionForeground)">None</p>'}</div>
<div class="s"><div class="st">Triggers (${scanned.triggerItems.length})</div>${toHtml(scanned.triggerItems) || '<p style="color:var(--vscode-descriptionForeground)">None</p>'}</div>
<div class="s"><div class="st">LWC (${scanned.lwcItems.length})</div>${toHtml(scanned.lwcItems) || '<p style="color:var(--vscode-descriptionForeground)">None</p>'}</div>
<button onclick="vscode.postMessage({type:'openPanel'})">Open UML Diagram</button>

<hr>
<div style="font-size:11px;color:var(--vscode-descriptionForeground)">
<strong style="color:var(--vscode-sideBar-foreground)">Legend</strong>
<div class="legend-item"><span style="background:#d4a017"></span> extends (abstract)</div>
<div class="legend-item"><span style="background:#e6a700"></span> extends (concrete)</div>
<div class="legend-item"><span class="dashed" style="border-color:#58a6ff"></span> implements</div>
<div class="legend-item"><span class="dashed" style="border-color:#888"></span> dependency</div>
<div class="legend-item"><span class="dotted" style="border-color:#666"></span> reference</div>
</div>
<script nonce="${Math.random().toString(36).substring(2)}">const vscode=acquireVsCodeApi();</script>
</body></html>`;
  }

  // ---- WebviewPanel (tab grafico) ----

  static openOrFocus(extensionUri: vscode.Uri): void {
    _panelExtUri = extensionUri;

    if (_panelInstance) {
      _panelInstance.reveal(undefined, true);
      UmlPanel._loadPanelData();
      return;
    }

    _panelInstance = vscode.window.createWebviewPanel(
      'sfdcUmlPanel',
      'VIRTUAL UML',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'node_modules'),
          vscode.Uri.joinPath(extensionUri, 'resources'),
        ],
      }
    );

    _panelInstance.iconPath = vscode.Uri.joinPath(
      extensionUri, 'resources', 'icons', 'folder-yellow.svg'
    );

    _panelInstance.webview.html = UmlPanel._getPanelHtml(extensionUri, _panelInstance.webview);

    _panelInstance.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      switch (msg.type) {
        case 'generate':
          await UmlPanel._handleGenerate(msg.files as string[]);
          break;
        case 'nodeMoved':
          UmlPanel._handleNodeMoved(msg.id as string, msg.x as number, msg.y as number);
          break;
        case 'svgData':
          await UmlPanel._handleSvgData(msg.format as string, msg.dataUrl as string, extensionUri);
          break;
      }
    });

    _panelInstance.onDidDispose(() => {
      _panelInstance = undefined;
    });

    UmlPanel._loadPanelData();
  }

  static refresh(): void {
    UmlPanel._loadPanelData();
  }

  private static _loadPanelData(): void {
    if (!_panelInstance) {return;}
    try {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      console.log('[VIRTUAL UML] _loadPanelData, root =', root);
      const saved = loadLayout(root);
      _panelLayout = saved ?? buildEmptyLayout();
      const scanned = scanResources(root);
      console.log('[VIRTUAL UML] scanResources:', scanned.items.length, 'items');
      const items: UmlResourceItem[] = scanned.items.map(i => ({
        id: i.id, label: i.label, filePath: i.filePath, kind: i.kind, sourceType: i.sourceType,
      }));
      const selectedFiles = _panelLayout.selectedFiles.filter(f =>
        scanned.items.some(i => i.id === f)
      );
      let nodes: UmlNodeData[] = [];
      let relationships: UmlRelationship[] = [];
      if (selectedFiles.length > 0) {
        const result = buildNodesAndRelationships(selectedFiles);
        nodes = result.nodes;
        relationships = result.relationships;
      }
      _panelInstance.webview.postMessage({
        type: 'init', items, selectedFiles, nodes, relationships,
        layoutNodes: _panelLayout.nodes,
      });
    } catch (err: unknown) {
      console.error('[VIRTUAL UML] _loadPanelData error:', err);
    }
  }

  private static _handleGenerate(files: string[]): void {
    _panelLayout.selectedFiles = files;
    const { nodes, relationships } = buildNodesAndRelationships(files);
    saveLayout(undefined, _panelLayout);
    _panelInstance?.webview.postMessage({
      type: 'render', nodes, relationships, layoutNodes: _panelLayout.nodes,
    });
  }

  private static _handleNodeMoved(id: string, x: number, y: number): void {
    _panelLayout.nodes[id] = { x, y };
    saveLayout(undefined, _panelLayout);
  }

  private static async _handleSvgData(format: string, dataUrl: string, extUri: vscode.Uri): Promise<void> {
    const ext = format === 'pdf' ? 'pdf' : 'png';
    const uri = await vscode.window.showSaveDialog({
      filters: { [ext.toUpperCase()]: [ext] },
      defaultUri: vscode.Uri.joinPath(extUri, `uml-diagram.${ext}`),
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

  private static _getPanelHtml(extUri: vscode.Uri, webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(extUri, 'resources', 'uml', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const jointUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extUri, 'node_modules', '@joint', 'core', 'dist', 'joint.min.js')
    );
    html = html
      .replace('${cspSource}', webview.cspSource)
      .replace('${jointUri}', jointUri.toString());
    return html;
  }
}
