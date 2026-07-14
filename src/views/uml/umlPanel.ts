import * as vscode from 'vscode';
import * as fs from 'fs';
import type { UmlNodeData, UmlRelationship, UmlLayoutState, UmlResourceItem } from './umlModels';
import { scanResources, buildNodesAndRelationships, buildFullGraph } from './umlService';
import { loadLayout, saveLayout, buildEmptyLayout } from './umlLayoutStore';

let _panelInstance: vscode.WebviewPanel | undefined;
let _panelLayout: UmlLayoutState = buildEmptyLayout();
let _panelExtUri: vscode.Uri | undefined;
let _panelFullGraph: { nodes: UmlNodeData[]; relationships: UmlRelationship[] } | undefined;

function getRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export class UmlPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sfdcUmlDiagram';

  private _view: vscode.WebviewView | undefined;
  private _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

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
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
body{font-family:sans-serif;font-size:12px;padding:8px;color:var(--vscode-sideBar-foreground)}
h3{margin:0 0 4px;font-size:14px;font-weight:600}
p.desc{font-size:11px;color:var(--vscode-descriptionForeground);margin:0 0 8px}
button{width:100%;padding:6px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;cursor:pointer;border-radius:2px}
hr{border:none;border-top:1px solid var(--vscode-panel-border);margin:12px 0}
.legend-item{font-size:11px;padding:1px 0;color:var(--vscode-descriptionForeground)}
.legend-item span{display:inline-block;width:20px;height:2px;vertical-align:middle;margin-right:6px}
.legend-item span.dashed{border-top:2px dashed;height:0}
.legend-item span.dotted{border-top:2px dotted;height:0}
.legend-color{display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:6px;border:2px solid;border-radius:2px}
</style></head><body>
<h3>VIRTUAL UML</h3>
<p class="desc">Seleziona le risorse nel pannello UML</p>
<button onclick="vscode.postMessage({type:'openPanel'})">Open UML Diagram</button>
<hr>
<div style="font-size:11px;color:var(--vscode-descriptionForeground)">
<strong style="color:var(--vscode-sideBar-foreground)">Relationships</strong>
<div class="legend-item"><span style="background:#d4a017"></span> extends (abstract)</div>
<div class="legend-item"><span style="background:#e6a700"></span> extends (concrete)</div>
<div class="legend-item"><span class="dashed" style="border-color:#58a6ff"></span> implements</div>
<div class="legend-item"><span class="dashed" style="border-color:#666"></span> dependency</div>
<div class="legend-item"><span class="dotted" style="border-color:#555"></span> reference</div>
<div style="margin-top:8px"><strong style="color:var(--vscode-sideBar-foreground)">Entities</strong></div>
<div class="legend-item"><span class="legend-color" style="background:#e8e8e8;border-color:#999"></span> Class</div>
<div class="legend-item"><span class="legend-color" style="background:#e8d4f0;border-color:#9b59b6"></span> Abstract</div>
<div class="legend-item"><span class="legend-color" style="background:#d4e8f0;border-color:#2196F3"></span> Interface</div>
<div class="legend-item"><span class="legend-color" style="background:#fff3cd;border-color:#d39e00"></span> Trigger</div>
<div class="legend-item"><span class="legend-color" style="background:#d4edda;border-color:#28a745"></span> LWC</div>
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
      'sfdcUmlPanel', 'VIRTUAL UML', vscode.ViewColumn.Beside,
      {
        enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'node_modules'),
          vscode.Uri.joinPath(extensionUri, 'resources'),
        ],
      }
    );
    _panelInstance.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'folder-yellow.svg');
    _panelInstance.webview.html = UmlPanel._getPanelHtml(extensionUri, _panelInstance.webview);

    _panelInstance.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      console.log('[VIRTUAL UML] message received:', msg.type);
      switch (msg.type) {
        case 'toggleItem':
          await UmlPanel._handleToggleItem(msg.id as string, msg.checked as boolean);
          break;
        case 'toggleItems':
          await UmlPanel._handleToggleItems(msg.ids as string[], msg.checked as boolean);
          break;
        case 'nodeMoved':
          UmlPanel._handleNodeMoved(msg.id as string, msg.x as number, msg.y as number);
          break;
        case 'addRelated':
          UmlPanel._handleAddRelated(msg.id as string);
          break;
        case 'updateViewOptions':
          UmlPanel._handleUpdateViewOptions(msg.showModifiers as boolean, msg.showMethods as boolean, msg.showProperties as boolean);
          break;
      }
    });

    _panelInstance.onDidDispose(() => { _panelInstance = undefined; });
    UmlPanel._loadPanelData();
  }

  static refresh(): void {
    UmlPanel._loadPanelData();
  }

  private static _loadPanelData(): void {
    if (!_panelInstance) {return;}
    try {
      const root = getRoot();
      console.log('[VIRTUAL UML] _loadPanelData, root =', root);
      const saved = loadLayout(root);
      _panelLayout = saved ?? buildEmptyLayout();
      const scanned = scanResources(root);
      const items: UmlResourceItem[] = scanned.items.map(i => ({
        id: i.id, label: i.label, filePath: i.filePath, kind: i.kind, sourceType: i.sourceType,
      }));
      _panelLayout.selectedFiles = _panelLayout.selectedFiles.filter(f => scanned.items.some(i => i.id === f));

      // Build full graph cache for addRelated lookup
      const resourcePaths = scanned.items.map(i => i.filePath);
      _panelFullGraph = buildFullGraph(resourcePaths);

      let nodes: UmlNodeData[] = [];
      let relationships: UmlRelationship[] = [];
      if (_panelLayout.selectedFiles.length > 0) {
        const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
        nodes = result.nodes;
        relationships = result.relationships;
      }
      _panelInstance.webview.postMessage({
        type: 'init', items, selectedFiles: _panelLayout.selectedFiles, nodes, relationships, layoutNodes: _panelLayout.nodes,
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    } catch (err: unknown) {
      console.error('[VIRTUAL UML] _loadPanelData error:', err);
    }
  }

  private static _handleToggleItem(id: string, checked: boolean): void {
    const root = getRoot();
    if (checked) {
      if (!_panelLayout.selectedFiles.includes(id)) {
        _panelLayout.selectedFiles.push(id);
      }
    } else {
      _panelLayout.selectedFiles = _panelLayout.selectedFiles.filter(f => f !== id);
    }
    _panelLayout.nodes = {};
    const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
    saveLayout(root, _panelLayout);
    if (_panelInstance) {
      _panelInstance.webview.postMessage({
        type: 'render', nodes: result.nodes, relationships: result.relationships, layoutNodes: {},
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    }
  }

  private static _handleToggleItems(ids: string[], checked: boolean): void {
    if (checked) {
      for (const id of ids) {
        if (!_panelLayout.selectedFiles.includes(id)) {
          _panelLayout.selectedFiles.push(id);
        }
      }
    } else {
      _panelLayout.selectedFiles = _panelLayout.selectedFiles.filter(f => !ids.includes(f));
    }
    const root = getRoot();
    _panelLayout.nodes = {};
    const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
    saveLayout(root, _panelLayout);
    if (_panelInstance) {
      _panelInstance.webview.postMessage({
        type: 'render', nodes: result.nodes, relationships: result.relationships, layoutNodes: {},
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    }
  }

  private static _handleAddRelated(id: string): void {
    if (!_panelFullGraph) return;
    const relatedIds = new Set<string>();
    for (const rel of _panelFullGraph.relationships) {
      if (rel.sourceId === id) relatedIds.add(rel.targetId);
      if (rel.targetId === id) relatedIds.add(rel.sourceId);
    }
    if (relatedIds.size === 0) return;
    for (const rid of relatedIds) {
      if (!_panelLayout.selectedFiles.includes(rid)) {
        _panelLayout.selectedFiles.push(rid);
      }
    }
    const root = getRoot();
    _panelLayout.nodes = {};
    const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
    saveLayout(root, _panelLayout);
    if (_panelInstance) {
      _panelInstance.webview.postMessage({
        type: 'render', nodes: result.nodes, relationships: result.relationships, layoutNodes: {},
        addedIds: Array.from(relatedIds),
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    }
  }

  private static _handleUpdateViewOptions(showModifiers: boolean, showMethods: boolean, showProperties: boolean): void {
    _panelLayout.viewOptions = {
      ...(_panelLayout.viewOptions ?? { version: 0 }),
      showModifiers,
      showMethods,
      showProperties,
    };
    saveLayout(getRoot(), _panelLayout);
    // Re-render with current selection
    if (_panelInstance) {
      const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
      _panelInstance.webview.postMessage({
        type: 'render', nodes: result.nodes, relationships: result.relationships, layoutNodes: _panelLayout.nodes,
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    }
  }

  private static _handleNodeMoved(id: string, x: number, y: number): void {
    _panelLayout.nodes[id] = { x, y };
    saveLayout(getRoot(), _panelLayout);
  }

  private static _getPanelHtml(extUri: vscode.Uri, webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(extUri, 'resources', 'uml', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const jointUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extUri, 'node_modules', '@joint', 'core', 'dist', 'joint.min.js')
    );
    html = html.replace('${cspSource}', webview.cspSource).replace('${jointUri}', jointUri.toString());
    return html;
  }
}
