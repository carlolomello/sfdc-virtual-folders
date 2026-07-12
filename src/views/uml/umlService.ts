import * as fs from 'fs';
import * as path from 'path';
import type { UmlNodeData, UmlRelationship, UmlProperty, UmlMethod, RelationshipKind } from './umlModels';
import { findApexClasses, findApexTriggers, findLwcComponents } from '../../services/apexMetadata';
import type { VirtualResourceType } from '../../models/treeItems';

function parseVisibility(token: string | undefined): 'public' | 'private' | 'protected' {
  if (!token) {return 'public';}
  const t = token.trim();
  if (t === 'private') {return 'private';}
  if (t === 'protected') {return 'protected';}
  return 'public';
}

const CLASS_DECL_REGEX = /(public\s+)?(virtual\s+|abstract\s+|with\s+sharing\s+|without\s+sharing\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
const PROPERTY_REGEX = /(public|private|protected)\s+(static\s+)?(\w+(?:\[\])?)\s+(\w+)\s*(?:=|;)/g;
const METHOD_REGEX = /(public|private|protected)\s+(static\s+|virtual\s+|override\s+)?(\w+)\s+(\w+)\s*\(([^)]*)\)/g;

function extractFromSource(filePath: string, ext: string): UmlNodeData {
  const content = fs.readFileSync(filePath, 'utf8');
  const properties: UmlProperty[] = [];
  const methods: UmlMethod[] = [];
  let label = path.basename(filePath, ext);
  let extendsName: string | undefined;
  let implementsNames: string[] | undefined;
  let isAbstract = false;

  let match: RegExpExecArray | null;

  CLASS_DECL_REGEX.lastIndex = 0;
  match = CLASS_DECL_REGEX.exec(content);
  if (match) {
    label = match[3] || label;
    isAbstract = (match[2] || '').includes('abstract');
    extendsName = match[4] || undefined;
    if (match[5]) {
      implementsNames = match[5].split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  PROPERTY_REGEX.lastIndex = 0;
  while ((match = PROPERTY_REGEX.exec(content)) !== null) {
    properties.push({
      visibility: parseVisibility(match[1]),
      type: match[3],
      name: match[4],
    });
  }

  METHOD_REGEX.lastIndex = 0;
  while ((match = METHOD_REGEX.exec(content)) !== null) {
    const rawParams = match[5].split(',').map(s => s.trim()).filter(Boolean);
    methods.push({
      visibility: parseVisibility(match[1]),
      returnType: match[3],
      name: match[4],
      parameters: rawParams,
    });
  }

  const kind = ext === '.trigger' ? 'trigger' : 'class';
  const sourceType: VirtualResourceType = ext === '.trigger' ? 'TRIGGER' : 'APEX';

  return {
    id: filePath,
    label,
    filePath,
    sourceType,
    kind,
    isAbstract,
    extendsName,
    implementsNames,
    properties,
    methods,
  };
}

function extractLwcData(filePath: string): UmlNodeData {
  const label = path.basename(path.dirname(filePath));
  const content = fs.readFileSync(filePath, 'utf8');
  // Detect @salesforce/apex/MyClass imports -> dependency
  const apexRefs: string[] = [];
  const apexImportRegex = /@salesforce\/apex\/(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = apexImportRegex.exec(content)) !== null) {
    apexRefs.push(m[1]);
  }

  // Detect c-lwc references in the companion HTML template
  const htmlRefs = extractLwcHtmlRefs(filePath);

  return {
    id: filePath,
    label,
    filePath,
    sourceType: 'LWC',
    kind: 'lwc',
    isAbstract: false,
    properties: [],
    methods: [],
    apexReferences: apexRefs,
    lwcReferences: htmlRefs,
  };
}

function extractLwcHtmlRefs(controllerPath: string): string[] {
  const refs: string[] = [];
  const dir = path.dirname(controllerPath);
  const entries = fs.readdirSync(dir);
  const htmlFile = entries.find(f => f.endsWith('.html'));
  if (!htmlFile) {return refs;}
  const htmlContent = fs.readFileSync(path.join(dir, htmlFile), 'utf8');
  // Match c-component-name in HTML templates
  const tagRegex = /c-([a-z]+(?:-[a-z]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(htmlContent)) !== null) {
    // Convert kebab-case to PascalCase (e.g. "my-component" -> "myComponent")
    const parts = match[1].split('-');
    const camel = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    refs.push(camel);
  }
  return refs;
}

export interface ScannedResources {
  items: Array<{ id: string; label: string; filePath: string; kind: 'class' | 'trigger' | 'lwc'; sourceType: VirtualResourceType }>;
  apexItems: Array<{ id: string; label: string; filePath: string }>;
  triggerItems: Array<{ id: string; label: string; filePath: string }>;
  lwcItems: Array<{ id: string; label: string; filePath: string }>;
}

export function scanResources(workspaceRoot: string | undefined): ScannedResources {
  const apexFiles = findApexClasses(workspaceRoot);
  const triggerFiles = findApexTriggers(workspaceRoot);
  const lwcComponents = findLwcComponents(workspaceRoot);

  const apexItems = apexFiles.map(f => ({
    id: f,
    label: path.basename(f, '.cls'),
    filePath: f,
  }));

  const triggerItems = triggerFiles.map(f => ({
    id: f,
    label: path.basename(f, '.trigger'),
    filePath: f,
  }));

  const lwcItems = lwcComponents.map(c => ({
    id: c.controllerPath,
    label: c.name,
    filePath: c.controllerPath,
  }));

  const items = [
    ...apexItems.map(i => ({ ...i, kind: 'class' as const, sourceType: 'APEX' as VirtualResourceType })),
    ...triggerItems.map(i => ({ ...i, kind: 'trigger' as const, sourceType: 'TRIGGER' as VirtualResourceType })),
    ...lwcItems.map(i => ({ ...i, kind: 'lwc' as const, sourceType: 'LWC' as VirtualResourceType })),
  ];

  return { items, apexItems, triggerItems, lwcItems };
}

export function buildNodesAndRelationships(
  selectedFiles: string[]
): { nodes: UmlNodeData[]; relationships: UmlRelationship[] } {
  const nodes: UmlNodeData[] = [];
  const relationships: UmlRelationship[] = [];

  for (const filePath of selectedFiles) {
    const ext = path.extname(filePath);
    let node: UmlNodeData;

    if (ext === '.cls' || ext === '.trigger') {
      node = extractFromSource(filePath, ext);
    } else {
      node = extractLwcData(filePath);
    }

    nodes.push(node);
  }

  for (const node of nodes) {
    if (node.kind === 'class' || node.kind === 'trigger') {
      // Inheritance
      if (node.extendsName) {
        const target = nodes.find(n => n.label === node.extendsName && (n.kind === 'class' || n.kind === 'trigger'));
        if (target) {
          relationships.push({
            sourceId: node.id,
            targetId: target.id,
            kind: target.isAbstract ? 'extends_abstract' : 'extends_concrete',
          });
        }
      }

      // Interface implementation
      if (node.implementsNames) {
        for (const iface of node.implementsNames) {
          const target = nodes.find(n => n.label === iface && (n.kind === 'class' || n.kind === 'trigger'));
          if (target) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'implements' });
          }
        }
      }

      // Property-type dependencies (strong)
      const knownLabels = new Set(nodes.filter(n => n.kind === 'class' || n.kind === 'trigger').map(n => n.label));
      for (const prop of node.properties) {
        const cleanType = prop.type.replace(/\[\]$/, '');
        if (cleanType && knownLabels.has(cleanType)) {
          const target = nodes.find(n => n.label === cleanType && (n.kind === 'class' || n.kind === 'trigger'));
          if (target && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'dependency' });
          }
        }
      }

      // Method parameter / return type references (weak)
      for (const method of node.methods) {
        for (const param of method.parameters) {
          const cleanParam = param.split(':').map(s => s.trim()).filter(Boolean);
          const paramType = cleanParam.length > 1 ? cleanParam[cleanParam.length - 1].replace(/\[\]$/, '') : '';
          if (paramType && knownLabels.has(paramType)) {
            const target = nodes.find(n => n.label === paramType && (n.kind === 'class' || n.kind === 'trigger'));
            if (target && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
              relationships.push({ sourceId: node.id, targetId: target.id, kind: 'reference' });
            }
          }
        }
        const retType = method.returnType.replace(/\[\]$/, '');
        if (retType && knownLabels.has(retType)) {
          const target = nodes.find(n => n.label === retType && (n.kind === 'class' || n.kind === 'trigger'));
          if (target && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'reference' });
          }
        }
      }
    }

    // LWC -> Apex references (via @salesforce/apex imports)
    if (node.kind === 'lwc' && node.apexReferences) {
      for (const apexRef of node.apexReferences) {
        const target = nodes.find(n => n.label === apexRef && (n.kind === 'class' || n.kind === 'trigger'));
        if (target) {
          if (!relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'dependency' });
          }
        }
      }
    }

    // LWC -> LWC references (via c- tags in HTML)
    if (node.kind === 'lwc' && node.lwcReferences) {
      for (const lwcRef of node.lwcReferences) {
        const target = nodes.find(n => n.label === lwcRef && n.kind === 'lwc');
        if (target) {
          if (!relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'reference' });
          }
        }
      }
    }
  }

  return { nodes, relationships };
}
