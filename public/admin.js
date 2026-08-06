let availableGames = [];
let selectedGames = []; // full game objects

async function loadCurrentWeek() {
  const box = document.getElementById('current-week-box');
  try {
    const res = await fetch('/api/week');
    if (res.status === 404) {
      box.textContent = 'No open week right now.';
      return;
    }
    const data = await res.json();
    box.innerHTML = `Week ${data.round_number}${data.is_playoff ? ' (playoff)' : ''} &middot; week id ${data.week_id} &middot; ` +
      data.games.map(g => `#${g.id} ${g.home_team} vs ${g.away_team}${g.locked ? ' (locked)' : ''}`).join(', ') +
      `<br><button class="btn-secondary" style="margin-left:0;margin-top:10px;" onclick="scoreWeek(${data.week_id})">Pull results &amp; score this week</button>`;
  } catch {
    box.textContent = 'Could not load the current week.';
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
    if (!res.ok) throw new Error();
    const data = await res.json();
    availableGames = data.games;

    if (!availableGames.length) {
      container.innerHTML = '<div class="empty-state">No games found for that date.</div>';
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
  } catch {
    container.innerHTML = '<div class="empty-state">Could not reach ESPN, try again in a moment.</div>';
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

function renderSelected() {
  const box = document.getElementById('selected-games');
  if (!selectedGames.length) {
    box.innerHTML = 'None yet, check games above to add them.';
    return;
  }
  box.innerHTML = selectedGames.map(g => `${g.away_team} at ${g.home_team}`).join('<br>');
}

async function publishWeek() {
  const status = document.getElementById('publish-status');
  const roundNumber = Number(document.getElementById('round-number').value);
  const isPlayoff = document.getElementById('is-playoff').checked;

  if (!selectedGames.length) {
    status.textContent = 'Select at least one game first.';
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

async function scoreWeek(weekId) {
  const box = document.getElementById('current-week-box');
  try {
    const res = await fetch('/api/admin/score-week', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week_id: weekId })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Scoring failed.');
    alert(body.all_final ? 'All games final, week scored.' : 'Some games are still in progress, run this again once they finish.');
    loadCurrentWeek();
  } catch (err) {
    alert(err.message);
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
