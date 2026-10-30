// Phoenix status objects for the demo (shapes from phoenix-for-klipper/integrations/voyager/fixtures). The
// coordinates are examples, not a park or calibration setting for a real printer.
const now = Date.now() / 1000;
const cp = (index, ago, x, y, z, layer) => ({
  id: 'cp' + index,
  index,
  saved_at: now - ago,
  offset: 812400 - index * 4100,
  machine_position: [x, y, z],
  gcode_position: [x, y, z],
  layer_z: layer,
  z_above_layer: +(z - layer).toFixed(2),
});
const base = {
  api_version: 1,
  version: '0.1.0',
  revision: 1,
  busy: false,
  recovery_available: true,
  job_id: 'phoenix-demo-job',
  filename: 'bracket_v3.gcode',
  file_size: 1835120,
  reason: 'unclean_shutdown',
  error: null,
  profile_ready: true,
  checks: {
    bed_attached: false,
    axes_unmoved: false,
    plate_unmoved: false,
    nozzle_free: false,
    path_clear: false,
    uncertainty_accepted: false,
  },
  selected_index: 0,
  checkpoints: [
    cp(0, 742, 130.4, 101.2, 20.6, 20.0),
    cp(1, 751, 128.9, 96.5, 20.0, 20.0),
    cp(2, 760, 118.2, 88.0, 20.0, 20.0),
    cp(3, 771, 102.7, 120.3, 19.8, 19.8),
  ],
  assumed_position: [130.4, 101.2, 20.6],
  plan: null,
  storage_error: null,
  journal_fallback: false,
  uncertainties: ['axes_assumed_unchanged', 'queued_motion', 'z_hop', 'sample_gap'],
  capabilities: {
    z_homing: false,
    z_hop: true,
    checkpoint_selection: true,
    arbitrary_line_selection: false,
    automatic_resume: false,
  },
};
const all = Object.fromEntries(Object.keys(base.checks).map((k) => [k, true]));
const plan = {
  assumed: [130.4, 101.2, 20.6],
  lift: [130.4, 101.2, 25.6],
  park: [10, 10, 25.6],
  above_target: [130.4, 101.2, 25.6],
  target: [130.4, 101.2, 20.6],
};
export const PHOENIX_FIXTURES = {
  detected: base,
  prepared: { ...base, phase: 'prepared', recovery_available: false, checks: all, plan },
  blocked: {
    ...base,
    phase: 'blocked',
    recovery_available: false,
    checks: all,
    plan,
    error: 'Recovery was interrupted after preparation began. Position needs manual review.',
  },
};
PHOENIX_FIXTURES.detected = { ...base, phase: 'detected' };
