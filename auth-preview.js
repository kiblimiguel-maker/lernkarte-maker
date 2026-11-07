const preview = document.querySelector('#auth-preview-toggle');
const status = document.querySelector('#auth-preview-status');
const [front, back] = preview.querySelectorAll('.auth-preview-face');

preview.addEventListener('click', () => {
  const face = preview.classList.toggle('is-flipped') ? back : front;
  const language = face.querySelector('small').textContent;
  preview.setAttribute('aria-label', face.querySelector('.auth-preview-action-label').textContent);
  status.replaceChildren(`${language}. `, face.querySelector('strong').cloneNode(true));
});
