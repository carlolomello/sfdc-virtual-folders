# Change Log

All notable changes to the "sfdc-virtual-folders" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.2.0] - 2026-07-12

### Added

- **UML Diagram panel** — Nuova vista laterale per creare diagrammi UML interattivi da classi Apex, trigger e componenti LWC
- Sezione dedicata a Apex Classes, Triggers e LWC con Select All / Clear All indipendenti
- Rilevamento automatico delle relazioni tra classi (extends, implements, dipendenze da proprietà, referenze da metodi)
- Tipi di freccia UML differenziati (ereditarietà concreta/astratta, implementazione interfacce, dipendenza, referenza)
- Canvas interattivo con JointJS: drag & drop dei nodi, auto layout a griglia
- Esportazione diagramma in PNG
- Persistenza automatica del layout su `.sfdc-uml-layout.json` nella root del progetto
- Comando `sfdcVirtualFolders.openUml` per aprire il pannello UML

## [0.1.0] - 2026-07-12

### Added

- Supporto completo per **Apex Trigger** in Virtual Folders e Virtual Tags
- Nuovo filtro `TRIGGER` nel menu di filtro (ALL / APEX / TRIGGER / LWC)
- Scansione di `force-app/main/default/triggers/` con `findApexTriggers()`
- Watcher file system per trigger in `extension.ts`
- **Menu contestuale Salesforce** nelle viste virtuali (Deploy, Retrieve, Diff, Delete)
- Comando `Open to the Side` nel menu contestuale
- Wrapper comandi Salesforce con detection a runtime (`vscode.commands.getCommands()`)
- `setPathForCurrentClass` esteso ai file `.trigger`

## [0.0.1] - 2026-07-12

### Added

- Release iniziale