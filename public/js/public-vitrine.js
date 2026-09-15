const searchInput = document.getElementById('searchInput');
const categoryButtons = Array.from(document.querySelectorAll('.category-btn'));
const cards = Array.from(document.querySelectorAll('.producer-card'));
const emptyState = document.getElementById('emptyState');
const btnCategoriaTodos = document.querySelector('.category-btn[data-category="Todos"]');

let activeCategory = 'Todos';

function marcarCategoriaAtiva() {
  categoryButtons.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.category === activeCategory);
  });
}

function applyFilters() {
  const term = (searchInput?.value || '').trim().toLowerCase();
  let visibleCount = 0;

  cards.forEach((card) => {
    const searchText = card.dataset.search || '';
    const categories = (card.dataset.categories || '').split('|').filter(Boolean);
    const chips = Array.from(card.querySelectorAll('[data-chip-category]'));

    const matchesSearch = !term || searchText.includes(term);
    const matchesCategory = activeCategory === 'Todos' || categories.includes(activeCategory);

    const visible = matchesSearch && matchesCategory;
    card.hidden = !visible;

    if (visible) {
      visibleCount += 1;

      // Se o termo digitado bate com o nome de algum produto deste produtor,
      // mostra só os produtos que batem (ex: buscar "tomate" mostra só o chip Tomate).
      // Se o termo bateu só pelo nome do produtor/comunidade, mostra todos os produtos.
      const algumNomeDeProdutoBate = term && chips.some((chip) => (chip.dataset.chipName || '').includes(term));

      chips.forEach((chip) => {
        const categoriaOk = activeCategory === 'Todos' || chip.dataset.chipCategory === activeCategory;
        const nomeOk = !term || !algumNomeDeProdutoBate || (chip.dataset.chipName || '').includes(term);
        const chipVisivel = categoriaOk && nomeOk;
        chip.style.display = chipVisivel ? '' : 'none';
      });
    }
  });

  emptyState?.classList.toggle('hidden', visibleCount > 0);
}

searchInput?.addEventListener('input', applyFilters);

categoryButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const categoriaClicada = button.dataset.category;

    if (categoriaClicada === activeCategory && categoriaClicada !== 'Todos') {
      // Clicou de novo na categoria já ativa: desmarca e volta pra "Todos".
      activeCategory = 'Todos';
    } else {
      activeCategory = categoriaClicada;
    }

    marcarCategoriaAtiva();
    applyFilters();
  });
});

applyFilters();