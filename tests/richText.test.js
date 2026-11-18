// Console markup (richText.js): RatOS's welcome message, printer images, and what stays text
import { describe, it, expect } from 'vitest';
import { richHtml, hasMarkup, plainText } from '../src/richText.js';

const RATOS =
  '<div style="margin:0; padding:0; color: rgba(255, 255, 255, 0.7)">Base image: RatOS v2.1.3 Kalico (trixie)</div>' +
  '<a href="https://os.ratrig.com/docs/intro"><img style="margin-top:6px;" src="../server/files/config/RatOS/Logo-white.png" width="258px"></a>';
const at = (p) => 'http://printer' + p;

describe('richHtml', () => {
  it("renders RatOS's welcome: the padded div and the logo from the printer", () => {
    const h = richHtml(RATOS, at);
    expect(h).toContain('<div style="margin:0; padding:0; color: rgba(255, 255, 255, 0.7)">');
    expect(h).toContain(
      '<img src="http://printer/server/files/config/RatOS/Logo-white.png" alt="" width="258" style="margin-top:6px;"',
    );
    expect(h).not.toContain('&lt;');
    expect(hasMarkup(RATOS)).toBe(true);
  });
  it('accepts the printer path written from the root or plain', () => {
    for (const src of ['/server/files/config/a.png', 'server/files/config/a.png', './server/files/config/a.png'])
      expect(richHtml(`<img src="${src}">`, at)).toContain('src="http://printer/server/files/config/a.png"');
  });
  it('keeps an image from anywhere else, or with other attributes, as text', () => {
    for (const bad of [
      '<img src="https://evil.example/x.png">',
      '<img src="data:image/png;base64,AAAA">',
      '<img src="../server/files/../../etc/passwd">',
      '<img src="/printer/other.png">',
      '<img src="../server/files/config/a.png" onerror="alert(1)">',
      '<img src="../server/files/config/a.png" style="background:url(x)">',
    ]) {
      const h = richHtml(bad, at);
      expect(h).not.toContain('<img');
      expect(h).toContain('&lt;img');
    }
  });
  it('shows no image markup when copied or searched', () => {
    expect(plainText(RATOS)).toBe('Base image: RatOS v2.1.3 Kalico (trixie)');
  });
});
