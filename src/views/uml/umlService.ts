import * as fs from 'fs';
import * as path from 'path';
import type { UmlNodeData, UmlRelationship, UmlProperty, UmlMethod, RelationshipKind } from './umlModels';
import { findApexClasses, findApexTriggers, findLwcComponents } from '../../services/apexMetadata';
import type { VirtualResourceType } from '../../models/treeItems';

function parseVisibility(token: string | undefined): 'public' | 'private' | 'protected' | 'global' {
  if (!token) {return 'public';}
  const t = token.trim();
  if (t === 'private') {return 'private';}
  if (t === 'protected') {return 'protected';}
  if (t === 'global') {return 'global';}
  return 'public';
}

const CLASS_DECL_REGEX = /(public|private|protected|global)?\s*(?:virtual\s+|abstract\s+|with\s+sharing\s+|without\s+sharing\s+|inherited\s+sharing\s+)*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w.,\s<>]+))?/g;
const INTERFACE_DECL_REGEX = /(public|global)\s+interface\s+(\w+)(?:\s+extends\s+(\w+))?/gi;
const TRIGGER_DECL_REGEX = /trigger\s+(\w+)\s+on\s+/g;
const PROPERTY_REGEX = /(public|private|protected|global)\s+(static\s+)?(\w+(?:\[\])?)\s+(\w+)\s*(?:=|;)/g;
const METHOD_REGEX = /(public|private|protected|global)\s+(static\s+|virtual\s+|abstract\s+|override\s+)*(\w+(?:\[\])?)\s+(\w+)\s*\(([^)]*)\)/g;
const IFACE_METHOD_REGEX = /(\w+(?:\s*<[^>]*>)?(?:\[\])?)\s+(\w+)\s*\(([^)]*)\)\s*;/g;

function extractFromSource(filePath: string, ext: string): UmlNodeData {
  const content = fs.readFileSync(filePath, 'utf8');
  const properties: UmlProperty[] = [];
  const methods: UmlMethod[] = [];
  let label = path.basename(filePath, ext);
  let extendsName: string | undefined;
  let implementsNames: string[] | undefined;
  let isAbstract = false;
  let classModifiers: string | undefined;

  let match: RegExpExecArray | null;
  let kind: UmlNodeData['kind'] = 'class';

  CLASS_DECL_REGEX.lastIndex = 0;
  match = CLASS_DECL_REGEX.exec(content);
  if (match) {
    label = match[2] || label;
    isAbstract = match[0].includes('abstract');
    extendsName = match[3] || undefined;
    if (match[4]) {
      implementsNames = match[4].split(',').map(s => s.trim()).filter(Boolean);
    }
    const ci = match[0].indexOf('class');
    classModifiers = ci > 0 ? match[0].substring(0, ci).trim() : undefined;
  }

  // Separate system interfaces (from Salesforce namespaces like Database.*, System.*)
  let systemInterfaces: string[] | undefined;
  if (implementsNames) {
    const userIfaces: string[] = [];
    const sysIfaces: string[] = [];
    for (const iface of implementsNames) {
      if (iface.includes('.')) {
        const gtIdx = iface.indexOf('<');
        const simpleName = gtIdx >= 0 ? iface.substring(0, gtIdx) : iface;
        sysIfaces.push(simpleName);
      } else if (['Batchable', 'Schedulable', 'Queueable', 'AllowsCallouts', 'Stateful', 'RaisesPlatformEvents'].includes(iface)) {
        sysIfaces.push(iface);
      } else {
        userIfaces.push(iface);
      }
    }
    implementsNames = userIfaces.length > 0 ? userIfaces : undefined;
    systemInterfaces = sysIfaces.length > 0 ? sysIfaces : undefined;
  }

  // Check for interface declaration
  INTERFACE_DECL_REGEX.lastIndex = 0;
  const ifaceMatch = INTERFACE_DECL_REGEX.exec(content);
  if (ifaceMatch) {
    kind = 'interface';
    label = ifaceMatch[2] || label;
    isAbstract = false;
    extendsName = ifaceMatch[3] || undefined;
    classModifiers = ifaceMatch[1] || undefined;
  }

  // Check for trigger declaration (triggers have no 'class' keyword)
  if (kind === 'class' && ext === '.trigger') {
    TRIGGER_DECL_REGEX.lastIndex = 0;
    const trigMatch = TRIGGER_DECL_REGEX.exec(content);
    if (trigMatch) {
      label = trigMatch[1] || label;
      classModifiers = 'public'; // triggers are implicitly public
    }
  }

  // Extract interface methods
  if (kind === 'interface') {
    IFACE_METHOD_REGEX.lastIndex = 0;
    while ((match = IFACE_METHOD_REGEX.exec(content)) !== null) {
      methods.push({
        visibility: 'public',
        returnType: match[1],
        name: match[2],
        parameters: match[3].split(',').map(s => s.trim()).filter(Boolean),
      });
    }
  }

  PROPERTY_REGEX.lastIndex = 0;
  while ((match = PROPERTY_REGEX.exec(content)) !== null) {
    const propOtherMods = match[2] ? match[2].trim() : '';
    properties.push({
      visibility: parseVisibility(match[1]),
      type: match[3],
      name: match[4],
      modifierString: propOtherMods || undefined,
    });
  }

  METHOD_REGEX.lastIndex = 0;
  while ((match = METHOD_REGEX.exec(content)) !== null) {
    const rawParams = match[5].split(',').map(s => s.trim()).filter(Boolean);
    const vis = parseVisibility(match[1]);
    const otherMods = match[2] ? match[2].trim() : '';
    methods.push({
      visibility: vis,
      returnType: match[3],
      name: match[4],
      parameters: rawParams,
      modifierString: otherMods || undefined,
    });
  }

  kind = ext === '.trigger' ? 'trigger' : (ifaceMatch ? 'interface' : 'class');
  const sourceType: VirtualResourceType = ext === '.trigger' ? 'TRIGGER' : 'APEX';

  return {
    id: filePath,
    label,
    filePath,
    sourceType,
    kind,
    isAbstract,
    classModifiers,
    extendsName,
    implementsNames,
    systemInterfaces,
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

  // Extract methods from JS/TS controller
  const lwcMethods: UmlMethod[] = [];
  const funcRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  const arrowRe = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;
  const methodRe = /(\w+)\s*\(\s*([^)]*)\)\s*\{/g;
  while ((m = funcRe.exec(content)) !== null) {
    lwcMethods.push({ name: m[1], returnType: 'void', parameters: m[2].split(',').map(s => s.trim()).filter(Boolean), visibility: 'public' });
  }
  while ((m = arrowRe.exec(content)) !== null) {
    lwcMethods.push({ name: m[1], returnType: 'void', parameters: m[2].split(',').map(s => s.trim()).filter(Boolean), visibility: 'public' });
  }
  while ((m = methodRe.exec(content)) !== null) {
    const m2 = m!;
    if (!lwcMethods.some(me => me.name === m2[1])) {
      lwcMethods.push({ name: m2[1], returnType: 'void', parameters: m2[2].split(',').map(s => s.trim()).filter(Boolean), visibility: 'public' });
    }
  }

  return {
    id: filePath,
    label,
    filePath,
    sourceType: 'LWC',
    kind: 'lwc',
    isAbstract: false,
    properties: [],
    methods: lwcMethods,
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

  const relationships = computeRelationships(nodes);

  console.log('[UML] buildNodesAndRelationships:', 
    nodes.map(n => n.label + '(' + n.kind + ')').join(', '),
    '→',
    relationships.map(r => {
      const src = nodes.find(n => n.id === r.sourceId)?.label || r.sourceId;
      const tgt = nodes.find(n => n.id === r.targetId)?.label || r.targetId;
      return src + ' ' + r.kind + ' ' + tgt;
    }).join(', ') || '(none)'
  );

  return { nodes, relationships };
}

function isKnownType(kind: string): boolean {
  return kind === 'class' || kind === 'interface' || kind === 'trigger';
}

export function computeRelationships(nodes: UmlNodeData[]): UmlRelationship[] {
  const relationships: UmlRelationship[] = [];
  const knownLabels = new Set(nodes.filter(n => isKnownType(n.kind)).map(n => n.label));

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
          const target = nodes.find(n => n.label === iface && isKnownType(n.kind));
          if (target) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'implements' });
          }
        }
      }

      // Property-type dependencies (strong)
      for (const prop of node.properties) {
        const cleanType = prop.type.replace(/\[\]$/, '');
        if (cleanType && knownLabels.has(cleanType)) {
          const target = nodes.find(n => n.label === cleanType && isKnownType(n.kind));
          if (target && target.id !== node.id && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
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
            const target = nodes.find(n => n.label === paramType && isKnownType(n.kind));
            if (target && target.id !== node.id && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
              relationships.push({ sourceId: node.id, targetId: target.id, kind: 'reference' });
            }
          }
        }
        const retType = method.returnType.replace(/\[\]$/, '');
        if (retType && knownLabels.has(retType)) {
          const target = nodes.find(n => n.label === retType && isKnownType(n.kind));
          if (target && target.id !== node.id && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
            relationships.push({ sourceId: node.id, targetId: target.id, kind: 'reference' });
          }
        }
      }

      // Body method calls: `ClassName.method()` references
      try {
        const text = fs.readFileSync(node.filePath, 'utf8');
        const methodCallRe = /\b([A-Z]\w+)\.\w+\s*\(/g;
        let mcMatch: RegExpExecArray | null;
        while ((mcMatch = methodCallRe.exec(text)) !== null) {
          const refName = mcMatch[1];
          if (refName !== node.label && knownLabels.has(refName)) {
            const target = nodes.find(n => n.label === refName && isKnownType(n.kind));
            if (target && !relationships.some(r => r.sourceId === node.id && r.targetId === target.id)) {
              relationships.push({ sourceId: node.id, targetId: target.id, kind: 'dependency' });
            }
          }
        }
      } catch {
        // ignore file read errors
      }
    }

    // LWC -> Apex references (via @salesforce/apex imports)
    if (node.kind === 'lwc' && node.apexReferences) {
      for (const apexRef of node.apexReferences) {
        const target = nodes.find(n => n.label === apexRef && isKnownType(n.kind));
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

  console.log('[UML] computeRelationships:', 
    nodes.map(n => n.label + '(' + n.kind + ')').join(', '),
    '→',
    relationships.map(r => {
      const src = nodes.find(n => n.id === r.sourceId)?.label || r.sourceId;
      const tgt = nodes.find(n => n.id === r.targetId)?.label || r.targetId;
      return src + ' ' + r.kind + ' ' + tgt;
    }).join(', ') || '(none)'
  );

  return relationships;
}

export function buildFullGraph(resourcePaths: string[]): { nodes: UmlNodeData[]; relationships: UmlRelationship[] } {
  const nodeMap = new Map<string, UmlNodeData>();

  for (const filePath of resourcePaths) {
    const ext = path.extname(filePath);
    let node: UmlNodeData;

    if (ext === '.cls' || ext === '.trigger') {
      node = extractFromSource(filePath, ext);
    } else {
      node = extractLwcData(filePath);
    }

    nodeMap.set(node.id, node);
  }

  const allNodes = Array.from(nodeMap.values());
  const relationships = computeRelationships(allNodes);

  return { nodes: allNodes, relationships };
}
