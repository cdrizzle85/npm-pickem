let availableGames = [];
let selectedGames = []; // full game objects, from either pull or manual entry

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
        #${g.id} ${g.away_team} at ${g.home_team}${g.locked ? '' : ' <span style="color:var(--muted);">(not locked yet)</span>'}
        ${g.locked ? `
          <button class="btn-secondary" style="margin-left:10px;" onclick="setResultInline(${g.id}, '${escapeQ(g.home_team)}')">${g.home_team} won</button>
          <button class="btn-secondary" onclick="setResultInline(${g.id}, '${escapeQ(g.away_team)}')">${g.away_team} won</button>
        ` : ''}
      </div>`).join('');

    box.innerHTML = `<strong>Week ${data.round_number}${data.is_playoff ? ' (playoff)' : ''}</strong>, week id ${data.week_id}<br><br>` +
      gamesHtml +
      `<button class="btn-secondary" style="margin-left:0;margin-top:10px;" onclick="scoreWeek(${data.week_id})">Try pulling results automatically</button>`;
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

async function fetchAvailableGames() {
  const sport = document.getElementById('sport-select').value;
  const date = document.getElementById('date-select').value.replace(/-/g, '');
  const container = document.getElementById('available-games');
  container.innerHTML = 'Loading&hellip;';

  try {
    const url = `/api/admin/available-games?sport=${sport}${date ? `&date=${date}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    availableGames = data.games;

    if (!availableGames.length) {
      container.innerHTML = '<div class="empty-state">No games found for that date, try manual entry below.</div>';
      return;
    }

    container.innerHTML = availableGames.map((g, i) => {
      const kickoff = new Date(g.kickoff_time).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      return `
        <label class="available-game">
          <span><input type="checkbox" onchange="toggleGame(${i}, this.checked)"> ${g.away_team} at ${g.home_team}</span>
          <span class="time">${kickoff}</span>
        </label>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

function toggleGame(index, checked) {
  const game = availableGames[index];
  if (checked) {
    if (!selectedGames.find(g => g.espn_event_id === game.espn_event_id)) selectedGames.push(game);
  } else {
    selectedGames = selectedGames.filter(g => g.espn_event_id !== game.espn_event_id);
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
