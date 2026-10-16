# SFDC Virtual Folders

[![VS Code](https://img.shields.io/badge/VS%20Code-^1.118.0-007acc)](https://code.visualstudio.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/carlolomello.sfdc-virtual-folders?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=carlolomello.sfdc-virtual-folders)

**SFDC Virtual Folders** è un'estensione VS Code che virtualizza classi Apex, trigger e componenti LWC in due viste ad albero (`Virtual Folders` e `Virtual Tags`) basandosi sulle annotazioni `@path` e `@tag` lette direttamente dai file su disco. Include inoltre un pannello **UML Diagram** interattivo per esplorare le relazioni tra classi, trigger e componenti.

> **Nessuna dipendenza da API Salesforce**: tutto funziona via file system locale su progetti SFDX.

---

## Funzionalità

### Virtual Folders

Organizza classi Apex, trigger e LWC in una gerarchia di cartelle virtuali basata sull'annotazione `@path`:

```apex
/**
 * @path Account.Controller
 * @tag billing, core
 */
public with sharing class AccountController {
    // ...
}
```

- **Drag & drop**: trascina le classi tra le cartelle virtuali per riorganizzarle — l'annotazione `@path` viene aggiornata automaticamente
- **Filtro per tipo**: mostra solo APEX, TRIGGER o LWC
- **Auto-reveal**: l'editor evidenzia automaticamente la classe attiva nell'albero
- **Annotazione rapida**: comando `Set Virtual Path for Current Apex Class` (`⌘+⌥+V`) per impostare o modificare il path

### Virtual Tags

Raggruppa classi e componenti per tag (`@tag`) in una vista separata:

- Filtra per uno o più tag (separati da virgola)
- I tag sono case-insensitive
- Ogni componente LWC viene mostrato con la propria struttura di file

### Menu contestuale Salesforce

Tasto destro su qualsiasi file nelle viste virtuali per accedere direttamente ai comandi del Salesforce Extension Pack:

| Comando | ID |
|---|---|
| Deploy This Source | `sf.metadata.deploy.source.path` |
| Retrieve This Source | `sf.metadata.retrieve.source.path` |
| Diff Against Org | `sf.metadata.source.diff` |
| Delete Source | `sf.metadata.delete.source` |
| Open to the Side | `explorer.openToSide` |

> I comandi vengono rilevati automaticamente a runtime: se il Salesforce Extension Pack non è installato o un comando è stato rinominato, viene mostrato un messaggio informativo invece di un errore silenzioso.

### UML Diagram

Pannello interattivo per creare diagrammi UML delle relazioni tra classi Apex, trigger e componenti LWC:

- **Selezione mirata**: tre sezioni distinte (Apex Classes, Triggers, LWC) con Select All / Clear All indipendenti
- **Rilevamento automatico delle relazioni**:
  - Ereditarietà (`extends`) — classi astratte e concrete differenziate
  - Implementazione interfacce (`implements`)
  - Dipendenze da proprietà (composition/aggregation)
  - Referenze da metodi (parametri e return type)
- **Tipi di freccia UML standard**:
  - Linea continua + triangolo vuoto → estensione di classe astratta (ambra)
  - Linea continua + triangolo pieno → estensione di classe concreta (arancio)
  - Linea blu tratteggiata + triangolo vuoto → implementazione interfaccia
  - Linea grigia tratteggiata + freccia piena → dipendenza
  - Linea grigia punteggiata + freccia piena → referenza
- Canvas interattivo con JointJS: drag & drop dei nodi, auto layout a griglia, zoom e minimappa
- **Persistenza automatica**: posizione dei nodi e selezione salvati in `.sfdc-uml-layout.json`
- Interfaccia e colori dei nodi che seguono automaticamente il tema chiaro/scuro di VS Code

---

## Installazione

### Da VS Code Marketplace

1. Apri VS Code → `Extensions` (`⌘+⇧+X`)
2. Cerca **SFDC Virtual Folders**
3. Clicca `Install`

Oppure da terminale:

```bash
code --install-extension carlolomello.sfdc-virtual-folders
```

### Da file VSIX

Scarica l'ultima versione:

| Versione | Download | Data |
|---|---|---|
| **0.0.1** | [sfdc-virtual-folders-0.0.1.vsix](https://github.com/carlolomello/sfdc-virtual-folders/raw/main/releases/sfdc-virtual-folders-0.0.1.vsix) | 2026-10-16 |

Tutte le versioni: [cartella `releases`](https://github.com/carlolomello/sfdc-virtual-folders/tree/main/releases)

1. Scarica il file `.vsix`
2. In VS Code: `View → Extensions` → `...` (menu in alto) → `Install from VSIX...`
3. Seleziona il file scaricato

Oppure da terminale:

```bash
code --install-extension sfdc-virtual-folders-0.0.1.vsix
```

---

## Prerequisiti

- **Node.js** ≥ 22
- **VS Code** ≥ 1.118.0
- **Progetto SFDX** con `sfdx-project.json` nella root
- *(Opzionale)* **Salesforce Extension Pack** per i comandi Deploy/Retrieve/Diff

---

## Utilizzo

### 1. Annota le tue classi

Aggiungi le annotazioni nei file Apex (`.cls`) e trigger (`.trigger`):

```apex
/**
 * @path Billing.Invoices
 * @tag finance, reporting, v2
 */
public class InvoiceController {
    // ...
}
```

Per i componenti LWC, le annotazioni vanno nel file controller (`*.js` / `*.ts`):

```javascript
/**
 * @path Components.DataTable
 * @tag ui, reusable
 */
import { LightningElement } from 'lwc';
```

### 2. Esplora le viste

Le tre viste vivono nel contenitore **SFDC Virtual Folders** della barra delle attività sinistra (icona cartella + nuvola):

| Vista | Come aprirla | ID |
|---|---|---|
| Virtual Folders | Clic sull'icona nella barra laterale | `sfdcVirtualApexFolders` |
| Virtual Tags | `View → Open View... → Virtual Tags` | `sfdcVirtualApexTags` |
| UML Diagram | `View → Open View... → UML Diagram` | `sfdcUmlDiagram` |

### 3. Usa i comandi

| Comando | Scorciatoia | Azione |
|---|---|---|
| `SFDC: Refresh Virtual Folders` | — | Ricarica le cartelle virtuali |
| `SFDC: Set Virtual Path` | `⌘+⌥+V` | Imposta/modifica `@path` della classe corrente |
| `SFDC: Filter Virtual Folders by Type` | — | Filtra ALL / APEX / TRIGGER / LWC |
| `SFDC: Filter Tags` | — | Filtra per tag (comma-separated) |
| `SFDC: Open UML Diagram` | — | Apre il pannello UML |

---

## Comandi da tastiera

| Tasto | Comando | Quando |
|---|---|---|
| `⌘+⌥+V` | Set Virtual Path for Current Apex Class | Editor aperto su file `.cls` / `.trigger` |

---

## Configurazione

Impostazioni in `settings.json`:

```json
{
  "sfdcVirtualFolders.autoRevealActiveClass": true
}
```

| Proprietà | Default | Descrizione |
|---|---|---|
| `sfdcVirtualFolders.autoRevealActiveClass` | `true` | Evidenzia automaticamente la classe attiva nell'albero |

---

## Sviluppo

```bash
git clone https://github.com/carlolomello/sfdc-virtual-folders.git
cd sfdc-virtual-folders
npm install
npm run compile
```

Avvia debugging: in VS Code premi `F5` (Extension Development Host).

### Scripts disponibili

```bash
npm run compile    # Compila TypeScript → out/
npm run watch      # Watch mode
npm run lint       # ESLint su src/
npm test           # Compila + lint + test
npx vsce package   # Crea .vsix
```

---

## Architettura

```
src/
├── extension.ts                  # Attivazione, comandi, watcher, editor listener
├── models/
│   └── treeItems.ts              # VirtualFolderItem, TagTreeItem (TreeItem)
├── services/
│   ├── apexMetadata.ts           # Scansione file, estrazione @path/@tag (fs puro)
│   └── pathAnnotation.ts         # Lettura/scrittura @path (vscode editor API)
├── views/
│   ├── virtualFoldersProvider.ts # TreeDataProvider + Drag&Drop per @path
│   ├── tagViewProvider.ts        # TreeDataProvider per @tag
│   └── uml/
│       ├── umlPanel.ts           # WebviewViewProvider per UML Diagram
│       ├── umlService.ts         # Estrazione relazioni Apex/LWC (regex)
│       ├── umlLayoutStore.ts     # Persistenza layout JSON
│       └── umlModels.ts          # Tipi UML (nodi, relazioni, layout)
├── test/
│   └── extension.test.ts
└── resources/
    ├── icon.png                  # Icona estensione (marketplace/lista estensioni)
    ├── icon.svg                  # Sorgente dell'icona
    ├── icons/                    # Icone cartelle e Activity Bar
    └── uml/
        └── index.html            # Webview JointJS
```

### Tecnologie

| Layer | Tecnologia |
|---|---|
| Linguaggio | TypeScript 5.9 (strict) |
| Runtime | VS Code API ^1.118.0, Node 22 |
| UI Alberi | TreeDataProvider + TreeDragAndDropController |
| UML Diagram | JointJS (SVG, Webview) |
| Layout persistenza | `.sfdc-uml-layout.json` (root progetto) |
| Build | tsc (nessun bundler) |
| Package | @vscode/vsce |
| Test | Mocha + @vscode/test-electron |
| Lint | ESLint 9 flat config |

---

## Roadmap

- [x] Virtual Folders basati su `@path`
- [x] Virtual Tags basati su `@tag`
- [x] Supporto Apex Trigger
- [x] Menu contestuale Salesforce (Deploy, Retrieve, Diff, Delete)
- [x] UML Diagram interattivo
- [ ] Export del diagramma (PNG/SVG)
- [ ] Temi colore personalizzabili per UML
- [ ] Supporto comandi Salesforce con org multipli

---

## Licenza

Licenza proprietaria — vedi [LICENSE](LICENSE). Uso gratuito, anche commerciale, ma senza modifiche, decompilazione o ridistribuzione di versioni modificate. Copyright (c) 2026 Carlo Lomello.

---

## Contributi

Segnalazioni di bug e suggerimenti sono benvenuti tramite le [issue](https://github.com/carlolomello/sfdc-virtual-folders/issues). Il codice sorgente è distribuito con licenza che non consente modifiche: eventuali pull request vengono valutate dall'autore caso per caso.
