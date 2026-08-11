// ---- View switching ----
function showView(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (id === 'standings') loadStandings();
}

// ---- Player identity (name + email, remembered on this device) ----
function getPlayer() {
  const raw = localStorage.getItem('pickem_player');
  return raw ? JSON.parse(raw) : null;
}

async function ensureIdentity() {
  const player = getPlayer();
  await loadTeamsIntoDropdown();
  if (!player) {
    document.getElementById('identity-modal').style.display = 'flex';
  } else {
    loadWeek();
  }
}

async function loadTeamsIntoDropdown() {
  try {
    const res = await fetch('/api/teams');
    const data = await res.json();
    const select = document.getElementById('identity-team');
    data.teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  } catch {
    // Non-fatal, they can still register without a team showing up here.
  }
}

async function submitIdentity() {
  const name = document.getElementById('identity-name').value.trim();
  const email = document.getElementById('identity-email').value.trim();
  const teamId = document.getElementById('identity-team').value;
  const errorEl = document.getElementById('identity-error');
  errorEl.textContent = '';

  if (!name || !email) {
    errorEl.textContent = 'Please enter both your name and email.';
    return;
  }

  try {
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, team_id: teamId ? Number(teamId) : null })
    });
    if (!res.ok) throw new Error('Could not save your info, please try again.');
    const player = await res.json();
    localStorage.setItem('pickem_player', JSON.stringify(player));
    document.getElementById('identity-modal').style.display = 'none';
    loadWeek();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---- Picks ----
let currentWeek = null;

async function loadWeek() {
  const player = getPlayer();
  const heading = document.getElementById('picks-heading');
  const list = document.getElementById('games-list');

  try {
    const res = await fetch(`/api/week?player_id=${player.id}`);
    if (res.status === 404) {
      heading.textContent = "No games are open for picks right now";
      list.innerHTML = '';
      return;
    }
    if (!res.ok) throw new Error('Could not load this week\'s games.');
    currentWeek = await res.json();

    heading.textContent = currentWeek.is_playoff
      ? `Playoff round ${currentWeek.round_number}`
      : `Week ${currentWeek.round_number} · ${currentWeek.games.length} games`;
    document.getElementById('week-subtitle').textContent = currentWeek.is_playoff
      ? 'Bonus Playoff Pick \'Em'
      : 'Pick the Winner of Each Game';

    renderGames(currentWeek.games);
  } catch (err) {
    heading.textContent = err.message;
  }
}

function renderGames(games) {
  const list = document.getElementById('games-list');
  if (!games.length) {
    list.innerHTML = '<div class="empty-state">No games set for this week yet.</div>';
    return;
  }

  list.innerHTML = games.map(g => {
    const kickoff = new Date(g.kickoff_time).toLocaleString(undefined, {
      weekday: 'short', hour: 'numeric', minute: '2-digit'
    });
    const lockLabel = g.locked
      ? '<span class="lock">Locked, kickoff passed</span>'
      : '<span class="open">Locks at kickoff</span>';

    const homePicked = g.my_pick === g.home_team;
    const awayPicked = g.my_pick === g.away_team;
    const disabledAttr = g.locked ? 'data-disabled="true"' : '';
    const clickHome = g.locked ? '' : `onclick="pick(${g.id}, '${escapeQuotes(g.home_team)}', this)"`;
    const clickAway = g.locked ? '' : `onclick="pick(${g.id}, '${escapeQuotes(g.away_team)}', this)"`;

    return `
      <div class="game-card">
        <div class="meta"><span>${g.sport === 'nfl' ? 'NFL' : 'College'} &middot; ${kickoff}</span>${lockLabel}</div>
        <div class="teams">
          <div class="team-btn ${homePicked ? 'picked' : ''}" ${disabledAttr} ${clickHome}>${g.home_team}</div>
          <div class="team-btn ${awayPicked ? 'picked' : ''}" ${disabledAttr} ${clickAway}>${g.away_team}</div>
        </div>
      </div>`;
  }).join('');
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'");
}

async function pick(gameId, pickedTeam, el) {
  const player = getPlayer();
  el.parentElement.querySelectorAll('.team-btn').forEach(b => b.classList.remove('picked'));
  el.classList.add('picked');

  try {
    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player_id: player.id, game_id: gameId, picked_team: pickedTeam })
    });
    if (!res.ok) {
      const body = await res.json();
      alert(body.error || 'Could not save that pick.');
      loadWeek(); // reload to reflect true state
    }
  } catch (err) {
    alert('Could not save that pick, check your connection and try again.');
  }
}

// ---- Standings ----
let allStandings = [];

async function loadStandings() {
  try {
    const res = await fetch('/api/standings');
    if (!res.ok) throw new Error();
    const data = await res.json();
    allStandings = data.standings;
    populateStandingsFilter();
    renderStandingsView();
  } catch {
    document.getElementById('standings-table').innerHTML = '<tr><td class="empty-state">Standings aren\'t available yet.</td></tr>';
  }

  try {
    const res = await fetch('/api/standings?teams=1');
    if (res.ok) {
      const data = await res.json();
      renderTeamStandings(data.team_standings);
    }
  } catch {
    // team standings are supplemental, fail quietly
  }

  if (currentWeek && currentWeek.week_id) {
    try {
      const res = await fetch(`/api/standings?week_id=${currentWeek.week_id}`);
      if (res.ok) {
        const recap = await res.json();
        renderRecap(recap);
      }
    } catch {
      // weekly recap is optional, fail quietly
    }
  }
}

function populateStandingsFilter() {
  const select = document.getElementById('standings-filter');
  const seen = new Set();
  const teamOptions = allStandings
    .filter(p => p.team_id && !seen.has(p.team_id) && seen.add(p.team_id))
    .map(p => `<option value="${p.team_id}">${p.team_name}</option>`)
    .join('');
  select.innerHTML = '<option value="all">Everyone</option>' + teamOptions;

  const me = getPlayer();
  if (me) {
    const meInStandings = allStandings.find(p => p.player_id === me.id);
    if (meInStandings && meInStandings.team_id) select.value = String(meInStandings.team_id);
  }
}

function renderTeamStandings(teamStandings) {
  const box = document.getElementById('team-standings');
  if (!teamStandings.length) {
    box.innerHTML = '<div class="empty-state">No teams set up yet.</div>';
    return;
  }
  box.innerHTML = teamStandings.map((t, i) => `
    <div class="team-card">
      <span class="rank">${i + 1}</span>
      <span class="name">${t.team_name} <span style="color:var(--muted);font-weight:400;">(${t.member_count} ${t.member_count === 1 ? 'member' : 'members'})</span></span>
      <span class="record">${t.wins}-${t.losses}</span>
    </div>`).join('');
}

function renderStandingsView() {
  const filter = document.getElementById('standings-filter').value;
  const filtered = filter === 'all'
    ? allStandings
    : allStandings.filter(p => String(p.team_id) === filter);

  renderPodiumAndTable(filtered);

  const note = document.getElementById('my-rank-note');
  const me = getPlayer();
  if (me && filter !== 'all') {
    const idx = filtered.findIndex(p => p.player_id === me.id);
    if (idx >= 0) {
      const teamName = filtered[idx].team_name;
      note.textContent = `You're ranked #${idx + 1} on ${teamName}.`;
    } else {
      note.textContent = '';
    }
  } else {
    note.textContent = '';
  }
}

function renderPodiumAndTable(standings) {
  const podium = document.getElementById('podium');
  const table = document.getElementById('standings-table');

  const top3 = standings.slice(0, 3);
  const rest = standings.slice(3);

  const stepClass = { 0: 'p1', 1: 'p2', 2: 'p3' };
  const rankLabel = { 0: '1st', 1: '2nd', 2: '3rd' };
  podium.innerHTML = top3.map((p, i) => `
    <div class="step ${stepClass[i]}">
      <div class="rank">${rankLabel[i]}</div>
      <div class="name">${p.name}</div>
      <div class="pct">${p.win_pct.toFixed(3)}</div>
    </div>`).join('');

  table.innerHTML = '<tr><th>Rank</th><th>Name</th><th>W</th><th>L</th><th>Win %</th></tr>' +
    rest.map((p, i) => `
      <tr class="${p.is_coinflip ? 'coinflip' : ''}">
        <td>${i + 4}</td><td>${p.name}</td><td>${p.wins}</td><td>${p.losses}</td>
        <td class="pctcol">${p.win_pct.toFixed(3)}</td>
      </tr>`).join('');
}

function renderRecap(recap) {
  document.getElementById('stat-row').innerHTML = `
    <div class="stat-card"><div class="num">${recap.average_wins}</div><div class="label">Avg wins this week</div></div>
    <div class="stat-card"><div class="num">${recap.player_count}</div><div class="label">Players this week</div></div>`;

  document.getElementById('pickbars').innerHTML = recap.games.map(g => `
    <div class="pickbar-row">
      <div class="labels"><span>${g.home_team} ${g.home_pct}%</span><span>${g.away_team} ${g.away_pct}%</span></div>
      <div class="pickbar">
        <div class="fillA" style="width:${g.home_pct}%"></div>
        <div class="fillB" style="width:${g.away_pct}%"></div>
      </div>
    </div>`).join('');
}

// ---- Boot ----
ensureIdentity();
