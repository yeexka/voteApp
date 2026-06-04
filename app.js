const cfg = window.APP_CONFIG || {};
let supabaseClient = null;
let screenLayoutKey = null;
let selectedScore = null;

const COMPETITION_GROUPS = [
  {
    id: 1,
    name: "低调组",
    work: "小猪佩奇",
    members: ["李峻宇", "法舜哲", "刘瑜董泽", "邱傲然"],
  },
  {
    id: 2,
    name: "企鹅组",
    work: "马达加斯加的企鹅1",
    members: ["朱海滨", "王鸿飞", "殷子尧", "吴硕宸"],
  },
  {
    id: 3,
    name: "宠物王",
    work: "爱宠大机密",
    members: ["王若璇", "王薇茗", "贾璀琦"],
  },
  {
    id: 4,
    name: "探案组",
    work: "疯狂动物城",
    members: ["温子豪", "袁睿", "王雪瑜"],
  },
  {
    id: 5,
    name: "天煞队",
    work: "功夫熊猫3",
    members: ["张峻瑜", "郗梓淳", "蒋家增"],
  },
  {
    id: 6,
    name: "随便队",
    work: "神偷奶爸",
    members: ["王梓安", "张迎栋", "周雨馨", "刘小童"],
  },
  {
    id: 7,
    name: "Team Spirit",
    work: "狮子王",
    members: ["金旻志", "王铭洋", "颜鑫宇", "张晶贻"],
  },
  {
    id: 8,
    name: "蔚蓝队",
    work: "阿甘正传",
    members: ["王文煊", "Sami"],
  },
  {
    id: 9,
    name: "无人队",
    work: "奇幻森林",
    members: ["闫梓翔", "娄家辉"],
  },
];
const PARTICIPANTS = [
  "邱傲然",
  "张晶贻",
  "金旻志",
  "王梓安",
  "王文煊",
  "吴硕宸",
  "袁睿",
  "郭子琪",
  "王铭洋",
  "王薇茗",
  "王鸿飞",
  "李峻宇",
  "朱海滨",
  "刘小童",
  "闫梓翔",
  "张迎栋",
  "崔婧涵",
  "郗梓淳",
  "温子豪",
  "蒋家增",
  "王雪瑜",
  "李泳仪",
  "周雨馨",
  "颜鑫雨",
  "李冰璇",
  "夏雪",
  "张峻瑜",
  "刘谕董泽",
  "娄家辉",
  "许皓然",
  "凡姝菡",
  "魏子芮",
  "王若璇",
  "宋澜",
  "张肖铨",
  "张俪莹",
  "冯彰美佳",
  "丁梓萱",
  "赵佑泽",
  "贾晓璐",
  "殷子尧",
  "彭宇轩",
  "孙畅",
  "王晨锦",
  "贾璀琦",
  "法舜哲",
  "盛俊",
  "梁佳琳",
  "李明昊",
  "李雨臻",
  "褚志贤",
  "张赵涵",
  "易千舜",
  "王宁",
  "刘芯源",
  "刘懿杭",
  "杨晨嘉",
  "张昱宬",
  "袁书怡",
  "满晓凡",
  "杨景皓",
  "赵笠言",
  "韩镇泽",
  "吴钒",
  "宋延昊",
  "宋述辉",
  "任师域",
];

function getClient() {
  if (!supabaseClient) {
    if (
      !cfg.SUPABASE_URL ||
      cfg.SUPABASE_URL.includes("YOUR_PROJECT") ||
      !cfg.SUPABASE_ANON_KEY ||
      cfg.SUPABASE_ANON_KEY.includes("YOUR_")
    ) {
      throw new Error(
        "Please fill SUPABASE_URL and SUPABASE_ANON_KEY in config.js first.",
      );
    }
    supabaseClient = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY,
    );
  }
  return supabaseClient;
}

function $(id) {
  return document.getElementById(id);
}
function nowMs() {
  return Date.now();
}
function isoAfter(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function safeName(g) {
  return g && g.name ? g.name : `Group ${g ? g.id : ""}`;
}
function safeWork(g) {
  return g && g.work ? g.work : g && g.work_title ? g.work_title : "作品待定";
}
function safeMembers(g) {
  if (!g) return "参赛人待定";
  if (Array.isArray(g.members)) return g.members.join("、");
  return g.members || "参赛人待定";
}
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function getVoteUrl() {
  const base =
    cfg.PUBLIC_BASE_URL && cfg.PUBLIC_BASE_URL.trim()
      ? cfg.PUBLIC_BASE_URL.trim().replace(/\/$/, "")
      : window.location.origin +
        window.location.pathname.replace(/\/[^/]*$/, "");
  return `${base}/vote.html`;
}
function getGroupById(id) {
  return COMPETITION_GROUPS.find((g) => g.id === Number(id));
}
function groupCover(g) {
  return g ? `assets/group${g.id}.jpg` : "";
}
function coverImg(g, className = "cover-image") {
  return `<div class="${className}"><img src="${groupCover(g)}" alt="${esc(safeName(g))} cover" onerror="this.closest('.${className}').style.display='none'"></div>`;
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
  if (phase === "canvassing") return canvassing;
  if (phase === "thinking") return thinking;
  if (state && state.voting_start_time && state.voting_end_time) {
    return (
      new Date(state.voting_end_time).getTime() -
      new Date(state.voting_start_time).getTime()
    );
  }
  return canvassing + thinking;
}
function derivePhase(state) {
  if (!state) return { phase: "idle", remainingMs: 0 };
  if (state.show_ranking || state.phase === "ranking")
    return { phase: "ranking", remainingMs: 0 };
  if (
    state.phase === "menu" ||
    state.phase === "participants" ||
    state.phase === "performing"
  )
    return { phase: state.phase, remainingMs: 0 };
  if (!state.voting_open || !state.voting_end_time)
    return { phase: state.phase || "idle", remainingMs: 0 };
  const t = nowMs();
  const canvassEnd = new Date(state.canvassing_end_time).getTime();
  const voteEnd = new Date(state.voting_end_time).getTime();
  if (t >= voteEnd) return { phase: "closed", remainingMs: 0 };
  if (t < canvassEnd)
    return {
      phase: "canvassing",
      remainingMs: voteEnd - t,
      phaseRemainingMs: canvassEnd - t,
    };
  return {
    phase: "thinking",
    remainingMs: voteEnd - t,
    phaseRemainingMs: voteEnd - t,
  };
}

async function fetchState() {
  const { data, error } = await getClient()
    .from("event_state")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}
async function updateState(patch) {
  const { error } = await getClient()
    .from("event_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}
async function fetchVotes() {
  const { data, error } = await getClient().from("votes").select("*");
  if (error) throw error;
  return data || [];
}
async function hasVoted(groupId) {
  const token = ensureToken();
  const { data, error } = await getClient()
    .from("votes")
    .select("score")
    .eq("group_id", groupId)
    .eq("voter_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function fetchResults() {
  const votes = await fetchVotes();
  return COMPETITION_GROUPS.map((g) => {
    const gv = votes.filter((v) => Number(v.group_id) === Number(g.id));
    const total = gv.reduce((sum, v) => sum + Number(v.score || 0), 0);
    const avg = gv.length ? total / gv.length : 0;
    return { ...g, vote_count: gv.length, average_score: avg };
  }).sort(
    (a, b) =>
      b.average_score - a.average_score ||
      b.vote_count - a.vote_count ||
      a.id - b.id,
  );
}
function ensureToken() {
  let token = localStorage.getItem("dubbing_voter_token");
  if (!token) {
    token = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("dubbing_voter_token", token);
  }
  return token;
}
function setMsg(id, text, type = "notice") {
  const el = $(id);
  if (!el) return;
  el.className = `notice ${type}`;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

function emojiConfetti(count = 90) {
  const emojis = ["🎉", "🎊", "✨", "⭐", "🏆", "🥳", "🌟", "💫"];

  return `<div class="emoji-confetti-layer">
    ${Array.from({ length: count })
      .map(() => {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const size = 22 + Math.random() * 34;
        const delay = Math.random() * 4;
        const duration = 3.5 + Math.random() * 3;
        const rotate = Math.random() * 720 - 360;
        const drift = Math.random() * 160 - 80;

        return `<span style="
          left:${left}%;
          top:${top}%;
          font-size:${size}px;
          animation-delay:${delay}s;
          animation-duration:${duration}s;
          --rotate:${rotate}deg;
          --drift:${drift}px;
        ">${emoji}</span>`;
      })
      .join("")}
  </div>`;
}
function hiddenNav() {
  return `<nav class="hidden-nav" aria-label="Hidden navigation">
    <button class="hidden-nav-toggle" type="button" onclick="toggleHiddenNav(event)">☰</button>
    <div class="hidden-nav-panel">
      <button type="button" onclick="goHome()">大屏首页</button>
      <button type="button" onclick="showCompetitionMenu()">比赛入口</button>
      <button type="button" onclick="showParticipants()">参赛名单</button>
      <button type="button" onclick="showResults()">比赛结果</button>
      <button type="button" onclick="location.reload()">刷新同步</button>
      <button type="button" onclick="toggleFullscreen()">全屏显示</button>
    </div>
  </nav>`;
}
function toggleHiddenNav(event) {
  event.stopPropagation();
  const nav = event.currentTarget.closest(".hidden-nav");
  if (nav) nav.classList.toggle("open");
}
function toggleFullscreen() {
  const doc = document;
  const el = document.documentElement;
  if (!doc.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
  else if (doc.exitFullscreen) doc.exitFullscreen();
}
async function goHome() {
  await updateState({
    current_group_id: null,
    phase: "idle",
    voting_open: false,
    show_ranking: false,
    voting_start_time: null,
    canvassing_end_time: null,
    voting_end_time: null,
  });
  await renderScreen();
}
async function showCompetitionMenu() {
  await updateState({
    current_group_id: null,
    phase: "menu",
    voting_open: false,
    show_ranking: false,
    voting_start_time: null,
    canvassing_end_time: null,
    voting_end_time: null,
  });
  await renderScreen();
}
async function showParticipants() {
  await updateState({
    phase: "participants",
    voting_open: false,
    show_ranking: false,
  });
  await renderScreen();
}
async function showResults() {
  await updateState({
    phase: "ranking",
    voting_open: false,
    show_ranking: true,
  });
  await renderScreen();
}
async function selectCompetitionGroup(id) {
  await updateState({
    current_group_id: id,
    phase: "performing",
    voting_open: false,
    show_ranking: false,
    voting_start_time: null,
    canvassing_end_time: null,
    voting_end_time: null,
  });
  await renderScreen();
}
async function startVotingForCurrent() {
  const state = await fetchState();
  const groupId = Number(state.current_group_id);
  if (!groupId) throw new Error("No group selected.");
  const canvassing = Number(cfg.CANVASSING_SECONDS || 60);
  const thinking = Number(cfg.THINKING_SECONDS || 60);
  await updateState({
    current_group_id: groupId,
    phase: "canvassing",
    voting_open: true,
    voting_start_time: new Date().toISOString(),
    canvassing_end_time: isoAfter(canvassing),
    voting_end_time: isoAfter(canvassing + thinking),
    show_ranking: false,
  });
  await renderScreen();
}
async function closeVoting() {
  const state = await fetchState();
  const d = derivePhase(state);

  if (d.phase === "canvassing") {
    const thinking = Number(cfg.THINKING_SECONDS || 60);
    const now = new Date().toISOString();

    await updateState({
      phase: "thinking",
      canvassing_end_time: now,
      voting_end_time: isoAfter(thinking),
    });
  } else {
    await updateState({
      phase: "closed",
      voting_open: false,
      voting_end_time: new Date().toISOString(),
      show_ranking: false,
    });
  }

  await renderScreen();
}
function buildQRCode(width = 230) {
  const box = $("qrcode");
  if (!box) return;
  box.innerHTML = "";
  new QRCode(box, { text: getVoteUrl(), width, height: width });
  const url = $("voteUrlText");
  if (url) url.textContent = getVoteUrl();
}

async function initScreen() {
  await renderScreen();
  setInterval(renderScreen, 1000);
}

async function renderScreen() {
  try {
    const state = await fetchState();
    const d = derivePhase(state);
    const group = getGroupById(state.current_group_id);
    const wrap = $("screenMain");
    if (d.phase === "ranking") {
      if (screenLayoutKey !== "ranking" || !wrap.dataset.ready)
        return renderResultsBarChart();
      return;
    }
    const layoutKey = `${d.phase}-${state.current_group_id || "none"}`;
    const shouldRebuild = screenLayoutKey !== layoutKey || !wrap.dataset.ready;

    if (shouldRebuild) {
      screenLayoutKey = layoutKey;
      wrap.dataset.ready = "1";
      wrap.innerHTML = "";

      if (d.phase === "idle") {
        wrap.className = "home-code-screen";
        wrap.innerHTML = `
          <section class="home-code-card">
            <h1 class="home-main-title">
              马来西亚沙巴大学2+2国际本科首届<br>
              <span>“声临其境”杯配音大赛</span>
            </h1>
            <p class="home-subtitle">以声入戏，以译传情</p>
<div class="home-status-pill" onclick="this.style.display='none'">等待比赛开始</div>
          </section>
          ${hiddenNav()}`;
        return;
      }

      if (d.phase === "menu") {
        wrap.className = "menu-screen";
        wrap.innerHTML = `
          <section class="menu-card">
            <h1 class="menu-title">比赛入口</h1>
            <p class="menu-subtitle">请选择即将演绎的小组</p>
            <div class="group-button-grid">
              ${COMPETITION_GROUPS.map((g) => `<button class="group-entry-btn" onclick="selectCompetitionGroup(${g.id})"><b>${esc(g.name)}</b><span>《${esc(g.work)}》</span></button>`).join("")}
            </div>
          </section>
          ${hiddenNav()}`;
        return;
      }

      if (d.phase === "participants") {
        wrap.className = "participants-screen participants-wall-screen";
        wrap.innerHTML = `
          <section class="participants-wall">
          <div class="participants-header">
  <img src="assets/logo.png" class="participants-logo" alt="UMS logo">
  <h1 class="participants-title">卓越之声·荣耀参与者</h1>
</div>
            <div class="participants-name-wall">
              ${PARTICIPANTS.map((name, index) => `<span style="--i:${index}">${esc(name)}</span>`).join("")}
            </div>
            <p class="participants-footer">用声音传递力量，用热爱感染舞台，感谢每位参赛者的精彩呈现！</p>
          </section>
          ${hiddenNav()}`;
        return;
      }

      if (d.phase === "performing" && group) {
        wrap.className = "performing-screen";
        wrap.innerHTML = `
          <section class="performing-card">
            <div class="screen-kicker">NOW PERFORMING 正在演绎</div>
            <h1 class="perform-title">${esc(group.name)}</h1>
            <div class="perform-work">《${esc(group.work)}》</div>
            ${coverImg(group, "perform-cover")}
            <div class="perform-members">${esc(safeMembers(group))}</div>
            <div class="performing-label">演绎中</div>
            <div class="stage-controls">
              <button onclick="startVotingForCurrent()">演绎结束，开始投票倒计时</button>
              <button class="secondary" onclick="showCompetitionMenu()">返回比赛入口</button>
            </div>
          </section>
          ${hiddenNav()}`;
        return;
      }

      if (d.phase === "closed" && group) {
        wrap.className = "closed-screen-page";
        wrap.innerHTML = `
          <section class="closed-card">
            <h1 class="closed-title">${esc(group.name)}</h1>
            <div class="perform-work">《${esc(group.work)}》</div>
            <p class="closed-line">本组投票已结束</p>
            <div class="stage-controls">
              <button onclick="showCompetitionMenu()">进入下一组</button>
              <button class="secondary" onclick="showResults()">查看比赛结果</button>
            </div>
          </section>
          ${hiddenNav()}`;
        return;
      }

      if ((d.phase === "canvassing" || d.phase === "thinking") && group) {
        wrap.className = "voting-screen";
        wrap.innerHTML = `
          <section class="voting-info">
            <div class="voting-kicker" id="stageKicker"></div>
            <h1 id="screenGroup" class="voting-group"></h1>
            <div class="voting-work" id="screenWork"></div>
            <div id="votingCoverSlot"></div>
            <div class="voting-members" id="screenMembers"></div>
            <div id="screenPhase" class="voting-phase"></div>
            <p id="screenHint" class="voting-hint"></p>
            <div class="stage-controls voting-control-line">
              <button class="secondary" id="earlyCloseBtn" onclick="closeVoting()">提前结束拉票</button>
            </div>
          </section>
          <section class="voting-action">
            <div class="ring-wrap" id="ringWrap">
              <svg class="timer-ring" viewBox="0 0 220 220" aria-label="Countdown ring">
                <circle class="ring-bg" cx="110" cy="110" r="94"></circle>
                <circle class="ring-progress" id="ringProgress" cx="110" cy="110" r="94"></circle>
              </svg>
              <div class="ring-content"><div id="screenTimer" class="ring-time">--:--</div><div id="ringLabel" class="ring-label">VOTING</div></div>
            </div>
            <div class="qr-stage"><div class="qr-box"><div id="qrcode"></div></div><div class="qr-caption">扫码投票 / Scan to Vote</div><p class="subtle vote-url" id="voteUrlText"></p></div>
          </section>
          ${hiddenNav()}`;
        buildQRCode(230);
      }
    }

    if ((d.phase === "canvassing" || d.phase === "thinking") && group) {
      $("stageKicker").textContent =
        d.phase === "canvassing"
          ? "CANVASSING TIME · 拉票环节"
          : "FINAL VOTING · 最后投票";
      $("screenGroup").textContent = group.name;
      $("screenWork").textContent = `《${group.work}》`;
      const coverSlot = $("votingCoverSlot");
      if (coverSlot && !coverSlot.dataset.coverReady) {
        coverSlot.innerHTML = coverImg(group, "voting-cover");
        coverSlot.dataset.coverReady = "1";
      }
      $("screenMembers").textContent = safeMembers(group);

      const ring = $("ringProgress");
      const ringWrap = $("ringWrap");
      const label = $("ringLabel");
      const totalMs = getPhaseTotalMs(state, d.phase);
      const phaseLeft = d.phaseRemainingMs || 0;
      ringWrap.classList.remove("is-active", "is-ending");
      setRingProgress(ring, phaseLeft, totalMs, 590.619);

      if (d.phase === "canvassing") {
        $("screenPhase").textContent = "拉票环节倒计时";
        $("screenTimer").textContent = fmt(phaseLeft);
        $("screenHint").textContent = "观众可扫码进入投票，本阶段为拉票时间。";
        label.textContent = "激情拉票中！";
        const earlyCloseBtn = $("earlyCloseBtn");
        if (earlyCloseBtn) earlyCloseBtn.textContent = "提前结束拉票";
      } else {
        $("screenPhase").textContent = "现场观众投票倒计时";
        $("screenTimer").textContent = fmt(phaseLeft);
        $("screenHint").textContent = "最后投票中，请现场观众确认分数。";
        label.textContent = "请投我们一票！";
        const earlyCloseBtn = $("earlyCloseBtn");
        if (earlyCloseBtn) earlyCloseBtn.textContent = "提前结束投票";
      }

      ringWrap.classList.remove("is-active", "is-ending");

      if (phaseLeft <= 10000) {
        ringWrap.classList.add("is-ending");
      } else {
        ringWrap.classList.add("is-active");
      }
    }
  } catch (e) {
    document.body.innerHTML = `<main class="bigscreen-shell"><section class="connection-error"><h1>大屏连接异常</h1><p>${esc(e.message)}</p><p>请检查网络或刷新同步。</p><button onclick="location.reload()">刷新同步</button></section></main>`;
  }
}

async function renderResultsBarChart() {
  const results = await fetchResults();
  const wrap = $("screenMain");
  screenLayoutKey = "ranking";
  wrap.dataset.ready = "1";
  wrap.className = "results-screen";
  const maxScore = 10;
  const top3 = results.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const rest = results.slice(3);
  wrap.innerHTML = `
<div class="side-fireworks">
${emojiConfetti(60)}
  <div class="firework left">
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
  </div>

  <div class="firework right">
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
  </div>
</div>
    <section class="results-card premium-results-card">
      <div class="screen-kicker">FINAL RESULTS</div>
      <h1 class="results-title">比赛结果</h1>

      <div class="podium-wrap">
      
            ${podiumOrder
              .map((r, i) => {
                const originalRank =
                  results.findIndex((item) => item.id === r.id) + 1;
                const medal =
                  originalRank === 1
                    ? "冠军"
                    : originalRank === 2
                      ? "亚军"
                      : "季军";
                const icon =
                  originalRank === 1 ? "🥇" : originalRank === 2 ? "🥈" : "🥉";
                const score = r.vote_count ? r.average_score.toFixed(2) : "-";
                return `<div class="podium-card podium-${originalRank}">
            <div class="podium-icon">${icon}</div>
            <div class="podium-medal">${medal}</div>
            <div class="podium-name">${esc(r.name)}</div>
            <div class="podium-work">《${esc(r.work)}》</div>
            <div class="podium-score">${score}</div>
          </div>`;
              })
              .join("")}
      </div>

      <div class="bar-list refined-bar-list">
        ${rest
          .map((r, i) => {
            const realRank = i + 4;
            const width = Math.max(
              0,
              Math.min(100, (r.average_score / maxScore) * 100),
            );
            const score = r.vote_count ? r.average_score.toFixed(2) : "-";
            return `<div class="bar-row refined-bar-row">
            <div class="bar-rank">${realRank}</div>
            <div class="bar-main">
              <div class="bar-label"><b>${esc(r.name)}</b><span>《${esc(r.work)}》</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            </div>
            <div class="bar-score">${score}</div>
          </div>`;
          })
          .join("")}
      </div>
    </section>
    ${hiddenNav()}`;
}
// Admin dashboard for emergency control.
function requireAdmin() {
  return true;
}

function adminShell() {
  return `<div class="admin-page">
    <section class="admin-card">
      <div class="admin-header">
        <div>
          <h1>比赛投票后台</h1>
          <p>用于查看每组投票人数、总分、均分，以及清空某组票数重新投票。</p>
        </div>
        <div class="admin-actions">
          <button onclick="renderAdmin()">刷新数据</button>
          <button class="secondary" onclick="goHome()">大屏回首页</button>
        </div>
      </div>

      <div id="adminStatus" class="admin-status">正在加载数据...</div>

      <h2>各组投票统计</h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>小组</th>
              <th>作品</th>
              <th>投票人数</th>
              <th>总分</th>
              <th>均分</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="adminStatsBody"></tbody>
        </table>
      </div>

      <h2>应急清票与重新投票</h2>
      <div class="admin-reset-panel">
        <label for="adminGroupSelect">选择小组</label>
        <select id="adminGroupSelect">
          ${COMPETITION_GROUPS.map((g) => `<option value="${g.id}">${esc(g.name)}《${esc(g.work)}》</option>`).join("")}
        </select>

        <div class="admin-reset-buttons">
          <button class="danger" onclick="clearSelectedGroupVotes()">只清空该组票数</button>
          <button onclick="restartSelectedGroupVoting()">清空并重新开放投票</button>
        </div>

        <p class="admin-note">
          说明：清空某组票数后，之前同一设备“只能投一次”的记录会被删除，该组可以重新扫码投票。
        </p>
      </div>

      <h2>应急设置某组成绩</h2>
      <div class="admin-reset-panel emergency-score-panel">
        <label for="emergencyGroupSelect">选择小组</label>
        <select id="emergencyGroupSelect">
          ${COMPETITION_GROUPS.map((g) => `<option value="${g.id}">${esc(g.name)}《${esc(g.work)}》</option>`).join("")}
        </select>

        <div class="manual-score-grid">
          <label>
            投票人数
            <input id="emergencyVoteCount" type="number" min="1" step="1" placeholder="例如 80">
          </label>
          <label>
            目标均分
            <input id="emergencyAverageScore" type="number" min="1" max="10" step="0.01" placeholder="例如 8.75">
          </label>
        </div>

        <div class="admin-reset-buttons">
          <button class="danger" onclick="applyEmergencyScore()">清空该组并写入这个成绩</button>
        </div>

        <p class="admin-note">
          说明：这个功能会先清空该组原有投票，再自动生成一批应急投票记录，所以结果页仍然按 votes 表正常计算。
        </p>
      </div>
    </section>
  </div>`;
}

async function initAdmin() {
  document.body.innerHTML = adminShell();
  await renderAdmin();
}

async function renderAdmin() {
  const body = $("adminStatsBody");
  const status = $("adminStatus");
  if (!body || !status) return;

  try {
    status.textContent = "正在读取投票数据...";
    const votes = await fetchVotes();

    const rows = COMPETITION_GROUPS.map((g) => {
      const gv = votes.filter((v) => Number(v.group_id) === Number(g.id));
      const voteCount = gv.length;
      const totalScore = gv.reduce((sum, v) => sum + Number(v.score || 0), 0);
      const avgScore = voteCount ? totalScore / voteCount : 0;
      return {
        ...g,
        voteCount,
        totalScore,
        avgScore,
      };
    });

    body.innerHTML = rows
      .map(
        (r, index) => `<tr>
          <td>${index + 1}</td>
          <td><strong>${esc(r.name)}</strong></td>
          <td>《${esc(r.work)}》</td>
          <td>${r.voteCount}</td>
          <td>${r.totalScore}</td>
          <td>${r.voteCount ? r.avgScore.toFixed(2) : "-"}</td>
          <td class="admin-op-cell">
            <button class="small danger" onclick="clearGroupVotes(${r.id})">清空票数</button>
            <button class="small" onclick="restartGroupVoting(${r.id})">重新开放投票</button>
            <button class="small secondary" onclick="fillEmergencyScoreForm(${r.id}, ${r.voteCount}, ${r.avgScore || 0})">设应急成绩</button>
          </td>
        </tr>`,
      )
      .join("");

    const totalVotes = votes.length;
    status.textContent = `当前总投票记录：${totalVotes} 条。`;
  } catch (e) {
    status.textContent = `读取失败：${e.message}`;
  }
}

async function renderAdminStatusOnly() {
  await renderAdmin();
}

async function clearGroupVotes(groupId) {
  const group = getGroupById(groupId);
  const ok = confirm(
    `确定清空「${group ? group.name : groupId}」的所有投票记录吗？清空后该组可以重新投票。`,
  );
  if (!ok) return;

  const { error } = await getClient()
    .from("votes")
    .delete()
    .eq("group_id", Number(groupId));

  if (error) {
    alert(`清空失败：${error.message}`);
    return;
  }

  alert(`已清空「${group ? group.name : groupId}」的投票记录。`);
  await renderAdmin();
}

async function restartGroupVoting(groupId) {
  const group = getGroupById(groupId);
  const ok = confirm(
    `确定清空「${group ? group.name : groupId}」票数，并重新开放 2 分钟投票吗？`,
  );
  if (!ok) return;

  const { error } = await getClient()
    .from("votes")
    .delete()
    .eq("group_id", Number(groupId));

  if (error) {
    alert(`清空失败：${error.message}`);
    return;
  }

  const canvassing = Number(cfg.CANVASSING_SECONDS || 60);
  const thinking = Number(cfg.THINKING_SECONDS || 60);

  await updateState({
    current_group_id: Number(groupId),
    phase: "canvassing",
    voting_open: true,
    voting_start_time: new Date().toISOString(),
    canvassing_end_time: isoAfter(canvassing),
    voting_end_time: isoAfter(canvassing + thinking),
    show_ranking: false,
  });

  alert(`已清空「${group ? group.name : groupId}」票数，并重新开放投票。`);
  await renderAdmin();
}

async function clearSelectedGroupVotes() {
  const select = $("adminGroupSelect");
  if (!select) return;
  await clearGroupVotes(Number(select.value));
}

async function restartSelectedGroupVoting() {
  const select = $("adminGroupSelect");
  if (!select) return;
  await restartGroupVoting(Number(select.value));
}

function fillEmergencyScoreForm(groupId, voteCount = 1, avgScore = 8) {
  const groupSelect = $("emergencyGroupSelect");
  const countInput = $("emergencyVoteCount");
  const avgInput = $("emergencyAverageScore");

  if (groupSelect) groupSelect.value = String(groupId);
  if (countInput) countInput.value = voteCount && voteCount > 0 ? voteCount : 1;
  if (avgInput)
    avgInput.value =
      avgScore && avgScore > 0 ? Number(avgScore).toFixed(2) : "";

  const panel = document.querySelector(".emergency-score-panel");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function buildEmergencyScores(voteCount, targetAverage) {
  const count = Math.max(1, Number(voteCount));
  const avg = Math.max(1, Math.min(10, Number(targetAverage)));
  const targetTotal = Math.round(count * avg);

  let base = Math.floor(targetTotal / count);
  let remainder = targetTotal - base * count;

  base = Math.max(1, Math.min(10, base));

  const scores = Array.from({ length: count }, () => base);

  for (let i = 0; i < scores.length && remainder > 0; i += 1) {
    const add = Math.min(10 - scores[i], remainder);
    scores[i] += add;
    remainder -= add;
  }

  for (let i = 0; i < scores.length && remainder < 0; i += 1) {
    const minus = Math.min(scores[i] - 1, Math.abs(remainder));
    scores[i] -= minus;
    remainder += minus;
  }

  return scores;
}

async function applyEmergencyScore() {
  const groupId = Number($("emergencyGroupSelect")?.value);
  const voteCount = Number($("emergencyVoteCount")?.value);
  const targetAverage = Number($("emergencyAverageScore")?.value);
  const group = getGroupById(groupId);

  if (!groupId) {
    alert("请先选择小组。");
    return;
  }

  if (!Number.isInteger(voteCount) || voteCount < 1) {
    alert("投票人数必须是大于 0 的整数。");
    return;
  }

  if (
    !Number.isFinite(targetAverage) ||
    targetAverage < 1 ||
    targetAverage > 10
  ) {
    alert("目标均分必须在 1 到 10 之间。");
    return;
  }

  const scores = buildEmergencyScores(voteCount, targetAverage);
  const realTotal = scores.reduce((sum, score) => sum + score, 0);
  const realAverage = realTotal / scores.length;

  const ok = confirm(
    `确定清空「${group ? group.name : groupId}」原有投票，并写入应急成绩吗？\n\n` +
      `投票人数：${scores.length}\n` +
      `总分：${realTotal}\n` +
      `实际均分：${realAverage.toFixed(2)}\n\n` +
      `注意：因为 votes 表单个分数只能是 1 到 10 的整数，系统会自动生成最接近目标均分的投票记录。`,
  );

  if (!ok) return;

  const deleteResult = await getClient()
    .from("votes")
    .delete()
    .eq("group_id", groupId);

  if (deleteResult.error) {
    alert(`清空失败：${deleteResult.error.message}`);
    return;
  }

  const stamp = Date.now();
  const rows = scores.map((score, index) => ({
    group_id: groupId,
    voter_token: `emergency-${groupId}-${stamp}-${index}`,
    score,
  }));

  const insertResult = await getClient().from("votes").insert(rows);

  if (insertResult.error) {
    alert(`写入应急成绩失败：${insertResult.error.message}`);
    return;
  }

  alert(
    `已写入「${group ? group.name : groupId}」应急成绩。\n\n` +
      `投票人数：${scores.length}\n` +
      `总分：${realTotal}\n` +
      `均分：${realAverage.toFixed(2)}`,
  );

  await renderAdmin();
}

async function saveGroup() {}

async function startVoting() {
  await startVotingForCurrent();
}

async function showPerformance() {}

async function resetCurrentGroup() {
  const state = await fetchState();
  if (!state.current_group_id) return;
  await clearGroupVotes(Number(state.current_group_id));
}

async function resetAll() {
  const ok = confirm("确定清空所有小组的投票记录，并让大屏回到首页吗？");
  if (!ok) return;

  const { error } = await getClient().from("votes").delete().neq("id", 0);
  if (error) {
    alert(`清空失败：${error.message}`);
    return;
  }

  await goHome();
  await renderAdmin();
}

async function initVote() {
  ensureToken();
  document.querySelectorAll(".score-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedScore = Number(btn.dataset.score);
      document
        .querySelectorAll(".score-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
  $("submitVote").addEventListener("click", submitVote);
  await renderVote();
  setInterval(renderVote, 2000);
}
async function renderVote() {
  try {
    const state = await fetchState();
    const d = derivePhase(state);
    const group = getGroupById(state.current_group_id);
    $("voteGroup").textContent = group ? group.name : "Waiting";
    const mobileCoverSlot = $("mobileCoverSlot");
    if (mobileCoverSlot) {
      if (group) {
        const expected = String(group.id);
        if (mobileCoverSlot.dataset.groupId !== expected) {
          mobileCoverSlot.innerHTML = coverImg(group, "mobile-cover");
          mobileCoverSlot.dataset.groupId = expected;
        }
      } else {
        mobileCoverSlot.innerHTML = "";
        mobileCoverSlot.dataset.groupId = "";
      }
    }
    $("voteTimer").textContent =
      d.phase === "canvassing" || d.phase === "thinking"
        ? fmt(d.remainingMs)
        : "--:--";
    $("votePhase").textContent =
      d.phase === "canvassing"
        ? "拉票环节"
        : d.phase === "thinking"
          ? "最后投票"
          : d.phase === "performing"
            ? "演绎中"
            : d.phase === "closed"
              ? "投票已结束"
              : d.phase === "ranking"
                ? "结果公布中"
                : "等待开始";

    const miniRing = $("voteRingProgress");
    const totalMs = getPhaseTotalMs(state, d.phase);
    setRingProgress(miniRing, d.phaseRemainingMs || 0, totalMs, 364.425);
    if (miniRing && d.phase !== "canvassing" && d.phase !== "thinking")
      setRingProgress(miniRing, 0, 1, 364.425);

    const canVote =
      (d.phase === "canvassing" || d.phase === "thinking") &&
      state.voting_open &&
      group;
    if (!canVote) {
      $("voteControls").style.display = "none";
      let msg = "请等待投票开始 / Waiting for voting to start.";
      if (d.phase === "performing")
        msg = `${group ? group.name : "当前小组"}正在演绎中，请稍后投票。`;
      if (d.phase === "closed")
        msg = `${group ? group.name : "该组"}投票已结束。`;
      if (d.phase === "ranking") msg = "比赛结果公布中。";
      setMsg("voteMsg", msg, "notice");
      return;
    }
    const voted = await hasVoted(group.id);
    if (voted) {
      $("voteControls").style.display = "none";
      setMsg(
        "voteMsg",
        `感谢你完成本组投票。你给出的分数是: ${voted.score}`,
        "success",
      );
    } else {
      $("voteControls").style.display = "block";
      const prompt =
        d.phase === "canvassing"
          ? "当前为拉票环节，可先完成投票，也可等待最后投票阶段。"
          : "当前为最后投票阶段，请确认并提交你的分数。";
      setMsg("voteMsg", prompt, "notice");
    }
  } catch (e) {
    setMsg("voteMsg", e.message, "error");
  }
}
async function submitVote() {
  try {
    if (!selectedScore) throw new Error("Please choose a score first.");
    const state = await fetchState();
    const d = derivePhase(state);
    if (
      !(d.phase === "canvassing" || d.phase === "thinking") ||
      !state.voting_open ||
      !state.current_group_id
    ) {
      throw new Error("Voting is not open now.");
    }
    const { error } = await getClient().from("votes").insert({
      group_id: state.current_group_id,
      voter_token: ensureToken(),
      score: selectedScore,
    });
    if (error) {
      if (String(error.message).includes("duplicate") || error.code === "23505")
        throw new Error("You have already voted for this group.");
      throw error;
    }
    setMsg(
      "voteMsg",
      `感谢你完成本组投票。你给出的分数是: ${selectedScore}`,
      "success",
    );
    await renderVote();
  } catch (e) {
    setMsg("voteMsg", e.message, "error");
  }
}
