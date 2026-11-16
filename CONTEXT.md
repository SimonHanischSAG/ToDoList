# IBM Todo App – Projekt-Kontext

Diese Datei dient als schneller Einstieg für KI-Assistenten (z.B. IBM Bob) und neue Entwickler.

## Repo & Live-URL

- **Repo:** https://github.com/SimonHanischSAG/ToDoList
- **Live:** https://simonhanischsag.github.io/ToDoList/
- **Lokal:** `C:\GIT-Repos\SimonHanischSAG\ToDoList`

---

## Was ist das?

Serverlose Progressive Web App (PWA) für Task-Management. Zielgruppe: IBM-Mitarbeiter.  
Kein Backend, kein zentraler Server, keine Datenbank. Jeder Nutzer speichert seine Daten selbst (BYOS).

**Kernfeatures:**
- Aufgaben erstellen, bearbeiten, priorisieren, erledigen
- Intelligenter Prio-Score (Deadline, Abhängigkeiten, Alter)
- Focus-Modus: Top-5 Tasks für heute
- Filter nach Umfeld (Area), Volltextsuche
- Offline-fähig (Service Worker)
- iPhone: Als PWA zum Home Screen hinzufügbar

---

## Tech Stack

| Was | Technologie |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (Runes) |
| Styling | Tailwind CSS 3 |
| PWA | vite-plugin-pwa (Workbox) |
| Lokaler Cache | Dexie.js (IndexedDB) |
| Auth / Storage | Umschaltbar (`src/lib/backend.js`): lokaler Ordner (`auth/folder.js`, `storage/folder.js`, aktiv) oder Box OAuth 2.0 PKCE (`auth/box.js`, `storage/box.js`) |
| Hosting | GitHub Pages (via GitHub Actions) |
| CI/CD | `.github/workflows/deploy.yml` |

---

## Backend umschalten (folder ⇄ box)

Aktuell aktiv: **`folder`** – die App liest/schreibt `todos.json` und `prefs.json` direkt in einem
lokalen Ordner (File System Access API), z. B. dem Box-Drive-Ordner
`C:\Users\<user>\Box\IBMTodoStorage`. Box Drive synchronisiert die Dateien; die App braucht keine
Box-OAuth-App (IBM hat die Box-App deaktiviert). Nur Edge/Chrome am Desktop, kein iOS.

Der Schalter liegt in [`src/lib/backend.js`](src/lib/backend.js) und steuert gemeinsam
[`src/lib/auth/index.js`](src/lib/auth/index.js) und [`src/lib/storage/index.js`](src/lib/storage/index.js).

**Zurück auf Box-OAuth, falls die Box-App wieder erlaubt wird:**
1. GitHub → Settings → Secrets and variables → Actions → **Variables**: `STORAGE_BACKEND` = `box`
2. Secrets `VITE_BOX_CLIENT_ID` / `VITE_BOX_CLIENT_SECRET` müssen gesetzt sein (neues Secret erzeugen, das alte stand im öffentlichen Bundle!)
3. Workflow „Deploy to GitHub Pages“ neu starten (Run workflow).

Weitere Möglichkeiten: lokal `VITE_STORAGE_BACKEND=box` in `.env.local`, oder im Browser
`localStorage.setItem('ibmtodo_backend','box')` + Reload (zurück: `removeItem`).

**Folder-Backend – Hinweise:**
- Nach Reload/Browser-Neustart muss die Schreibfreigabe per Klick („Connect Box folder“) erneuert werden;
  im Dialog „Bei jedem Besuch zulassen“ wählen.
- Konflikte: Vergleich über `lastModified` statt ETag, Merge nach `updatedAt` (neuer gewinnt).
- Ohne Verbindung bleiben Änderungen im lokalen IndexedDB-Cache und werden nach dem Verbinden geschrieben.

**Box-Setup (nur für Backend `box`):**
- Client ID: GitHub Secret `VITE_BOX_CLIENT_ID` (nicht im Code!)
- Client Secret: GitHub Secret `VITE_BOX_CLIENT_SECRET` (nicht im Code!)
- Redirect URI: `https://simonhanischsag.github.io/ToDoList/`

---

## Projektstruktur

```
src/
  lib/
    auth/
      index.js            Wählt Auth-Backend anhand von backend.js
      folder.js           Aktiv: lokaler Ordner (File System Access API)
      box.js              Box OAuth 2.0 PKCE-Flow (deaktiviert durch IBM)
      msal.js             Azure AD / OneDrive Auth (Fallback, nicht aktiv)
    backend.js            ← Schalter: 'folder' | 'box'
    storage/
      index.js            Wählt Storage-Backend anhand von backend.js
      folder.js           Aktiv: todos.json/prefs.json im lokalen Ordner
      local.js            Export/Import als JSON-Datei
      box.js              Box Cloud-Sync (nur Backend 'box')
      db.js               Dexie.js IndexedDB-Schema
    engine/
      priority.js         Score-Formel: Deadline + Aging + Dependencies
    model/
      task.js             Task-Typedef + createTask() + normalizeTask()
    stores/
      taskStore.svelte.js Reaktiver State (Svelte 5 Runes), alle CRUD-Operationen
    components/
      TaskCard.svelte     Einzelner Task; Klick auf Titel öffnet Edit-Modal
      TaskForm.svelte     Neu- und Edit-Modal (gemeinsame Komponente)
      FocusView.svelte    Top-5 Tasks nach Score
      AreaFilter.svelte   Horizontale Filterleiste nach Umfeld
  routes/
    +layout.svelte        App-Shell; Export/Import-Buttons in Header
    +page.svelte          Hauptseite: Suche, Filter, Taskliste
```

---

## Datenmodell

```ts
Task {
  id:          string        // UUID v4
  title:       string        // Kurztitel
  description: string        // Details (Rich Text HTML)
  comments:    string        // Interne Notizen (Rich Text HTML)
  status:      'open' | 'done' | 'optional' | 'archived'
  priority:    'critical' | 'high' | 'medium-high' | 'normal' | 'low' | 'verylow' | 'someday'
  area:        string        // Umfeld (z.B. "MFT", "SelfEdi")
  topic:       string        // Thema (z.B. "Review", "Deployment")
  tags:        string[]
  blockedBy:   string[]      // IDs von blockierenden Tasks
  dueDate:     string|null   // "YYYY-MM-DD"
  createdAt:   string        // ISO 8601
  updatedAt:   string        // ISO 8601 – Basis für Aging-Penalty
  score:       number        // 0–100, berechnet, read-only
}
```

### Score-Formel (`src/lib/engine/priority.js`)

```
score = basePrio
      + deadlineBoost    (je näher/überfälliger, desto mehr)
      + dependencyBoost  (wenn andere Tasks auf diesen warten)
      +/- agingEffect    (abhängig von Prio-Stufe, basiert auf updatedAt)
      - blockedPenalty   (wenn selbst blockiert)
```

#### Basis-Scores der 7 Prio-Stufen

| Prio        | Basis-Score |
|-------------|-------------|
| critical    | 90          |
| high        | 75          |
| medium-high | 60          |
| normal      | 45          |
| low         | 30          |
| verylow     | 15          |
| someday     |  5          |

#### Deadline-Boost (gilt für alle Prio-Stufen gleich)

| Fälligkeit          | Boost |
|---------------------|-------|
| Überfällig          | +25   |
| ≤ 3 Tage            | +20   |
| ≤ 7 Tage            | +10   |
| ≤ 14 Tage           | +5    |
| > 14 Tage           |  0    |

Beispiel: `normal` (45) + überfällig (+25) = Score **70** → landet zwischen `high` (75) und `medium-high` (60).

#### Dependency-Boost

+5 pro Task der auf diesen wartet, max. **+15**.

#### Aging-Effekt (basiert auf `updatedAt`, nicht `createdAt`)

| Prio-Stufe                           | Effekt                                                   |
|--------------------------------------|----------------------------------------------------------|
| critical, high                       | Kleiner Boost: +1 pro 4 Wochen, max. **+10**             |
| medium-high, normal, low, verylow, someday | Penalty: −10 nach 3 Monaten, −20 nach 6 Monaten (Maximum) |

→ Bearbeiten eines Tasks setzt `updatedAt` zurück und stoppt damit den Penalty-Lauf.
→ Maximum −20 Punkte = maximal 2 Prio-Stufen Abfall, nie mehr.

#### Blocked-Penalty

−30 wenn mindestens ein offener Blocker-Task vorhanden ist.

---

## Offene Punkte

- [ ] IBM Box Admin-Freigabe abwarten (Client ID produktiv schalten), dann Backend auf `box` zurückschalten (siehe oben)
- [ ] Erledigte Tasks anzeigen / Archiv-Ansicht
- [ ] Task-Abhängigkeiten (blockedBy) in der UI editierbar machen
- [ ] Push Notifications für Deadlines (iOS 16.4+, `vite-plugin-pwa` vorbereitet)
- [ ] Excel-Import direkt in der App (xlsx.js im Browser)
- [x] Multi-Device-Sync: Optimistic Locking (ETag If-Match) + Polling alle 30 s in `storage/box.js`
- [x] iPhone-Doku: PWA-Installation, App-Icon, iOS-Meta-Tags → `README.md`
- [x] Details- und Comments-Felder doppelt so hoch (`min-h-[14rem]`)
- [x] TaskForm-Dialog nach oben verschoben (`items-start` + `pt-6`/`pt-8`)
