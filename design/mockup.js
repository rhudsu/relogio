const filterButtons = document.querySelectorAll(".filters__btn");
const entries = document.querySelectorAll(".entry");

function applyFilter(filter) {
  entries.forEach((entry) => {
    entry.hidden = filter !== "all" && entry.dataset.effect !== filter;
  });
  filterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
  });
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => applyFilter(button.dataset.filter));
});
