# Spartan STG Tracker — Handover

Live: **https://kovreka99.github.io/SpartanResultsTracker/**  
Repo: **https://github.com/KovReka99/SpartanResultsTracker**  
Built for: **STG-Dunakeszi 4+**, Bielsko-Biała weekend event

---

## Architecture

```
live.onlinesystem.cz API
        │
        │  GitHub Actions (every 5 min, or on config.json push)
        ▼
   results.json  ──►  index.html + src/app.js  (GitHub Pages, static)
   config.json   ──►  read on every refresh by the browser
```

- **No backend.** The GitHub Action is the only server-side piece.
- **CORS workaround:** browser can't hit the API directly — the Action fetches and commits `results.json` so the page reads it same-origin.
- **Race switching:** user pastes a URL from live.onlinesystem.cz into the ⚙ settings panel. The app calls the GitHub API to update `config.json`, which triggers the Action immediately.

---

## config.json fields

| Field | Example | Purpose |
|---|---|---|
| `eventId` | `"3578"` | Event ID from live.onlinesystem.cz URL (`id=`) |
| `idTrack` | `"11478"` | Track/distance ID (`idTrack=`) — one value per race distance |
| `raceName` | `"Spartan Super Bielsko-Biala 2026"` | Displayed in the header |
| `stgStartTime` | `"09:10, 09:20"` | Comma-separated STG wave start times (HH:MM). Leave blank to disable filter. |

---

## API response shape

```
GET https://live.onlinesystem.cz/api/ResultsList/List/?...&eventId=X&idTrack=Y&...
```

Response: `{ data: { data: [...entries] } }`  
Wrapped in `results.json` as: `{ updated, raceName, data: <raw API response> }`

### Key entry fields

| Field | Values / Notes |
|---|---|
| `N` | Full name |
| `C` | Category: `OM` Open Men, `OW` Open Women, `EM/EW` Elite, `M39/M49/W44` age group |
| `Sex` | `"M"` or `"F"` |
| `Team` | Team name (e.g. `STG-Dunakeszi 4+`, `Spartan Gym JBC`) |
| `Club` | Club/city — fallback if Team is blank |
| `Status` | `1` = finished, `3` = DNF (has last-CP time in Result), `4/5` = other DNF |
| `Result` | Chip finish time string: `"50:06"` or `"4:25:36"` — only valid when Status=1 |
| `Splits` | Array of `{ T, DT, SO, OA }` — one entry per checkpoint passed |
| `Splits[n].T` | Chip time at that CP: `"12:44"` (mm:ss) or `"2:37:46"` (h:mm:ss) |
| `Splits[n].DT` | Clock time at that CP: `"ne 13:12"` (ne=Sunday, so=Saturday) |

**Important:** There is no finish-mat split. Finish time always comes from `Result`, never from Splits.

---

## STG filtering logic (processEntries)

Two modes depending on whether `stgStartTime` is configured:

**With start times set:**
- Include any athlete with a non-empty `Team` field whose calculated start time falls within **–2 min / +10 min** of any configured start time.
- Start time is calculated as: `first split clock time (DT) − first split chip time (T)`.
- This catches all teams regardless of naming convention (e.g. `Spartan Gym JBC`, `STG-Dunakeszi 4+`).

**Without start times:**
- Fall back to requiring `Team` or `Club` to start with `"STG"` (case-insensitive), or `C` to contain `"STG"`.

---

## Scoring rules

- **Eligible athletes:** Status=1, category=OM or OW only (Elite and age-group categories are excluded).
- **Team score:** average of the 4 fastest eligible finish times, with ≥1 female in the scoring 4.
- **Female swap:** if the top 4 are all male, replace the slowest with the fastest female.
- **Mid-race CP score:** same logic applied to checkpoint split times (latest CP where rule can be applied).

---

## Bielsko-Biała 2026 race IDs (eventId=3579 for all)

| Distance | Date | idTrack |
|---|---|---|
| Ultra | Fri Aug 29 | (used during Ultra day, check live site) |
| Beast | Sat Aug 31 | 11447 |
| Super | Sun Aug 31 | 11478 |
| Sprint | Sun Aug 31 | 11477 |

**Note:** `idTrack` is only visible in the live.onlinesystem.cz URL when that race is selected. Each track covers exactly one distance — there is no mixing of distances within a track.

---

## Known issues / limitations

- **GitHub Actions cron is unreliable** — not guaranteed to fire every 5 min. The stale-data banner (red, shown after 10 min without update) tells users to trigger manually via GitHub Actions → Run workflow.
- **Start time tolerance is hardcoded** — currently −2 min / +10 min. Some STG waves start a minute or two early due to chip timing rounding. If teams are missing, widen the before-buffer in `processEntries` (`t - 120`).
- **Habajova-type filtering** — age-group athletes (W54, M49, etc.) who are on an STG team pass the team/start-time filter but are excluded from scoring by the `eligible` flag (OM/OW only). They appear in the member list but don't count toward the team score.
- **"-+" bogus team** — occasionally a malformed entry appears with `Team: "-+"`. Harmless but visible as a waiting team. Could add a minimum team-name length check.
- **No pagination** — fetches up to 5000 entries. Fine for current event sizes.
- **PAT stored in localStorage** — GitHub token is saved in the browser. Remind the person setting races to use a fine-grained token scoped to this repo only.

---

## Potential future improvements

- **Auto-detect STG start times** — scan the data for clusters of athletes sharing a team name that starts with STG, find their modal start time, and suggest it automatically.
- **Multiple race distances in one view** — currently one idTrack at a time. Could show Ultra + Beast + Super + Sprint in tabs.
- **Historical results** — preserve completed race results.json before switching to the next race.
- **Push notifications** — notify when a team member finishes (using Web Push or a simple polling + browser notification).
- **Configurable tolerances** — expose the –2/+10 min start-time window in the settings panel instead of hardcoding.
- **My Team is hardcoded** — `MY_TEAM = 'STG-Dunakeszi 4+'` in `app.js`. Could be a settings field so others can fork and use the app for their own team.
