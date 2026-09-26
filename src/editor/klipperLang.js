// Klipper config syntax for CodeMirror: sections, options, values, comments and the
// G-code / Jinja inside gcode: blocks of macros.
import { StreamLanguage, HighlightStyle, syntaxHighlighting, foldService } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const GCODE_KEY = /^(gcode|.*_gcode|on_[a-z_]+|runout_gcode|insert_gcode)$/i;

export const klipperStream = StreamLanguage.define({
  name: 'klipper',
  startState: () => ({ key: '', gcode: false, section: '', jinja: 0 }),
  copyState: (s) => ({ ...s }),
  token(stream, st) {
    const sol = stream.sol();
    if (sol) {
      st.lineStart = true;
      // section header
      if (stream.match(/^\[[^\]]*\]/)) {
        st.section = stream.current().slice(1, -1);
        st.key = '';
        st.gcode = false;
        st.lineStart = false;
        return 'heading';
      }
      // SAVE_CONFIG block marker lines start with #*#
      if (stream.match(/^#\*#.*/)) return 'meta';
      if (stream.match(/^[#;].*/)) return 'comment';
      // option at column 0
      const m = stream.match(/^[A-Za-z0-9_.\-]+(?=\s*[:=])/);
      if (m) {
        st.key = stream.current();
        st.gcode = GCODE_KEY.test(st.key);
        st.afterKey = true;
        st.lineStart = false;
        return 'propertyName';
      }
    }
    if (st.afterKey) {
      if (stream.match(/^\s*[:=]/)) {
        st.afterKey = false;
        st.valueStart = true;
        return 'punctuation';
      }
      st.afterKey = false;
    }
    if (stream.eatSpace()) return null;
    // inline comment (after whitespace)
    if (stream.match(/^[#;].*/)) return 'comment';
    const inGcode = st.gcode;
    if (inGcode) {
      if (stream.match(/^\{%-?/)) {
        st.jinja = 1;
        return 'keyword';
      }
      if (stream.match(/^-?%\}/)) {
        st.jinja = 0;
        return 'keyword';
      }
      if (stream.match(/^\{\{|^\}\}/)) return 'meta';
      if (st.jinja) {
        if (stream.match(/^(if|elif|else|endif|for|endfor|in|set|macro|endmacro|not|and|or|is|filter|endfilter)\b/))
          return 'keyword';
        if (
          stream.match(
            /^(printer|params|rawparams|action_respond_info|action_raise_error|action_emergency_stop|action_call_remote_method)\b/,
          )
        )
          return 'variableName.special';
        if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
        if (stream.match(/^"[^"]*"|^'[^']*'/)) return 'string';
        if (stream.match(/^[A-Za-z_][\w]*/)) return 'variableName';
        stream.next();
        return 'operator';
      }
      if (stream.match(/^\{[^}]*\}/)) return 'variableName';
      if (stream.match(/^[GMT]\d+(\.\d+)?\b/i)) return 'keyword';
      if (stream.match(/^[A-Z_][A-Z0-9_]{2,}\b/)) return 'variableName.function';
      if (stream.match(/^[A-Za-z_]+(?==)/)) return 'attributeName';
      if (stream.match(/^[XYZEFS](?=-?[\d.{])/i)) return 'attributeName';
      if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
      stream.next();
      return null;
    }
    // plain values
    if (stream.match(/^-?\d+(\.\d+)?(e-?\d+)?\b/)) return 'number';
    if (stream.match(/^(true|false|True|False)\b/)) return 'bool';
    if (
      stream.match(/^[!^~]*(PA|PB|PC|PD|PE|PF|PG|P\d|gpio)\d+\b/i) ||
      stream.match(/^[!^~]*[a-z0-9_]+:[A-Za-z0-9_]+/i)
    )
      return 'atom';
    stream.next();
    return 'string';
  },
  languageData: { commentTokens: { line: '#' } },
});

// fold whole sections from their header
export const sectionFold = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  if (!/^\[[^\]]+\]/.test(line.text)) return null;
  let end = line.to;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    if (/^\[[^\]]+\]/.test(l.text) || /^#\*#/.test(l.text)) break;
    if (l.text.trim()) end = l.to;
  }
  return end > line.to ? { from: line.to, to: end } : null;
});

export const klipperHighlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--ac)', fontWeight: '700' },
  { tag: t.propertyName, color: 'var(--cm-key)' },
  { tag: t.punctuation, color: 'var(--mu)' },
  { tag: t.comment, color: 'var(--comment)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--mu2)' },
  { tag: t.number, color: 'var(--cm-num)' },
  { tag: t.bool, color: 'var(--cm-num)' },
  { tag: t.atom, color: 'var(--cm-pin)' },
  { tag: t.string, color: 'var(--code)' },
  { tag: t.keyword, color: 'var(--cm-kw)', fontWeight: '600' },
  { tag: t.function(t.variableName), color: 'var(--cm-fn)' },
  { tag: t.special(t.variableName), color: 'var(--cm-kw)' },
  { tag: t.variableName, color: 'var(--cm-var)' },
  { tag: t.attributeName, color: 'var(--cm-attr)' },
  { tag: t.operator, color: 'var(--mu)' },
]);
export const klipper = [klipperStream, syntaxHighlighting(klipperHighlight), sectionFold];
