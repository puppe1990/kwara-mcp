export const SITE_ORIGIN = "https://www.kwara.com.br";
export const API_ORIGIN = "https://api.kwara.com.br";

export function formatReais(cents) {
  if (cents == null || cents === "") return null;
  const value = Number(cents);
  if (!Number.isFinite(value)) return null;
  return `R$ ${(value / 100).toFixed(2).replace(".", ",")}`;
}

export function lotUrl(slug, id) {
  const s = slug == null ? "" : String(slug);
  const i = id == null ? "" : String(id);
  if (!s && !i) return null;
  if (s && i && (s.endsWith(`-${i}`) || s === i)) {
    return `${SITE_ORIGIN}/bens/${s}`;
  }
  if (s && i) return `${SITE_ORIGIN}/bens/${s}-${i}`;
  if (s) return `${SITE_ORIGIN}/bens/${s}`;
  return `${SITE_ORIGIN}/bens/${i}`;
}
