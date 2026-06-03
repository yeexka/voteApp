const socket = io();

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(seconds) {
  seconds = Math.max(0, Number(seconds || 0));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

function phaseLabel(phase) {
  const map = {
    idle: 'Waiting / 等待开始',
    canvassing: 'Canvassing Time / 拉票时间',
    thinking: 'Final Voting Time / 最终投票时间',
    closed: 'Voting Closed / 投票结束',
    ranking: 'Final Ranking / 最终排名'
  };
  return map[phase] || phase;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}
