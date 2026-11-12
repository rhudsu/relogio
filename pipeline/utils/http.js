export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} em ${url}`);
    this.name = "HttpError";
    this.status = status;
  }
}

const DEFAULT_ENCODING = "utf-8";
const PROLOG_SNIFF_BYTES = 200;

function detectEncoding(bytes, contentType) {
  const headerCharset = /charset=["']?([\w-]+)/i.exec(contentType ?? "");
  if (headerCharset) return headerCharset[1];

  const prolog = new TextDecoder("latin1").decode(bytes.slice(0, PROLOG_SNIFF_BYTES));
  const prologEncoding = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(prolog);
  return prologEncoding ? prologEncoding[1] : DEFAULT_ENCODING;
}

export function decodeBody(bytes, contentType) {
  const encoding = detectEncoding(bytes, contentType);

  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder(DEFAULT_ENCODING).decode(bytes);
  }
}

export async function fetchText(url, { fetchFn = fetch, timeoutMs, userAgent }) {
  const response = await fetchFn(url, {
    headers: { "User-Agent": userAgent, Accept: "application/xml, application/json, text/xml, */*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });

  if (!response.ok) throw new HttpError(url, response.status);

  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeBody(bytes, response.headers.get("content-type"));
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
