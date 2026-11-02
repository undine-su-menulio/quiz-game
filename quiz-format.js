// Общий формат для игры и конструктора. Относительные картинки считаются от страницы сайта.
export function safeImage(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value, location.href.split('#')[0]);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin) ? url.href : '';
  } catch { return ''; }
}

export function validateQuiz(value, {resolveImages = true} = {}) {
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
    const originalImage = (q.image || '').trim();
    const image = safeImage(originalImage);
    if (originalImage && (!image || image.length > 2000)) fail('нужна корректная HTTPS-ссылка или относительный путь к картинке.');
    return {text:q.text.trim(),options:q.options.map(o => o.trim()),correct:q.correct,seconds:q.seconds,image:resolveImages ? image : originalImage};
  });
  const quiz = {title:value.title.trim(),questions};
  if (new TextEncoder().encode(JSON.stringify(quiz)).length > 280000) throw new Error('Квиз слишком большой. Ограничение: 280 КБ после обработки.');
  return quiz;
}
