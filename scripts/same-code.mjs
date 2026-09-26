// Checks that a change is formatting only: for every file given (default: the files changed against HEAD) it
// compares the old and the new version by meaning, not by text.
//   .js         the parsed syntax tree, without positions and comments
//   .vue        the compiled template (with the text nodes, so a lost or added space shows up), the script's
//               syntax tree and the styles
//   .css        the rules with whitespace, comments and quote style removed
// Usage: npm run same-code [-- file ...]    Prints the files whose meaning changed, "differ 0" when none did.
import { execSync } from 'child_process';
import fs from 'fs';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import * as babel from '@babel/parser';
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : execSync('git diff --name-only HEAD')
      .toString()
      .split('\n')
      .filter((f) => /\.(vue|js|cjs|mjs|css)$/.test(f) && fs.existsSync(f) && !f.startsWith('src/locales/'));
const strip = (n) => {
  if (Array.isArray(n)) return n.filter((x) => !(x && x.type === 'EmptyStatement')).map(strip);
  if (n && typeof n === 'object') {
    const o = {};
    for (const k of Object.keys(n)) {
      if (
        [
          'start',
          'end',
          'loc',
          'range',
          'extra',
          'comments',
          'leadingComments',
          'trailingComments',
          'innerComments',
          'tokens',
        ].includes(k)
      )
        continue;
      o[k] = strip(n[k]);
    }
    return o;
  }
  return n;
};
const jsAst = (src, ts) =>
  JSON.stringify(strip(babel.parse(src, { sourceType: 'module', plugins: ['jsx', 'importAttributes'] }).program));
const css = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'/g, '"')
    .replace(/\[([\w-]+)([~|^$*]?=)"([^"]*)"\]/g, '[$1$2$3]')
    .replace(/(^|[^0-9.])0\.(\d)/g, '$1.$2')
    .replace(/\s+/g, '')
    .replace(/;}/g, '}');
let bad = 0;
for (const f of files) {
  const old = execSync(`git show HEAD:${f}`).toString(),
    cur = fs.readFileSync(f, 'utf8');
  const probs = [];
  if (f.endsWith('.vue')) {
    const a = parse(old).descriptor,
      b = parse(cur).descriptor;
    const tpl = (d) =>
      d.template
        ? compileTemplate({
            source: d.template.content,
            filename: f,
            id: 'x',
            compilerOptions: { mode: 'module', comments: false },
          }).code
        : '';
    const tplA = (d) => {
      const c = tpl(d);
      return c ? jsAst(c) : '';
    };
    if (tplA(a) !== tplA(b)) {
      const lits = (d) => {
        const out = [];
        JSON.parse(tplA(d), (k, v) => {
          if (v && v.type === 'StringLiteral') out.push(v.value);
          return v;
        });
        return out;
      };
      const la = lits(a),
        lb = lits(b),
        dd = [];
      for (let i = 0; i < Math.max(la.length, lb.length); i++)
        if (la[i] !== lb[i]) dd.push(JSON.stringify(la[i]) + ' -> ' + JSON.stringify(lb[i]));
      probs.push('template' + (dd.length ? ' [' + dd.slice(0, 4).join(' | ') + ']' : ' (structure)'));
    }
    const sc = (d) => (d.scriptSetup ? jsAst(d.scriptSetup.content) : '');
    if (sc(a) !== sc(b)) probs.push('script setup');
    const s2 = (d) => (d.script ? jsAst(d.script.content) : '');
    if (s2(a) !== s2(b)) probs.push('script');
    if (a.styles.map((s) => css(s.content)).join() !== b.styles.map((s) => css(s.content)).join()) probs.push('style');
  } else if (f.endsWith('.css')) {
    if (css(old) !== css(cur)) probs.push('css');
  } else {
    if (jsAst(old) !== jsAst(cur)) probs.push('js');
  }
  if (probs.length) {
    bad++;
    console.log(f, probs.join(','));
  }
}
console.log('checked', files.length, 'differ', bad);
