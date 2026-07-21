# IBM Todo App

Smart, serverless todo management for IBM employees as a Progressive Web App (PWA).

**Live:** https://simonhanischsag.github.io/ToDoList/

## Features

- 🧠 **Smart priority engine** – automatic score from deadline, dependencies, age
- ⭐ **Focus mode** – shows the 5 most important tasks each day
- 🔍 **Full-text search** + filter by area and topic
- 🔄 **Multi-device sync** – automatic polling every 30 s, optimistic locking
- 🔐 **IBM login** via Box OAuth 2.0 (PKCE flow, no central backend)
- ☁️ **Data stored in your Box** – each user stores data in their own Box account
- 📴 **Offline-capable** – Service Worker caches the app shell

---

## Score Formula

Every task gets an automatic **score (0–100)** that determines its position in the list.
The score replaces manual sorting — just set the priority and let the engine do the rest.

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

+5 per task waiting on this one, max. **+15**.

### Aging Effect (based on `updatedAt`)

| Priority level                                       | Effect                                                  |
|------------------------------------------------------|---------------------------------------------------------|
| `critical`, `high`                                   | Boost: +1 per 4 weeks, max. **+10**                     |
| `medium-high`, `normal`, `low`, `verylow`, `someday` | Penalty: −10 after 3 months, −20 after 6 months (max.) |

Saving a task (any edit) resets `updatedAt` → the penalty clock restarts.
Maximum: **−20 points** (= 2 priority levels), no further drop after that.

### Blocked Penalty

−30 if at least one open blocker task exists.

### Score Filter (Slider)

The app has a score slider (0–90) to hide low-priority noise. It filters directly on the
calculated score — aging is automatically accounted for: a 6-month-old `medium-high` task
(score ~40) disappears at slider value 45, even though its nominal priority is higher than `normal`.

---

## Focus Mode

Focus mode shows the **5 most important open tasks** for the currently selected area,
sorted by score. Blocked tasks are excluded automatically — the list always shows
what you can actually work on right now.

Switch between Focus and the full task list using the **⭐ Focus** / **← All tasks** button.

---

## Multi-Device Synchronisation

All data is stored in your personal Box account. The app syncs automatically across
all devices where you are logged in.

### How it works

```
Device A (editing a task)            Device B (opens app)
      │                                      │
      │ 1. Local change (IndexedDB)          │
      │ 2. Upload → Box with If-Match        │  3. Polling every 30 s (ETag check)
      │    ETag header                       │  4. ETag changed → download
      │                                      │  5. loadTasks() → UI updated
```

Every **30 seconds** each device checks via a lightweight metadata request whether the
remote file has changed. Only if it has will the data be downloaded and the UI updated.

The current sync status is visible in the header:
- **⟳ Sync…** – sync in progress
- **✓ HH:MM** – time of last successful remote sync

### Write Conflicts (Optimistic Locking)

Every upload sends `If-Match: <last-ETag>` to Box. If two devices write at the same time,
the second upload receives HTTP **412 Precondition Failed** and is aborted. The remote
version is then loaded on the next poll cycle (within 30 s).

> The app does **not** perform an automatic merge. In a conflict the remote version wins.
> To avoid losing changes, avoid editing the same tasks on two devices simultaneously.

---

## Using the App

### Desktop (recommended)

The desktop browser is the primary and most comfortable way to use the app.
Open https://simonhanischsag.github.io/ToDoList/ in any modern browser and sign in
with your Box account.

**Microsoft Edge** works particularly well when installed as a desktop PWA
(**Menu → Apps → Install this site as an app**):
- Credentials are remembered between sessions — no need to re-enter your email address.
- The app runs in its own window without browser chrome.
- Sessions stay alive significantly longer than on mobile.

Chrome and Firefox work equally well in the browser tab.

### Mobile (fallback)

The app works on smartphones but the experience is more limited than on desktop:

- **Sessions expire faster** on iOS due to memory management. After the app has been
  in the background for a while you may need to sign in again. A silent token refresh
  is attempted on startup, but does not always succeed on iOS.
- The app is best used on mobile for **checking and ticking off tasks on the go**,
  not as a primary editing device.

#### Install on iPhone (Safari required)

On iOS, only Safari supports PWA installation:

1. Open **Safari** and navigate to `https://simonhanischsag.github.io/ToDoList/`
2. Tap the **Share** icon (rectangle with upward arrow, bottom toolbar)
3. Scroll down → tap **"Add to Home Screen"**
4. Confirm the name → tap **Add**

The app then runs full-screen without the Safari address bar.

#### Install on Android

In Chrome or Edge, tap the address bar install button or **Menu → Install app**.

---

## Architecture

```
GitHub Pages (static PWA)
    │
    ├─ Box OAuth 2.0 PKCE flow
    │
    └─ User's Box account
           └─ /IBMTodoStorage/todos.json   (all tasks)
           └─ /IBMTodoStorage/prefs.json   (UI settings: filters, score threshold, …)
```

No server. No backend. No database. €0 running costs.

---

## Data Format

All tasks are stored as `todos.json` in the user's Box account.
UI preferences are stored separately in `prefs.json`.

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

## License

MIT
