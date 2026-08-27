# Spartan STG Tracker

A mobile-friendly web app for tracking Spartan Race team results in real time during an STG (team) race. Built for **STG-Dunakeszi 4+** but works for any STG team.

Live at: **https://kovreka99.github.io/SpartanResultsTracker/**

---

## What it does

- Shows live results for all STG teams in a race, refreshed every 5 minutes
- Calculates team scores using the official rule: **average of the best 4 finish times, with at least 1 female member**
- Mid-race: shows each member's current checkpoint and their chip time there
- Mid-race: calculates a **checkpoint team score** at the latest checkpoint where the scoring rule can be applied
- Tap any team in the rankings to expand and see individual members
- Works on mobile over mobile data — no login required for viewers

---

## How it works

The race results API at `live.onlinesystem.cz` blocks browser requests (CORS). To work around this:

1. A **GitHub Actions** workflow runs every 5 minutes, fetches the results server-side, and commits them to `results.json`
2. The **GitHub Pages** site reads `results.json` from the same domain — no CORS issue
3. Anyone with the URL sees live data with no setup needed

```
live.onlinesystem.cz API
        │
        │  every 5 min (GitHub Actions)
        ▼
   results.json  ──────────────────────►  index.html (GitHub Pages)
   (in this repo)                         (everyone's browser)
```

---

## Project structure

```
/
├── index.html                      Entry point served by GitHub Pages
├── config.json                     Which race to track (edited via in-app settings)
├── results.json                    Latest fetched data — managed by the Action
├── README.md
│
├── src/
│   ├── app.js                      All application logic
│   └── style.css                   All styling
│
├── data/
│   └── test-results.json           Simulated mid-race data for testing
│
└── .github/
    └── workflows/
        └── fetch.yml               GitHub Actions workflow (fetches every 5 min)
```

> `config.json` and `results.json` stay in the root because the GitHub Actions workflow reads/writes them there, and GitHub Pages serves them to the browser.

---

## Scoring rules

- Team score = average of the **4 fastest finish times** from the team
- At least **1 female** must be in the scoring 4
- If the fastest 4 are all male, the slowest of those 4 is replaced by the fastest female finisher
- ★ marks which members count toward the team score
- Finish times use the `Result` field, which is already chip time (corrected for wave starts)
- Mid-race: the same rules are applied to checkpoint split times to give an estimated team score

---

## Setup (one time)

### 1. Fork / clone this repo and enable GitHub Pages

- Go to repo **Settings → Pages**
- Source: `Deploy from a branch` → `main` → `/ (root)`
- Save — the site will be live at `https://<your-username>.github.io/<repo-name>/`

### 2. Allow Actions to write to the repo

- Go to **Settings → Actions → General → Workflow permissions**
- Select **Read and write permissions**
- Save

### 3. Create a GitHub Personal Access Token (for in-app race switching)

Only needed by the person who will set the race on the day. Viewers need nothing.

- GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
- Click **Generate new token**
- Repository access: select only this repo
- Permissions: **Contents → Read and write**
- Copy the token — you only see it once

---

## Race day — how to switch to the real race

1. Open `live.onlinesystem.cz`, find the race, click the **STG/Ultra category**
2. Copy the URL from your browser — it looks like:
   ```
   https://live.onlinesystem.cz/results?id=3579&idTrack=12345
   ```
3. Open the tracker, tap the **⚙ gear button** (top right)
4. Paste the URL, enter a race name, enter your GitHub token (saved after the first time)
5. Tap **Apply & Switch Race**
6. The Action triggers immediately — data appears within ~1 minute
7. Share the tracker URL with teammates — they just open it, no setup needed

> The `idTrack` for the STG category is only visible on the live results site on race day. The `eventId` for Bielsko-Biała is **3579**.

---

## Test mode

Add `?test` to the URL to load simulated mid-race data (`data/test-results.json`) without affecting the live feed:

```
https://kovreka99.github.io/SpartanResultsTracker/?test
```

The test data includes 5 fictional teams in various states — some finished, some at different checkpoints, one with no female finisher. An orange banner confirms test mode is active.

---

## Status indicators

| Display | Meaning |
|---------|---------|
| `4:26:07` (green) | Valid team score — 4 finishers with ≥1 female |
| `⏳ 2 done · 3 racing` | Not enough finishers yet |
| `⚠ no F` | 4+ finishers but all male — no valid score |
| `CP5 3:42:15` (orange) | Mid-race checkpoint team score |
| `CP3 · 2:01:15` per member | Member on course, last seen at CP3 |
| `—` | Member not yet started |
| `2+3/6` in rankings | 2 finished, 3 on course, 6 total |
