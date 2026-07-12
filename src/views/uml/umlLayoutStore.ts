import * as fs from 'fs';
import * as path from 'path';
import type { UmlLayoutState } from './umlModels';

const LAYOUT_FILENAME = '.sfdc-uml-layout.json';
const CURRENT_VERSION = 1;

export function getLayoutPath(workspaceRoot: string | undefined): string | undefined {
  if (!workspaceRoot) {return undefined;}
  return path.join(workspaceRoot, LAYOUT_FILENAME);
}

export function loadLayout(workspaceRoot: string | undefined): UmlLayoutState | null {
  const filePath = getLayoutPath(workspaceRoot);
  if (!filePath) {return null;}
  try {
    if (!fs.existsSync(filePath)) {return null;}
    const raw = fs.readFileSync(filePath, 'utf8');
    const state: UmlLayoutState = JSON.parse(raw);
    if (state.version !== CURRENT_VERSION) {return null;}
    return state;
  } catch {
    return null;
  }
}

export function saveLayout(workspaceRoot: string | undefined, state: UmlLayoutState): void {
  const filePath = getLayoutPath(workspaceRoot);
  if (!filePath) {return;}
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[UmlLayoutStore] save error', err);
  }
}

export function buildEmptyLayout(): UmlLayoutState {
  return {
    version: CURRENT_VERSION,
    selectedFiles: [],
    nodes: {},
    zoom: 1,
  };
}
