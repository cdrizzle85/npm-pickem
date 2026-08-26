let availableGames = [];
let selectedGames = []; // full game objects, from either the schedule or manual entry
let allTeams = [];
let allPlayers = [];

// ---- Current week ----
async function loadCurrentWeek() {
  const box = document.getElementById('current-week-box');
  try {
    const res = await fetch('/api/week');
    if (res.status === 404) {
      box.textContent = 'No open week right now.';
      return;
    }
    const data = await res.json();

    const gamesHtml = data.games.map(g => `
      <div style="margin-bottom:8px;">
        #${g.id} ${g.away_team} at ${g.home_team}${data.locked ? '' : ' <span style="color:var(--muted);">(not locked yet)</span>'}
        ${data.locked ? `
          <button class="btn-secondary" style="margin-left:10px;" onclick="setResultInline(${g.id}, '${escapeQ(g.home_team)}')">${g.home_team} won</button>
          <button class="btn-secondary" onclick="setResultInline(${g.id}, '${escapeQ(g.away_team)}')">${g.away_team} won</button>
        ` : ''}
      </div>`).join('');

    box.innerHTML = `<strong>Week ${data.round_number}${data.is_playoff ? ' (playoff)' : ''}</strong>, week id ${data.week_id}<br><br>` +
      gamesHtml +
      `<button class="btn-secondary" style="margin-left:0;margin-top:10px;" onclick="scoreWeek(${data.week_id})">Try pulling results automatically</button>` +
      `<button class="btn-secondary" style="margin-top:10px;color:var(--loss);border-color:var(--loss);" onclick="deleteWeek(${data.week_id}, ${data.round_number})">Delete this week</button>`;
  } catch {
    box.textContent = 'Could not load the current week.';
  }
}

function escapeQ(str) {
  return str.replace(/'/g, "\\'");
}

async function setResultInline(gameId, winnerTeam) {
  try {
    const res = await fetch('/api/admin/set-result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, winner_team: winnerTeam })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not set result.');
    loadCurrentWeek();
  } catch (err) {
    alert(err.message);
  }
}

async function scoreWeek(weekId) {
  try {
    const res = await fetch('/api/admin/score-week', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week_id: weekId })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Scoring failed.');
    alert(body.all_final
      ? 'All games final, week scored.'
      : 'Some games are still in progress, still pending, or were added manually (use the buttons above for those).');
    loadCurrentWeek();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteWeek(weekId, roundNumber) {
  if (!confirm(`Delete week ${roundNumber}? This removes its games and everyone's picks for it. No undo.`)) return;
  try {
    const res = await fetch('/api/admin/delete-week', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week_id: weekId })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not delete week.');
    loadCurrentWeek();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Teams ----
async function loadTeams() {
  const box = document.getElementById('teams-list');
  try {
    const res = await fetch('/api/admin/teams');
    const data = await res.json();
    allTeams = data.teams;
    if (!allTeams.length) {
      box.innerHTML = 'No teams yet, add one below.';
      return;
    }
    const groups = { NPM: allTeams.filter(t => t.org === 'NPM'), NPCC: allTeams.filter(t => t.org === 'NPCC') };
    box.innerHTML = ['NPM', 'NPCC'].map(org => `
      <div style="font-weight:800;color:var(--navy);margin:10px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">${org}</div>
      ${groups[org].length ? groups[org].map(t => `
        <div style="margin-bottom:6px;">
          <strong>${t.name}</strong>
          <button class="btn-secondary" style="margin-left:10px;padding:4px 10px;" onclick="editTeam(${t.id}, '${escapeQ(t.name)}', '${t.org}')">Rename</button>
          <button class="btn-secondary" style="padding:4px 10px;" onclick="deleteTeam(${t.id}, '${escapeQ(t.name)}')">Remove</button>
        </div>`).join('') : '<div style="color:var(--muted);">No teams yet.</div>'}
    `).join('');
  } catch {
    box.innerHTML = 'Could not load teams.';
  }
}

async function addTeam() {
  const status = document.getElementById('team-status');
  const org = document.getElementById('new-team-org').value;
  const name = document.getElementById('new-team-name').value.trim();
  if (!name) {
    status.textContent = 'Enter a team name.';
    status.style.color = 'var(--loss)';
    return;
  }
  try {
    const res = await fetch('/api/admin/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ org, name })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not add team.');
    status.textContent = `Added ${org} \u00b7 ${name}.`;
    status.style.color = 'var(--royal)';
    document.getElementById('new-team-name').value = '';
    loadTeams();
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--loss)';
  }
}

async function editTeam(id, currentName, currentOrg) {
  const name = prompt('Team name:', currentName);
  if (!name) return;
  const org = prompt('Org (NPM or NPCC):', currentOrg);
  if (!org || (org !== 'NPM' && org !== 'NPCC')) {
    alert("Org must be exactly 'NPM' or 'NPCC', rename cancelled.");
    return;
  }
  try {
    const res = await fetch(`/api/admin/teams/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, org })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not rename team.');
    loadTeams();
    loadPlayers();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTeam(id, name) {
  if (!confirm(`Remove ${name}? Members keep their picks but lose their team assignment.`)) return;
  try {
    const res = await fetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not remove team.');
    loadTeams();
    loadPlayers();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Players ----
async function loadPlayers() {
  const box = document.getElementById('players-list');
  try {
    const res = await fetch('/api/admin/players');
    const data = await res.json();
    allPlayers = data.players;
    if (!allPlayers.length) {
      box.innerHTML = 'No players yet.';
      return;
    }
    box.innerHTML = allPlayers.map(p => {
      return `
        <div style="margin-bottom:6px;">
          <strong>${p.name}</strong> <span style="color:var(--muted);">${p.email} &middot; ${p.team_name || 'no team'}</span>
          <button class="btn-secondary" style="margin-left:10px;padding:4px 10px;" onclick="editPlayer(${p.id}, '${escapeQ(p.name)}', '${escapeQ(p.email)}')">Edit</button>
          <button class="btn-secondary" style="padding:4px 10px;" onclick="deletePlayer(${p.id}, '${escapeQ(p.name)}')">Remove</button>
        </div>`;
    }).join('');
  } catch {
    box.innerHTML = 'Could not load players.';
  }
}

function copyAllEmails() {
  const status = document.getElementById('emails-status');
  const box = document.getElementById('emails-box');
  const emails = allPlayers.map(p => p.email);

  if (!emails.length) {
    status.textContent = 'No player emails yet.';
    status.style.color = 'var(--muted)';
    return;
  }

  const list = emails.join(', ');
  box.value = list;
  box.style.display = 'block';

  navigator.clipboard.writeText(list).then(() => {
    status.textContent = `Copied ${emails.length} email${emails.length === 1 ? '' : 's'} to your clipboard, paste into BCC.`;
    status.style.color = 'var(--royal)';
  }).catch(() => {
    status.textContent = `Couldn't copy automatically, select the text below and copy it manually.`;
    status.style.color = 'var(--muted)';
    box.select();
  });
}

async function addPlayer() {
  const status = document.getElementById('player-status');
  const name = document.getElementById('new-player-name').value.trim();
  const email = document.getElementById('new-player-email').value.trim();

  if (!name || !email) {
    status.textContent = 'Enter a name and email.';
    status.style.color = 'var(--loss)';
    return;
  }

  try {
    const res = await fetch('/api/admin/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not add player.');
    status.textContent = `Added ${name}.`;
    status.style.color = 'var(--royal)';
    document.getElementById('new-player-name').value = '';
    document.getElementById('new-player-email').value = '';
    loadPlayers();
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--loss)';
  }
}

async function editPlayer(id, currentName, currentEmail) {
  const name = prompt('Name:', currentName);
  if (name === null) return;
  const email = prompt('Email:', currentEmail);
  if (email === null) return;

  const npmTeams = allTeams.filter(t => t.org === 'NPM');
  const npccTeams = allTeams.filter(t => t.org === 'NPCC');
  const teamMenu = [
    '-- NPM --', ...npmTeams.map(t => `${t.id}) ${t.name}`),
    '-- NPCC --', ...npccTeams.map(t => `${t.id}) ${t.name}`)
  ].join('\n');
  const teamChoice = prompt(`Team? Enter the number, or leave blank for no team:\n${teamMenu}`);
  const team_id = teamChoice && teamChoice.trim() ? Number(teamChoice.trim()) : null;

  try {
    const res = await fetch(`/api/admin/players/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, team_id })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not update player.');
    loadPlayers();
  } catch (err) {
    alert(err.message);
  }
}

async function deletePlayer(id, name) {
  if (!confirm(`Remove ${name}? This also deletes all of their past picks.`)) return;
  try {
    const res = await fetch(`/api/admin/players/${id}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not remove player.');
    loadPlayers();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Schedule browsing ----
async function fetchAvailableGames() {
  const sport = document.getElementById('sport-select').value;
  const start = document.getElementById('date-start').value;
  const end = document.getElementById('date-end').value;
  const container = document.getElementById('available-games');

  if (!start || !end) {
    container.innerHTML = '<div class="empty-state">Pick a from and to date first.</div>';
    return;
  }

  container.innerHTML = 'Loading&hellip;';

  try {
    const res = await fetch(`/api/admin/schedule?sport=${sport}&start=${start}&end=${end}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    availableGames = data.games;

    if (!availableGames.length) {
      container.innerHTML = '<div class="empty-state">No pre-loaded games in that range, try manual entry below.</div>';
      return;
    }

    container.innerHTML = availableGames.map((g, i) => {
      const kickoff = new Date(g.kickoff_time).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      return `
        <label class="available-game">
          <span><input type="checkbox" onchange="toggleGame(${i}, this.checked)"> ${g.away_team} at ${g.home_team}</span>
          <span class="time">
            ${g.time_tbd ? '<span style="color:var(--loss);">TBD</span> ' : ''}${kickoff}
            <button class="btn-secondary" style="padding:3px 8px;font-size:11px;margin-left:8px;" onclick="editScheduleTime(${g.id}, ${i})">Edit time</button>
          </span>
        </label>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

async function editScheduleTime(scheduleId, index) {
  const current = availableGames[index].kickoff_time;
  const input = prompt('New kickoff time (local), format: YYYY-MM-DDTHH:MM, e.g. 2026-09-13T13:00', current.slice(0, 16));
  if (!input) return;

  try {
    const iso = new Date(input).toISOString();
    const res = await fetch('/api/admin/schedule', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: scheduleId, kickoff_time: iso })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not update time.');
    fetchAvailableGames();
  } catch (err) {
    alert(err.message);
  }
}

function toggleGame(index, checked) {
  const g = availableGames[index];
  const normalized = {
    espn_event_id: g.source_event_id,
    source: 'schedule',
    sport: g.sport,
    home_team: g.home_team,
    away_team: g.away_team,
    kickoff_time: g.kickoff_time
  };
  if (checked) {
    if (!selectedGames.find(sg => sg.espn_event_id === normalized.espn_event_id)) selectedGames.push(normalized);
  } else {
    selectedGames = selectedGames.filter(sg => sg.espn_event_id !== normalized.espn_event_id);
  }
  renderSelected();
}

function addManualGame() {
  const sport = document.getElementById('manual-sport').value;
  const away = document.getElementById('manual-away').value.trim();
  const home = document.getElementById('manual-home').value.trim();
  const kickoffLocal = document.getElementById('manual-kickoff').value;

  if (!away || !home || !kickoffLocal) {
    alert('Fill in away team, home team, and kickoff time first.');
    return;
  }

  selectedGames.push({
    espn_event_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'manual',
    sport,
    home_team: home,
    away_team: away,
    kickoff_time: new Date(kickoffLocal).toISOString()
  });

  document.getElementById('manual-away').value = '';
  document.getElementById('manual-home').value = '';
  document.getElementById('manual-kickoff').value = '';
  renderSelected();
}

function renderSelected() {
  const box = document.getElementById('selected-games');
  if (!selectedGames.length) {
    box.innerHTML = 'None yet, add games above.';
    return;
  }
  box.innerHTML = selectedGames.map(g => `${g.away_team} at ${g.home_team} <span style="color:var(--muted);">(${g.source})</span>`).join('<br>');
}

async function publishWeek() {
  const status = document.getElementById('publish-status');
  const roundNumber = Number(document.getElementById('round-number').value);
  const isPlayoff = document.getElementById('is-playoff').checked;

  if (!selectedGames.length) {
    status.textContent = 'Add at least one game first.';
    status.style.color = 'var(--loss)';
    return;
  }

  try {
    const res = await fetch('/api/admin/publish-week', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ round_number: roundNumber, is_playoff: isPlayoff, games: selectedGames })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Publish failed.');
    status.textContent = `Week ${roundNumber} published with ${selectedGames.length} games.`;
    status.style.color = 'var(--royal)';
    selectedGames = [];
    renderSelected();
    loadCurrentWeek();
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--loss)';
  }
}

async function setResult() {
  const status = document.getElementById('override-status');
  const gameId = Number(document.getElementById('override-game-id').value);
  const winner = document.getElementById('override-winner').value.trim();

  try {
    const res = await fetch('/api/admin/set-result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, winner_team: winner })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not set result.');
    status.textContent = 'Result set.';
    status.style.color = 'var(--royal)';
    loadCurrentWeek();
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--loss)';
  }
}

loadCurrentWeek();
loadTeams();
loadPlayers();
