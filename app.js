const STORAGE_KEY = 'timeCatcherData';
const REASONS = ['시간부족','깜빡함','우선순위밀림','컨디션난조','외부일정','기타'];
const DOW = ['일','월','화','수','목','금','토'];

const SLOTS = [];
for (let i = 0; i < 44; i++) {
  const totalMin = (5 * 60 + i * 30) % (24 * 60);
  SLOTS.push({ h: Math.floor(totalMin / 60), m: totalMin % 60 });
}

function slotRowLabel(idx) {
  const { h, m } = SLOTS[idx];
  if (m !== 0) return '';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return String(h12);
}

function slotPickerLabel(idx) {
  const { h, m } = SLOTS[idx];
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${String(m).padStart(2, '0')}`;
}

function populateSlotSelect(selectEl) {
  const blankOpt = document.createElement('option');
  blankOpt.value = '';
  blankOpt.textContent = '--:--';
  selectEl.appendChild(blankOpt);
  SLOTS.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = slotPickerLabel(i);
    selectEl.appendChild(opt);
  });
}

let state = loadAll();
let currentDate = new Date();

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDay(key) {
  if (!state[key]) {
    state[key] = { todos: [], time: {}, brain: '', alarms: {} };
  }
  if (!state[key].alarms) state[key].alarms = {};
  return state[key];
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* audio not available */ }
}

function ensureNotifyPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function fireAlarm(idx, text) {
  beep();
  const label = text && text.trim() ? text : '예정된 시간입니다';
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⏰ 미룸노트', { body: `${slotPickerLabel(idx)} - ${label}` });
  } else {
    alert(`⏰ ${slotPickerLabel(idx)} - ${label}`);
  }
}

function checkAlarms() {
  const now = new Date();
  const todayKey = dateKey(now);
  if (!state[todayKey]) return;
  const day = getDay(todayKey);
  const firedKey = 'timeCatcherFired_' + todayKey;
  const fired = JSON.parse(sessionStorage.getItem(firedKey) || '[]');

  Object.keys(day.alarms).forEach(idxStr => {
    const idx = Number(idxStr);
    if (!day.alarms[idx]) return;
    if (fired.includes(idx)) return;
    const { h, m } = SLOTS[idx];
    if (now.getHours() === h && now.getMinutes() >= m && now.getMinutes() < m + 2) {
      const linked = startLabelMap(day)[idx];
      const text = (linked && linked.join(', ')) || day.time[idx];
      fireAlarm(idx, text);
      fired.push(idx);
      sessionStorage.setItem(firedKey, JSON.stringify(fired));
    }
  });
}

function syncTodoTime(day, todo) {
  if (todo.startIdx == null || todo.endIdx == null) return;
  day.alarms[todo.startIdx] = true;
  saveAll();
}

function startLabelMap(day) {
  const map = {};
  day.todos.forEach(todo => {
    if (todo.startIdx == null || todo.endIdx == null) return;
    if (!map[todo.startIdx]) map[todo.startIdx] = [];
    map[todo.startIdx].push(todo.text);
  });
  return map;
}

function findOverlap(day, startIdx, endIdx, excludeId) {
  const bFrom = Math.min(startIdx, endIdx);
  const bTo = Math.max(startIdx, endIdx);
  return day.todos.find(t => {
    if (t.id === excludeId) return false;
    if (t.startIdx == null || t.endIdx == null) return false;
    const aFrom = Math.min(t.startIdx, t.endIdx);
    const aTo = Math.max(t.startIdx, t.endIdx);
    return aFrom <= bTo && bFrom <= aTo;
  });
}

function confirmOverlapOrRevert(day, startIdx, endIdx, excludeId) {
  const clash = findOverlap(day, startIdx, endIdx, excludeId);
  if (!clash) return true;
  const ok = confirm(`"${clash.text}" 일정과 시간이 겹쳐요. 이대로 적용할까요?`);
  if (!ok) alert('시간을 다시 선택해주세요.');
  return ok;
}

function shadedSlotMap(day) {
  const map = {};
  day.todos.forEach(todo => {
    if (todo.startIdx == null || todo.endIdx == null) return;
    const from = Math.min(todo.startIdx, todo.endIdx);
    const to = Math.max(todo.startIdx, todo.endIdx);
    for (let i = from; i <= to; i++) {
      if (map[i] !== 'pending') {
        map[i] = todo.done ? 'done' : 'pending';
      }
    }
  });
  return map;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function renderDateLabel() {
  const key = dateKey(currentDate);
  document.getElementById('dateLabel').textContent =
    `${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일`;
  document.getElementById('dowLabel').textContent = `(${DOW[currentDate.getDay()]})`;
  return key;
}

function renderTodos() {
  const key = dateKey(currentDate);
  const day = getDay(key);
  const list = document.getElementById('todoList');
  list.innerHTML = '';

  day.todos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');

    const mainRow = document.createElement('div');
    mainRow.className = 'todo-main';
    const subRow = document.createElement('div');
    subRow.className = 'todo-sub';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.addEventListener('change', () => {
      todo.done = checkbox.checked;
      if (todo.done) {
        todo.reason = '';
        todo.reasonNote = '';
      }
      saveAll();
      renderTodos();
      renderTimeGrid();
    });

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.contentEditable = 'true';
    text.textContent = todo.text;
    text.addEventListener('blur', () => {
      todo.text = text.textContent.trim();
      saveAll();
      renderTimeGrid();
    });

    mainRow.appendChild(checkbox);
    mainRow.appendChild(text);

    if (todo.done) {
      const doneBadge = document.createElement('span');
      doneBadge.className = 'done-badge';
      doneBadge.textContent = '✓ 완료';
      mainRow.appendChild(doneBadge);
    }

    const timeRange = document.createElement('div');
    timeRange.className = 'todo-time-range';

    const startSelect = document.createElement('select');
    startSelect.className = 'todo-time-select';
    const endSelect = document.createElement('select');
    endSelect.className = 'todo-time-select';

    populateSlotSelect(startSelect);
    populateSlotSelect(endSelect);
    startSelect.value = todo.startIdx != null ? todo.startIdx : '';
    endSelect.value = todo.endIdx != null ? todo.endIdx : '';

    function applyTimeChange() {
      const s = startSelect.value === '' ? null : Number(startSelect.value);
      const e = endSelect.value === '' ? null : Number(endSelect.value);

      if (s != null && e != null && !confirmOverlapOrRevert(day, s, e, todo.id)) {
        startSelect.value = todo.startIdx != null ? todo.startIdx : '';
        endSelect.value = todo.endIdx != null ? todo.endIdx : '';
        return;
      }

      todo.startIdx = s;
      todo.endIdx = e;
      saveAll();
      if (s != null && e != null) {
        syncTodoTime(day, todo);
      }
      renderTimeGrid();
    }

    startSelect.addEventListener('change', applyTimeChange);
    endSelect.addEventListener('change', applyTimeChange);

    const arrow = document.createElement('span');
    arrow.className = 'time-range-arrow';
    arrow.textContent = '~';

    timeRange.appendChild(startSelect);
    timeRange.appendChild(arrow);
    timeRange.appendChild(endSelect);
    subRow.appendChild(timeRange);

    const isPastDay = key < dateKey(new Date());
    if (!todo.done && isPastDay) {
      const select = document.createElement('select');
      select.className = 'reason-select';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '못한 사유';
      select.appendChild(noneOpt);
      REASONS.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        if (todo.reason === r) opt.selected = true;
        select.appendChild(opt);
      });
      subRow.appendChild(select);

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'reason-note';
      noteInput.placeholder = '사유를 적어주세요';
      noteInput.value = todo.reasonNote || '';
      noteInput.hidden = todo.reason !== '기타';
      noteInput.addEventListener('blur', () => {
        todo.reasonNote = noteInput.value.trim();
        saveAll();
      });
      subRow.appendChild(noteInput);

      select.addEventListener('change', () => {
        todo.reason = select.value;
        if (todo.reason !== '기타') todo.reasonNote = '';
        noteInput.hidden = todo.reason !== '기타';
        if (!noteInput.hidden) noteInput.focus();
        saveAll();
      });

      const moveDateInput = document.createElement('input');
      moveDateInput.type = 'date';
      moveDateInput.className = 'move-date-input';

      const moveBtn = document.createElement('button');
      moveBtn.className = 'move-btn';
      moveBtn.textContent = '날짜 이동';
      moveBtn.addEventListener('click', () => {
        const targetKey = moveDateInput.value;
        if (!targetKey) {
          alert('옮길 날짜를 선택해주세요.');
          return;
        }
        if (targetKey === key) {
          alert('현재 날짜와 같아요.');
          return;
        }
        const targetDay = getDay(targetKey);
        if (
          todo.startIdx != null && todo.endIdx != null &&
          !confirmOverlapOrRevert(targetDay, todo.startIdx, todo.endIdx, todo.id)
        ) {
          return;
        }
        day.todos = day.todos.filter(t => t.id !== todo.id);
        todo.reason = '';
        todo.reasonNote = '';
        targetDay.todos.push(todo);
        if (todo.startIdx != null && todo.endIdx != null) syncTodoTime(targetDay, todo);
        saveAll();
        renderTodos();
        renderTimeGrid();
      });

      subRow.appendChild(moveDateInput);
      subRow.appendChild(moveBtn);
    }

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      day.todos = day.todos.filter(t => t.id !== todo.id);
      saveAll();
      renderTodos();
      renderTimeGrid();
    });
    mainRow.appendChild(del);

    li.appendChild(mainRow);
    li.appendChild(subRow);

    list.appendChild(li);
  });
}

function addTodo() {
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if (!text) return;
  const key = dateKey(currentDate);
  const day = getDay(key);

  const startSel = document.getElementById('addStartSelect');
  const endSel = document.getElementById('addEndSelect');
  const startIdx = startSel.value === '' ? null : Number(startSel.value);
  const endIdx = endSel.value === '' ? null : Number(endSel.value);

  if (startIdx == null || endIdx == null) {
    alert('시작~종료 시간을 선택해야 할 일을 추가할 수 있어요.');
    return;
  }

  if (!confirmOverlapOrRevert(day, startIdx, endIdx, null)) {
    return;
  }

  const todo = { id: uid(), text, done: false, reason: '', reasonNote: '', startIdx, endIdx };
  day.todos.push(todo);
  syncTodoTime(day, todo);

  input.value = '';
  startSel.value = '';
  endSel.value = '';
  saveAll();
  renderTodos();
  renderTimeGrid();
}

function renderTimeGrid() {
  const key = dateKey(currentDate);
  const day = getDay(key);
  const grid = document.getElementById('timeGrid');
  grid.innerHTML = '';
  const shaded = shadedSlotMap(day);
  const labels = startLabelMap(day);

  SLOTS.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'time-row' + (s.m !== 0 ? ' half' : '') + (shaded[idx] ? ' shaded-' + shaded[idx] : '');

    const label = document.createElement('div');
    label.className = 'time-hour';
    label.textContent = slotRowLabel(idx);

    const content = document.createElement('div');
    content.className = 'time-content';

    if (labels[idx]) {
      const badge = document.createElement('div');
      badge.className = 'time-todo-label';
      badge.textContent = labels[idx].join(', ');
      content.appendChild(badge);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.value = day.time[idx] || '';
    input.addEventListener('blur', () => {
      day.time[idx] = input.value;
      saveAll();
    });
    content.appendChild(input);

    const bell = document.createElement('button');
    bell.className = 'bell-btn' + (day.alarms[idx] ? ' on' : '');
    bell.textContent = '🔔';
    bell.title = '이 시간에 알림받기';
    bell.addEventListener('click', () => {
      ensureNotifyPermission();
      day.alarms[idx] = !day.alarms[idx];
      bell.classList.toggle('on', day.alarms[idx]);
      saveAll();
    });

    row.appendChild(label);
    row.appendChild(content);
    row.appendChild(bell);
    grid.appendChild(row);
  });
}

function renderBrainDump() {
  const key = dateKey(currentDate);
  const day = getDay(key);
  const box = document.getElementById('brainDump');
  box.value = day.brain || '';
  box.oninput = () => {
    day.brain = box.value;
    saveAll();
  };
}

function renderPlanner() {
  renderDateLabel();
  renderTodos();
  renderTimeGrid();
  renderBrainDump();
}

function changeDay(delta) {
  currentDate.setDate(currentDate.getDate() + delta);
  renderPlanner();
}

function goToday() {
  currentDate = new Date();
  renderPlanner();
}

function renderStats(rangeDays) {
  const keys = Object.keys(state).sort();
  let filteredKeys = keys;

  if (rangeDays !== 'all') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(rangeDays) + 1);
    filteredKeys = keys.filter(k => new Date(k) >= cutoff);
  }

  let total = 0, done = 0;
  const reasonCounts = {};
  REASONS.forEach(r => reasonCounts[r] = 0);

  filteredKeys.forEach(k => {
    const day = state[k];
    day.todos.forEach(t => {
      total++;
      if (t.done) {
        done++;
      } else if (t.reason) {
        reasonCounts[t.reason] = (reasonCounts[t.reason] || 0) + 1;
      }
    });
  });

  document.getElementById('totalCount').textContent = total;
  document.getElementById('doneCount').textContent = done;
  document.getElementById('rateCount').textContent =
    total ? Math.round((done / total) * 100) + '%' : '0%';

  const chart = document.getElementById('reasonChart');
  chart.innerHTML = '';

  const maxCount = Math.max(1, ...Object.values(reasonCounts));
  const hasAny = Object.values(reasonCounts).some(v => v > 0);

  if (!hasAny) {
    chart.innerHTML = '<div class="empty-msg">아직 미완료 이유 데이터가 없어요</div>';
    return;
  }

  REASONS.forEach(r => {
    const count = reasonCounts[r];
    const row = document.createElement('div');
    row.className = 'reason-row';
    row.innerHTML = `
      <div class="reason-name">${r}</div>
      <div class="reason-bar-track"><div class="reason-bar-fill" style="width:${(count / maxCount) * 100}%"></div></div>
      <div class="reason-count">${count}</div>
    `;
    chart.appendChild(row);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'stats') {
      const activeRange = document.querySelector('.range-btn.active').dataset.range;
      renderStats(activeRange);
    }
  });
});

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderStats(btn.dataset.range);
  });
});

document.getElementById('prevDay').addEventListener('click', () => changeDay(-1));
document.getElementById('nextDay').addEventListener('click', () => changeDay(1));
document.getElementById('todayBtn').addEventListener('click', goToday);
document.getElementById('addTodoBtn').addEventListener('click', addTodo);
document.getElementById('todoInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTodo();
});

populateSlotSelect(document.getElementById('addStartSelect'));
populateSlotSelect(document.getElementById('addEndSelect'));

renderPlanner();
setInterval(checkAlarms, 20000);
checkAlarms();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
