# AGENTS.md — SFDC Virtual Folders

## Profilo

Estensione VS Code in TypeScript che virtualizza classi Apex e componenti LWC in due viste ad albero (`Virtual Folders` e `Virtual Tags`), basandosi sulle annotazioni `@path` e `@tag` lette direttamente dai file su disco. **Nessuna dipendenza da API Salesforce**: tutto funziona via file system locale su progetti SFDX.

---

## Stack

| Layer | Tecnologia |
|---|---|---|
| Linguaggio | TypeScript 5.9 con `strict: true` |
| Runtime | VS Code API `^1.118.0`, Node 22 |
| UI Tree | `TreeDataProvider` + `TreeDragAndDropController` |
| UML Diagram | JointJS (`@joint/core`) — Webview + SVG |
| Layout persistenza | `.sfdc-uml-layout.json` nella root del progetto |
| Build | `tsc` (nessun bundler) |
| Package | `@vscode/vsce` per generare `.vsix` |
| Test | Mocha + `@vscode/test-electron` |
| Lint | ESLint 9 flat config |

---

## Convenzioni di codice

1. **Lingua**: commenti JSDoc e messaggi utente in **italiano**; codice, identificatori e log in **inglese**
2. **Import**: `import * as vscode from 'vscode'` per vscode; named import per moduli interni
3. **Async/await**: sempre per operazioni su file system, editor e prompt
4. **Disposable pattern**: registrare provider, comandi, watcher in `context.subscriptions`
5. **TreeView pattern**: `_onDidChangeTreeData` EventEmitter + `fire()` per refresh
6. **Config**: `vscode.workspace.getConfiguration('sfdcVirtualFolders')`
7. **Sorting**: `String(a.label).localeCompare(String(b.label))`
8. **Error handling**: try/catch su `reveal()`; `showInformationMessage` per feedback utente
9. **Naming**: `camelCase` per variabili/funzioni, `PascalCase` per classi/interfacce
10. **Type safety**: `strict: true`, preferire `interface` a `type` per contratti pubblici

---

## Architettura

```
src/
├── extension.ts                    # Attivazione, comandi, watcher, editor listener
├── models/
│   └── treeItems.ts                # VirtualFolderItem, TagTreeItem (estendono TreeItem)
├── services/
│   ├── apexMetadata.ts             # Scansione file, estrazione @path/@tag (solo fs, no vscode)
│   └── pathAnnotation.ts           # Lettura/scrittura @path (usa vscode editor API)
├── views/
│   ├── virtualFoldersProvider.ts   # TreeDataProvider + TreeDragAndDropController per @path
│   ├── tagViewProvider.ts          # TreeDataProvider per @tag
│   └── uml/
│       ├── umlPanel.ts             # WebviewViewProvider per UML Diagram
│       ├── umlService.ts           # Estrazione relazioni Apex/LWC (regex)
│       ├── umlLayoutStore.ts       # Salvataggio/caricamento layout JSON
│       └── umlModels.ts            # Tipi UML (nodi, relazioni, layout)
├── test/
│   └── extension.test.ts           # Test placeholder
└── resources/
    └── uml/
        └── index.html              # Webview HTML con JointJS
```

### Flusso dati

```
File .cls / LWC  →  apexMetadata (scan + parse)  →  Provider (buildTree)  →  TreeView
                                                         ↑
Utente (drag/drop, comandi)  →  pathAnnotation (scrivi @path)
```

### Comandi VS Code registrati

| Comando | Azione |
|---|---|
| `sfdcVirtualFolders.refresh` | Refresh albero cartelle virtuali |
| `sfdcVirtualFolders.toggleEnabled` | Abilita/disabilita vista |
| `sfdcVirtualFolders.setPathForCurrentClass` | Imposta `@path` classe corrente |
| `sfdcVirtualTags.refresh` | Refresh albero tags |
| `sfdcVirtualTags.filter` | Filtra per tags (comma-separated) |
| `sfdcVirtualFolders.filterType` | Filtra ALL / APEX / TRIGGER / LWC |
| `sfdcVirtualFolders.openUml` | Apri pannello UML Diagram |

---

## Workflow sviluppo

```bash
npm run compile           # Compila TypeScript → out/
npm run watch             # Watch mode
npm run lint              # ESLint su src/
npm test                  # Compila + lint + test integration
```

- F5 in VS Code → debug extension host
- Le viste compaiono nell'Explorer sidebar solo se il workspace contiene `sfdx-project.json`

---

## Principi di refactoring e robustezza

Quando modifichi il codice, segui questi principi derivati dall'analisi del codebase:

### 1. Estrai funzioni pure dalle buildTree()

`virtualFoldersProvider.ts:171` e `tagViewProvider.ts:45` hanno metodi `buildTree()` di 140+ linee che mescolano scansione, costruzione struttura e conversione in TreeItem.

- **Estrarre** la logica di scansione e costruzione in servizi separati
- **Lasciare** nei provider solo la conversione a `TreeItem`
- Le funzioni pure (`extractPathAnnotationFromText`, `extractTagsFromText`) sono già testabili; mantenerle tali

### 2. Evita I/O sincrono nei costruttori

I costruttori di `VirtualFoldersProvider` e `TagViewProvider` chiamano `this.refresh()` che esegue I/O bloccante (`fs.*Sync`).

- **Preferire**: caricamento lazy nel primo `getChildren()`
- Oppure rendere la scansione asincrona con `fs.promises`

### 3. Condividi la scansione tra provider

Entrambi i provider chiamano `findApexClasses()` e `findLwcComponents()` in modo indipendente → ogni refresh scansiona due volte gli stessi file.

- **Introdurre** un servizio di caching (es. `ScanService` con memoization su `mtime`)
- I provider ricevono i dati già pronti invece di fare scanning diretto

### 4. Separa parsing da editor API in pathAnnotation.ts

`applyOrUpdatePathAnnotation()` mescola la logica regex (pura) con `vscode.TextEditor.edit()`.

- **Estrarre** una funzione pura `replaceOrInsertPathAnnotation(fullText, newPath)` → restituisce `{text, start, end}` o `{insertAt, text}`
- Lasciare nel file solo l'applicazione tramite editor API
- La funzione pura diventa immediatamente testabile

### 5. Estrai command handler da activate()

`extension.ts:activate()` è un unico blocco di 200 linee con comandi definiti come closure inline.

- **Estrarre** ogni handler in una funzione esportata (es. `handleSetPathCommand`, `handleToggleCommand`)
- `activate()` diventa solo un registro di comandi

### 6. Non mescolare fs, parsing e UI nello stesso metodo

`findLwcComponents()` (62 linee) mescola directory traversal, regex e costruzione oggetti.

- Separare in: `scanDirectories()` → `parseControllerFile()` → `assembleComponentInfo()`

### 7. Evita dipendenze incrociate tra modelli

`TagTreeItem` in `treeItems.ts:112` accede a `VirtualFolderItem.greenFolderIcon`. Questo crea un accoppiamento fragile.

- **Preferire**: duplicare l'URI dell'icona o iniettarlo via costruttore/config

---

## ⚠️ REGOLA FONDAMENTALE: consenso prima di modificare

Prima di **qualsiasi modifica** al codice (refactor, nuova feature, fix, restructuring):

1. **Spiegare** i pro e i contro della modifica
2. **Chiedere** conferma all'utente
3. **Se i contro superano i pro** (o l'impatto è alto), suggerire un'alternativa
4. **Non scrivere codice** fino ad approvazione esplicita

---

## Skill: Build & Versioning

### Prerequisiti

```bash
npm install --save-dev @vscode/vsce
```

### Flusso

1. Eseguire `npm run compile` per assicurarsi che il codice sia fresco
2. **Chiedere all'utente**:
   > *"Nuova versione o sovrascrivi la corrente (X.Y.Z)?"*
   - **Nuova versione**: chiedere `major | minor | patch`
     - Aggiornare `version` in `package.json`
     - Aggiornare `CHANGELOG.md` spostando `[Unreleased]` in una nuova sezione `[X.Y.Z] - data`
     - Eseguire `npx @vscode/vsce package`
   - **Sovrascrivi**: eseguire `npx @vscode/vsce package` con la versione corrente
3. Mostrare all'utente il percorso del file `.vsix` generato

### Comandi utili

```bash
npx @vscode/vsce package          # Crea .vsix
npx @vscode/vsce ls               # Elenca file inclusi nel pacchetto
```

---

## Skill: Git Commit & Tag

Dopo aver creato con successo una **nuova versione** (non in caso di sovrascrittura):

1. Eseguire:
   ```bash
   git add -A
   git commit -m "Release v<X.Y.Z>"
   git tag v<X.Y.Z>
   ```
2. **Chiedere all'utente**:
   > *"Eseguire anche git push?"*
   - Se sì: `git push && git push --tags`

---

## Riferimenti file chiave

| File | Scopo |
|---|---|
| `package.json` | Versione, comandi, views, activation events |
| `tsconfig.json` | Strict mode, target ES2022, Node16 module |
| `eslint.config.mjs` | Flat config: eqeqeq, curly, semi, naming-convention |
| `.vscodeignore` | Cosa escludere dal .vsix |
| `CHANGELOG.md` | Storico versioni (Keep a Changelog) |
| `resources/icons/` | Icone folder gialla (Apex) e verde (LWC) |
