const cfg = window.APP_CONFIG || {};
let supabaseClient = null;

function getClient() {
  if (!supabaseClient) {
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR_PROJECT') || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes('YOUR_')) {
      throw new Error('Please fill SUPABASE_URL and SUPABASE_ANON_KEY in config.js first.');
    }
    supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function $(id) { return document.getElementById(id); }
function nowMs() { return Date.now(); }
function isoAfter(seconds) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function safeName(g) { return g && g.name && g.name.trim() ? g.name.trim() : `Group ${g ? g.id : ''}`; }
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function setRingProgress(el, remainingMs, totalMs, circumference) {
  if (!el) return;
  if (!totalMs || totalMs <= 0) {
    el.style.strokeDashoffset = String(circumference);
    return;
  }
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  el.style.strokeDashoffset = String(circumference * (1 - ratio));
}
function getPhaseTotalMs(state, phase) {
  const canvassing = Number(cfg.CANVASSING_SECONDS || 60) * 1000;
  const thinking = Number(cfg.THINKING_SECONDS || 60) * 1000;
  if (phase === 'canvassing') return canvassing;
  if (phase === 'thinking') return thinking;
  if (state && state.voting_start_time && state.voting_end_time) {
    return new Date(state.voting_end_time).getTime() - new Date(state.voting_start_time).getTime();
  }
  return canvassing + thinking;
}
function getVoteUrl() {
  const base = cfg.PUBLIC_BASE_URL && cfg.PUBLIC_BASE_URL.trim()
    ? cfg.PUBLIC_BASE_URL.trim().replace(/\/$/, '')
    : window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/vote.html`;
}
async function fetchGroups() {
  const { data, error } = await getClient().from('groups').select('*').order('id');
  if (error) throw error;
  return data || [];
}
async function fetchState() {
  const { data, error } = await getClient().from('event_state').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}
async function fetchVotesForGroup(groupId) {
  const { data, error } = await getClient().from('votes').select('*').eq('group_id', groupId);
  if (error) throw error;
  return data || [];
}
async function fetchResults() {
  const groups = await fetchGroups();
  const { data: votes, error } = await getClient().from('votes').select('*');
  if (error) throw error;
  return groups.map(g => {
    const gv = (votes || []).filter(v => v.group_id === g.id);
    const total = gv.reduce((sum, v) => sum + Number(v.score || 0), 0);
    const avg = gv.length ? total / gv.length : 0;
    return { ...g, vote_count: gv.length, average_score: avg };
  }).sort((a, b) => b.average_score - a.average_score || b.vote_count - a.vote_count || a.id - b.id);
}
function derivePhase(state) {
  if (!state) return { phase: 'idle', remainingMs: 0 };
  if (state.show_ranking || state.phase === 'ranking') return { phase: 'ranking', remainingMs: 0 };
  if (!state.voting_open || !state.voting_end_time) return { phase: state.phase || 'idle', remainingMs: 0 };
  const t = nowMs();
  const canvassEnd = new Date(state.canvassing_end_time).getTime();
  const voteEnd = new Date(state.voting_end_time).getTime();
  if (t >= voteEnd) return { phase: 'closed', remainingMs: 0 };
  if (t < canvassEnd) return { phase: 'canvassing', remainingMs: voteEnd - t, phaseRemainingMs: canvassEnd - t };
  return { phase: 'thinking', remainingMs: voteEnd - t, phaseRemainingMs: voteEnd - t };
}
function ensureToken() {
  let token = localStorage.getItem('dubbing_voter_token');
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem('dubbing_voter_token', token);
  }
  return token;
}
function setMsg(id, text, type='notice') {
  const el = $(id);
  if (!el) return;
  el.className = `notice ${type}`;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}
function requireAdmin() {
  const saved = sessionStorage.getItem('admin_ok') === '1';
  if (saved) return true;
  const code = prompt('请输入后台密码 / Admin code');
  if (code === cfg.ADMIN_CODE) {
    sessionStorage.setItem('admin_ok', '1');
    return true;
  }
  document.body.innerHTML = '<div class="page"><div class="card"><h1>后台密码错误</h1><p class="subtle">刷新页面后可重新输入。人类连密码都能输错，真是稳定发挥。</p></div></div>';
  return false;
}
async function initAdmin() {
  if (!requireAdmin()) return;
  await renderAdmin();
  setInterval(renderAdminStatusOnly, 1000);
}
async function renderAdmin() {
  try {
    const groups = await fetchGroups();
    const state = await fetchState();
    const list = $('groupList');
    const select = $('currentGroup');
    list.innerHTML = '';
    select.innerHTML = '';
    groups.forEach(g => {
      const row = document.createElement('div');
      row.className = 'group-row';
      row.innerHTML = `<b>#${g.id}</b><input id="gname-${g.id}" value="${(g.name || '').replace(/"/g, '&quot;')}" placeholder="Group ${g.id} name"><button onclick="saveGroup(${g.id})">Save</button>`;
      list.appendChild(row);
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = safeName(g);
      if (state.current_group_id === g.id) opt.selected = true;
      select.appendChild(opt);
    });
    await renderAdminStatusOnly();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function renderAdminStatusOnly() {
  try {
    const [state, groups] = await Promise.all([fetchState(), fetchGroups()]);
    const group = groups.find(g => g.id === state.current_group_id);
    const d = derivePhase(state);
    const votes = state.current_group_id ? await fetchVotesForGroup(state.current_group_id) : [];
    $('adminCurrent').textContent = group ? safeName(group) : 'No group selected';
    $('adminPhase').textContent = d.phase;
    $('adminTimer').textContent = d.phase === 'idle' || d.phase === 'closed' || d.phase === 'ranking' ? '--:--' : fmt(d.remainingMs);
    $('adminVotes').textContent = votes.length;
  } catch (e) { /* keep page calm, unlike most build logs */ }
}
async function saveGroup(id) {
  try {
    const name = $(`gname-${id}`).value.trim();
    const { error } = await getClient().from('groups').update({ name }).eq('id', id);
    if (error) throw error;
    setMsg('adminMsg', 'Group name saved.', 'success');
    await renderAdmin();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function startVoting() {
  try {
    const groupId = Number($('currentGroup').value);
    const canvassing = Number(cfg.CANVASSING_SECONDS || 60);
    const thinking = Number(cfg.THINKING_SECONDS || 60);
    const start = new Date().toISOString();
    const { error } = await getClient().from('event_state').update({
      current_group_id: groupId,
      phase: 'canvassing',
      voting_open: true,
      voting_start_time: start,
      canvassing_end_time: isoAfter(canvassing),
      voting_end_time: isoAfter(canvassing + thinking),
      show_ranking: false,
      updated_at: new Date().toISOString()
    }).eq('id', 1);
    if (error) throw error;
    setMsg('adminMsg', 'Voting started.', 'success');
    await renderAdminStatusOnly();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function closeVoting() {
  try {
    const { error } = await getClient().from('event_state').update({
      phase: 'closed', voting_open: false, voting_end_time: new Date().toISOString(), show_ranking: false, updated_at: new Date().toISOString()
    }).eq('id', 1);
    if (error) throw error;
    setMsg('adminMsg', 'Voting closed.', 'success');
    await renderAdminStatusOnly();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function showRanking() {
  try {
    const { error } = await getClient().from('event_state').update({ phase: 'ranking', voting_open: false, show_ranking: true, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) throw error;
    setMsg('adminMsg', 'Ranking is now shown on screen.', 'success');
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function backIdle() {
  try {
    const { error } = await getClient().from('event_state').update({ current_group_id: null, phase: 'idle', voting_open: false, show_ranking: false, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) throw error;
    setMsg('adminMsg', 'Screen back to idle.', 'success');
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function resetCurrentGroup() {
  if (!confirm('Reset current group votes?')) return;
  try {
    const state = await fetchState();
    if (!state.current_group_id) throw new Error('No current group selected.');
    const { error } = await getClient().from('votes').delete().eq('group_id', state.current_group_id);
    if (error) throw error;
    setMsg('adminMsg', 'Current group votes reset.', 'success');
    await renderAdminStatusOnly();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function resetAll() {
  if (!confirm('Reset ALL votes and state? This cannot be undone.')) return;
  try {
    let r = await getClient().from('votes').delete().neq('id', 0);
    if (r.error) throw r.error;
    r = await getClient().from('event_state').update({ current_group_id: null, phase: 'idle', voting_open: false, voting_start_time: null, canvassing_end_time: null, voting_end_time: null, show_ranking: false, updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) throw r.error;
    setMsg('adminMsg', 'All data reset.', 'success');
    await renderAdmin();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}
async function initScreen() {
  $('voteUrlText').textContent = getVoteUrl();
  new QRCode($('qrcode'), { text: getVoteUrl(), width: 250, height: 250 });
  await renderScreen();
  setInterval(renderScreen, 1000);
}
async function renderScreen() {
  try {
    const [state, groups] = await Promise.all([fetchState(), fetchGroups()]);
    const d = derivePhase(state);
    const group = groups.find(g => g.id === state.current_group_id);
    if (d.phase === 'ranking') return renderRanking();

    const ring = $('ringProgress');
    const ringWrap = $('ringWrap');
    const label = $('ringLabel');
    const totalMs = getPhaseTotalMs(state, d.phase);
    const phaseLeft = d.phaseRemainingMs || 0;

    $('screenGroup').textContent = group ? safeName(group) : 'Dubbing Competition';

    ringWrap.classList.remove('is-active', 'is-ending');
    setRingProgress(ring, phaseLeft, totalMs, 590.619);

    if (d.phase === 'canvassing') {
      $('screenPhase').textContent = '拉票时间 / Canvassing Time';
      $('screenTimer').textContent = fmt(phaseLeft);
      $('screenHint').textContent = 'Scan the QR code and vote for the current group.';
      label.textContent = 'CANVASSING';
      ringWrap.classList.add('is-active');
      if (phaseLeft <= 10000) ringWrap.classList.add('is-ending');
    } else if (d.phase === 'thinking') {
      $('screenPhase').textContent = '最终投票时间 / Final Voting Time';
      $('screenTimer').textContent = fmt(phaseLeft);
      $('screenHint').textContent = 'Please complete your vote before time is over.';
      label.textContent = 'FINAL VOTE';
      ringWrap.classList.add('is-active');
      if (phaseLeft <= 10000) ringWrap.classList.add('is-ending');
    } else if (d.phase === 'closed') {
      $('screenPhase').textContent = '本组投票已结束 / Voting Closed';
      $('screenTimer').textContent = '00:00';
      $('screenHint').textContent = 'Please welcome the next group.';
      label.textContent = 'CLOSED';
      setRingProgress(ring, 0, 1, 590.619);
    } else {
      $('screenPhase').textContent = '请扫码进入投票页面';
      $('screenTimer').textContent = '--:--';
      $('screenHint').textContent = 'Waiting for the admin to start voting.';
      label.textContent = 'WAITING';
      setRingProgress(ring, 0, 1, 590.619);
    }
  } catch (e) { $('screenHint').textContent = e.message; }
}
async function renderRanking() {
  const results = await fetchResults();
  const wrap = $('screenMain');
  wrap.className = 'ranking-stage';
  wrap.innerHTML = `
    <section class="ranking-card">
      <div class="stage-kicker">DUBBING COMPETITION</div>
      <h1 class="ranking-title">Final Ranking / 最终排名</h1>
      <div class="ranking-list">
        ${results.map((r, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
          return `<div class="rank-row" style="animation-delay:${Math.min(i * 0.06, .54)}s">
            <div class="rank-medal">${medal}</div>
            <div class="rank-name">${safeName(r)}</div>
            <div class="rank-score">${r.vote_count ? r.average_score.toFixed(2) : '-'}</div>
            <div class="rank-votes">${r.vote_count} votes</div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}
let selectedScore = null;
async function initVote() {
  ensureToken();
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedScore = Number(btn.dataset.score);
      document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  $('submitVote').addEventListener('click', submitVote);
  await renderVote();
  setInterval(renderVote, 2000);
}
async function hasVoted(groupId) {
  const token = ensureToken();
  const { data, error } = await getClient().from('votes').select('score').eq('group_id', groupId).eq('voter_token', token).maybeSingle();
  if (error) throw error;
  return data;
}
async function renderVote() {
  try {
    const [state, groups] = await Promise.all([fetchState(), fetchGroups()]);
    const d = derivePhase(state);
    const group = groups.find(g => g.id === state.current_group_id);
    $('voteGroup').textContent = group ? safeName(group) : 'Waiting';
    $('voteTimer').textContent = d.phase === 'canvassing' || d.phase === 'thinking' ? fmt(d.remainingMs) : '--:--';
    $('votePhase').textContent = d.phase;

    const miniRing = $('voteRingProgress');
    const totalMs = getPhaseTotalMs(state, d.phase);
    setRingProgress(miniRing, d.phaseRemainingMs || 0, totalMs, 364.425);
    if (miniRing && (d.phase !== 'canvassing' && d.phase !== 'thinking')) {
      setRingProgress(miniRing, 0, 1, 364.425);
    }

    const canVote = (d.phase === 'canvassing' || d.phase === 'thinking') && state.voting_open && group;
    if (!canVote) {
      $('voteControls').style.display = 'none';
      setMsg('voteMsg', d.phase === 'closed' ? '本组投票已结束 / Voting closed.' : '请等待投票开始 / Waiting for voting to start.', 'notice');
      return;
    }
    const voted = await hasVoted(group.id);
    if (voted) {
      $('voteControls').style.display = 'none';
      setMsg('voteMsg', `你已完成本组投票 / Submitted. Your score: ${voted.score}`, 'success');
    } else {
      $('voteControls').style.display = 'block';
      setMsg('voteMsg', '', 'notice');
    }
  } catch (e) { setMsg('voteMsg', e.message, 'error'); }
}
async function submitVote() {
  try {
    if (!selectedScore) throw new Error('Please choose a score first.');
    const state = await fetchState();
    const d = derivePhase(state);
    if (!(d.phase === 'canvassing' || d.phase === 'thinking') || !state.voting_open || !state.current_group_id) {
      throw new Error('Voting is not open now.');
    }
    const { error } = await getClient().from('votes').insert({ group_id: state.current_group_id, voter_token: ensureToken(), score: selectedScore });
    if (error) {
      if (String(error.message).includes('duplicate') || error.code === '23505') throw new Error('You have already voted for this group.');
      throw error;
    }
    setMsg('voteMsg', `投票成功 / Submitted. Your score: ${selectedScore}`, 'success');
    await renderVote();
  } catch (e) { setMsg('voteMsg', e.message, 'error'); }
}
