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
score = basePrio
      + deadlineBoost    (je näher/überfälliger, desto mehr)
      + dependencyBoost  (wenn andere Tasks auf diesen warten)
      +/- agingEffect    (abhängig von Prio-Stufe, basiert auf updatedAt)
      - blockedPenalty   (wenn selbst blockiert)
```

### Basis-Scores (7 Stufen)

| Prio        | Basis-Score |
|-------------|-------------|
| critical    | 90          |
| high        | 75          |
| medium-high | 60          |
| normal      | 45          |
| low         | 30          |
| verylow     | 15          |
| someday     |  5          |

### Deadline-Boost (alle Prio-Stufen gleich)

| Fälligkeit  | Boost |
|-------------|-------|
| Überfällig  | +25   |
| ≤ 3 Tage    | +20   |
| ≤ 7 Tage    | +10   |
| ≤ 14 Tage   | +5    |
| > 14 Tage   |  0    |

Ein `normal`-Task (45) der morgen fällig ist erreicht Score **65** und landet damit zwischen `high` (75) und `medium-high` (60) – obwohl er nominell niedriger eingestuft ist.

### Dependency-Boost

+5 pro wartendem Task, max. **+15**.

### Aging-Effekt (basiert auf `updatedAt`)

| Prio-Stufe                                        | Effekt                                           |
|---------------------------------------------------|--------------------------------------------------|
| `critical`, `high`                                | Boost: +1 pro 4 Wochen, max. **+10**             |
| `medium-high`, `normal`, `low`, `verylow`, `someday` | Penalty: −10 nach 3 Mon., −20 nach 6 Mon. (Max.) |

Bearbeiten eines Tasks (Speichern) setzt `updatedAt` zurück → Penalty-Lauf startet neu.
Maximum: **−20 Punkte** (= 2 Prio-Stufen), danach kein weiterer Abfall.

### Blocked-Penalty

−30 wenn mindestens ein offener Blocker-Task vorhanden ist.

### Score-Filter (Slider)

In der App gibt es einen Score-Slider (0–90). Er filtert direkt auf den berechneten Score –
Aging ist damit automatisch berücksichtigt: ein 6 Monate alter `medium-high`-Task (Score ~40)
verschwindet beim Slider-Wert 45, obwohl seine nominelle Prio höher ist als `normal`.

---

## Lizenz

MIT
