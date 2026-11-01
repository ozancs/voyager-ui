import { describe, it, expect } from 'vitest';
import { PROBLEMS, findProblems, forError, nextQuestion, rankCauses } from '../src/solver/problems';
import { systemToday } from '../src/solver/facts';
import { parseSlicerConfig, slicerSettings, buildFacts, material, flowOf } from '../src/solver/facts';

const P = (id) => PROBLEMS.find((p) => p.id === id);
const block = `G1 X1\n; CONFIG_BLOCK_START\n; nozzle_temperature = 255,255\n; filament_type = PETG\n; retraction_length = 0.8\n; outer_wall_acceleration = 10000\n; hot_plate_temp = 80\n; brim_width = 0\n; CONFIG_BLOCK_END\n`;
const status = (o = {}) => ({
  configfile: { settings: { printer: { max_accel: 10000 }, extruder: { pressure_advance: 0.04 }, ...o } },
  extruder: { pressure_advance: 0.04 },
  toolhead: { max_accel: 10000, square_corner_velocity: 5 },
});

describe('problem search', () => {
  it('finds Turkish words without accents and English words', () => {
    expect(findProblems('sacak')[0].p.id).toBe('stringing');
    expect(findProblems('yapisma')[0].p.id).toBe('firstlayer');
    expect(findProblems('stringing')[0].p.id).toBe('stringing');
    expect(findProblems('fan dönmüyor')[0].p.id).toBe('m_fan');
    expect(findProblems('')).toEqual([]);
  });
  it('a pasted Klipper error finds its guide', () => {
    expect(findProblems("MCU 'mcu' shutdown: Timer too close")[0].p.id).toBe('k_timer');
    expect(forError("TMC 'stepper_x' reports error: GSTAT: 00000001 reset=1")?.id).toBe('k_tmc');
    expect(forError('Thermocouple reader fault')?.kind).toBe('klipper');
    expect(forError('something unrelated')).toBe(null);
  });
  it('every problem has questions with options and causes with a test', () => {
    for (const p of PROBLEMS) {
      if (p.kind === 'print') expect(p.questions.length).toBeGreaterThan(0);
      expect(p.questions.length).toBeLessThanOrEqual(3);
      for (const q of p.questions) expect(q.opts.length).toBeGreaterThan(1);
      for (const c of p.causes) expect(c.test?.label && c.test?.how).toBeTruthy();
    }
  });
});

describe('slicer settings', () => {
  it('reads "; key = value" lines, first value of a list', () => {
    const s = slicerSettings(parseSlicerConfig(block));
    expect(s.nozzleTemp).toBe(255);
    expect(s.filament).toBe('PETG');
    expect(s.retract).toBe(0.8);
    expect(s.bedTemp).toBe(80);
  });
  it('knows materials and flow', () => {
    expect(material('PETG-CF')).toBe('PETG');
    expect(material('Nylon')).toBe('PA');
    expect(material('')).toBe(null);
    expect(flowOf(300, 0.2, 0.45)).toBe(27);
    expect(flowOf(null, 0.2, 0.45)).toBe(null);
  });
});

describe('ranking', () => {
  it('stringing: hot PETG from an open spool puts temperature and moisture first, with the file as evidence', () => {
    const f = buildFacts({ meta: { filament_type: 'PETG' }, cfg: parseSlicerConfig(block), status: status() });
    const a = { where: 'travel', spool: 'weeks' };
    const r = rankCauses(P('stringing'), a, f);
    expect(r[0].id).toBe('temp');
    expect(r[0].evidence[0]).toEqual(['file', 'Nozzle 255° (PETG usually 225–250°)']);
    expect(r.map((c) => c.id)).toContain('wet');
  });
  it('without a file nothing is taken from it, and today is only labelled as today', () => {
    const f = buildFacts({ status: status() });
    expect(f.file.exists).toBe(false);
    const r = rankCauses(P('stringing'), { where: 'hairs', spool: 'dried' }, f);
    expect(r.find((c) => c.id === 'temp').missing).toContain('The nozzle temperature of the print');
    expect(r.flatMap((c) => c.evidence).every(([s]) => s !== 'file')).toBe(true);
  });
  it('ringing without a shaper says so first', () => {
    const f = buildFacts({ status: status() });
    expect(rankCauses(P('ringing'), { dir: 'y', since: 'always' }, f)[0].id).toBe('noshaper');
    const g = buildFacts({ status: status({ input_shaper: { shaper_freq_x: 50, shaper_freq_y: 40 } }) });
    expect(rankCauses(P('ringing'), { dir: 'y', since: 'change' }, g)[0].id).toBe('stale');
  });
  it('questions go in order and stop when all are answered', () => {
    const p = P('warping');
    expect(nextQuestion(p, {}).id).toBe('box');
    expect(nextQuestion(p, { box: 'open' }).id).toBe('how');
    expect(nextQuestion(p, { box: 'open', how: 'corners' })).toBe(null);
  });
  it('a print record that no longer matches the file is flagged', () => {
    const f = buildFacts({
      meta: { modified: 200 },
      fileModified: 200,
      job: { status: 'completed', metadata: { modified: 100 }, exists: true },
      status: status(),
    });
    expect(f.print.fileChanged).toBe(true);
  });
});

describe('machine and Klipper guides', () => {
  it('timer too close points at link errors when the board resends', () => {
    const st = {
      mcu: { mcu_version: 'v0.13.0-1', last_stats: { bytes_retransmit: 800, bytes_invalid: 4 } },
      ...status(),
    };
    const sys = systemToday(st, { throttled_state: { bits: 0 } }, 'v0.13.0-1', () => 0);
    const f = buildFacts({ status: st, sys, error: 'Timer too close' });
    const r = rankCauses(P('k_timer'), { when: 'random' }, f);
    expect(r[0].id).toBe('bus');
    expect(r[0].evidence[0]).toEqual(['error', 'Timer too close']);
  });
  it('Z banding finds a layer height off the full step', () => {
    const st = status({ stepper_z: { rotation_distance: 8 } });
    const f = buildFacts({ cfg: { layer_height: '0.25' }, status: st });
    expect(f.sys.zFullStep).toBe(0.04);
    expect(rankCauses(P('zband'), { even: 'even' }, f)[0].id).toBe('step');
  });
});
