# Change Log

All notable changes to the "sfdc-virtual-folders" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.1] - 2026-10-16

Prima release pubblica.

### Added

- **Virtual Folders** — Vista ad albero che organizza classi Apex, trigger e componenti LWC in cartelle virtuali basate sull'annotazione `@path`
  - Drag & drop con aggiornamento automatico dell'annotazione `@path`
  - Filtro per tipo (All / Apex / Trigger / LWC)
  - Auto-reveal del file attivo nell'albero
- **Virtual Tags** — Vista ad albero per raggruppare i file per tag (`@tag`), con filtro multi-tag case-insensitive
- **UML Diagram** — Pannello interattivo (JointJS) per visualizzare le relazioni tra classi Apex, trigger e componenti LWC
  - Ereditarietà, implementazioni, dipendenze e referenze con frecce in stile UML
  - Selezione per sezioni (Apex Classes, Triggers, LWC) e pulsante "Find Related"
  - Auto-layout a griglia e persistenza delle posizioni in `.sfdc-uml-layout.json`
  - Interfaccia e colori sincronizzati con il tema chiaro/scuro di VS Code
- **Contenitore dedicato nella Activity Bar** con icona (cartella + nuvola Salesforce)
- **Menu contestuale Salesforce** su ogni file delle viste (Deploy, Retrieve, Diff, Delete, Open to the Side), rilevati automaticamente a runtime
- **Comando "Set Virtual Path"** (`⌘+⌥+V` su macOS) per impostare o modificare il `@path` della classe corrente
- Icona dell'estensione per la lista estensioni di VS Code

### Removed

- Rimossi i comandi "On/Off" delle viste: Virtual Folders, Virtual Tags e Virtual UML sono sempre attive (le viste si possono comunque nascondere dalla UI di VS Code)

### Fixed

- Rilevamento delle relazioni: supporto a generics (`List<T>`, `Set<T>`, `Map<K, V>`), proprietà `{ get; set; }`, `new` e invocazioni nei trigger
- Parsing dei parametri dei metodi Apex (sintassi `Type name`)
- "Add Related" non cancella più le posizioni dei nodi già disposti
- Testo nei riquadri UML misurato al pixel (Canvas 2D): niente overflow, larghezze e altezze dinamiche, auto-layout anti-sovrapposizione
- Tokenizer a passaggio singolo per commenti/stringhe (niente falsi match con URL o apostrofi nei commenti)
- Regex di analisi del body ristrette a tipi/metodi PascalCase (niente falsi positivi su `this.metodo()` o variabili locali)
- Rimossi i pulsanti Export PNG/SVG non funzionanti dalla toolbar UML (export rimandato a versioni future)

### Notes

- Nessuna dipendenza da API Salesforce: tutto funziona via file system locale su progetti SFDX.
