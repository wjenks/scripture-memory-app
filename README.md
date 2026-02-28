# Scripture Memory

A progressive web app for memorizing Bible verses using spaced repetition.

## Features

- **Spaced repetition system** — Verses progress through daily, weekly, monthly, and retired phases
- **Manual review tracking** — Mark reviews complete with a single tap; both time and review count required for promotion
- **Bible verse lookup** — Look up verses by reference in CSB, NIV, or NKJV via API.Bible
- **Speech recitation** — Recite verses aloud and get accuracy feedback via speech recognition
- **Review history** — View, add, and delete review entries for any verse
- **Dark mode** — Toggle between light and dark themes; respects system preference
- **Auto-backup** — Sync to a local folder (OneDrive, Google Drive) or scheduled downloads as a safety net
- **Offline-capable** — Works without an internet connection after first load

## Getting Started

1. Open `index.html` in a browser (Chrome or Edge recommended for full backup features)
2. Go to the **Verses** tab
3. Type a reference (e.g., `John 3:16`), pick a translation, and click **Look Up**
4. Click **Add Verse** to save it
5. Go to the **Practice** tab to start reviewing

## How the Spaced Repetition Works

Verses move through four phases. Both the required time **and** the required number of reviews must be met before a verse promotes to the next phase.

| Phase | Practice frequency | Reviews required | Time required |
|-------|-------------------|-----------------|---------------|
| Daily | Every day | 49 | 49 days |
| Weekly | Once a week (assigned day) | 28 | 28 weeks |
| Monthly | Once a month (assigned day) | 84 | 84 months |
| Retired | No longer practiced | — | — |

Only one review per verse per day can be recorded.

## Daily Practice

The **Practice** tab shows all verses due for today:
- **Daily** verses appear every day
- **Weekly** verses appear on their assigned day of the week
- **Monthly** verses appear on their assigned day of the month

Use **Hide Text** to test your recall, **Test Yourself** to type the verse, or **Recite** to speak it aloud and check accuracy via speech recognition (Chrome/Edge/Safari). Tap **Mark Reviewed** after practicing each verse.

## Review History & Editing

Tap any verse in the **Verses** or **Stats** tab to open its detail view:
- See the full review history with dates
- Add a review for a past date (mark a missed day)
- Delete an accidental review entry
- Edit the verse reference or text
- Changes immediately update the review count and promotion eligibility

## Backup Options

Your data is stored in the browser's `localStorage`. For extra safety:

- **Folder sync** (Chrome/Edge only) — Click **Set Backup Folder** on the Backup tab and select a folder (e.g., your OneDrive or Google Drive sync folder). The app silently saves `scripture_memory_backup.json` there on every change. The folder selection is remembered across sessions.
- **Scheduled download** — If no folder is connected, the app auto-downloads a dated backup file to your Downloads folder on a weekly or monthly schedule.
- **Manual export/import** — Use the Export and Import buttons on the Backup tab anytime.

## Dark Mode

Tap the sun/moon icon in the top-right corner of the header. Your preference is saved and persists across sessions. If no preference is set, the app follows your system's light/dark setting.

## Technical Details

- Single-page PWA: `index.html`, `styles.css`, `app.js`
- No build step or dependencies — just open in a browser
- Inline base64 service worker and manifest for offline support
- Bible verse lookup via [API.Bible](https://scripture.api.bible/) (CSB, NIV, NKJV)
- Backup folder handle persisted via IndexedDB (File System Access API)
