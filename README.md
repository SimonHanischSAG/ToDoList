# IBM Todo App

Smart, serverless todo management for IBM employees as a Progressive Web App (PWA).

**Live:** https://simonhanischsag.github.io/ToDoList/

## Features

- 🔐 **IBM login** via Box OAuth 2.0 (PKCE flow, no central backend)
- ☁️ **Data stored in your Box** – each user stores data in their own Box account
- 📱 **Mobile-ready** – installable as a PWA on iOS and Android
- 🔄 **Multi-device sync** – automatic polling every 30 s, optimistic locking
- 🧠 **Smart priority engine** – automatic score from deadline, dependencies, age
- ⭐ **Focus mode** – shows the 5 most important tasks each day
- 🔍 **Full-text search** + filter by area and topic
- 📴 **Offline-capable** – Service Worker caches the app shell

---

## iPhone / Mobile – Install as App (PWA)

The app can be installed on the home screen like a native app.

### iOS (iPhone / iPad)

On iOS, only **Safari** supports PWA installation. However, the overall experience on iPhone
is more limited than on a desktop browser:

- **Microsoft Edge** (desktop) offers the most comfortable experience: credentials are remembered
  between sessions, the app installs cleanly, and the session stays alive for a long time.
- On iPhone, **sessions expire more quickly** due to iOS memory management. After closing the app
  for a while you may need to sign in again. The app attempts a silent token refresh on startup,
  but this does not always succeed on iOS.
- Overall, the iPhone version is a useful feature for checking tasks on the go, but it is not
  as seamless as the desktop experience.

#### Step-by-step (Safari on iOS)

1. Open **Safari** (required – other iOS browsers cannot install PWAs)
2. Navigate to: `https://simonhanischsag.github.io/ToDoList/`
3. Tap the **Share** icon (rectangle with arrow pointing up, bottom toolbar)
4. Scroll down in the share sheet → tap **"Add to Home Screen"**
5. Confirm the suggested name → tap **Add**

The app icon appears on your home screen. When opened it runs full-screen without the
Safari address bar.

### Android / Desktop (Chrome, Edge, …)

On Android and desktop browsers, install via the address bar install button or
**Menu → Install app**.

### What the icon is

The app icon (`apple-touch-icon.png`, 180 × 180 px) is used automatically when adding
to the home screen. It is located under `static/apple-touch-icon.png` and referenced in
`src/app.html` via `<link rel="apple-touch-icon">`.

> **Tip:** Replace `static/apple-touch-icon.png` with any PNG (180 × 180 px, no transparency)
> to update the icon. It goes live with the next deploy.

### iOS-specific meta tags (set in `src/app.html`)

| Meta tag | Meaning |
|---|---|
| `apple-mobile-web-app-capable` | Standalone mode (no Safari chrome) |
| `apple-mobile-web-app-status-bar-style` | Black-translucent status bar |
| `apple-mobile-web-app-title` | Name shown under the icon: "IBM ToDo List" |
| `viewport-fit=cover` | Content extends into safe areas (notch) |

### Push Notifications on iOS

Safari Web Push is supported from iOS 16.4 onwards. Prerequisite: the app must be installed as
a PWA. The implementation is prepared (`vite-plugin-pwa` + Workbox) but not yet activated.

---

## Multi-Device Synchronisation

The app is designed for conflict-safe parallel use on multiple devices.

### How it works

```
Device A (editing a task)            Device B (opens app)
      │                                      │
      │ 1. Local change (IndexedDB)          │
      │ 2. Upload → Box with If-Match        │  3. Polling every 30 s (ETag check)
      │    ETag header                       │  4. ETag changed → download
      │                                      │  5. loadTasks() → UI updated
```

### Optimistic Locking (write conflicts)

Every upload sends `If-Match: <last-ETag>` to Box. If two devices try to write at the same
time, the second one receives HTTP **412 Precondition Failed**.

The app handles this automatically:

1. The conflicting upload is **aborted**
2. Local changes are kept in IndexedDB
3. On the next poll cycle (within 30 s) the remote version is downloaded
4. The UI reflects the remote state; any unsaved local changes may be lost

> Note: The app does **not** perform an automatic merge. In a conflict the remote version wins
> on the next sync. To avoid losing changes, avoid editing the same tasks on two devices
> simultaneously.

### Automatic Polling

Every **30 seconds** each device checks via a metadata request (no body download) whether
the ETag of `todos.json` has changed. Only if it has will the data be downloaded and the
UI updated.

The current sync status is visible in the header:
- **⟳ Sync…** – sync in progress
- **✓ HH:MM** – last successful remote sync

---

## Architecture

```
GitHub Pages (static PWA)
    │
    ├─ Box OAuth 2.0 PKCE flow
    │
    └─ User's Box account
           └─ /IBMTodoStorage/todos.json
           └─ /IBMTodoStorage/prefs.json
```

No server. No backend. No database. €0 running costs.

---

## Setup (for developers)

### 1. Create Box App Registration

1. [Box Developer Console](https://app.box.com/developers/console) → **Create New App**
2. App type: **Custom App** → **User Authentication (OAuth 2.0)**
3. Redirect URI: `https://simonhanischsag.github.io/ToDoList/`
4. Copy **Client ID** and **Client Secret**

### 2. Add GitHub Secrets

GitHub Repository → **Settings** → **Secrets and variables** → **Actions**:
- `VITE_BOX_CLIENT_ID` – Client ID from step 1
- `VITE_BOX_CLIENT_SECRET` – Client Secret from step 1

### 3. Enable GitHub Pages

Repository → **Settings** → **Pages** → Source: **GitHub Actions**

### 4. Local Development

```bash
npm install

# Create .env.local:
cp .env.example .env.local
# Fill in VITE_BOX_CLIENT_ID and VITE_BOX_CLIENT_SECRET

npm run dev
```

The app runs at http://localhost:5173

---

## Data Format

All tasks are stored as `todos.json` in the user's Box account
(`/IBMTodoStorage/todos.json`). UI preferences (active filters, score threshold, etc.)
are stored separately in `/IBMTodoStorage/prefs.json`.

```json
[
  {
    "id": "uuid-v4",
    "title": "Short title",
    "description": "<p>Details as HTML…</p>",
    "comments": "<p>Internal notes…</p>",
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

## Score Formula

```
score = basePrio
      + deadlineBoost    (the closer / more overdue, the higher)
      + dependencyBoost  (if other tasks are waiting on this one)
      +/- agingEffect    (depends on priority level, based on updatedAt)
      - blockedPenalty   (if this task is itself blocked)
```

### Base Scores (7 levels)

| Priority    | Base score |
|-------------|------------|
| critical    | 90         |
| high        | 75         |
| medium-high | 60         |
| normal      | 45         |
| low         | 30         |
| verylow     | 15         |
| someday     |  5         |

### Deadline Boost (all priority levels equal)

| Due          | Boost |
|--------------|-------|
| Overdue      | +25   |
| Today        | +22   |
| Tomorrow     | +20   |
| In 2 days    | +18   |
| In 3 days    | +16   |
| ≤ 7 days     | +10   |
| ≤ 14 days    | +5    |
| > 14 days    |  0    |

A `normal` task (45) due tomorrow reaches a score of **65**, placing it between
`high` (75) and `medium-high` (60) – even though it is nominally ranked lower.

### Dependency Boost

+5 per waiting task, max. **+15**.

### Aging Effect (based on `updatedAt`)

| Priority level                                       | Effect                                            |
|------------------------------------------------------|---------------------------------------------------|
| `critical`, `high`                                   | Boost: +1 per 4 weeks, max. **+10**               |
| `medium-high`, `normal`, `low`, `verylow`, `someday` | Penalty: −10 after 3 months, −20 after 6 months (max.) |

Saving a task (any edit) resets `updatedAt` → the penalty clock restarts.
Maximum: **−20 points** (= 2 priority levels), no further drop after that.

### Blocked Penalty

−30 if at least one open blocker task exists.

### Score Filter (Slider)

The app has a score slider (0–90). It filters directly on the calculated score –
aging is automatically accounted for: a 6-month-old `medium-high` task (score ~40)
disappears at slider value 45, even though its nominal priority is higher than `normal`.

---

## License

MIT
