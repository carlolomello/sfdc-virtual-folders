import * as vscode from 'vscode';

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
export async function applyOrUpdatePathAnnotation(
  doc: vscode.TextDocument,
  editor: vscode.TextEditor,
  newPath: string
): Promise<void> {
  const fullText = doc.getText();
  const regex = /\/\*\*[\s\S]*?@path\s+[A-Za-z0-9_.]+[\s\S]*?\*\//m;
  const match = fullText.match(regex);

  await editor.edit(editBuilder => {
    if (match) {
      const start = doc.positionAt(match.index!);
      const end = doc.positionAt(match.index! + match[0].length);
      const newBlock = `/**
* @path ${newPath}
*/`;
      editBuilder.replace(new vscode.Range(start, end), newBlock);
    } else {
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
export async function applyOrUpdatePathAnnotationOnFile(filePath: string, newPath: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(filePath);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  await applyOrUpdatePathAnnotation(doc, editor, newPath);
  await doc.save();
}
