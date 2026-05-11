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
exports.applyOrUpdatePathAnnotation = applyOrUpdatePathAnnotation;
exports.applyOrUpdatePathAnnotationOnFile = applyOrUpdatePathAnnotationOnFile;
const vscode = __importStar(require("vscode"));
/**
 * Gestisce la lettura e scrittura dell'annotazione @path
 * all'interno di un file Apex o LWC aperto.
 */
/**
 * Applica o aggiorna il blocco di commento @path in un documento aperto.
 *
 * Se esiste già un blocco JSDoc con @path, viene sostituito.
 * Altrimenti, viene inserito un nuovo blocco all'inizio del file.
 */
async function applyOrUpdatePathAnnotation(doc, editor, newPath) {
    const fullText = doc.getText();
    const regex = /\/\*\*[\s\S]*?@path\s+[A-Za-z0-9_.]+[\s\S]*?\*\//m;
    const match = fullText.match(regex);
    await editor.edit(editBuilder => {
        if (match) {
            const start = doc.positionAt(match.index);
            const end = doc.positionAt(match.index + match[0].length);
            const newBlock = `/**
* @path ${newPath}
*/`;
            editBuilder.replace(new vscode.Range(start, end), newBlock);
        }
        else {
            const insertPos = new vscode.Position(0, 0);
            const newBlock = `/**
* @path ${newPath}
*/

`;
            editBuilder.insert(insertPos, newBlock);
        }
    });
}
/**
 * Variante che lavora su un file dato il path, usata dalla logica di drag&drop.
 */
async function applyOrUpdatePathAnnotationOnFile(filePath, newPath) {
    const doc = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    await applyOrUpdatePathAnnotation(doc, editor, newPath);
    await doc.save();
}
//# sourceMappingURL=pathAnnotation.js.map