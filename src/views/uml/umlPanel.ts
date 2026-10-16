import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { UmlNodeData, UmlRelationship, UmlLayoutState, UmlResourceItem } from './umlModels';
import { scanResources, buildNodesAndRelationships, buildFullGraph, buildTagMap } from './umlService';
import { loadLayout, saveLayout, buildEmptyLayout } from './umlLayoutStore';

let _panelInstance: vscode.WebviewPanel | undefined;
let _panelLayout: UmlLayoutState = buildEmptyLayout();
let _panelExtUri: vscode.Uri | undefined;
let _panelFullGraph: { nodes: UmlNodeData[]; relationships: UmlRelationship[] } | undefined;
let _sidebarView: vscode.WebviewView | undefined;
let _themeListenerRegistered = false;

function getRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getThemeKind(): 'dark' | 'light' {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light';
}

function broadcastTheme(): void {
  const theme = getThemeKind();
  if (_panelInstance) {
    _panelInstance.webview.postMessage({ type: 'theme', theme });
  }
  if (_sidebarView) {
    _sidebarView.webview.postMessage({ type: 'theme', theme });
  }
}

function ensureThemeListener(): void {
  if (_themeListenerRegistered) {return;}
  _themeListenerRegistered = true;
  vscode.window.onDidChangeActiveColorTheme(broadcastTheme);
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
    _sidebarView = webviewView;
    ensureThemeListener();
    webviewView.onDidDispose(() => {
      if (_sidebarView === webviewView) { _sidebarView = undefined; }
    });
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
    const theme = getThemeKind();
    return `<!DOCTYPE html>
<html data-theme="${theme}"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
:root{
  --card:var(--vscode-editorWidget-background,var(--vscode-sideBar-background,#252526));
  --border:var(--vscode-panel-border,rgba(128,128,128,0.25));
  --text:var(--vscode-sideBar-foreground,#cccccc);
  --muted:var(--vscode-descriptionForeground,#9e9e9e);
  --accent:var(--vscode-button-background,#4f8cff);
  --accent-hover:var(--vscode-button-hoverBackground,#6ea0ff);
}
html[data-theme='dark'] body{background:#1e1e1e;color:#d4d4d4}
html[data-theme='light'] body{background:#f7f8fa;color:#1f1f1f}
html[data-theme='dark']{--border:rgba(255,255,255,0.12)}
html[data-theme='light']{--border:rgba(0,0,0,0.12)}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:12px;padding:12px;color:var(--text);-webkit-font-smoothing:antialiased}
.brand{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.brand .dot{width:12px;height:12px;border-radius:4px;background:linear-gradient(135deg,#4f8cff,#a855f7);box-shadow:0 0 10px rgba(79,140,255,0.5)}
h3{margin:0;font-size:14px;font-weight:700;letter-spacing:0.02em}
p.desc{font-size:11px;color:var(--muted);margin:0 0 12px;line-height:1.5}
button{width:100%;padding:9px 12px;background:var(--accent);color:var(--vscode-button-foreground,#ffffff);border:none;cursor:pointer;border-radius:10px;font-weight:600;font-size:12px;transition:background .16s ease,box-shadow .16s ease,transform .08s ease;box-shadow:0 1px 3px rgba(0,0,0,0.2)}
button:hover{background:var(--accent-hover);box-shadow:0 3px 10px rgba(0,0,0,0.24)}
button:active{transform:translateY(1px)}
.card{margin-top:14px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px}
.card h4{margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)}
.legend-item{display:flex;align-items:center;gap:8px;font-size:11px;padding:3px 0;color:var(--text)}
.legend-item span.line{display:inline-block;width:22px;height:0;border-top-width:2px;border-top-style:solid;flex-shrink:0;border-radius:2px}
.legend-item span.dashed{border-top-style:dashed}
.legend-item span.dotted{border-top-style:dotted}
.legend-color{display:inline-block;width:13px;height:13px;flex-shrink:0;border:2px solid;border-radius:5px}
</style></head><body>
<div class="brand"><span class="dot"></span><h3>Virtual UML</h3></div>
<p class="desc">Genera diagrammi di classi, trigger e componenti LWC direttamente dal tuo progetto Salesforce.</p>
<button onclick="vscode.postMessage({type:'openPanel'})">Open UML Diagram</button>
<div class="card">
<h4>Relationships</h4>
<div class="legend-item"><span class="line" style="border-color:#d4a017"></span> extends (abstract)</div>
<div class="legend-item"><span class="line" style="border-color:#e6a700"></span> extends (concrete)</div>
<div class="legend-item"><span class="line dashed" style="border-color:#58a6ff"></span> implements</div>
<div class="legend-item"><span class="line dashed" style="border-color:#94a3b8"></span> dependency</div>
<div class="legend-item"><span class="line dotted" style="border-color:#a1a8b3"></span> reference</div>
</div>
<div class="card">
<h4>Entities</h4>
<div class="legend-item"><span class="legend-color" style="background:#eef1f6;border-color:#94a3b8"></span> Class</div>
<div class="legend-item"><span class="legend-color" style="background:#efe3fb;border-color:#8b5cf6"></span> Abstract</div>
<div class="legend-item"><span class="legend-color" style="background:#dfeffc;border-color:#0ea5e9"></span> Interface</div>
<div class="legend-item"><span class="legend-color" style="background:#fdf2d7;border-color:#f59e0b"></span> Trigger</div>
<div class="legend-item"><span class="legend-color" style="background:#dbf3e4;border-color:#22c55e"></span> LWC</div>
</div>
<script nonce="${Math.random().toString(36).substring(2)}">
const vscode=acquireVsCodeApi();
window.addEventListener('message', function(e){
  if (e.data && e.data.type === 'theme') {
    document.documentElement.dataset.theme = e.data.theme === 'dark' ? 'dark' : 'light';
  }
});
</script>
</body></html>`;
  }

  // ---- WebviewPanel (tab grafico) ----

  static openOrFocus(extensionUri: vscode.Uri): void {
    _panelExtUri = extensionUri;
    ensureThemeListener();
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
        theme: getThemeKind(), tagMap: buildTagMap(root),
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
      delete _panelLayout.nodes[id];
    }
    const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
    saveLayout(root, _panelLayout);
    if (_panelInstance) {
      _panelInstance.webview.postMessage({
        type: 'render', nodes: result.nodes, relationships: result.relationships, layoutNodes: _panelLayout.nodes,
        theme: getThemeKind(),
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
      for (const id of ids) {
        delete _panelLayout.nodes[id];
      }
    }
    const root = getRoot();
    const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
    saveLayout(root, _panelLayout);
    if (_panelInstance) {
      _panelInstance.webview.postMessage({
        type: 'render', nodes: result.nodes, relationships: result.relationships, layoutNodes: _panelLayout.nodes,
        theme: getThemeKind(),
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    }
  }

  private static _handleAddRelated(id: string): void {
    const root = getRoot();
    if (!root) {
      return;
    }

    // Refresh full graph to be up-to-date with current disk contents
    const scanned = scanResources(root);
    const resourcePaths = scanned.items.map(i => i.filePath);
    _panelFullGraph = buildFullGraph(resourcePaths);

    const normTarget = path.normalize(id).toLowerCase();
    const relatedIds = new Set<string>();

    for (const rel of _panelFullGraph.relationships) {
      if (path.normalize(rel.sourceId).toLowerCase() === normTarget) {
        relatedIds.add(rel.targetId);
      }
      if (path.normalize(rel.targetId).toLowerCase() === normTarget) {
        relatedIds.add(rel.sourceId);
      }
    }

    if (relatedIds.size === 0) {
      vscode.window.showInformationMessage('Nessuna entità correlata trovata nel progetto per questo elemento.');
      return;
    }

    const newToAdd: string[] = [];
    for (const rid of relatedIds) {
      const isAlreadySelected = _panelLayout.selectedFiles.some(
        f => path.normalize(f).toLowerCase() === path.normalize(rid).toLowerCase()
      );
      if (!isAlreadySelected) {
        newToAdd.push(rid);
        _panelLayout.selectedFiles.push(rid);
      }
    }

    if (newToAdd.length === 0) {
      vscode.window.showInformationMessage('Tutte le entità correlate sono già presenti nel diagramma.');
      return;
    }

    // Place new nodes relative to the clicked parent node
    const parentPos = _panelLayout.nodes[id] || { x: 120, y: 120 };
    newToAdd.forEach((rid, idx) => {
      if (!_panelLayout.nodes[rid]) {
        _panelLayout.nodes[rid] = {
          x: parentPos.x + 360,
          y: parentPos.y + (idx * 200),
        };
      }
    });

    const result = buildNodesAndRelationships(_panelLayout.selectedFiles);
    saveLayout(root, _panelLayout);

    if (_panelInstance) {
      _panelInstance.webview.postMessage({
        type: 'render',
        nodes: result.nodes,
        relationships: result.relationships,
        layoutNodes: _panelLayout.nodes,
        theme: getThemeKind(),
        addedIds: newToAdd,
        showModifiers: _panelLayout.viewOptions?.showModifiers ?? true,
        showMethods: _panelLayout.viewOptions?.showMethods ?? true,
        showProperties: _panelLayout.viewOptions?.showProperties ?? true,
      });
    }

    vscode.window.showInformationMessage(`Aggiunte ${newToAdd.length} entità correlate.`);
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
        theme: getThemeKind(),
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
