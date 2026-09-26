// Every language must have every key, and keep the same {placeholders}.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
const keys = JSON.parse(readFileSync(new URL('../scripts/i18n-keys.json', import.meta.url)));
const langs = readdirSync(new URL('../src/locales/', import.meta.url)).filter((f) => f.endsWith('.js'));
const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();

describe.each(langs)('%s', (file) => {
  it('has every key with matching placeholders', async () => {
    const d = (await import('../src/locales/' + file)).default;
    const missing = keys.filter((k) => !(k in d));
    const bad = keys.filter((k) => k in d && ph(k) !== ph(d[k]));
    expect(missing).toEqual([]);
    expect(bad).toEqual([]);
  });
});
