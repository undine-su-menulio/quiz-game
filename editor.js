import {validateQuiz, safeImage} from './quiz-format.js';

const DRAFT_KEY = 'quiz-editor-draft-v1';
const letters = ['A', 'B', 'C', 'D'];
const form = document.querySelector('#editor-form');
const list = document.querySelector('#questions');
const titleInput = document.querySelector('#quiz-title');
const status = document.querySelector('#editor-status');
const saveStatus = document.querySelector('#save-status');
const preview = document.querySelector('#preview');
const previewButton = document.querySelector('#preview-toggle');
const blankQuestion = () => ({text:'',image:'',options:['','','',''],correct:null,seconds:20});
const blankQuiz = () => ({title:'',questions:[blankQuestion()]});
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let quiz = blankQuiz(), saveTimer;

function message(text = '', error = false) {
  status.textContent = text;
  status.className = error ? 'error' : 'success';
  status.setAttribute('role', error ? 'alert' : 'status');
}
function persist() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(quiz));
    saveStatus.textContent = `Черновик сохранён в браузере · ${new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}`;
  } catch {
    saveStatus.textContent = 'Не удалось сохранить черновик в браузере. Обязательно скачай JSON перед закрытием.';
  }
}
function changed() {
  message();
  saveStatus.textContent = 'Сохраняем черновик…';
  clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350);
  if (!preview.hidden) renderPreview();
}
function renderQuestions(focusIndex = null) {
  titleInput.value = quiz.title;
  list.innerHTML = quiz.questions.map((q,i) => `<section class="card question-editor" data-index="${i}">
    <div class="row question-heading"><h2>Вопрос ${i+1}</h2><div class="row">
      <button type="button" class="secondary compact" data-command="up" aria-label="Поднять вопрос ${i+1}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="secondary compact" data-command="down" aria-label="Опустить вопрос ${i+1}" ${i === quiz.questions.length-1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="secondary compact" data-command="duplicate" ${quiz.questions.length >= 100 ? 'disabled' : ''}>Копия</button>
      <button type="button" class="secondary compact danger" data-command="delete" ${quiz.questions.length === 1 ? 'disabled' : ''}>Удалить</button>
    </div></div>
    <label>Текст вопроса<textarea data-field="text" maxlength="1000" placeholder="Что спросим у игроков?" required>${escape(q.text)}</textarea></label>
    <div class="grid question-meta"><label>Картинка <span class="muted">· необязательно</span><input type="text" data-field="image" maxlength="2000" value="${escape(q.image)}" placeholder="https://… или images/photo.jpg"></label>
      <label>Время, секунд<input type="number" data-field="seconds" min="5" max="180" step="1" value="${escape(q.seconds ?? '')}" required></label></div>
    <div data-image-preview></div>
    <fieldset class="options-editor"><legend>Четыре варианта · кружок слева отмечает правильный</legend>
      ${q.options.map((option,j) => `<div class="option-editor"><input type="radio" name="correct-${i}" value="${j}" data-field="correct" aria-label="Ответ ${letters[j]} правильный" ${q.correct === j ? 'checked' : ''} required>
        <label><span class="option-letter">Вариант ${letters[j]}</span><input type="text" data-field="option" data-option="${j}" maxlength="250" value="${escape(option)}" placeholder="Текст ответа ${letters[j]}" required></label></div>`).join('')}
    </fieldset></section>`).join('');
  document.querySelector('#question-count').textContent = `${quiz.questions.length} / 100 вопросов`;
  document.querySelector('#add-question').disabled = quiz.questions.length >= 100;
  list.querySelectorAll('[data-index]').forEach(card => renderImage(card));
  if (focusIndex !== null) {
    const card = list.querySelector(`[data-index="${focusIndex}"]`);
    card?.querySelector('textarea').focus({preventScroll:true});
    card?.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
function renderImage(card) {
  const target = card.querySelector('[data-image-preview]');
  const raw = quiz.questions[Number(card.dataset.index)].image;
  const url = safeImage(raw);
  target.replaceChildren();
  if (!raw) return;
  if (!url) { target.textContent = 'Для картинки нужна HTTPS-ссылка или относительный путь.'; target.className = 'muted'; return; }
  const img = document.createElement('img');
  img.className = 'question-image editor-image'; img.alt = 'Предпросмотр картинки'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { target.textContent = 'Картинка не загрузилась. Проверь прямую ссылку или путь на сайте.'; target.className = 'muted'; }, {once:true});
  img.src = url; target.append(img);
}
function renderPreview() {
  preview.innerHTML = `<div class="row question-heading"><div class="eyebrow">Предпросмотр · вид ведущего с ответами</div><button type="button" class="secondary compact" id="close-preview">Закрыть</button></div>
    <h2>${escape(quiz.title) || 'Квиз без названия'}</h2>${quiz.questions.map((q,i) => `<section class="card"><p class="eyebrow">Вопрос ${i+1} · ${escape(q.seconds ?? '—')} секунд</p><h3>${escape(q.text) || 'Текст вопроса'}</h3>
      ${safeImage(q.image) ? `<img class="question-image" src="${escape(safeImage(q.image))}" alt="Картинка вопроса ${i+1}" referrerpolicy="no-referrer">` : ''}
      <div class="grid">${q.options.map((o,j) => `<div class="answer answer-${j} ${q.correct === j ? 'correct' : ''}"><b>${letters[j]}</b><span>${escape(o) || 'Вариант ответа'}${q.correct === j ? ' ✓' : ''}</span></div>`).join('')}</div>
      ${q.correct === null ? '<p class="muted">Правильный ответ пока не выбран.</p>' : ''}</section>`).join('')}`;
  preview.querySelector('#close-preview').addEventListener('click', () => togglePreview(false));
  preview.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
    const text = document.createElement('p'); text.className = 'muted'; text.textContent = 'Картинка не загрузилась.'; img.replaceWith(text);
  }, {once:true}));
}
function togglePreview(open) {
  preview.hidden = !open;
  previewButton.setAttribute('aria-expanded', String(open));
  previewButton.textContent = open ? 'Скрыть предпросмотр' : 'Предпросмотр';
  if (open) { renderPreview(); preview.scrollIntoView({behavior:'smooth',block:'start'}); }
}

form.addEventListener('input', event => {
  const input = event.target;
  if (input === titleInput) quiz.title = input.value;
  else {
    const card = input.closest('[data-index]'); if (!card) return;
    const q = quiz.questions[Number(card.dataset.index)];
    if (input.dataset.field === 'option') q.options[Number(input.dataset.option)] = input.value;
    else if (input.dataset.field === 'seconds') q.seconds = input.value === '' ? null : Number(input.value);
    else if (input.dataset.field === 'correct') q.correct = Number(input.value);
    else q[input.dataset.field] = input.value;
  }
  changed();
});
form.addEventListener('focusout', event => {
  if (event.target.dataset.field === 'image') renderImage(event.target.closest('[data-index]'));
});
list.addEventListener('click', event => {
  const button = event.target.closest('[data-command]'); if (!button || button.disabled) return;
  const index = Number(button.closest('[data-index]').dataset.index), command = button.dataset.command;
  let focus = index;
  if (command === 'delete') {
    if (!confirm(`Удалить вопрос ${index+1}?`)) return;
    quiz.questions.splice(index,1); focus = Math.min(index,quiz.questions.length-1);
  } else if (command === 'duplicate') {
    quiz.questions.splice(index+1,0,structuredClone(quiz.questions[index])); focus = index+1;
  } else {
    const to = index + (command === 'up' ? -1 : 1);
    [quiz.questions[index],quiz.questions[to]] = [quiz.questions[to],quiz.questions[index]]; focus = to;
  }
  renderQuestions(focus); changed(); persist();
});
document.querySelector('#add-question').addEventListener('click', () => {
  if (quiz.questions.length >= 100) return;
  quiz.questions.push(blankQuestion()); renderQuestions(quiz.questions.length-1); changed(); persist();
});
document.querySelector('#new-quiz').addEventListener('click', () => {
  if (!confirm('Начать пустой квиз? Текущий черновик будет заменён. Сначала скачай JSON, если хочешь его сохранить.')) return;
  quiz = blankQuiz(); togglePreview(false); renderQuestions(); message(); persist(); titleInput.focus();
});
previewButton.addEventListener('click', () => togglePreview(preview.hidden));
document.querySelector('#import-button').addEventListener('click', () => document.querySelector('#import-file').click());
document.querySelector('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 300000) throw new Error('Размер JSON-файла должен быть не больше 300 КБ.');
    const imported = validateQuiz(JSON.parse(await file.text()), {resolveImages:false});
    if (!confirm('Открыть этот файл вместо текущего черновика? Нескачанные изменения будут заменены.')) return;
    quiz = imported; renderQuestions(); persist();
    if (!preview.hidden) renderPreview();
    message(`Открыт квиз «${quiz.title}». Можно редактировать и скачать новую версию.`);
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const valid = validateQuiz(quiz, {resolveImages:false});
    const blob = new Blob([JSON.stringify(valid,null,2) + '\n'], {type:'application/json;charset=utf-8'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    const filename = valid.title.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'').slice(0,80) || 'quiz';
    link.download = `${filename}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    persist(); message('JSON подготовлен для скачивания. Загрузи его в пульте ведущего, чтобы начать игру.');
  } catch (error) { message(error.message,true); }
});
window.addEventListener('pagehide', persist);

try {
  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  // Черновик может быть незавершённым, поэтому полная проверка выполняется только при экспорте.
  if (saved && typeof saved.title === 'string' && Array.isArray(saved.questions) && saved.questions.length >= 1 && saved.questions.length <= 100 &&
      saved.questions.every(q => q && typeof q.text === 'string' && typeof q.image === 'string' && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string') &&
        (q.correct === null || (Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3)) && (q.seconds === null || Number.isFinite(q.seconds)))) {
    quiz = saved; saveStatus.textContent = 'Восстановлен твой черновик из этого браузера.';
  }
} catch { saveStatus.textContent = 'Хранилище браузера недоступно или черновик повреждён. Сохраняй работу скачиванием JSON.'; }
renderQuestions();
