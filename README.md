# IBM Todo App

Intelligente, serverlose Todo-Verwaltung für IBM-Mitarbeiter als Progressive Web App (PWA).

**Live:** https://simonhanischsag.github.io/ToDoList/

## Features

- 🔐 **IBM-Login** via Microsoft/Azure AD (IBM w3id-Kompatibilität)
- ☁️ **Datenhaltung in deinem OneDrive** – kein zentrales Backend, keine Datenbank
- 📱 **iPhone-ready** – als PWA zum Home Screen hinzufügbar
- 🧠 **Intelligente Prioritäts-Engine** – automatischer Score aus Deadline, Abhängigkeiten, Alter
- ⭐ **Focus-Modus** – zeigt täglich die 5 wichtigsten Tasks
- 🔍 **Volltextsuche** + Filter nach Umfeld (Area)
- 📴 **Offline-fähig** – Service Worker cached die App

## Architektur

```
GitHub Pages (statische PWA)
    │
    ├─ IBM w3id Login (Azure AD / MSAL.js, PKCE-Flow)
    │
    └─ OneDrive des Nutzers (Microsoft Graph API)
           └─ /Apps/IBMTodo/todos.json
```

Kein Server. Kein Backend. Keine Datenbank. €0 laufende Kosten.

---

## Setup (für Entwickler)

### 1. Azure App Registration anlegen

1. [Azure Portal](https://portal.azure.com) → **App registrations** → **New registration**
2. Name: `IBM Todo App`
3. Supported account types: **Accounts in any organizational directory (Multi-tenant)**
4. Redirect URI: `https://simonhanischsag.github.io/ToDoList/`
5. Nach dem Anlegen: **Client ID** kopieren

### 2. API-Permissions setzen

In der App Registration → **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
- `Files.ReadWrite` (OneDrive-Zugriff)
- `User.Read` (Nutzer-Profil)

**Admin consent ist nicht nötig** – Nutzer stimmen beim ersten Login zu.

### 3. Client ID als GitHub Secret hinterlegen

GitHub Repository → **Settings** → **Secrets and variables** → **Actions** → **New secret**:
- Name: `VITE_AZURE_CLIENT_ID`
- Value: die Client ID aus Schritt 1

### 4. GitHub Pages aktivieren

Repository → **Settings** → **Pages** → Source: **GitHub Actions**

### 5. Lokale Entwicklung

```bash
npm install

# .env.local anlegen:
echo "VITE_AZURE_CLIENT_ID=deine-client-id" > .env.local

npm run dev
```

Die App läuft auf http://localhost:5173

---

## Nutzung (für Endnutzer)

1. **URL aufrufen:** https://simonhanischsag.github.io/ToDoList/
2. **"Mit IBM-Account anmelden"** klicken → Microsoft-Login mit @ibm.com-Konto
3. **OneDrive-Zugriff erlauben** (einmalig) → App darf `todos.json` in `/Apps/IBMTodo/` schreiben
4. **Fertig** – alle Tasks werden automatisch in deinem OneDrive gespeichert

### iPhone (PWA installieren)

1. URL in **Safari** öffnen
2. Teilen-Symbol (□↑) → **"Zum Home-Bildschirm"**
3. App erscheint als Icon auf dem Homescreen

---

## Datenformat

Alle Tasks werden als `todos.json` im OneDrive des Nutzers gespeichert:

```json
[
  {
    "id": "uuid-v4",
    "title": "Kurzer Titel",
    "description": "Details…",
    "status": "open",
    "priority": "high",
    "area": "MFT",
    "customer": "L",
    "tags": ["review"],
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
