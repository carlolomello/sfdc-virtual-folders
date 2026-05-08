import * as fs from 'fs';
import * as path from 'path';

/**
 * Contiene funzioni di utilità per lavorare with file Apex
 * (ricerca classi, parsing @path e @tag, ecc.).
 */

export interface ApexClassInfo {
  filePath: string;
  pathAnnotation: string | null;
  tags: string[];
}

/**
 * Ritorna la lista dei file .cls in un progetto SFDX (se esiste).
 */
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

/**
 * Estrae il valore della annotation @path da un testo Apex.
 *
 * Esempio supportato:
 * @path Account.Controller
 */
export function extractPathAnnotationFromText(text: string): string | null {
  const regex = /@path\s+([A-Za-z0-9_.]+)/;
  const match = text.match(regex);
  return match ? match[1] : null;
}

/**
 * Estrae tutti i TAG dal testo Apex.
 * Supporta righe tipo:
 * @tag evolutiva1, evolutiva 2
 */
export function extractTagsFromText(text: string): string[] {
  // Prende tutto dopo @tag fino al prossimo asterisco o fine riga.
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

/**
 * Legge un file .cls e ritorna info utili (path virtuale e tag).
 */
export function readApexClassInfo(filePath: string): ApexClassInfo {
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    filePath,
    pathAnnotation: extractPathAnnotationFromText(content),
    tags: extractTagsFromText(content)
  };
}
