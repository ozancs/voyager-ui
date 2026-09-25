import { describe, it, expect } from 'vitest'
import { lintKlipper } from '../src/editor/lint.js'

const msgs = (doc, ctx) => lintKlipper(doc, ctx).map((d) => d.severity + ': ' + d.message)

describe('config checks', () => {
  it('accepts a clean config', () => {
    expect(msgs('[printer]\nkinematics: corexy\n\n[gcode_macro A]\ngcode:\n  {% if x %}\n  G28\n  {% endif %}\n')).toEqual([])
  })
  it('flags options outside a section', () => {
    expect(msgs('x: 1\n[printer]\n')[0]).toMatch(/^error: Option outside/)
  })
  it('flags repeated options in one section', () => {
    expect(msgs('[printer]\nmax_velocity: 1\nmax_velocity: 2\n')[0]).toMatch(/^warning: "max_velocity" is already set on line 2/)
  })
  it('flags unbalanced jinja blocks', () => {
    expect(msgs('[gcode_macro A]\ngcode:\n  {% if x %}\n  G28\n').some((m) => /endif/.test(m))).toBe(true)
  })
  it('checks includes only when the file list is known', () => {
    expect(msgs('[include missing.cfg]\n', { files: ['printer.cfg'] })[0]).toMatch(/No file matches/)
    expect(msgs('[include missing.cfg]\n', { files: null })).toEqual([])
    expect(msgs('[include macros/*.cfg]\n', { files: ['macros/a.cfg'] })).toEqual([])
  })
  it('stops at the SAVE_CONFIG block', () => {
    expect(msgs('[printer]\n#*# <---------------------- SAVE_CONFIG ---------------------->\n#*# [probe]\nx: 1\n')).toEqual([])
  })
  it('places Klipper warnings on the option line', () => {
    const d = lintKlipper('[printer]\nmax_accel_to_decel: 5000\n', { warnings: [{ type: 'deprecated_option', section: 'printer', option: 'max_accel_to_decel', message: 'Option max_accel_to_decel is deprecated' }] })
    expect(d[0].from).toBe(10)
  })
})
