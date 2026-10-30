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
const setup = (o = {}) => ({
  complete: true,
  profile_ready: true,
  profile_error: null,
  park: [10, 10],
  clearance: 5,
  hooks: { start: ['PRINT_START'], end: ['PRINT_END'] },
  slicer_confirmed: false,
  homed_axes: 'xyz',
  can_edit: false,
  can_use_current: false,
  can_jog: false,
  current_position: [130.4, 101.2, 20.6],
  steps: [
    { id: 'module', state: 'ok', message: 'Phoenix module loaded' },
    { id: 'printer', state: 'ok', message: 'Printer configuration supported' },
    { id: 'hooks', state: 'ok', message: 'Print hooks found/confirmed' },
    { id: 'park', state: 'ok', message: 'Park point saved' },
    { id: 'test', state: 'manual', message: 'Verify recording on a small supervised test print' },
  ],
  ...o,
});
base.setup = setup();
const idleBase = {
  ...base,
  phase: 'idle',
  recovery_available: false,
  job_id: null,
  filename: null,
  file_size: null,
  reason: '',
  checkpoints: [],
  assumed_position: null,
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
// idle on an empty, homed printer with setup still to do (hooks missing, no park point)
PHOENIX_FIXTURES.setup = {
  ...idleBase,
  profile_ready: false,
  setup: setup({
    complete: false,
    profile_ready: false,
    hooks: { start: ['PRINT_START'], end: [] },
    can_edit: true,
    can_use_current: true,
    can_jog: true,
    current_position: [12.5, 290.0, 30.0],
    steps: [
      { id: 'module', state: 'ok', message: 'Phoenix module loaded' },
      { id: 'printer', state: 'ok', message: 'Printer configuration supported' },
      {
        id: 'hooks',
        state: 'needs_action',
        message: 'Rerun setup to connect macros, or add PHOENIX_START/PHOENIX_END in your slicer',
      },
      { id: 'park', state: 'needs_action', message: 'Choose a clear park point on an empty bed' },
      { id: 'test', state: 'manual', message: 'Verify recording on a small supervised test print' },
    ],
  }),
};
PHOENIX_FIXTURES.ready = { ...idleBase, setup: setup({ can_edit: true, can_use_current: true, can_jog: true }) };
// a print being recorded: the newest checkpoint is a few seconds old
PHOENIX_FIXTURES.recording = { ...base, phase: 'recording', recovery_available: false, reason: '' };
