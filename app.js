const app = document.querySelector('#app');
const connection = document.querySelector('#connection');
const letters = ['A', 'B', 'C', 'D'];
const config = window.QUIZ_CONFIG || {};
let db, route, state, renderKey = '', polling = false, busy = false, syncSequence = 0;
let deadlineAt = 0, clockAnchor = 0, clockRemaining = 0, lastGood = 0;

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pageUrl = hash => `${location.href.split('#')[0]}#${hash}`;
const roomCode = value => /^\d{6}$/.test(value || '');
const readRoom = code => {
  try { return JSON.parse(localStorage.getItem(`quiz-host-${code}`) || 'null'); } catch { return null; }
};
const safeImage = value => {
  if (!value) return '';
  try {
    const url = new URL(value, location.href.split('#')[0]);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin) ? url.href : '';
  } catch { return ''; }
};

function errorMessage(error) {
  return error?.message || 'Не удалось выполнить запрос. Проверьте интернет.';
}
function showError(error) {
  let box = document.querySelector('#error');
  if (!box) {
    box = document.createElement('div'); box.id = 'error'; box.className = 'error';
    box.setAttribute('role', 'alert'); app.prepend(box);
  }
  box.textContent = errorMessage(error);
}
async function rpc(name, args) {
  const {data, error} = await db.rpc(`quiz_${name}`, args);
  if (error) throw error;
  return data;
}
function parseRoute() {
  const parts = location.hash.slice(1).split('/');
  return {mode:parts[0] || 'home', code:parts[1] || '', token:parts[2] || ''};
}

function home() {
  app.innerHTML = `<div class="narrow"><div class="eyebrow">Вопросы на экране · ответы в телефоне</div>
    <h1>Время играть.</h1><p class="muted">Одна комната. До 35 игроков. Кто ответит точнее и быстрее?</p>
    <form id="join-form" class="card stack"><h2>Присоединиться</h2>
      <label>Код комнаты<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" autocomplete="off" required value="${escape(route.code)}"></label>
      <label>Твоё имя<input name="nickname" maxlength="24" autocomplete="nickname" placeholder="Например, Мария" required></label>
      <button>Войти в игру →</button></form>
    <a class="button secondary" href="#create">Я ведущий — создать квиз</a></div>`;
  document.querySelector('#join-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try {
      const form = new FormData(event.target), code = form.get('code').trim();
      await rpc('join', {p_code:code, p_nickname:form.get('nickname').trim()});
      location.hash = `play/${code}`;
    } catch (error) { showError(error); } finally { button.disabled = false; }
  });
}

export function validateQuiz(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('В файле должен быть JSON-объект.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120) throw new Error('Нужно название title длиной до 120 символов.');
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 100) throw new Error('В questions должно быть от 1 до 100 вопросов.');
  const questions = value.questions.map((q, index) => {
    const fail = text => { throw new Error(`Вопрос ${index + 1}: ${text}`); };
    if (!q || typeof q.text !== 'string' || !q.text.trim() || q.text.length > 1000) fail('нужен текст text длиной до 1000 символов.');
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 250)) fail('options — ровно четыре непустые строки, до 250 символов каждая.');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) fail('correct — номер правильного ответа от 0 до 3.');
    if (!Number.isInteger(q.seconds) || q.seconds < 5 || q.seconds > 180) fail('seconds — целое число от 5 до 180.');
    if (q.image !== undefined && typeof q.image !== 'string') fail('image — строка со ссылкой на картинку.');
    const image = safeImage(q.image);
    if (q.image && (!image || image.length > 2000)) fail('нужна корректная HTTPS-ссылка или относительный путь к картинке.');
    return {text:q.text.trim(),options:q.options.map(o => o.trim()),correct:q.correct,seconds:q.seconds,image};
  });
  const quiz = {title:value.title.trim(),questions};
  if (new TextEncoder().encode(JSON.stringify(quiz)).length > 280000) throw new Error('Квиз слишком большой. Ограничение: 280 КБ после обработки.');
  return quiz;
}

function createPage() {
  app.innerHTML = `<div class="narrow"><div class="eyebrow">Пульт ведущего</div><h1>Новая игра</h1>
    <p class="muted">Загрузи JSON-файл с вопросами. Картинки указываются ссылками, не вставляются в сам файл.</p>
    <form id="create-form" class="card stack"><label>Файл квиза<input name="quiz" type="file" accept=".json,application/json" required></label>
    <div id="file-summary" class="muted" role="status"></div><button>Создать комнату →</button></form>
    <p><a href="example-quiz.json" download>Скачать пример квиза</a></p>
    <p class="muted">В correct используются номера: 0 = A, 1 = B, 2 = C, 3 = D. Таймер — от 5 до 180 секунд.</p>
    <details><summary>Мои комнаты в этом браузере</summary><div id="saved-rooms"></div></details></div>`;
  const saved = document.querySelector('#saved-rooms');
  try {
    for (const key of Object.keys(localStorage).filter(k => k.startsWith('quiz-host-'))) {
      const code = key.slice('quiz-host-'.length), room = readRoom(code);
      if (room && roomCode(code)) saved.insertAdjacentHTML('beforeend', `<p><a href="#host/${code}">${escape(room.title)} · ${code}</a></p>`);
    }
  } catch { saved.textContent = 'Хранилище браузера недоступно.'; }
  let quiz = null;
  const form = document.querySelector('#create-form');
  form.elements.quiz.addEventListener('change', async event => {
    quiz = null;
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 300000) throw new Error('Размер JSON-файла должен быть не больше 300 КБ.');
      quiz = validateQuiz(JSON.parse(await file.text()));
      document.querySelector('#file-summary').textContent = `${quiz.title} · вопросов: ${quiz.questions.length}`;
      document.querySelector('#error')?.remove();
    } catch (error) { document.querySelector('#file-summary').textContent = ''; showError(error); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
    try {
      if (!quiz) throw new Error('Сначала выбери корректный JSON-файл.');
      // Проверяем доступность localStorage до создания комнаты: здесь хранится ссылка общего экрана.
      localStorage.setItem('quiz-storage-test', '1'); localStorage.removeItem('quiz-storage-test');
      const room = await rpc('create', {p_quiz:quiz});
      localStorage.setItem(`quiz-host-${room.code}`, JSON.stringify({...room,title:quiz.title}));
      location.hash = `host/${room.code}`;
    } catch (error) { showError(error); } finally { button.disabled = false; }
  });
}

function leaderboard(s) {
  return `<div class="card"><h2>${s.phase === 'finished' ? '🏆 Итоговый рейтинг' : 'Лидерборд'}</h2><ol>${(s.leaderboard || []).map((p,i) =>
    `<li class="rank ${p.id === s.playerId ? 'self' : ''}"><span><b>${i+1}.</b> ${escape(p.nickname)}${p.id === s.playerId ? ' · ты' : ''}</span><span><b>${p.points}</b> <small>баллов · ${p.correct} ✓</small></span></li>`).join('')}</ol></div>`;
}
function choices(s) {
  return `<div class="grid">${(s.options || []).map((text,i) => `<div class="answer answer-${i} ${s.phase === 'reveal' ? (s.correct === i ? 'correct' : 'wrong') : ''}"><b>${letters[i]}</b><span>${escape(text)}</span></div>`).join('')}</div>`;
}
function hostControls(s) {
  if (route.mode !== 'host') return '';
  const stored = readRoom(s.code);
  const displayLink = stored ? pageUrl(`screen/${s.code}/${stored.displayToken}`) : '';
  return `<div class="card"><div class="row">
    ${s.phase === 'lobby' ? `<button data-action="next" ${s.playerCount ? '' : 'disabled'}>Начать игру →</button>` : ''}
    ${s.phase === 'question' ? '<button data-action="reveal">Завершить вопрос</button>' : ''}
    ${s.phase === 'reveal' ? `<button data-action="next">${s.questionIndex + 1 >= s.questionCount ? 'Итоговый рейтинг' : 'Следующий вопрос →'}</button>` : ''}
    ${s.phase !== 'finished' ? '<button class="secondary" data-action="finish">Завершить игру</button>' : '<a class="button" href="#create">Новый квиз</a>'}
    ${displayLink ? `<a class="button secondary" href="${escape(displayLink)}" target="_blank" rel="noopener">Общий экран ↗</a>` : ''}
    </div><details><summary>Управление комнатой</summary><p class="muted">Не очищайте данные браузера ведущего до конца игры. Ссылка общего экрана даёт доступ к вопросам, но не к управлению.</p>
    <button class="secondary" data-action="delete">Удалить комнату и результаты</button></details></div>`;
}
function renderGame(s) {
  const isPlayer = route.mode === 'play';
  let body = '';
  if (s.phase === 'lobby') {
    const joinLink = pageUrl(`join/${s.code}`);
    body = `<div class="center"><div class="eyebrow">${escape(s.title)}</div><h1>${isPlayer ? 'Ты в игре!' : 'Присоединяйтесь к квизу'}</h1>
      ${!isPlayer ? `<div class="code">${s.code}</div><div id="qr"></div><p><a class="link" href="${escape(joinLink)}">${escape(joinLink)}</a></p>` : '<div class="big-symbol">✦</div><p class="muted">Ждём, когда ведущий начнёт игру. Вопросы будут на общем экране.</p>'}
      <div class="card"><h2>Игроки: ${s.playerCount} / 35</h2>${(s.players || []).map(n => `<span class="pill">${escape(n)}</span>`).join('') || '<p class="muted">Пока никого. Самое время зайти первым!</p>'}</div></div>`;
  } else if (s.phase === 'question') {
    body = `<div class="row"><span class="eyebrow">Вопрос ${s.questionIndex+1} / ${s.questionCount}</span><span class="timer" id="timer" role="timer"></span></div><div class="progress"><div id="time-bar"></div></div>`;
    if (isPlayer) {
      body += s.answered ? `<div class="card center"><div class="big-symbol">✓</div><h1>Ответ ${letters[s.myChoice]} принят</h1><p class="muted">Смотри на общий экран. Скоро узнаем результат!</p></div>` : `<h1>Выбирай ответ</h1><p class="muted">Вопрос и варианты — на общем экране.</p><div class="grid phone-answers">${letters.map((l,i) => `<button class="answer answer-${i}" data-choice="${i}" aria-label="Ответ ${l}"><b>${l}</b></button>`).join('')}</div><p id="time-up" class="muted center" hidden>Время вышло. Ждём результаты.</p>`;
    } else {
      body += `<h1>${escape(s.text)}</h1>${imageHtml(s.image)}${choices(s)}`;
    }
    body += `<p class="muted center">Ответили: ${s.answerCount} / ${s.playerCount}</p>`;
  } else if (s.phase === 'reveal') {
    if (isPlayer) {
      body = `<div class="center"><div class="eyebrow">Вопрос ${s.questionIndex+1} / ${s.questionCount}</div><h1>${!s.answered ? 'Нет ответа' : s.myChoice === s.correct ? 'Верно! 🎉' : 'В этот раз мимо'}</h1><p>Правильный ответ: <b>${letters[s.correct]}</b></p><h2 class="success">+${s.myPoints} баллов</h2></div>`;
    } else {
      body = `<div class="eyebrow">Правильный ответ: ${letters[s.correct]}</div><h1>${escape(s.text)}</h1>${imageHtml(s.image)}${choices(s)}`;
    }
    body += leaderboard(s);
  } else {
    body = `<div class="center"><div class="eyebrow">${escape(s.title)}</div><h1>Вот это была игра!</h1><p class="muted">Спасибо всем участникам.</p></div>${leaderboard(s)}`;
    if (route.mode === 'host') body += '<button class="secondary" id="download-results">Скачать результаты CSV</button>';
  }
  app.innerHTML = body + hostControls(s);
  app.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => answer(Number(button.dataset.choice))));
  app.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.action)));
  document.querySelector('#download-results')?.addEventListener('click', downloadResults);
  app.querySelectorAll('.question-image').forEach(img => img.addEventListener('error', () => {
    const notice = document.createElement('p'); notice.className = 'muted'; notice.textContent = 'Картинка не загрузилась. Проверьте ссылку и интернет.'; img.replaceWith(notice);
  }, {once:true}));
  if (s.phase === 'lobby' && !isPlayer) drawQr(pageUrl(`join/${s.code}`));
  updateClock();
}
function imageHtml(image) {
  const url = safeImage(image);
  return url ? `<img class="question-image" src="${escape(url)}" alt="Изображение к вопросу" referrerpolicy="no-referrer">` : '';
}
async function drawQr(url) {
  const element = document.querySelector('#qr');
  try {
    const {default:QRCode} = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const data = await QRCode.toDataURL(url, {width:200,margin:2});
    if (element?.isConnected) element.innerHTML = `<img class="qr" src="${data}" alt="QR-код для входа в квиз">`;
  } catch { /* Код комнаты и обычная ссылка доступны и без QR-библиотеки. */ }
}
function downloadResults() {
  const cell = v => `"${String(v).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g,'""')}"`;
  const rows = [['Место','Имя','Баллы','Правильных ответов'], ...state.leaderboard.map((p,i) => [i+1,p.nickname,p.points,p.correct])];
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `quiz-${state.code}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function updateClock() {
  if (!state || state.phase !== 'question') return;
  const remaining = Math.max(0, clockRemaining - (performance.now() - clockAnchor));
  const beforeStart = remaining - state.seconds*1000;
  const timer = document.querySelector('#timer'), bar = document.querySelector('#time-bar');
  if (timer) timer.textContent = beforeStart > 0 ? `Старт через ${Math.ceil(beforeStart/1000)}` : `${Math.ceil(remaining/1000)} с`;
  if (bar) bar.style.width = `${Math.min(100, remaining / (state.seconds*1000) * 100)}%`;
  app.querySelectorAll('[data-choice]').forEach(b => { b.disabled = busy || remaining <= 0 || beforeStart > 0; });
  const timeUp = document.querySelector('#time-up'); if (timeUp) timeUp.hidden = remaining > 0;
}
async function answer(choice) {
  if (busy || !state) return;
  busy = true; updateClock();
  try { await rpc('answer', {p_code:state.code,p_question_index:state.questionIndex,p_choice:choice}); await sync(); }
  catch (error) { showError(error); }
  finally { busy = false; updateClock(); }
}
async function action(name, automatic = false) {
  if (busy || !state) return;
  if (['finish','delete'].includes(name) && !confirm(name === 'delete' ? 'Удалить комнату и все её результаты? Это нельзя отменить.' : 'Завершить игру досрочно? Ответы на текущий незавершённый вопрос не будут учтены.')) return;
  busy = true;
  app.querySelectorAll('[data-action]').forEach(b => { b.disabled = true; });
  try {
    await rpc('action', {p_code:state.code,p_action:name});
    if (name === 'delete') { localStorage.removeItem(`quiz-host-${state.code}`); location.hash = 'create'; }
    else { renderKey = ''; await sync(); }
  } catch (error) { if (!automatic) showError(error); }
  finally { busy = false; renderKey = ''; }
}
async function sync() {
  if (!db || !['host','screen','play'].includes(route?.mode) || !roomCode(route.code)) return;
  const current = location.hash, requestedAt = performance.now(), sequence = ++syncSequence;
  try {
    const s = await rpc('state', {p_code:route.code,p_display_token:route.mode === 'screen' ? route.token : null});
    if (current !== location.hash || sequence !== syncSequence) return;
    if (route.mode === 'host' && !s.isHost) throw new Error('В этом браузере нет доступа ведущего. Открой исходный браузер, в котором создавалась комната.');
    state = s; lastGood = Date.now(); connection.textContent = '● На связи';
    document.querySelector('#error')?.remove();
    clockAnchor = performance.now();
    deadlineAt = Date.parse(s.deadline);
    clockRemaining = deadlineAt - Date.parse(s.serverNow) - (clockAnchor-requestedAt)/2;
    const {serverNow,...visible} = s;
    const key = JSON.stringify(visible);
    if (key !== renderKey) { renderGame(s); renderKey = key; }
    updateClock();
    if (route.mode === 'host' && s.phase === 'question' && !busy &&
      (Date.parse(s.serverNow) >= deadlineAt || (s.playerCount > 0 && s.answerCount >= s.playerCount))) {
      await action('reveal', true);
    }
  } catch (error) {
    if (current !== location.hash || sequence !== syncSequence) return;
    connection.textContent = '● Нет обновлений';
    if (!state || Date.now()-lastGood > 6000) showError(error);
  }
}
async function poll() {
  if (polling) return;
  polling = true;
  try { await sync(); } finally { polling = false; }
  setTimeout(poll, document.hidden ? 4000 : 1500);
}
function navigate() {
  route = parseRoute(); state = null; renderKey = ''; connection.textContent = '';
  if (route.mode === 'create') createPage();
  else if (route.mode === 'home' || route.mode === 'join') home();
  else if (['host','screen','play'].includes(route.mode) && roomCode(route.code)) {
    if (route.mode === 'screen' && !/^[0-9a-f-]{36}$/i.test(route.token)) {
      app.innerHTML = '<div class="error">Нужна полная ссылка общего экрана из пульта ведущего.</div>'; return;
    }
    app.innerHTML = '<div class="card center">Подключаемся к комнате…</div>'; sync();
  } else { location.hash = ''; }
}
async function start() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    app.innerHTML = `<div class="narrow setup"><div class="eyebrow">Первый запуск</div><h1>Квиз почти готов.</h1><div class="card"><h2>Нужно подключить Supabase</h2><ol style="list-style:decimal;padding-left:20px"><li><p>Создай бесплатный проект Supabase и включи анонимный вход.</p></li><li><p>Выполни файл <code>supabase/schema.sql</code> в SQL Editor.</p></li><li><p>Вставь URL проекта и публичный ключ в <code>config.js</code>.</p></li><li><p>Обнови эту страницу.</p></li></ol></div><p class="muted">Пошаговая инструкция находится в README.md. Секретный ключ service_role не нужен и не должен попадать на сайт.</p><a class="button secondary" href="example-quiz.json" download>Скачать пример вопросов</a></div>`;
    return;
  }
  try {
    const {createClient} = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');
    db = createClient(config.supabaseUrl, config.supabasePublishableKey);
    const {data, error} = await db.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      const {error:signInError} = await db.auth.signInAnonymously();
      if (signInError) throw signInError;
    }
    window.addEventListener('hashchange', navigate);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    window.addEventListener('online', () => sync());
    navigate(); poll(); setInterval(updateClock, 100);
  } catch (error) {
    app.innerHTML = '<div class="narrow"><h1>Не удалось подключиться</h1><p class="muted">Проверь config.js, доступность Supabase и настройку Anonymous Sign-ins. После исправления обнови страницу.</p></div>';
    showError(error);
  }
}
start();
