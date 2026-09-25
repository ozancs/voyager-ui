import { describe, it, expect } from 'vitest'
import { richHtml, hasMarkup } from '../src/richText.js'

describe('console markup', () => {
  it('keeps coloured spans and simple tags', () => {
    expect(richHtml('<b><span style="color:#87CEEB">a</span></b>')).toBe('<b><span style="color:#87CEEB">a</span></b>')
    expect(richHtml('<span style="color:#00ff00;font-weight:bold">T</span><br/>')).toBe('<span style="color:#00ff00;font-weight:bold">T</span><br>')
  })
  it('leaves everything else as text', () => {
    expect(richHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(richHtml('<img src=x onerror=alert(1)>')).not.toContain('<img')
    expect(richHtml('<span style="color:red" onclick="x()">x</span>')).not.toContain('<span style')
    expect(richHtml('<span style="background:url(javascript:alert(1))">x</span>')).not.toContain('<span style')
  })
  it('keeps entities and plain text', () => {
    expect(richHtml('a &amp; b &#9632;')).toBe('a &amp; b &#9632;')
    expect(richHtml('G28 X Y')).toBe('G28 X Y')
    expect(hasMarkup('ok')).toBe(false)
    expect(hasMarkup('<span style="color:#fff">x</span>')).toBe(true)
  })
})

import { expandPaths } from '../src/paths.js'
describe('download folders', () => {
  it('replaces a folder with every file under it, however deep', () => {
    const all = [{ path: 'printer.cfg' }, { path: 'mmu/base/mmu.cfg' }, { path: 'mmu/macros/a.cfg' }, { path: 'mmu2/x.cfg' }, { path: 'mmu/top.cfg' }]
    expect(expandPaths([{ path: 'mmu', dir: true }, { path: 'printer.cfg' }], all).sort()).toEqual(['mmu/base/mmu.cfg', 'mmu/macros/a.cfg', 'mmu/top.cfg', 'printer.cfg'])
  })
})

import { counterGrowth } from '../src/calc.js'
describe('mcu counters', () => {
  it('ignores the drop when Klipper restarts', () => {
    const h = [{ re: 100 }, { re: 120 }, { re: 5 }, { re: 15 }]
    expect(counterGrowth(h, 're')).toBe(30)
  })
})

import { pushDown } from '../src/calc.js'
describe('grid resize from the left or top', () => {
  it('pushes overlapped cards below the resized one', () => {
    const l = [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }, { i: 'c', x: 6, y: 4, w: 6, h: 2 }]
    l[0].w = 8 // a grew over b
    pushDown(l, 'a')
    expect(l.find((x) => x.i === 'b').y).toBe(4)
    expect(l.find((x) => x.i === 'c').y).toBe(8)
  })
})
