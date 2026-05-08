"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findApexClasses = findApexClasses;
exports.extractPathAnnotationFromText = extractPathAnnotationFromText;
exports.extractTagsFromText = extractTagsFromText;
exports.readApexClassInfo = readApexClassInfo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Ritorna la lista dei file .cls in un progetto SFDX (se esiste).
 */
function findApexClasses(workspaceRoot) {
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
function extractPathAnnotationFromText(text) {
    const regex = /@path\s+([A-Za-z0-9_.]+)/;
    const match = text.match(regex);
    return match ? match[1] : null;
}
/**
 * Estrae tutti i TAG dal testo Apex.
 * Supporta righe tipo:
 * @tag evolutiva1, evolutiva 2
 */
function extractTagsFromText(text) {
    // Prende tutto dopo @tag fino al prossimo asterisco o fine riga.
    const regex = /@tag\s+([^*]+)/g;
    const tags = [];
    let match;
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
function readApexClassInfo(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return {
        filePath,
        pathAnnotation: extractPathAnnotationFromText(content),
        tags: extractTagsFromText(content)
    };
}
//# sourceMappingURL=apexMetadata.js.map