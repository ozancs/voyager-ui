// Two helpers for the [section] blocks of a Klipper config:
// - Copy: a small button at the end of a section's header line copies the whole block (header to its last line,
//   the same range the fold arrow folds). It shows on the block the mouse is over and on the block the cursor is
//   in, folded or not, so long blocks can be copied without selecting them.
// - Sticky header: once a block's header has scrolled out of view, its name stays at the top of the editor (with
//   its line number and the same Copy), so in a long macro it is always clear which block the lines belong to.
//   It is drawn as a bar over the text, not as a line of the file, and clicking the name goes to the header.
import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';

const HEAD = /^\[([^\]]+)\]/;
const END = /^#\*#/; // Klipper's SAVE_CONFIG block ends the last section

// the header line of the block that line n is in, or 0 outside any block
export function sectionStart(doc, n) {
  for (; n >= 1; n--) {
    const t = doc.line(n).text;
    if (HEAD.test(t)) return n;
    if (END.test(t)) return 0;
  }
  return 0;
}
// the block from its header line to its last non-empty line
export function sectionRange(doc, start) {
  const head = doc.line(start);
  let end = head.to;
  for (let n = start + 1; n <= doc.lines; n++) {
    const l = doc.line(n);
    if (HEAD.test(l.text) || END.test(l.text)) break;
    if (l.text.trim()) end = l.to;
  }
  return { from: head.from, to: end };
}

const COPY_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function copyButton(view, start, labels, copy) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-sec-copy';
  b.innerHTML = COPY_SVG + '<span></span>';
  const txt = b.querySelector('span');
  txt.textContent = labels.copy;
  b.setAttribute('aria-label', labels.tip);
  b.dataset.tip = labels.tip;
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor and selection where they are
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const doc = view.state.doc;
    if (start > doc.lines || !HEAD.test(doc.line(start).text)) return;
    const { from, to } = sectionRange(doc, start);
    if (await copy(doc.sliceString(from, to))) {
      txt.textContent = labels.copied;
      setTimeout(() => (txt.textContent = labels.copy), 1400);
    }
  });
  return b;
}

class CopyWidget extends WidgetType {
  constructor(start, labels, copy) {
    super();
    this.start = start;
    this.labels = labels;
    this.copy = copy;
  }
  eq(o) {
    return o.start === this.start;
  }
  toDOM(view) {
    return copyButton(view, this.start, this.labels, this.copy);
  }
  ignoreEvent() {
    return true;
  }
}

const hoverSec = StateEffect.define();

export function sectionTools({ labels, copy }) {
  const buttons = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.hover = 0;
        this.decorations = this.build(view);
      }
      build(view) {
        const doc = view.state.doc;
        const cur = sectionStart(doc, doc.lineAt(view.state.selection.main.head).number);
        const lines = [...new Set([this.hover, cur])].filter((n) => n && n <= doc.lines).sort((a, b) => a - b);
        return Decoration.set(
          lines
            .filter((n) => HEAD.test(doc.line(n).text))
            .map((n) => Decoration.widget({ widget: new CopyWidget(n, labels, copy), side: -1 }).range(doc.line(n).to)),
        );
      }
      update(u) {
        let changed = u.docChanged || u.selectionSet;
        for (const tr of u.transactions)
          for (const e of tr.effects)
            if (e.is(hoverSec) && e.value !== this.hover) {
              this.hover = e.value;
              changed = true;
            }
        if (changed) this.decorations = this.build(u.view);
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousemove(e, view) {
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
          const n = pos == null ? 0 : sectionStart(view.state.doc, view.state.doc.lineAt(pos).number);
          if (n !== this.hover) view.dispatch({ effects: hoverSec.of(n) });
        },
        mouseleave(e, view) {
          if (this.hover) view.dispatch({ effects: hoverSec.of(0) });
        },
      },
    },
  );

  const sticky = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.start = 0;
        this.bar = document.createElement('div');
        this.bar.className = 'cm-sticky-sec';
        this.bar.hidden = true;
        this.name = document.createElement('button');
        this.name.type = 'button';
        this.name.className = 'nm';
        this.name.dataset.tip = labels.jump;
        this.name.addEventListener('mousedown', (e) => e.preventDefault());
        this.name.addEventListener('click', () => {
          if (!this.start) return;
          const pos = view.state.doc.line(this.start).from;
          view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
          view.focus();
        });
        this.ln = document.createElement('span');
        this.ln.className = 'ln';
        this.bar.append(this.name, this.ln);
        view.dom.appendChild(this.bar);
        this.onScroll = () => this.measure();
        view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
        this.measure();
      }
      measure() {
        this.view.requestMeasure({
          key: this,
          read: (view) => {
            if (view.scrollDOM.scrollTop <= 0) return { start: 0 };
            // the top edge of the visible area, in the document's own heights
            const h = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
            const blk = view.lineBlockAtHeight(h + 1);
            const doc = view.state.doc;
            const start = sectionStart(doc, doc.lineAt(blk.from).number);
            if (!start) return { start: 0 };
            // only once the header itself has gone above the top edge
            const hb = view.lineBlockAt(doc.line(start).from);
            return {
              start: hb.top < h - 2 ? start : 0,
              left: view.contentDOM.getBoundingClientRect().left - view.dom.getBoundingClientRect().left,
            };
          },
          write: (m) => this.show(m),
        });
      }
      show({ start, left }) {
        const doc = this.view.state.doc;
        if (!start || start > doc.lines) {
          this.start = 0;
          this.bar.hidden = true;
          return;
        }
        if (left != null) this.bar.style.left = left + 'px';
        if (start !== this.start) {
          this.start = start;
          this.name.textContent = HEAD.exec(doc.line(start).text)[0];
          this.ln.textContent = labels.line.replace('{n}', start);
          this.bar.querySelector('.cm-sec-copy')?.remove();
          this.bar.append(copyButton(this.view, start, labels, copy));
        }
        this.bar.hidden = false;
      }
      update(u) {
        if (u.docChanged || u.geometryChanged || u.viewportChanged) {
          this.start = u.docChanged ? -1 : this.start; // a changed header line is drawn again
          this.measure();
        }
      }
      destroy() {
        this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
        this.bar.remove();
      }
    },
  );
  return [buttons, sticky];
}
