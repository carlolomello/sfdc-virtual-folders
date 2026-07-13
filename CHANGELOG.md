# Change Log

All notable changes to the "sfdc-virtual-folders" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.2] - 2026-07-13

### Added

- **UML Diagram panel** — Vista laterale per creare diagrammi UML interattivi da classi Apex, trigger e componenti LWC
- Sezione dedicata a Apex Classes, Triggers e LWC con Select All / Clear All indipendenti
- Rilevamento automatico delle relazioni tra classi (extends, implements, dipendenze da proprietà, referenze da metodi)
- Tipi di freccia UML differenziati (ereditarietà concreta/astratta, implementazione interfacce, dipendenza, referenza)
- Canvas interattivo con JointJS: drag & drop dei nodi, auto layout a griglia
- Persistenza automatica del layout su `.sfdc-uml-layout.json` nella root del progetto

## [0.0.1] - 2026-07-12

### Added

- Release iniziale con Virtual Folders e Virtual Tags
- Scansione di classi Apex, componenti LWC e Trigger con `@path` e `@tag`
- Tree view interattive con drag & drop per aggiornare `@path`
- Filtro per tipo (ALL / APEX / TRIGGER / LWC)
- Menu contestuale Salesforce (Deploy, Retrieve, Diff, Delete)
- Auto-reveal del file attivo nell'editor
- Comando `Open to the Side` per navigazione rapida
- Watcher file system per aggiornamento automatico
