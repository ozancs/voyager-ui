// Section headers as links to the Klipper docs: hold Ctrl (Cmd on a Mac) and the [section] names underline,
// Ctrl+click opens that section in the Config Reference. A plain click keeps editing as usual.
import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

export function sectionLinks(docUrl, title) {
  const mark = Decoration.mark({ class: 'cm-sec', attributes: { title } });
  const build = (view) => {
    const b = new RangeSetBuilder();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const m = /^\[([^\]\s][^\]]*)\]/.exec(line.text);
        if (m) b.add(line.from + 1, line.from + 1 + m[1].length, mark);
        pos = line.to + 1;
      }
    }
    return b.finish();
  };
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view);
      }
      update(u) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
  const setCtrl = (view, on) => view.dom.classList.toggle('cm-ctrl', on);
  const handlers = EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!(e.ctrlKey || e.metaKey)) return false;
      const el = e.target.closest?.('.cm-sec');
      if (!el) return false;
      e.preventDefault();
      window.open(docUrl(el.textContent.trim()), '_blank', 'noopener');
      return true;
    },
    keydown(e, view) {
      if (e.key === 'Control' || e.key === 'Meta') setCtrl(view, true);
      return false;
    },
    keyup(e, view) {
      if (e.key === 'Control' || e.key === 'Meta') setCtrl(view, false);
      return false;
    },
    mousemove(e, view) {
      setCtrl(view, e.ctrlKey || e.metaKey);
      return false;
    },
    blur(e, view) {
      setCtrl(view, false);
      return false;
    },
  });
  return [plugin, handlers];
}
