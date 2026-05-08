# SFDC Virtual Folders

Estensione VS Code per progetti Salesforce DX che mostra le classi Apex in una gerarchia di cartelle virtuali basata su annotazioni `@path` nei file `.cls`.

## Usage

1. Aggiungi un'annotazione in testa alla classe Apex:

   /**
    * @path Account.Controller
    */

2. Apri la view "Virtual Apex Folders" nell'Explorer.
3. Usa il drag & drop per spostare le classi tra cartelle virtuali.
4. Usa il comando "Set Virtual Path for Current Apex Class" per creare o modificare il path.