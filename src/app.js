// ── Constants ─────────────────────────────────────────────
const MY_TEAM  = 'STG-Dunakeszi 4+';
const INTERVAL = 60;
const REPO     = 'KovReka99/SpartanResultsTracker';

// ── State ─────────────────────────────────────────────────
let teams       = {};
let ticker      = null;
let countdown   = INTERVAL;
let expanded    = new Set();
let lastUpdated = null;
let stgStartTimes = [];
let currentConfig = {};

// ── Settings panel ────────────────────────────────────────
function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('gear-btn');
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('active', isOpen);

  if (isOpen) {
    const { eventId, idTrack, raceName, stgStartTime } = currentConfig;
    if (eventId && idTrack)
      document.getElementById('set-url').value =
        `https://live.onlinesystem.cz/results?id=${eventId}&idTrack=${idTrack}`;
    if (raceName)
      document.getElementById('set-name').value = raceName;
    document.getElementById('set-stg-start').value =
      stgStartTimes.length ? stgStartTimes.map(secsToHHMM).join(', ') : (stgStartTime || '');
    const pat = localStorage.getItem('gh_pat') || '';
    document.getElementById('set-pat').value = pat ? '••••••••' : '';
  }
}

function clearToken() {
  localStorage.removeItem('gh_pat');
  document.getElementById('set-pat').value = '';
  showSettingsStatus('Token cleared.', 'ok');
}

function showSettingsStatus(msg, type) {
  const el = document.getElementById('settings-status');
  el.textContent = msg;
  el.className = type;
}

async function applyConfig() {
  const rawUrl   = document.getElementById('set-url').value.trim();
  const name     = document.getElementById('set-name').value.trim();
  const patVal   = document.getElementById('set-pat').value.trim();
  const stgStart = document.getElementById('set-stg-start').value.trim();

  let eventId = '', idTrack = '';
  try {
    const u = new URL(rawUrl);
    eventId = u.searchParams.get('id') || u.searchParams.get('eventId') || '';
    idTrack = u.searchParams.get('idTrack') || '';
  } catch {}

  if (!eventId || !idTrack) {
    showSettingsStatus('❌ Invalid URL — must contain id= and idTrack=', 'err');
    return;
  }
  if (!name) {
    showSettingsStatus('❌ Please enter a race name (e.g. Bielsko-Biała Ultra STG 2026)', 'err');
    return;
  }
  if (stgStart && parseStartTimes(stgStart).length === 0) {
    showSettingsStatus('❌ STG Start Times must be HH:MM, comma-separated (e.g. 09:00, 09:30)', 'err');
    return;
  }

  let pat = patVal;
  if (pat === '••••••••' || pat === '') pat = localStorage.getItem('gh_pat') || '';
  if (!pat) {
    showSettingsStatus('❌ GitHub token is required', 'err');
    return;
  }
  localStorage.setItem('gh_pat', pat);

  showSettingsStatus('⏳ Updating config on GitHub…', 'loading');
  try {
    await updateGitHubConfig({ eventId, idTrack, raceName: name, stgStartTime: stgStart }, pat);
    stgStartTimes = parseStartTimes(stgStart);
    showSettingsStatus(`✓ Switched to "${name}". Data will update within ~1 minute.`, 'ok');
    document.getElementById('set-pat').value = '••••••••';
    setTimeout(() => manualRefresh(), 15000);
  } catch (e) {
    showSettingsStatus(`❌ ${e.message}`, 'err');
  }
}

async function updateGitHubConfig(config, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/config.json`;

  const getRes = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' }
  });
  if (!getRes.ok) {
    const j = await getRes.json().catch(() => ({}));
    throw new Error(j.message || `GitHub API error ${getRes.status}`);
  }
  const current = await getRes.json();

  const newContent = JSON.stringify(config, null, 2) + '\n';
  const encoded    = btoa(unescape(encodeURIComponent(newContent)));

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Switch race: ${config.raceName}`,
      content: encoded,
      sha: current.sha,
    }),
  });
  if (!putRes.ok) {
    const j = await putRes.json().catch(() => ({}));
    throw new Error(j.message || `GitHub API error ${putRes.status}`);
  }
}

// ── Config ────────────────────────────────────────────────
async function fetchConfig() {
  try {
    const r = await fetch(`./config.json?t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return;
    const c = await r.json();
    currentConfig = c;
    stgStartTimes = parseStartTimes(c.stgStartTime || '');
  } catch { /* ignore — filter just won't apply */ }
}

function parseStartTimes(raw) {
  return raw.split(',')
    .map(s => parseHHMM(s.trim()))
    .filter(v => v !== null);
}

// ── Fetch results.json (same domain, no CORS) ─────────────
const IS_TEST = new URLSearchParams(window.location.search).has('test');

async function fetchData() {
  const file = IS_TEST ? './data/test-results.json' : './results.json';
  const r = await fetch(`${file}?t=${Date.now()}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();

  if (Array.isArray(json))
    return { data: json, updated: null, raceName: null };
  if (json.status === 'waiting')
    return { data: [], updated: null, raceName: null, message: json.message };
  if (json.data !== undefined) {
    const raw = json.data;
    const arr = Array.isArray(raw) ? raw
              : Array.isArray(raw.data) ? raw.data
              : [];
    return { data: arr, updated: json.updated || null, raceName: json.raceName || null };
  }
  return { data: [], updated: null, raceName: null };
}

// ── Time helpers ──────────────────────────────────────────
function parseSecs(s) {
  if (!s) return null;
  const t = s.trim();
  let m;
  if ((m = t.match(/^(\d{1,3}):(\d{2}):(\d{2})$/)))
    return Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]);
  if ((m = t.match(/^(\d{1,3}):(\d{2})$/)))
    return Number(m[1])*60 + Number(m[2]);
  return null;
}

function fmtSecs(secs) {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${h}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function parseSplit(entry) {
  if (!entry) return { T: null, DT: null };
  if (typeof entry === 'string') return { T: entry, DT: null };
  const T  = entry.T  != null ? String(entry.T)  : null;
  const DT = entry.DT != null ? String(entry.DT) : null;
  return { T, DT };
}

function parseLastSplit(splits) {
  if (!Array.isArray(splits) || splits.length === 0) return null;
  const { T, DT } = parseSplit(splits[splits.length - 1]);
  return { cp: splits.length, timeStr: T, dtStr: DT };
}

function parseHHMM(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
}

function secsToHHMM(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${pad(h)}:${pad(m)}`;
}

function athleteStartSecs(splits) {
  if (!Array.isArray(splits) || splits.length === 0) return null;
  const { T, DT } = parseSplit(splits[0]);
  if (!T || !DT) return null;
  const chipSecs = parseSecs(T);
  const dtMatch  = String(DT).match(/(\d{1,2}):(\d{2})\s*$/);
  if (chipSecs == null || !dtMatch) return null;
  return Number(dtMatch[1]) * 3600 + Number(dtMatch[2]) * 60 - chipSecs;
}

// ── Process entries ───────────────────────────────────────
function processEntries(raw) {
  if (!Array.isArray(raw)) return {};

  const out = {};

  for (const e of raw) {
    const teamField = (e.Team || '').trim();
    const clubField = (e.Club || '').trim();
    const cat       = (e.C   || '').trim();

    if (stgStartTimes.length > 0) {
      // Start time is configured: use it as the primary STG filter.
      // Any athlete with a non-empty team who started in an STG wave counts.
      if (!teamField) continue;
      const start = athleteStartSecs(e.Splits);
      if (start === null || !stgStartTimes.some(t => Math.abs(start - t) <= 600)) continue;
    } else {
      // No start time configured: fall back to requiring team/club/cat to start with STG.
      const hasStg = /^STG/i.test(teamField) || /^STG/i.test(clubField) || /STG/i.test(cat);
      if (!hasStg) continue;
    }

    const team       = teamField || clubField || 'STG Unknown';
    const splitData  = parseLastSplit(e.Splits);
    const secs       = e.Status === 1 ? parseSecs(e.Result) : null;
    const eligible   = (cat === 'OM' || cat === 'OW');

    if (!out[team]) out[team] = [];
    out[team].push({
      name:      (e.N || '').trim(),
      sex:       e.Sex === 'F' ? 'F' : 'M',
      bib:       e.Bib,
      time:      secs != null ? e.Result.trim() : null,
      secs,
      eligible,
      cp:        splitData ? splitData.cp : 0,
      splitTime: splitData ? splitData.timeStr : null,
      splits:    Array.isArray(e.Splits) ? e.Splits : [],
    });
  }

  for (const members of Object.values(out)) {
    members.sort((a, b) => {
      if (a.secs != null && b.secs != null) return a.secs - b.secs;
      if (a.secs != null) return -1;
      if (b.secs != null) return  1;
      if (a.cp !== b.cp)  return b.cp - a.cp;
      return (parseSecs(a.splitTime) ?? Infinity) - (parseSecs(b.splitTime) ?? Infinity);
    });
  }

  return out;
}

// ── Team score ────────────────────────────────────────────
function calcScore(members) {
  const finished = members.filter(m => m.secs != null);
  const onCourse = members.filter(m => m.secs == null && m.cp > 0);
  const eligible = finished.filter(m => m.eligible);
  const females  = eligible.filter(m => m.sex === 'F');
  const total    = members.length;

  if (eligible.length === 0)
    return { status: 'nodata',    score: null, scoring: [], finished, onCourse, total };
  if (eligible.length < 4)
    return { status: 'waiting',   score: null, scoring: [], finished, onCourse, total };
  if (females.length === 0)
    return { status: 'no_female', score: null, scoring: [], finished, onCourse, total };

  const top4 = eligible.slice(0, 4);
  const scoring = top4.some(m => m.sex === 'F')
    ? top4
    : [...top4.slice(0, 3), females[0]].sort((a, b) => a.secs - b.secs);

  const avg = Math.round(scoring.reduce((s, m) => s + m.secs, 0) / 4);
  return { status: 'valid', score: avg, scoring, finished, onCourse, total };
}

// ── Checkpoint team score ─────────────────────────────────
function getSecsAtCP(member, cpNum) {
  if (member.splits.length < cpNum) return null;
  const { T } = parseSplit(member.splits[cpNum - 1]);
  return T ? parseSecs(T) : null;
}

function calcCPTeamScore(members, cpNum) {
  const withTime = members
    .filter(m => m.eligible)
    .map(m => ({ ...m, secs: getSecsAtCP(m, cpNum) }))
    .filter(m => m.secs != null)
    .sort((a, b) => a.secs - b.secs);

  const females = withTime.filter(m => m.sex === 'F');
  if (withTime.length < 4 || females.length === 0) return null;

  const top4 = withTime.slice(0, 4);
  const scoring = top4.some(m => m.sex === 'F')
    ? top4
    : [...top4.slice(0, 3), females[0]].sort((a, b) => a.secs - b.secs);

  return Math.round(scoring.reduce((s, m) => s + m.secs, 0) / 4);
}

function bestCPTeamScore(members) {
  const maxCP = members.reduce((m, x) => Math.max(m, x.cp), 0);
  for (let cp = maxCP; cp >= 1; cp--) {
    const score = calcCPTeamScore(members, cp);
    if (score !== null) return { cp, score };
  }
  return null;
}

// ── Render helpers ────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function memberTimeEl(m) {
  if (m.secs != null)
    return `<span class="mtime done">${m.time}</span>`;
  if (m.cp > 0)
    return `<div class="mcp"><span class="cpbadge">CP${m.cp}</span><span class="mtime onc">${m.splitTime || '—'}</span></div>`;
  return `<span class="mtime wait">—</span>`;
}

function detailTimeEl(m) {
  if (m.secs != null)
    return `<span class="dtime">${m.time}</span>`;
  if (m.cp > 0)
    return `<span class="dtime" style="color:#ff9800">CP${m.cp} · ${m.splitTime || '—'}</span>`;
  return `<span class="dtime" style="color:#444">—</span>`;
}

// ── Render: my team ───────────────────────────────────────
function renderMyTeam() {
  const el      = document.getElementById('my-team');
  const members = teams[MY_TEAM];

  if (!members || members.length === 0) {
    el.innerHTML = `<div class="info-box">
      STG-Dunakeszi 4+ not in results yet.<br>
      Waiting for the first team member to finish.
    </div>`;
    return;
  }

  const { status, score, scoring, finished, onCourse } = calcScore(members);
  const scoringBibs = new Set(scoring.map(m => m.bib));

  const racingNote = onCourse.length > 0 ? ` · ${onCourse.length} racing` : '';
  const scoreLbl = {
    valid:     `<span class="c-green">${fmtSecs(score)}</span>`,
    waiting:   `<span class="c-orange">⏳ ${finished.length} done${racingNote}</span>`,
    no_female: `<span class="c-red">⚠ No female finisher yet</span>`,
    nodata:    `<span class="c-dim">Waiting…</span>`,
  }[status];

  const rows = members.map(m => `
    <div class="mrow">
      <div class="gbadge ${m.sex}">${m.sex}</div>
      <div class="mname">${esc(m.name)}</div>
      ${memberTimeEl(m)}${scoringBibs.has(m.bib) ? '<span class="star">★</span>' : ''}
    </div>`).join('');

  const note = status === 'valid'
    ? `<div class="score-note">★ counted in team score &nbsp;·&nbsp; avg of best 4, ≥1 female</div>`
    : '';

  let cpBar = '';
  if (status !== 'valid') {
    const cp = bestCPTeamScore(members);
    if (cp) cpBar = `<div class="cp-score-bar">
      <span class="cplabel">CP${cp.cp} team time (in progress)</span>
      <span class="cpval">${fmtSecs(cp.score)}</span>
    </div>`;
  }

  el.innerHTML = `<div class="my-card">
    <div class="my-card-head">
      <span class="tname">${esc(MY_TEAM)}</span>
      <span class="tscore">${scoreLbl}</span>
    </div>
    ${rows}${note}${cpBar}
  </div>`;
}

// ── Render: rankings ─────────────────────────────────────
function renderRankings() {
  const el = document.getElementById('rankings');
  const tc = document.getElementById('team-count');

  if (Object.keys(teams).length === 0) {
    el.innerHTML = ''; tc.textContent = ''; return;
  }

  const scored = Object.entries(teams)
    .map(([name, members]) => ({ name, ...calcScore(members) }))
    .sort((a, b) => {
      if (a.status === 'valid' && b.status === 'valid') return a.score - b.score;
      if (a.status === 'valid')   return -1;
      if (b.status === 'valid')   return  1;
      if (a.status === 'waiting' && b.status === 'waiting')
        return b.finished.length - a.finished.length;
      if (a.status === 'waiting') return -1;
      if (b.status === 'waiting') return  1;
      return a.name.localeCompare(b.name);
    });

  tc.textContent = `(${scored.length} teams)`;

  let validRank = 0;
  const html = scored.map((t, i) => {
    const isMe = t.name === MY_TEAM;
    if (t.status === 'valid') validRank++;
    const posNum   = t.status === 'valid' ? validRank : '—';
    const posClass = validRank <= 3 && t.status === 'valid' ? `p${validRank}` : '';

    let scoreTxt;
    if (t.status === 'valid') {
      scoreTxt = `<span class="rscore c-green">${fmtSecs(t.score)}</span>`;
    } else if (t.status === 'no_female') {
      scoreTxt = `<span class="rscore c-red">⚠ no F</span>`;
    } else {
      const cp = bestCPTeamScore(teams[t.name] || []);
      scoreTxt = cp
        ? `<span class="rscore" style="color:#ff9800;font-size:11px">CP${cp.cp}&nbsp;${fmtSecs(cp.score)}</span>`
        : `<span class="rscore c-dim">—</span>`;
    }

    const detailId    = `d${i}`;
    const isOpen      = expanded.has(detailId);
    const scoringBibs = new Set(t.scoring.map(m => m.bib));
    const detailRows  = (teams[t.name] || []).map(m => `
      <div class="drow">
        <div class="gbadge ${m.sex}" style="width:16px;height:16px;font-size:8px">${m.sex}</div>
        ${esc(m.name)}
        ${detailTimeEl(m)}
        ${scoringBibs.has(m.bib) ? '<span class="dstar">★</span>' : ''}
      </div>`).join('');

    return `
      <div class="trow${isMe ? ' mine' : ''}" onclick="toggleDetail('${detailId}')">
        <div class="rpos ${posClass}">${posNum}</div>
        <div class="rname">${isMe ? '★ ' : ''}${esc(t.name)}</div>
        ${scoreTxt}
        <span class="rprog">${t.finished.length}+${t.onCourse.length}/${t.total}</span>
      </div>
      <div id="${detailId}" class="tdetail${isOpen ? ' open' : ''}">${detailRows}</div>`;
  }).join('');

  el.innerHTML = `<div class="rcard">${html}</div>`;
}

function toggleDetail(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  document.getElementById(id)?.classList.toggle('open');
}

// ── Status bar ────────────────────────────────────────────
function setStatus(msg) { document.getElementById('status-text').textContent = msg; }

function setLoading(on) {
  document.getElementById('loading-bar').classList.toggle('active', on);
  document.getElementById('refresh-btn').disabled = on;
}

function fmtUpdated(s) {
  if (!s) return '';
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return s;
}

function dataAgeMinutes() {
  if (!lastUpdated) return null;
  return Math.floor((Date.now() - new Date(lastUpdated)) / 60000);
}

function updateStatus() {
  const n   = Object.values(teams).reduce((s, m) => s + m.filter(x => x.secs).length, 0);
  const age = lastUpdated ? ` · data from ${fmtUpdated(lastUpdated)}` : '';
  setStatus(`${n} finishers · refresh in ${countdown}s${age}`);

  const mins = dataAgeMinutes();
  const banner = document.getElementById('stale-banner');
  if (banner) banner.style.display = (mins !== null && mins >= 10) ? 'block' : 'none';
}

// ── Refresh loop ──────────────────────────────────────────
async function refresh() {
  setLoading(true);
  setStatus('Loading…');
  try {
    await fetchConfig();
    const { data, updated, raceName, message } = await fetchData();
    if (updated) lastUpdated = updated;
    if (raceName) document.getElementById('race-name').textContent = raceName;

    if (data.length === 0 && message) {
      setStatus('No race configured — tap ⚙ to set one');
      document.getElementById('my-team').innerHTML = `<div class="info-box">
        <b>No race selected yet.</b><br><br>
        Tap the <b>⚙</b> button in the top-right corner,<br>
        paste the race URL from live.onlinesystem.cz,<br>
        and tap <b>Apply</b>.
      </div>`;
      document.getElementById('rankings').innerHTML = '';
      document.getElementById('team-count').textContent = '';
      document.getElementById('race-name').textContent = 'No race selected';
      return;
    }

    teams = processEntries(data);

    if (Object.keys(teams).length === 0 && data.length > 0) {
      setStatus(`Loaded ${data.length} entries — no STG teams in this category`);
      document.getElementById('my-team').innerHTML = `<div class="info-box">
        Loaded ${data.length} results but found no STG teams.<br>
        Make sure you selected an STG category URL.
      </div>`;
      document.getElementById('rankings').innerHTML = '';
      return;
    }

    renderMyTeam();
    renderRankings();
    countdown = INTERVAL;
    updateStatus();
    startTicker();
  } catch (e) {
    setStatus('Error loading data');
    document.getElementById('my-team').innerHTML =
      `<div class="err-box"><b>Could not load results</b><br><br>${esc(e.message)}</div>`;
  } finally {
    setLoading(false);
  }
}

async function manualRefresh() {
  if (ticker) { clearInterval(ticker); ticker = null; }
  await refresh();
}

function startTicker() {
  if (ticker) clearInterval(ticker);
  countdown = INTERVAL;
  ticker = setInterval(() => {
    countdown--;
    if (countdown <= 0) refresh();
    else updateStatus();
  }, 1000);
}

// ── Init ──────────────────────────────────────────────────
if (IS_TEST) document.getElementById('test-banner').style.display = 'block';
refresh();
