// Делегирование сохраняет увеличение при перерисовке вопроса и в конструкторе.
let dialog, opener;

function openImage(image) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'image-viewer';
    dialog.setAttribute('aria-label', 'Увеличенное изображение');
    dialog.innerHTML = '<button type="button" class="image-viewer-close" aria-label="Закрыть изображение">✕</button><img alt=""><p>Закрыть: Escape или клик вне изображения. Таймер игры не останавливается.</p>';
    document.body.append(dialog);
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      dialog.querySelector('img').removeAttribute('src');
      if (opener?.isConnected) opener.focus();
    });
  }
  opener = image;
  const enlarged = dialog.querySelector('img');
  enlarged.src = image.currentSrc || image.src;
  enlarged.alt = image.alt || 'Изображение к вопросу';
  enlarged.referrerPolicy = 'no-referrer';
  if (!dialog.open) dialog.showModal();
}

function prepareImages(root) {
  root.querySelectorAll('.question-image').forEach(image => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-haspopup', 'dialog');
    image.setAttribute('aria-label', `${image.alt || 'Картинка'}. Нажмите, чтобы увеличить`);
    image.title = 'Нажмите, чтобы увеличить';
  });
}
document.addEventListener('click', event => {
  if (event.target.matches('.question-image')) openImage(event.target);
});
document.addEventListener('keydown', event => {
  if (event.target.matches('.question-image') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); openImage(event.target);
  }
});
prepareImages(document);
new MutationObserver(() => prepareImages(document)).observe(document.body, {childList:true,subtree:true});
// При смене вопроса закрываем старую картинку, но не при обновлении счётчика ответов.
new MutationObserver(() => {
  if (dialog?.open && ![...document.querySelectorAll('.question-image')].some(img => img.src === dialog.querySelector('img').src)) dialog.close();
}).observe(document.querySelector('main') || document.body, {childList:true,subtree:true});
