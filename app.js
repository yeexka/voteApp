const cfg = window.APP_CONFIG || {};
let supabaseClient = null;
let screenLayoutKey = null;

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
function safeWork(g) { return g && g.work_title && g.work_title.trim() ? g.work_title.trim() : '作品待定'; }
function safeMembers(g) { return g && g.members && g.members.trim() ? g.members.trim() : '参赛人待定'; }
function escAttr(v) { return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
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
      row.className = 'group-editor';
      row.innerHTML = `
        <div class="group-no">#${g.id}</div>
        <input id="gname-${g.id}" value="${escAttr(g.name)}" placeholder="小组名 / Group ${g.id}">
        <input id="gwork-${g.id}" value="${escAttr(g.work_title)}" placeholder="作品名 / Work title">
        <input id="gmembers-${g.id}" value="${escAttr(g.members)}" placeholder="参赛人 / Members">
        <button onclick="saveGroup(${g.id})">Save</button>`;
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
    const work_title = $(`gwork-${id}`).value.trim();
    const members = $(`gmembers-${id}`).value.trim();
    const { error } = await getClient().from('groups').update({ name, work_title, members }).eq('id', id);
    if (error) throw error;
    setMsg('adminMsg', 'Group info saved.', 'success');
    await renderAdmin();
  } catch (e) { setMsg('adminMsg', e.message, 'error'); }
}

async function showPerformance() {
  try {
    const groupId = Number($('currentGroup').value);
    const { error } = await getClient().from('event_state').update({
      current_group_id: groupId,
      phase: 'performing',
      voting_open: false,
      voting_start_time: null,
      canvassing_end_time: null,
      voting_end_time: null,
      show_ranking: false,
      updated_at: new Date().toISOString()
    }).eq('id', 1);
    if (error) throw error;
    setMsg('adminMsg', 'Performance screen shown.', 'success');
    await renderAdminStatusOnly();
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
  await renderScreen();
  setInterval(renderScreen, 1000);
}
function emergencyDock() {
  return `<nav class="hidden-nav" aria-label="Hidden navigation">
    <button class="hidden-nav-toggle" type="button" onclick="toggleHiddenNav(event)">☰</button>
    <div class="hidden-nav-panel">
      <a href="index.html">大屏首页</a>
      <a href="admin.html" target="_blank">后台控制</a>
      <a href="vote.html" target="_blank">投票入口</a>
      <button type="button" onclick="location.reload()">刷新同步</button>
      <button type="button" onclick="toggleFullscreen()">全屏显示</button>
    </div>
  </nav>`;
}

function toggleHiddenNav(event) {
  event.stopPropagation();
  const nav = event.currentTarget.closest('.hidden-nav');
  if (nav) nav.classList.toggle('open');
}

function toggleFullscreen() {
  const doc = document;
  const el = document.documentElement;
  if (!doc.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen();
  } else if (doc.exitFullscreen) {
    doc.exitFullscreen();
  }
}
function buildQRCode(width = 230) {
  const box = $('qrcode');
  if (!box) return;
  box.innerHTML = '';
  new QRCode(box, { text: getVoteUrl(), width, height: width });
  const url = $('voteUrlText');
  if (url) url.textContent = getVoteUrl();
}

async function renderScreen() {
  try {
    const [state, groups] = await Promise.all([fetchState(), fetchGroups()]);
    const d = derivePhase(state);
    const group = groups.find(g => g.id === state.current_group_id);
    if (d.phase === 'ranking') return renderRanking();

    const wrap = $('screenMain');
    const layoutKey = `${d.phase}-${state.current_group_id || 'none'}`;
    const shouldRebuild = screenLayoutKey !== layoutKey || !wrap.dataset.ready;

    if (shouldRebuild) {
      screenLayoutKey = layoutKey;
      wrap.dataset.ready = '1';
      wrap.innerHTML = '';

      if (d.phase === 'idle' || !group) {
        wrap.className = 'bigscreen-shell home-only-screen';
        wrap.innerHTML = `
          <section class="waiting-screen ums-welcome" aria-label="Competition homepage"></section>
          ${emergencyDock()}`;
        return;
      }

      if (d.phase === 'performing') {
        wrap.className = 'bigscreen-shell';
        wrap.innerHTML = `
          <section class="perform-screen">
            <div class="perform-kicker">NOW PERFORMING / 正在演绎</div>
            <h1 class="perform-group" id="perfGroup"></h1>
            <div class="perform-info">
              <div class="perform-item"><span>作品</span><b id="perfWork"></b></div>
              <div class="perform-item"><span>参赛人</span><b id="perfMembers"></b></div>
            </div>
            <div class="perform-badge">演绎中</div>
            <p class="perform-note">请欣赏本组现场配音表演，演绎结束后将开放现场投票。</p>
          </section>
          ${emergencyDock()}`;
      } else if (d.phase === 'closed') {
        wrap.className = 'bigscreen-shell';
        wrap.innerHTML = `
          <section class="closed-screen">
            <div class="waiting-kicker">VOTING CLOSED</div>
            <h1 class="closed-title" id="closedGroup"></h1>
            <p class="closed-line">本组投票已结束</p>
            <p class="waiting-small">Please welcome the next group</p>
          </section>
          ${emergencyDock()}`;
      } else {
        wrap.className = 'voting-screen';
        wrap.innerHTML = `
          <section class="voting-info">
            <div class="voting-kicker" id="stageKicker"></div>
            <h1 id="screenGroup" class="voting-group"></h1>
            <div class="voting-work" id="screenWork"></div>
            <div class="voting-members" id="screenMembers"></div>
            <div id="screenPhase" class="voting-phase"></div>
            <p id="screenHint" class="voting-hint"></p>
          </section>

          <section class="voting-action">
            <div class="ring-wrap" id="ringWrap">
              <svg class="timer-ring" viewBox="0 0 220 220" aria-label="Countdown ring">
                <circle class="ring-bg" cx="110" cy="110" r="94"></circle>
                <circle class="ring-progress" id="ringProgress" cx="110" cy="110" r="94"></circle>
              </svg>
              <div class="ring-content">
                <div id="screenTimer" class="ring-time">--:--</div>
                <div id="ringLabel" class="ring-label">VOTING</div>
              </div>
            </div>
            <div class="qr-stage">
              <div class="qr-box"><div id="qrcode"></div></div>
              <div class="qr-caption">Scan to Vote / 扫码投票</div>
              <p class="subtle vote-url" id="voteUrlText"></p>
            </div>
          </section>
          ${emergencyDock()}`;
        buildQRCode(230);
      }
    }

    if (d.phase === 'performing') {
      if ($('perfGroup')) $('perfGroup').textContent = safeName(group);
      if ($('perfWork')) $('perfWork').textContent = `《${safeWork(group)}》`;
      if ($('perfMembers')) $('perfMembers').textContent = safeMembers(group);
      return;
    }

    if (d.phase === 'closed') {
      if ($('closedGroup')) $('closedGroup').textContent = safeName(group);
      return;
    }

    if ($('stageKicker')) $('stageKicker').textContent = d.phase === 'canvassing' ? '拉票环节' : '最后投票';
    if ($('screenGroup')) $('screenGroup').textContent = safeName(group);
    if ($('screenWork')) $('screenWork').textContent = `《${safeWork(group)}》`;
    if ($('screenMembers')) $('screenMembers').textContent = safeMembers(group);

    const ring = $('ringProgress');
    const ringWrap = $('ringWrap');
    const label = $('ringLabel');
    const totalMs = getPhaseTotalMs(state, d.phase);
    const phaseLeft = d.phaseRemainingMs || 0;
    if (ringWrap) ringWrap.classList.remove('is-active', 'is-ending');
    setRingProgress(ring, phaseLeft, totalMs, 590.619);

    if (d.phase === 'canvassing') {
      $('screenPhase').textContent = '拉票环节倒计时';
      $('screenTimer').textContent = fmt(phaseLeft);
      $('screenHint').textContent = '观众可扫码投票，当前为拉票时间。';
      label.textContent = 'CANVASSING';
      ringWrap.classList.add('is-active');
      if (phaseLeft <= 10000) ringWrap.classList.add('is-ending');
    } else if (d.phase === 'thinking') {
      $('screenPhase').textContent = '现场观众投票倒计时';
      $('screenTimer').textContent = fmt(phaseLeft);
      $('screenHint').textContent = '最后投票中，请现场观众确认分数。';
      label.textContent = 'FINAL VOTE';
      ringWrap.classList.add('is-active');
      if (phaseLeft <= 10000) ringWrap.classList.add('is-ending');
    }
  } catch (e) {
    document.body.innerHTML = `<main class="bigscreen-shell"><section class="connection-error"><h1>大屏连接异常</h1><p>${e.message}</p><p>请检查网络或刷新同步。</p><a href="admin.html" target="_blank">打开后台</a><a href="vote.html" target="_blank">打开投票页</a></section></main>`;
  }
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
      let msg = '请等待投票开始 / Waiting for voting to start.';
      if (d.phase === 'performing') msg = '本组正在演绎中，请稍后投票 / Performance in progress.';
      if (d.phase === 'closed') msg = '该组投票已结束 / Voting for this group has closed.';
      if (d.phase === 'ranking') msg = '比赛结果公布中 / Ranking is being shown.';
      setMsg('voteMsg', msg, 'notice');
      return;
    }
    const voted = await hasVoted(group.id);
    if (voted) {
      $('voteControls').style.display = 'none';
      setMsg('voteMsg', `你已完成本组投票 / Submitted. Your score: ${voted.score}`, 'success');
    } else {
      $('voteControls').style.display = 'block';
      const prompt = d.phase === 'canvassing' ? '拉票环节已开始，投票通道开放 / Canvassing time, voting is open.' : '最后投票中，请确认你的分数 / Final voting time.';
      setMsg('voteMsg', prompt, 'notice');
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
