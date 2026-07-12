import * as fs from 'fs';
import * as path from 'path';

export interface ApexClassInfo {
  filePath: string;
  pathAnnotation: string | null;
  tags: string[];
}

export interface LwcComponentInfo {
  folderPath: string;
  name: string;
  controllerPath: string;
  otherFiles: string[];
  pathAnnotation: string | null;
  tags: string[];
}

export function findApexClasses(workspaceRoot: string | undefined): string[] {
  if (!workspaceRoot) {
    return [];
  }

  const sfdxConfig = path.join(workspaceRoot, 'sfdx-project.json');
  if (!fs.existsSync(sfdxConfig)) {
    return [];
  }

  const classesDir = path.join(workspaceRoot, 'force-app', 'main', 'default', 'classes');
  if (!fs.existsSync(classesDir)) {
    return [];
  }

  return fs.readdirSync(classesDir)
    .filter(f => f.endsWith('.cls'))
    .map(f => path.join(classesDir, f));
}

export function findApexTriggers(workspaceRoot: string | undefined): string[] {
  if (!workspaceRoot) {
    return [];
  }

  const sfdxConfig = path.join(workspaceRoot, 'sfdx-project.json');
  if (!fs.existsSync(sfdxConfig)) {
    return [];
  }

  const triggersDir = path.join(workspaceRoot, 'force-app', 'main', 'default', 'triggers');
  if (!fs.existsSync(triggersDir)) {
    return [];
  }

  return fs.readdirSync(triggersDir)
    .filter(f => f.endsWith('.trigger'))
    .map(f => path.join(triggersDir, f));
}

export function findLwcComponents(workspaceRoot: string | undefined): LwcComponentInfo[] {
  if (!workspaceRoot) {
    return [];
  }

  const lwcRoot = path.join(workspaceRoot, 'force-app', 'main', 'default', 'lwc');
  if (!fs.existsSync(lwcRoot) || !fs.statSync(lwcRoot).isDirectory()) {
    return [];
  }

  const components: LwcComponentInfo[] = [];
  const entries = fs.readdirSync(lwcRoot, { withFileTypes: true });

  for (const dirent of entries) {
    if (!dirent.isDirectory()) {
      continue;
    }

    const compName = dirent.name;
    const compFolder = path.join(lwcRoot, compName);

    const rootFiles = fs.readdirSync(compFolder);
    const controllerCandidates = rootFiles.filter(f => f === `${compName}.js` || f === `${compName}.ts`);
    if (controllerCandidates.length === 0) {
      continue;
    }

    const controllerFile = controllerCandidates[0];
    const controllerPath = path.join(compFolder, controllerFile);
    const content = fs.readFileSync(controllerPath, 'utf8');

    const pathAnnotation = extractPathAnnotationFromText(content);
    const tags = extractTagsFromText(content);

    const allFiles: string[] = [];
    const walk = (dir: string) => {
      const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of dirEntries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else {
          allFiles.push(full);
        }
      }
    };
    walk(compFolder);

    const otherFiles = allFiles.filter(f => path.normalize(f) !== path.normalize(controllerPath));

    components.push({
      folderPath: compFolder,
      name: compName,
      controllerPath,
      otherFiles,
      pathAnnotation,
      tags
    });
  }

  return components;
}

export function extractPathAnnotationFromText(text: string): string | null {
  const regex = /@path\s+([A-Za-z0-9_.]+)/;
  const match = text.match(regex);
  return match ? match[1] : null;
}

export function extractTagsFromText(text: string): string[] {
  const regex = /@tag\s+([^*]+)/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1];
    raw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .forEach(t => tags.push(t));
  }

  return tags;
}

export function readApexClassInfo(filePath: string): ApexClassInfo {
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    filePath,
    pathAnnotation: extractPathAnnotationFromText(content),
    tags: extractTagsFromText(content)
  };
}
