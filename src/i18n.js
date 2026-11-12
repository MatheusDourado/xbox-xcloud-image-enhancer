// UI language (v10.1.3). The pt-BR texts in the code are the keys; src/i18n.json holds their translations
// (embedded by tools/build.py as globalThis.BxI18nStrings). Language, in order: the www.xbox.com/<locale>/ path
// (the logged-in account's market), <html lang> (play.xbox.com URLs carry no locale), then the browser or
// Android language. Languages without a column in i18n.json fall back to English; a missing entry shows pt-BR.
(() => {
 if (globalThis.BxI18n) return;
 const SUPPORTED = ['pt', 'en', 'es'];
 let cached = null;
 function lang() {
  if (cached) return cached;
  const loc = globalThis.location, root = globalThis.document?.documentElement;
  const path = loc?.hostname === 'www.xbox.com' ? /^\/([a-z]{2})-[a-z]{2,4}(?:\/|$)/i.exec(loc.pathname)?.[1] : null;
  const tag = path || root?.lang || globalThis.navigator?.language || '';
  const code = tag.slice(0, 2).toLowerCase();
  const result = !code ? 'pt' : SUPPORTED.includes(code) ? code : 'en';
  // Before the page sets <html lang>, the browser language is only a guess: kept for this call, not cached.
  if (path || root?.lang || (globalThis.document && globalThis.document.readyState !== 'loading')) cached = result;
  return result;
 }
 function t(text, ...args) {
  const l = lang(), out = l === 'pt' ? text : globalThis.BxI18nStrings?.[text]?.[l] ?? text;
  return args.length ? out.replace(/\{(\d)\}/g, (m, i) => args[i] ?? m) : out;
 }
 globalThis.BxI18n = {
  t,
  get lang() { return lang(); },
  // Number separators: English uses 1,234.5; Portuguese and Spanish 1.234,5.
  get decimal() { return lang() === 'en' ? '.' : ','; },
  get thousands() { return lang() === 'en' ? ',' : '.'; },
 };
})();
