export function createElement(tagName, { className, text, attributes = {} } = {}, children = []) {
  const element = document.createElement(tagName);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  children.forEach((child) => element.append(child));

  return element;
}
