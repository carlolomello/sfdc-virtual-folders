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
exports.findApexTriggers = findApexTriggers;
exports.findLwcComponents = findLwcComponents;
exports.extractPathAnnotationFromText = extractPathAnnotationFromText;
exports.extractTagsFromText = extractTagsFromText;
exports.readApexClassInfo = readApexClassInfo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
function findApexTriggers(workspaceRoot) {
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
function findLwcComponents(workspaceRoot) {
    if (!workspaceRoot) {
        return [];
    }
    const lwcRoot = path.join(workspaceRoot, 'force-app', 'main', 'default', 'lwc');
    if (!fs.existsSync(lwcRoot) || !fs.statSync(lwcRoot).isDirectory()) {
        return [];
    }
    const components = [];
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
        const allFiles = [];
        const walk = (dir) => {
            const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of dirEntries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    walk(full);
                }
                else {
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
function extractPathAnnotationFromText(text) {
    const regex = /@path\s+([A-Za-z0-9_.]+)/;
    const match = text.match(regex);
    return match ? match[1] : null;
}
function extractTagsFromText(text) {
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
function readApexClassInfo(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return {
        filePath,
        pathAnnotation: extractPathAnnotationFromText(content),
        tags: extractTagsFromText(content)
    };
}
//# sourceMappingURL=apexMetadata.js.map