document.querySelectorAll('textarea[maxlength]').forEach((textarea) => {
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  });
});
