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
| Auth (bereit) | Box OAuth 2.0 PKCE (`src/lib/auth/box.js`) |
| Hosting | GitHub Pages (via GitHub Actions) |
| CI/CD | `.github/workflows/deploy.yml` |

---

## Storage-Modus umschalten

Aktuell aktiv: **Box Cloud-Sync** (IBM Box OAuth 2.0 PKCE).

Datei: [`src/lib/storage/index.js`](src/lib/storage/index.js)

```js
// Box Cloud-Sync (aktuell aktiv):
export { syncFromBox as syncFromStorage, schedulePush, retryFailedSyncs } from './box.js';

// Lokal (Fallback, kein Login):
// export { syncFromLocal as syncFromStorage, schedulePush, retryFailedSyncs, exportToFile, importFromFile } from './local.js';
```

**Box-Setup:**
- Client ID: `57mjnjrkdl2787qrsbcmk3zczhwa2en6` (produktiver Box-Account)
- Client Secret: GitHub Secret `VITE_BOX_CLIENT_SECRET` (nicht im Code!)
- Redirect URI: `https://simonhanischsag.github.io/ToDoList/`
- GitHub Secret `VITE_BOX_CLIENT_ID`: produktive Client ID

---

## Projektstruktur

```
src/
  lib/
    auth/
      box.js              Box OAuth 2.0 PKCE-Flow (fertig, wartet auf IBM-Freigabe)
      msal.js             Azure AD / OneDrive Auth (Fallback, nicht aktiv)
    storage/
      index.js            ← HIER Storage-Backend umschalten
      local.js            Aktiv: localStorage + JSON Export/Import
      box.js              Bereit: Box Cloud-Sync
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
  description: string        // Details / Kommentar
  status:      'open' | 'done' | 'optional' | 'archived'
  priority:    'urgent' | 'high' | 'normal' | 'low'
  area:        string        // Umfeld (z.B. "MFT", "SelfEdi")
  topic:       string        // Thema (z.B. "Review", "Deployment")
  tags:        string[]
  blockedBy:   string[]      // IDs von blockierenden Tasks
  dueDate:     string|null   // "YYYY-MM-DD"
  createdAt:   string        // ISO 8601
  updatedAt:   string        // ISO 8601
  score:       number        // 0–100, berechnet, read-only
}
```

### Score-Formel
```
score = basePrio (urgent=80, high=60, normal=40, low=20)
      + deadlineBoost   (bis +25 bei überfälligen Tasks)
      + dependencyBoost (bis +15 wenn andere Tasks darauf warten)
      + agingBoost      (bis +20 bei alten offenen Tasks)
      - blockedPenalty  (-30 wenn selbst blockiert)
```

---

## Offene Punkte

- [ ] IBM Box Admin-Freigabe abwarten → `storage/index.js` umschalten
- [ ] Erledigte Tasks anzeigen / Archiv-Ansicht
- [ ] Task-Abhängigkeiten (blockedBy) in der UI editierbar machen
- [ ] Push Notifications für Deadlines (iOS 16.4+)
- [ ] Excel-Import direkt in der App (xlsx.js im Browser)
