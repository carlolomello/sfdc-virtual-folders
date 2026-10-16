import * as fs from 'fs';
import * as path from 'path';
import type { UmlNodeData, UmlRelationship, UmlProperty, UmlMethod, RelationshipKind } from './umlModels';
import { findApexClasses, findApexTriggers, findLwcComponents, readApexClassInfo } from '../../services/apexMetadata';
import type { VirtualResourceType } from '../../models/treeItems';

function parseVisibility(token: string | undefined): 'public' | 'private' | 'protected' | 'global' {
  if (!token) {return 'public';}
  const t = token.trim().toLowerCase();
  if (t === 'private') {return 'private';}
  if (t === 'protected') {return 'protected';}
  if (t === 'global') {return 'global';}
  return 'public';
}

/**
 * Remove multi-line comments, line comments, and string literals
 * to avoid matching keywords and classes inside comments or text.
 * Single-pass tokenizer: handles quotes inside comments and comment
 * markers inside strings. Preserves character lengths (newlines kept)
 * so offsets and line structure remain intact.
 */
function stripCommentsAndStrings(code: string): string {
  let result = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && code[i] !== '\n') { result += ' '; i++; }
    } else if (c === '/' && next === '*') {
      result += '  '; i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        result += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) { result += '  '; i += 2; }
    } else if (c === "'") {
      result += ' '; i++;
      while (i < n) {
        if (code[i] === '\\') {
          result += '  '; i += 2;
        } else if (code[i] === "'") {
          result += ' '; i++; break;
        } else {
          result += code[i] === '\n' ? '\n' : ' ';
          i++;
        }
      }
    } else {
      result += c; i++;
    }
  }
  return result;
}

/**
 * Split parameter lists respecting nested generics e.g. <String, List<Account>>.
 */
function splitParams(paramStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < paramStr.length; i++) {
    const char = paramStr[i];
    if (char === '<' || char === '(') {
      depth++;
      current += char;
    } else if (char === '>' || char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {result.push(current.trim());}
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {result.push(current.trim());}
  return result;
}

/**
 * Extract custom class/interface identifiers from a type string,
 * ignoring primitive types, collections, and standard Salesforce keywords.
 */
const SYSTEM_APEX_TYPES = new Set([
  'string', 'integer', 'boolean', 'id', 'decimal', 'double', 'long',
  'date', 'datetime', 'time', 'blob', 'object', 'void', 'sobject',
  'list', 'set', 'map', 'public', 'private', 'protected', 'global',
  'final', 'static', 'override', 'virtual', 'abstract', 'transient',
  'system', 'schema', 'apexpages', 'test'
]);

function extractTypeNames(typeStr: string): string[] {
  if (!typeStr) {
    return [];
  }
  const matches = typeStr.match(/[A-Za-z0-9_]+/g);
  if (!matches) {
    return [];
  }
  return matches.filter(m => !SYSTEM_APEX_TYPES.has(m.toLowerCase()));
}

function extractFromSource(filePath: string, ext: string): UmlNodeData {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const content = stripCommentsAndStrings(rawContent);

  const properties: UmlProperty[] = [];
  const methods: UmlMethod[] = [];
  let label = path.basename(filePath, ext);
  let extendsName: string | undefined;
  let implementsNames: string[] | undefined;
  let isAbstract = false;
  let classModifiers: string | undefined;
  let kind: UmlNodeData['kind'] = ext === '.trigger' ? 'trigger' : 'class';

  if (ext === '.trigger') {
    // Apex Trigger
    const triggerRegex = /\btrigger\s+([A-Za-z0-9_]+)\s+on\s+([A-Za-z0-9_]+)/i;
    const trigMatch = triggerRegex.exec(content);
    if (trigMatch) {
      label = trigMatch[1] || label;
      classModifiers = 'public';
    }
  } else {
    // Check for Interface declaration
    const ifaceRegex = /(?:^|\s)((?:(?:public|global)\s+)*)interface\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?/i;
    const ifaceMatch = ifaceRegex.exec(content);

    if (ifaceMatch) {
      kind = 'interface';
      label = ifaceMatch[2] || label;
      extendsName = ifaceMatch[3] || undefined;
      classModifiers = ifaceMatch[1]?.trim() || 'public';

      // Interface methods
      const IFACE_METHOD_REGEX = /([A-Za-z0-9_.]+(?:<[^>]+>)?(?:\[\])?)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*;/g;
      let imMatch: RegExpExecArray | null;
      while ((imMatch = IFACE_METHOD_REGEX.exec(content)) !== null) {
        methods.push({
          visibility: 'public',
          returnType: imMatch[1].trim(),
          name: imMatch[2],
          parameters: splitParams(imMatch[3]),
        });
      }
    } else {
      // Apex Class declaration (handles annotations, arbitrary modifier order)
      const classDeclRegex = /(?:^|\s)((?:(?:public|private|protected|global|virtual|abstract|with\s+sharing|without\s+sharing|inherited\s+sharing)\s+)*)class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?(?:\s+implements\s+([^\\{]+))?/i;
      const classMatch = classDeclRegex.exec(content);

      if (classMatch) {
        label = classMatch[2] || label;
        const rawMods = (classMatch[1] || '').trim();
        classModifiers = rawMods || undefined;
        isAbstract = /\babstract\b/i.test(rawMods);
        extendsName = classMatch[3] || undefined;

        if (classMatch[4]) {
          implementsNames = classMatch[4]
            .split(',')
            .map(s => s.trim().replace(/<[^>]*>/g, '').trim())
            .filter(Boolean);
        }
      }
    }
  }

  // Separate system interfaces (Database.*, Schedulable, Batchable, etc.) from custom interfaces
  let systemInterfaces: string[] | undefined;
  if (implementsNames && implementsNames.length > 0) {
    const userIfaces: string[] = [];
    const sysIfaces: string[] = [];
    for (const iface of implementsNames) {
      if (
        iface.includes('.') ||
        ['Batchable', 'Schedulable', 'Queueable', 'AllowsCallouts', 'Stateful', 'RaisesPlatformEvents', 'InstallHandler', 'UninstallHandler'].includes(iface)
      ) {
        const simpleName = iface.split('<')[0].trim();
        sysIfaces.push(simpleName);
      } else {
        userIfaces.push(iface);
      }
    }
    implementsNames = userIfaces.length > 0 ? userIfaces : undefined;
    systemInterfaces = sysIfaces.length > 0 ? sysIfaces : undefined;
  }

  // Extract Properties & Fields (supports getters/setters { get; set; } and standard fields)
  if (kind === 'class') {
    const PROP_REGEX = /(?:@\w+(?:\([^)]*\))?\s+)*(public|private|protected|global)\s+((?:static|final|transient)\s+)*([A-Za-z0-9_.]+(?:<[^;{(=>]+>)?(?:\[\])?)\s+([A-Za-z0-9_]+)(?!\s*\()\s*(?:=\s*[^;{]+;|\s*\{[^}]*\}|;)/gi;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = PROP_REGEX.exec(content)) !== null) {
      const pVis = parseVisibility(propMatch[1]);
      const pMods = propMatch[2] ? propMatch[2].trim() : '';
      const pType = propMatch[3].trim();
      const pName = propMatch[4].trim();

      // Avoid duplicate properties
      if (!properties.some(p => p.name.toLowerCase() === pName.toLowerCase())) {
        properties.push({
          visibility: pVis,
          type: pType,
          name: pName,
          modifierString: pMods || undefined,
        });
      }
    }

    // Extract Constructors
    const CONSTRUCTOR_REGEX = /(?:@\w+(?:\([^)]*\))?\s+)*(public|private|protected|global)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/gi;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = CONSTRUCTOR_REGEX.exec(content)) !== null) {
      if (cMatch[2].toLowerCase() === label.toLowerCase()) {
        const cVis = parseVisibility(cMatch[1]);
        const params = splitParams(cMatch[3]);
        methods.push({
          visibility: cVis,
          returnType: label,
          name: label,
          parameters: params,
          modifierString: undefined,
        });
      }
    }

    // Extract Methods
    const METHOD_REGEX = /(?:@\w+(?:\([^)]*\))?\s+)*(public|private|protected|global)\s+((?:static|virtual|abstract|override|testMethod)\s+)*([A-Za-z0-9_.]+(?:<[^;{(=>]+>)?(?:\[\])?)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*(?:\{|;)/gi;
    let mMatch: RegExpExecArray | null;
    while ((mMatch = METHOD_REGEX.exec(content)) !== null) {
      const mName = mMatch[4].trim();
      if (mName.toLowerCase() === label.toLowerCase()) {
        // Constructor already parsed
        continue;
      }
      const mVis = parseVisibility(mMatch[1]);
      const mMods = mMatch[2] ? mMatch[2].trim() : '';
      const mRet = mMatch[3].trim();
      const params = splitParams(mMatch[5]);

      if (!methods.some(m => m.name.toLowerCase() === mName.toLowerCase())) {
        methods.push({
          visibility: mVis,
          returnType: mRet,
          name: mName,
          parameters: params,
          modifierString: mMods || undefined,
        });
      }
    }
  }

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
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const content = stripCommentsAndStrings(rawContent);

  // Detect @salesforce/apex/MyClass imports -> dependency
  const apexRefs: string[] = [];
  const apexImportRegex = /@salesforce\/apex\/([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = apexImportRegex.exec(content)) !== null) {
    if (!apexRefs.includes(m[1])) {
      apexRefs.push(m[1]);
    }
  }

  // Detect c-lwc references in companion HTML template
  const htmlRefs = extractLwcHtmlRefs(filePath);

  // Extract methods from JS/TS controller
  const lwcMethods: UmlMethod[] = [];
  const funcRe = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  const arrowRe = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;
  const methodRe = /([A-Za-z0-9_]+)\s*\(\s*([^)]*)\)\s*\{/g;

  while ((m = funcRe.exec(content)) !== null) {
    const name = m[1];
    if (!lwcMethods.some(me => me.name === name)) {
      lwcMethods.push({ name, returnType: 'void', parameters: splitParams(m[2]), visibility: 'public' });
    }
  }
  while ((m = arrowRe.exec(content)) !== null) {
    const name = m[1];
    if (!lwcMethods.some(me => me.name === name)) {
      lwcMethods.push({ name, returnType: 'void', parameters: splitParams(m[2]), visibility: 'public' });
    }
  }
  while ((m = methodRe.exec(content)) !== null) {
    const name = m[1];
    if (!['if', 'for', 'while', 'switch', 'catch'].includes(name) && !lwcMethods.some(me => me.name === name)) {
      lwcMethods.push({ name, returnType: 'void', parameters: splitParams(m[2]), visibility: 'public' });
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
  try {
    const entries = fs.readdirSync(dir);
    const htmlFile = entries.find(f => f.endsWith('.html'));
    if (!htmlFile) {return refs;}
    const htmlContent = fs.readFileSync(path.join(dir, htmlFile), 'utf8');
    const tagRegex = /c-([a-z0-9]+(?:-[a-z0-9]+)*)/gi;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(htmlContent)) !== null) {
      const parts = match[1].split('-');
      const camel = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      if (!refs.includes(camel)) {
        refs.push(camel);
      }
    }
  } catch {
    // ignore
  }
  return refs;
}

export interface ScannedResources {
  items: Array<{ id: string; label: string; filePath: string; kind: 'class' | 'trigger' | 'lwc'; sourceType: VirtualResourceType }>;
  apexItems: Array<{ id: string; label: string; filePath: string }>;
  triggerItems: Array<{ id: string; label: string; filePath: string }>;
  lwcItems: Array<{ id: string; label: string; filePath: string }>;
}

export function buildTagMap(workspaceRoot: string | undefined): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const add = (filePath: string, tags: string[]) => {
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!map[key]) { map[key] = []; }
      if (!map[key].includes(filePath)) {
        map[key].push(filePath);
      }
    }
  };
  for (const file of findApexClasses(workspaceRoot)) {
    add(file, readApexClassInfo(file).tags);
  }
  for (const file of findApexTriggers(workspaceRoot)) {
    add(file, readApexClassInfo(file).tags);
  }
  for (const comp of findLwcComponents(workspaceRoot)) {
    add(comp.controllerPath, comp.tags);
  }
  return map;
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

/**
 * Priority of UML relationship kinds for deduplication.
 * Higher priority overwrites or preserves over lower priority.
 */
const KIND_PRIORITY: Record<RelationshipKind, number> = {
  extends_abstract: 5,
  extends_concrete: 5,
  implements: 4,
  dependency: 3,
  reference: 2,
};

export function computeRelationships(nodes: UmlNodeData[]): UmlRelationship[] {
  // Case-insensitive lookup map for all available nodes
  const nodeByLabel = new Map<string, UmlNodeData>();
  for (const n of nodes) {
    nodeByLabel.set(n.label.toLowerCase(), n);
  }

  const relMap = new Map<string, UmlRelationship>();

  function addRel(sourceId: string, targetId: string, kind: RelationshipKind) {
    if (sourceId === targetId) {
      return;
    }
    const key = `${sourceId}:::${targetId}`;
    const existing = relMap.get(key);
    if (!existing || KIND_PRIORITY[kind] > KIND_PRIORITY[existing.kind]) {
      relMap.set(key, { sourceId, targetId, kind });
    }
  }

  for (const node of nodes) {
    // 1. Inheritance (extends)
    if (node.extendsName) {
      const target = nodeByLabel.get(node.extendsName.toLowerCase());
      if (target && target.id !== node.id) {
        addRel(node.id, target.id, target.isAbstract ? 'extends_abstract' : 'extends_concrete');
      }
    }

    // 2. Interface implementation (implements)
    if (node.implementsNames) {
      for (const iface of node.implementsNames) {
        const target = nodeByLabel.get(iface.toLowerCase());
        if (target && target.id !== node.id) {
          addRel(node.id, target.id, 'implements');
        }
      }
    }

    // 3. Properties and Fields (dependency)
    for (const prop of node.properties) {
      const types = extractTypeNames(prop.type);
      for (const t of types) {
        const target = nodeByLabel.get(t.toLowerCase());
        if (target && target.id !== node.id) {
          addRel(node.id, target.id, 'dependency');
        }
      }
    }

    // 4. Methods: Return types and Parameter types (reference)
    for (const method of node.methods) {
      const retTypes = extractTypeNames(method.returnType);
      for (const t of retTypes) {
        const target = nodeByLabel.get(t.toLowerCase());
        if (target && target.id !== node.id) {
          addRel(node.id, target.id, 'reference');
        }
      }

      for (const param of method.parameters) {
        const paramTypes = extractTypeNames(param);
        for (const t of paramTypes) {
          const target = nodeByLabel.get(t.toLowerCase());
          if (target && target.id !== node.id) {
            addRel(node.id, target.id, 'reference');
          }
        }
      }
    }

    // 5. Body Analysis for Apex Classes and Triggers
    if (node.kind === 'class' || node.kind === 'trigger') {
      try {
        const rawText = fs.readFileSync(node.filePath, 'utf8');
        const cleanText = stripCommentsAndStrings(rawText);

        // Instantiations: new ClassName(...) -> strong dependency
        const newRegex = /\bnew\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = newRegex.exec(cleanText)) !== null) {
          const target = nodeByLabel.get(m[1].toLowerCase());
          if (target && target.id !== node.id) {
            addRel(node.id, target.id, 'dependency');
          }
        }

        // Static method calls: ClassName.method(...) -> strong dependency
        // Qualifier must be PascalCase (custom class), avoiding this.foo()/localVar.bar()
        const staticCallRegex = /\b([A-Z][A-Za-z0-9_]*)\.[A-Za-z0-9_]+\s*\(/g;
        while ((m = staticCallRegex.exec(cleanText)) !== null) {
          const target = nodeByLabel.get(m[1].toLowerCase());
          if (target && target.id !== node.id) {
            addRel(node.id, target.id, 'dependency');
          }
        }

        // Static constant access: ClassName.CONSTANT -> reference
        const staticConstRegex = /\b([A-Z][A-Za-z0-9_]*)\.[A-Za-z0-9_]+\b(?!\s*\()/g;
        while ((m = staticConstRegex.exec(cleanText)) !== null) {
          const target = nodeByLabel.get(m[1].toLowerCase());
          if (target && target.id !== node.id) {
            addRel(node.id, target.id, 'reference');
          }
        }

        // Type casts or local variable declarations: (ClassName) or ClassName var = ...
        // Type must be PascalCase to avoid matching primitive/local patterns
        const typeCastOrVarRegex = /(?:\(\s*([A-Z][A-Za-z0-9_]*)\s*\)|\b([A-Z][A-Za-z0-9_]*)\s+[A-Za-z0-9_]+\s*=|catch\s*\(\s*([A-Z][A-Za-z0-9_]*)\s+\w+\))/g;
        while ((m = typeCastOrVarRegex.exec(cleanText)) !== null) {
          const captured = m[1] || m[2] || m[3];
          if (captured) {
            const target = nodeByLabel.get(captured.toLowerCase());
            if (target && target.id !== node.id) {
              addRel(node.id, target.id, 'reference');
            }
          }
        }
      } catch {
        // ignore file read error
      }
    }

    // 6. LWC -> Apex references via imports
    if (node.kind === 'lwc' && node.apexReferences) {
      for (const apexRef of node.apexReferences) {
        const target = nodeByLabel.get(apexRef.toLowerCase());
        if (target && target.id !== node.id) {
          addRel(node.id, target.id, 'dependency');
        }
      }
    }

    // 7. LWC -> LWC references via <c-...> template tags
    if (node.kind === 'lwc' && node.lwcReferences) {
      for (const lwcRef of node.lwcReferences) {
        const target = nodeByLabel.get(lwcRef.toLowerCase());
        if (target && target.id !== node.id && target.kind === 'lwc') {
          addRel(node.id, target.id, 'reference');
        }
      }
    }
  }

  const relationships = Array.from(relMap.values());

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
