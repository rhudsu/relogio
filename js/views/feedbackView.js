const LOAD_ERROR_MESSAGE =
  "Não foi possível carregar os dados do relógio. Verifique sua conexão e recarregue a página.";

export function showNotice(notice, text) {
  if (text) notice.textContent = text;
  notice.hidden = false;
}

export function showLoadError(container) {
  container.textContent = LOAD_ERROR_MESSAGE;
  container.hidden = false;
}
