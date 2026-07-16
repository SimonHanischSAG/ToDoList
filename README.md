# IBM Todo App

Intelligente, serverlose Todo-Verwaltung für IBM-Mitarbeiter als Progressive Web App (PWA).

**Live:** https://simonhanischsag.github.io/ToDoList/

## Features

- 🔐 **IBM-Login** via Box OAuth 2.0 (PKCE-Flow, kein zentrales Backend)
- ☁️ **Datenhaltung in deiner Box** – jeder Nutzer speichert in seinem eigenen Box-Account
- 📱 **iPhone-ready** – als PWA zum Home Screen hinzufügbar (Standalone-App-Erlebnis)
- 🔄 **Multi-Device-Sync** – automatisches Polling alle 30 s, konfliktfreies Mergen (Optimistic Locking)
- 🧠 **Intelligente Prioritäts-Engine** – automatischer Score aus Deadline, Abhängigkeiten, Alter
- ⭐ **Focus-Modus** – zeigt täglich die 5 wichtigsten Tasks
- 🔍 **Volltextsuche** + Filter nach Umfeld (Area) und Thema (Topic)
- 📴 **Offline-fähig** – Service Worker cached die App

---

## iPhone – Als App installieren (PWA)

Die App kann auf dem iPhone wie eine native App auf dem Homescreen erscheinen:

### Schritt-für-Schritt

1. **Safari öffnen** (wichtig: nur Safari unterstützt PWA-Installation auf iOS)
2. URL aufrufen: `https://simonhanischsag.github.io/ToDoList/`
3. **Teilen-Symbol** antippen (das Viereck mit dem Pfeil nach oben, unten in der Menüleiste)
4. Im Teilen-Menü nach unten scrollen → **„Zum Home-Bildschirm"** antippen
5. Den vorgeschlagenen Namen bestätigen (z. B. „IBM Todo") → **Hinzufügen**

Das App-Icon erscheint jetzt auf dem Homescreen. Beim Öffnen startet die App vollbild ohne
Safari-Adressleiste – genau wie eine native App.

### Was das Icon ist

Das App-Icon (`apple-touch-icon.png`, 180 × 180 px) wird automatisch beim Hinzufügen
zum Homescreen verwendet. Es liegt unter `static/apple-touch-icon.png` und wird in
`src/app.html` via `<link rel="apple-touch-icon">` referenziert.

> **Tipp:** Das Icon kann jederzeit durch eine neue PNG-Datei (180 × 180 px, kein Transparenz-Kanal)
> unter `static/apple-touch-icon.png` ersetzt werden. Nach dem nächsten Deploy ist es aktiv.

### iOS-spezifische Meta-Tags (bereits gesetzt in `src/app.html`)

| Meta-Tag | Bedeutung |
|---|---|
| `apple-mobile-web-app-capable` | Standalone-Modus (kein Safari-Chrome) |
| `apple-mobile-web-app-status-bar-style` | Statusleiste schwarz-transluzent |
| `apple-mobile-web-app-title` | Name unter dem Icon: „IBM Todo" |
| `viewport-fit=cover` | Inhalt reicht bis in die Safe Areas (Notch) |

### Push Notifications auf iOS

Ab iOS 16.4 unterstützt Safari Web Push. Voraussetzung: App muss als PWA installiert sein.
Implementierung ist vorbereitet (`vite-plugin-pwa` + Workbox), aber noch nicht aktiviert.

---

## Multi-Device-Synchronisation

Die App ist auf konfliktfreien Parallelbetrieb auf mehreren Geräten ausgelegt:

### Wie es funktioniert

```
Gerät A (bearbeitet Task)            Gerät B (öffnet App)
      │                                      │
      │ 1. Änderung lokal (IndexedDB)         │
      │ 2. Upload → Box mit If-Match          │  3. Polling alle 30s (ETag-Check)
      │    ETag-Header                        │  4. ETag geändert → Download
      │                                       │  5. loadTasks() → UI aktualisiert
```

### Optimistic Locking (Schreibkonflikte)

Jeder Upload sendet `If-Match: <letzter-ETag>` an Box. Wenn zwei Geräte gleichzeitig
schreiben wollen, schlägt das zweite mit HTTP **412 Precondition Failed** fehl.
Die App reagiert automatisch:

1. Remote-Stand herunterladen
2. **Merge:** Für jeden Task gewinnt der Stand mit dem neueren `updatedAt`-Zeitstempel
3. Merge lokal speichern
4. Nochmals hochladen (max. 3 Versuche)

### Automatisches Polling

Alle **30 Sekunden** prüft jedes Gerät per Metadaten-Request (kein Body-Download),
ob sich der ETag der `todos.json` geändert hat. Nur wenn ja, werden die Daten
heruntergeladen und die UI aktualisiert.

Der aktuelle Sync-Status ist im Header sichtbar:
- **⟳ Sync…** – gerade aktiv
- **✓ HH:MM** – letzter erfolgreicher Remote-Sync

---

## Architektur

```
GitHub Pages (statische PWA)
    │
    ├─ Box OAuth 2.0 PKCE-Flow
    │
    └─ Box des Nutzers
           └─ /IBMTodoStorage/todos.json
```

Kein Server. Kein Backend. Keine Datenbank. €0 laufende Kosten.

---

## Setup (für Entwickler)

### 1. Box App Registration anlegen

1. [Box Developer Console](https://app.box.com/developers/console) → **Create New App**
2. App-Typ: **Custom App** → **User Authentication (OAuth 2.0)**
3. Redirect URI: `https://simonhanischsag.github.io/ToDoList/`
4. **Client ID** und **Client Secret** kopieren

### 2. GitHub Secrets hinterlegen

GitHub Repository → **Settings** → **Secrets and variables** → **Actions**:
- `VITE_BOX_CLIENT_ID` – Client ID aus Schritt 1
- `VITE_BOX_CLIENT_SECRET` – Client Secret aus Schritt 1

### 3. GitHub Pages aktivieren

Repository → **Settings** → **Pages** → Source: **GitHub Actions**

### 4. Lokale Entwicklung

```bash
npm install

# .env.local anlegen:
cp .env.example .env.local
# VITE_BOX_CLIENT_ID und VITE_BOX_CLIENT_SECRET eintragen

npm run dev
```

Die App läuft auf http://localhost:5173

---

## Datenformat

Alle Tasks werden als `todos.json` im Box-Account des Nutzers gespeichert
(`/IBMTodoStorage/todos.json`):

```json
[
  {
    "id": "uuid-v4",
    "title": "Kurzer Titel",
    "description": "<p>Details als HTML…</p>",
    "comments": "<p>Interne Notizen…</p>",
    "status": "open",
    "priority": "high",
    "area": "MFT",
    "topic": "Review",
    "tags": [],
    "blockedBy": [],
    "dueDate": "2025-12-31",
    "createdAt": "2025-01-15T09:00:00Z",
    "updatedAt": "2025-07-01T14:30:00Z",
    "score": 72
  }
]
```

---

## Score-Formel

```
score = basePrio (urgent=80, high=60, normal=40, low=20)
      + deadlineBoost   (bis +25 bei überfälligen Tasks)
      + dependencyBoost (bis +15 wenn andere Tasks darauf warten)
      + agingBoost      (bis +20 bei alten Tasks)
      - blockedPenalty  (-30 wenn ich selbst blockiert bin)
```

---

## Lizenz

MIT
