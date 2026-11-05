// Copy text to the clipboard. The Clipboard API exists only on https or localhost, and a printer is usually
// opened over plain http on its LAN address, so the old way (a hidden text box and the copy command) is tried
// when the API is missing or refuses. Resolves when the text was copied, throws when neither way worked.
export async function copyText(text) {
  const s = String(text ?? '');
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(s);
      return;
    } catch {}
  }
  const ta = document.createElement('textarea');
  ta.value = s;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  const focused = document.activeElement;
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, s.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {}
  ta.remove();
  focused?.focus?.({ preventScroll: true });
  if (!ok) throw new Error('copy blocked');
}
