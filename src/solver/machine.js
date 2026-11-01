// Problem Solver: machine and Klipper problems (problems.js has the print ones). A Klipper error entry has `match`,
// the error text it stands for: a pasted error finds it, and an error seen on the printer opens it with the message
// as evidence. The host and board facts come from systemToday() in facts.js. Klipper errors this file does not
// cover in depth still get a guide from the error explanations (explain.js), added in problems.js.

const has = (v) => v != null && v !== '';
const pick = (...xs) => xs.filter(Boolean);
const err = (f) => f.error && ['error', f.error.split('\n')[0].slice(0, 160)];
const linkErrors = (f) =>
  (f.sys?.mcus || [])
    .filter((m) => m.retrans > 0 || m.invalid > 0)
    .map((m) => ['today', `${m.name}: ${m.retrans ?? 0} bytes resent, ${m.invalid ?? 0} invalid`]);
const oldFw = (f) => (f.sys?.mcus || []).filter((m) => m.old);

export const MACHINE = [
  // ------------------------------------------------------------------ Klipper: timer too close
  {
    id: 'k_timer',
    kind: 'klipper',
    icon: 'clock',
    name: 'Timer too close',
    desc: 'Klipper stopped: the host or a board could not keep up',
    words: ['timer too close', 'rescheduled timer', 'stepper too far in past', 'mcu shutdown', 'zamanlayıcı'],
    match: /Timer too close|Rescheduled timer in the past|Stepper too far in past|Missed scheduling of next/i,
    questions: [
      {
        id: 'when',
        q: 'When does it happen?',
        opts: [
          { v: 'fast', label: 'During fast moves or the start of a print' },
          { v: 'cam', label: 'When the webcam or the interface is open' },
          { v: 'random', label: 'At random times' },
        ],
      },
    ],
    causes: [
      {
        id: 'load',
        title: 'The Raspberry Pi is overloaded or throttled',
        why: 'Klipper needs the host to send steps on time; a busy, hot or underpowered Pi falls behind.',
        score: ({ a, f }) =>
          f.sys.throttledNow || f.sys.underVoltage ? 3 : a.when === 'cam' ? 3 : f.sys.load > 2 ? 2 : 1,
        evidence: ({ a, f }) =>
          pick(
            err(f),
            a.when === 'cam' && ['answer', 'When the webcam or the interface is open'],
            has(f.sys.load) && ['today', `Host load ${f.sys.load.toFixed(2)}`],
            f.sys.underVoltage && ['today', 'The Pi reports under-voltage right now'],
            !f.sys.underVoltage && f.sys.underVoltageEver && ['today', 'The Pi had under-voltage since it started'],
            f.sys.throttledNow && ['today', 'The Pi is throttled right now'],
          ),
        missing: ({ f }) => (f.sys.throttledNow == null ? ['Throttling state of the Pi'] : []),
        test: {
          label: 'Check host load and power on the Health page',
          how: 'Lower the webcam resolution or frame rate, close other programs, and use a proper power supply.',
          page: 'health',
          change: 'Change only the webcam settings first.',
        },
      },
      {
        id: 'bus',
        title: 'A busy or noisy USB or CAN link',
        why: 'Resent or broken messages on the link delay the step timing until Klipper gives up.',
        score: ({ f }) => (linkErrors(f).length ? 3 : 1),
        evidence: ({ f }) => pick(err(f), ...linkErrors(f)),
        missing: ({ f }) => (linkErrors(f).length ? [] : ['Link errors at the moment it happened']),
        test: {
          label: 'Check the cables and the link on the Health page',
          how: 'A shielded USB cable away from motor wires; for CAN, 120 Ω termination at both ends and one bitrate.',
          page: 'health',
          change: 'Change only the cable or the termination.',
        },
      },
      {
        id: 'micro',
        title: 'Too many steps per second',
        why: 'High microsteps at high speed ask a board for more steps than it can schedule.',
        score: ({ a }) => (a.when === 'fast' ? 2 : 0),
        evidence: ({ f }) => pick(err(f), ['answer', 'During fast moves']),
        test: {
          label: 'Lower microsteps or the top speed',
          how: 'For example 16 instead of 64 microsteps, or a lower max_velocity, then try the same print.',
          change: 'Change only the microsteps.',
        },
      },
      {
        id: 'fw',
        title: 'Board firmware older than Klipper',
        why: 'An old firmware can time things differently from what the host expects.',
        score: ({ f }) => (oldFw(f).length ? 2 : 0),
        evidence: ({ f }) => oldFw(f).map((m) => ['today', `${m.name} firmware ${m.ver}`]),
        test: {
          label: 'Flash the boards with the current Klipper',
          how: 'The Machine page shows which boards are behind.',
          page: 'machine',
          change: 'Change only the firmware.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: lost communication
  {
    id: 'k_lost',
    kind: 'klipper',
    icon: 'plug',
    name: 'Lost communication with MCU',
    desc: 'A board stopped answering',
    words: [
      'lost communication',
      'mcu disconnect',
      'serial connection closed',
      'can bus',
      'bağlantı koptu',
      'kart cevap vermiyor',
    ],
    match:
      /Lost communication with MCU|Serial connection closed|Timeout on connect|Unable to connect|Unable to open (serial|CAN)/i,
    questions: [
      {
        id: 'when',
        q: 'When does it happen?',
        opts: [
          { v: 'move', label: 'When the toolhead moves or a cable bends' },
          { v: 'heat', label: 'When heaters or motors switch on' },
          { v: 'start', label: 'Right at start, it never connects' },
        ],
      },
    ],
    causes: [
      {
        id: 'cable',
        title: 'A loose or damaged cable',
        why: 'A connector that moves or a cable broken inside drops the link when it flexes.',
        score: ({ a }) => (a.when === 'move' ? 3 : 1),
        evidence: ({ a, f }) =>
          pick(err(f), a.when === 'move' && ['answer', 'When the toolhead moves'], ...linkErrors(f)),
        test: {
          label: 'Reseat and check the cable',
          how: 'Move the toolhead by hand while watching the link errors on the Health page.',
          page: 'health',
          change: 'Change only the cable.',
        },
      },
      {
        id: 'power',
        title: 'A dip in power',
        why: 'When heaters or motors switch on, a weak supply or a shared ground can reset a board.',
        score: ({ a, f }) => (a.when === 'heat' ? 3 : f.sys.underVoltage || f.sys.underVoltageEver ? 2 : 0),
        evidence: ({ a, f }) =>
          pick(
            err(f),
            a.when === 'heat' && ['answer', 'When heaters or motors switch on'],
            (f.sys.underVoltage || f.sys.underVoltageEver) && ['today', 'The Pi had under-voltage since it started'],
          ),
        test: {
          label: 'Check the supply and grounds',
          how: 'Measure the board voltage while the bed heats; check the ground between the supply, the board and the Pi.',
          change: 'Change only the power wiring.',
        },
      },
      {
        id: 'id',
        title: 'The serial path or canbus_uuid does not match',
        why: 'If the board never connects, the config points at the wrong device.',
        score: ({ a }) => (a.when === 'start' ? 3 : 0),
        evidence: ({ f }) =>
          pick(err(f), ...f.sys.mcus.filter((m) => m.can).map((m) => ['today', `${m.name} uses CAN`])),
        test: {
          label: 'Check the board ID',
          how: 'ls /dev/serial/by-id for USB, or the CAN query, and compare with [mcu] in the config.',
          page: 'config',
          change: 'Change only the [mcu] serial or canbus_uuid.',
        },
      },
      {
        id: 'canterm',
        title: 'CAN termination or bitrate',
        why: 'Without 120 Ω at both ends, or with different bitrates, CAN messages break up under load.',
        score: ({ f }) => (f.sys.mcus.some((m) => m.can) ? 2 : 0),
        evidence: ({ f }) =>
          pick(err(f), ...f.sys.mcus.filter((m) => m.can).map((m) => ['today', `${m.name} uses CAN`])),
        test: {
          label: 'Check the CAN termination',
          how: 'About 60 Ω between CAN-H and CAN-L with the power off means both ends are terminated.',
          change: 'Change only the termination.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: ADC out of range
  {
    id: 'k_adc',
    kind: 'klipper',
    icon: 'thermo',
    name: 'ADC out of range',
    desc: 'A temperature reading is impossible',
    words: ['adc out of range', 'thermistor', 'temperature error', 'termistör', 'sıcaklık hatası'],
    match: /ADC out of range/i,
    questions: [
      {
        id: 'read',
        q: 'What did the temperature do just before?',
        opts: [
          { v: 'jump', label: 'Jumped to a very high or low value' },
          { v: 'cold', label: 'The room is cold, it happened at power on' },
          { v: 'unsure', label: 'Not sure' },
        ],
      },
    ],
    causes: [
      {
        id: 'wire',
        title: 'Loose, broken or shorted thermistor wire',
        why: 'A wire that opens reads far below zero, a short reads far above max_temp.',
        score: ({ a }) => (a.read === 'cold' ? 1 : 3),
        evidence: ({ a, f }) => pick(err(f), a.read === 'jump' && ['answer', 'The reading jumped']),
        test: {
          label: 'Check the thermistor connector and wire',
          how: 'Watch the temperature graph while moving the wire; a jump shows where it breaks.',
          page: 'dashboard',
          change: 'Change only the thermistor wiring.',
        },
      },
      {
        id: 'min',
        title: 'min_temp above the room temperature',
        why: 'In a cold room a heater can read below min_temp at power on.',
        score: ({ a }) => (a.read === 'cold' ? 3 : 0),
        evidence: () => [['answer', 'The room is cold']],
        test: {
          label: 'Lower min_temp to about 0',
          how: 'In the heater section of the config.',
          page: 'config',
          change: 'Change only min_temp.',
        },
      },
      {
        id: 'type',
        title: 'Wrong sensor_type',
        why: 'A sensor_type that does not match the thermistor reads far off.',
        score: () => 1,
        evidence: ({ f }) =>
          pick(
            has(f.sys.extruder.sensor) && ['today', `Hotend sensor_type ${f.sys.extruder.sensor}`],
            has(f.sys.bed.sensor) && ['today', `Bed sensor_type ${f.sys.bed.sensor}`],
          ),
        test: {
          label: 'Compare sensor_type with the thermistor',
          how: 'The hotend or bed documentation names the thermistor.',
          page: 'config',
          change: 'Change only sensor_type.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: verify_heater
  {
    id: 'k_heat',
    kind: 'klipper',
    icon: 'flame',
    name: 'Heater not heating at expected rate',
    desc: 'verify_heater stopped Klipper',
    words: ['heater not heating', 'verify_heater', 'thermal runaway', 'ısıtıcı ısınmıyor', 'termal kaçak'],
    match: /not heating at expected rate/i,
    questions: [
      {
        id: 'when',
        q: 'When did it happen?',
        opts: [
          { v: 'heat', label: 'While heating up' },
          { v: 'fan', label: 'While printing, when the part fan was on' },
        ],
      },
    ],
    causes: [
      {
        id: 'therm',
        title: 'Thermistor slipped out of the block',
        why: 'A thermistor that is not in the block reads too slowly, so Klipper thinks the heater fails.',
        score: ({ a }) => (a.when === 'heat' ? 3 : 1),
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Check the thermistor and heater are tight',
          how: 'With the printer off and cold: thermistor fully in, its screw tight, heater cartridge screw tight.',
          change: 'Change only the mounting.',
        },
      },
      {
        id: 'cool',
        title: 'Fan air on the heater block',
        why: 'Part cooling hitting the bare block pulls the temperature down faster than the heater adds.',
        score: ({ a }) => (a.when === 'fan' ? 3 : 0),
        evidence: () => [['answer', 'When the part fan was on']],
        test: {
          label: 'Fit a silicone sock, then tune PID with the fan on',
          how: 'PID tuning with the part fan running gives settings that hold against the airflow.',
          calib: 'pid_extruder',
          change: 'Change only the sock first.',
        },
      },
      {
        id: 'pid',
        title: 'Heater control not tuned',
        why: 'Untuned PID can undershoot long enough to trip the check.',
        score: () => 1,
        evidence: ({ f }) => pick(has(f.sys.extruder.control) && ['today', `Hotend control ${f.sys.extruder.control}`]),
        test: {
          label: 'Run PID tuning',
          how: 'At the temperature you print with.',
          calib: 'pid_extruder',
          change: 'Change only the PID values.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: TMC errors
  {
    id: 'k_tmc',
    kind: 'klipper',
    icon: 'motor',
    name: 'TMC driver error',
    desc: 'A stepper driver reported a problem',
    words: ['tmc error', 'driver error', 'otpw', 'uv_cp', 'stepper driver', 'sürücü hatası'],
    match: /TMC '?[\w ]+'? reports error|Unable to read tmc|Unable to write tmc/i,
    questions: [],
    causes: [
      {
        id: 'hot',
        title: 'The driver overheated',
        why: 'ot / otpw flags mean the driver got too hot: too much current or no cooling.',
        score: ({ f }) => (/\bot(pw)?\b|ot=1|otpw=1/i.test(f.error) ? 3 : 1),
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Cool the drivers or lower run_current',
          how: 'A fan over the drivers, or run_current a little lower (about 70–85% of the motor rating).',
          change: 'Change only the cooling or the current.',
        },
      },
      {
        id: 'uv',
        title: 'Driver power dropped',
        why: 'uv_cp, or a reset flag, means the driver lost its motor supply for a moment.',
        score: ({ f }) => (/uv_cp|reset/i.test(f.error) ? 3 : 1),
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Check the motor power supply and its wiring',
          how: 'Supply connectors, fuse and the board power input.',
          change: 'Change only the power wiring.',
        },
      },
      {
        id: 'short',
        title: 'Short or bad motor wire',
        why: 's2ga / s2gb / s2vs flags mean a short in the motor wires or the motor.',
        score: ({ f }) => (/s2g|s2vs|ola|olb/i.test(f.error) ? 3 : 0),
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Check the motor cable and connector',
          how: 'With power off, check for pinched wires and swap the motor to another driver to see if it follows.',
          change: 'Change only the cable.',
        },
      },
      {
        id: 'comm',
        title: 'The driver does not answer',
        why: '"Unable to read tmc" means the UART or SPI line to the driver is wrong or the driver has no power.',
        score: ({ f }) => (/Unable to (read|write) tmc/i.test(f.error) ? 3 : 0),
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Check uart_pin / cs_pin and motor power',
          how: 'The pins in the tmc section must match the board; the driver needs motor power to answer.',
          page: 'config',
          change: 'Change only the pin setting.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: probe errors
  {
    id: 'k_probe',
    kind: 'klipper',
    icon: 'target',
    name: 'Probe did not trigger as expected',
    desc: 'Probe triggered before moving, or never triggered',
    words: ['probe triggered prior to movement', 'no trigger on probe', 'probe error', 'prob hatası'],
    match: /Probe triggered prior to movement|No trigger on probe after full movement/i,
    questions: [],
    causes: [
      {
        id: 'state',
        title: 'The probe was already triggered',
        why: 'A probe that is not deployed, dirty or wired the wrong way round reads triggered before moving.',
        score: ({ f }) => (/prior to movement/i.test(f.error) ? 3 : 0),
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Run QUERY_PROBE with the probe free',
          how: 'It should say open; if not, invert the pin (! in the config) or check the wiring.',
          page: 'console',
          change: 'Change only the pin setting.',
        },
      },
      {
        id: 'never',
        title: 'The probe never reached the bed',
        why: 'Started too high, a wrong z_offset or position, or a probe that does not react.',
        score: ({ f }) => (/No trigger/i.test(f.error) ? 3 : 0),
        evidence: ({ f }) =>
          pick(err(f), has(f.today.probeOffset) && ['today', `Probe z_offset ${f.today.probeOffset}`]),
        test: {
          label: 'Test the probe by hand',
          how: 'QUERY_PROBE while triggering it with a finger or metal; it must change state.',
          page: 'console',
          change: 'Change only the probe wiring or position.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: config error
  {
    id: 'k_config',
    kind: 'klipper',
    icon: 'code',
    name: 'Config error',
    desc: 'Klipper does not start because of the config',
    words: ['config error', 'is not valid in section', 'unable to parse option', 'config hatası', 'klipper başlamıyor'],
    match:
      /is not a valid config section|is not valid in section|Unable to parse option|must be specified|Option '.*' in section/i,
    questions: [],
    causes: [
      {
        id: 'opt',
        title: 'An option or section is misspelled or misplaced',
        why: 'The error names the option and the section; often a typo, an old name after an update, or an include in the wrong place.',
        score: () => 3,
        evidence: ({ f }) => pick(err(f)),
        test: {
          label: 'Open the config at that option',
          how: 'Search the option name with Ctrl+K; the Klipper docs list the current names.',
          page: 'config',
          change: 'Change only that option, then restart.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ Klipper: firmware mismatch
  {
    id: 'k_fw',
    kind: 'klipper',
    icon: 'chip',
    name: 'Board firmware does not match Klipper',
    desc: 'Command format mismatch or protocol error',
    words: ['command format mismatch', 'protocol error', 'firmware out of date', 'firmware', 'flash'],
    match: /Command format mismatch|MCU Protocol error|mcu '.*': Unable to .* protocol|is out of date/i,
    questions: [],
    causes: [
      {
        id: 'flash',
        title: 'Klipper was updated, the board firmware was not',
        why: 'After an update the host and the boards must run the same Klipper version.',
        score: () => 3,
        evidence: ({ f }) => pick(err(f), ...oldFw(f).map((m) => ['today', `${m.name} firmware ${m.ver}`])),
        test: {
          label: 'Flash the boards',
          how: 'Build the firmware with the same Klipper and flash each board the Machine page marks.',
          page: 'machine',
          change: 'Flash one board at a time.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ machine: grinding / skipping motors
  {
    id: 'm_skip',
    kind: 'machine',
    icon: 'motor',
    name: 'Grinding or clicking motors',
    desc: 'A motor buzzes, grinds or skips',
    words: [
      'grinding',
      'clicking',
      'skipping',
      'motor noise',
      'buzzing',
      'motor sesi',
      'takırtı',
      'tıkırtı',
      'adım kaçırma',
    ],
    questions: [
      {
        id: 'axis',
        q: 'Which motor?',
        opts: [
          { v: 'xy', label: 'X or Y' },
          { v: 'z', label: 'Z' },
          { v: 'e', label: 'Extruder' },
        ],
      },
      {
        id: 'when',
        q: 'When?',
        when: (a) => a.axis !== 'e',
        opts: [
          { v: 'home', label: 'While homing' },
          { v: 'fast', label: 'On fast moves' },
          { v: 'always', label: 'On every move' },
        ],
      },
    ],
    causes: [
      {
        id: 'ext',
        title: 'The extruder cannot push the filament',
        why: 'A clicking extruder skips because the nozzle cannot take the flow: clogged, too cold or too fast.',
        score: ({ a }) => (a.axis === 'e' ? 3 : 0),
        evidence: () => [['answer', 'The extruder clicks']],
        test: {
          label: 'Go through the under-extrusion guide',
          how: 'It checks flow, temperature and clogs.',
          problem: 'under',
          change: '',
        },
      },
      {
        id: 'sensorless',
        title: 'Sensorless homing sensitivity',
        why: 'With sensorless homing, a threshold set too low lets the motor bang against the end.',
        score: ({ a, f }) => (a.when === 'home' ? (f.sys.sensorless ? 3 : 1) : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'While homing'],
            f.sys.sensorless && ['today', 'Sensorless homing (virtual_endstop) is used'],
          ),
        test: {
          label: 'Raise driver_SGTHRS a little',
          how: 'Tune it per axis until homing stops at the first touch without false triggers.',
          page: 'config',
          change: 'Change only the threshold.',
        },
      },
      {
        id: 'accel',
        title: 'Moves faster than the motor can follow',
        why: 'Above the torque the motor has at speed, it skips and grinds.',
        score: ({ a }) => (a.when === 'fast' ? 3 : 0),
        evidence: ({ f }) =>
          pick(['answer', 'On fast moves'], has(f.today.maxAccel) && ['today', `max_accel ${f.today.maxAccel}`]),
        test: {
          label: 'Lower max_accel and max_velocity',
          how: 'By about a third, then try the same move.',
          page: 'config',
          change: 'Change only the acceleration.',
        },
      },
      {
        id: 'bind',
        title: 'Something binds',
        why: 'A tight belt, a dry or bent rail, or Z lead screws out of line make the motor work too hard.',
        score: ({ a }) => (a.when === 'always' ? 3 : a.axis === 'z' ? 2 : 1),
        evidence: ({ a }) =>
          pick(a.axis === 'z' && ['answer', 'On Z'], a.when === 'always' && ['answer', 'On every move']),
        test: {
          label: 'Move the axis by hand with the motors off',
          how: 'It should move evenly over the whole travel; feel for tight spots.',
          change: 'Fix only what binds.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ machine: probe accuracy
  {
    id: 'm_probe',
    kind: 'machine',
    icon: 'target',
    name: 'Probe readings vary',
    desc: 'Probe accuracy is poor, the mesh changes between runs',
    words: ['probe accuracy', 'inconsistent probe', 'probe range', 'repeatability', 'prob sapması', 'tutarsız prob'],
    questions: [
      {
        id: 'drift',
        q: 'Does it get worse as the printer warms up?',
        opts: [
          { v: 'yes', label: 'Yes' },
          { v: 'no', label: 'No, it varies the same cold or hot' },
        ],
      },
    ],
    causes: [
      {
        id: 'mount',
        title: 'Loose probe or toolhead parts',
        why: 'Any play in the probe mount or the toolhead shows up as spread in the readings.',
        score: ({ a }) => (a.drift === 'no' ? 3 : 1),
        evidence: ({ a }) => pick(a.drift === 'no' && ['answer', 'It varies the same cold or hot']),
        test: {
          label: 'Tighten the probe mount, then run Probe accuracy',
          how: 'A range under about 0.01 mm is good.',
          calib: 'accuracy',
          change: 'Change only the mount.',
        },
      },
      {
        id: 'temp',
        title: 'Temperature drift',
        why: 'Inductive and eddy probes read differently as they warm up.',
        score: ({ a }) => (a.drift === 'yes' ? 3 : 0),
        evidence: () => [['answer', 'Worse as the printer warms up']],
        test: {
          label: 'Heat soak before probing',
          how: 'Probe at printing temperature after 10–15 minutes, or use temperature compensation if the probe has it.',
          calib: 'accuracy',
          change: 'Change only the heat soak.',
        },
      },
      {
        id: 'speed',
        title: 'Probing too fast or one sample only',
        why: 'Slower probing and more samples reduce the spread.',
        score: () => 1,
        evidence: () => [],
        test: {
          label: 'Slower probing and samples: 3',
          how: 'In the probe section: speed 3–5 mm/s, samples 3 with a tolerance.',
          page: 'config',
          change: 'Change only the probe speed.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ machine: temperature
  {
    id: 'm_temp',
    kind: 'machine',
    icon: 'thermo',
    name: 'Temperature swings or never reaches target',
    desc: 'A heater overshoots, wanders or is too slow',
    words: [
      'temperature unstable',
      'temperature swing',
      'pid',
      'slow heating',
      'sıcaklık dalgalanıyor',
      'ısınmıyor',
      'yavaş ısınıyor',
    ],
    questions: [
      {
        id: 'which',
        q: 'Which heater?',
        opts: [
          { v: 'extruder', label: 'Hotend' },
          { v: 'heater_bed', label: 'Bed' },
        ],
      },
      {
        id: 'what',
        q: 'What does it do?',
        opts: [
          { v: 'swing', label: 'Swings up and down around the target' },
          { v: 'slow', label: 'Heats very slowly or stops short' },
          { v: 'fan', label: 'Drops when the part fan starts' },
        ],
      },
    ],
    causes: [
      {
        id: 'pid',
        title: 'PID not tuned for this heater',
        why: 'Default or old PID values overshoot and swing.',
        score: ({ a }) => (a.what === 'swing' ? 3 : 1),
        evidence: ({ a, f }) => {
          const h = a.which === 'heater_bed' ? f.sys.bed : f.sys.extruder;
          return pick(
            a.what === 'swing' && ['answer', 'It swings around the target'],
            has(h.control) && ['today', `control: ${h.control}`],
          );
        },
        test: {
          label: 'Run PID tuning',
          how: 'At the temperature you use most, and save the result.',
          calib: 'pid',
          change: 'Change only the PID values.',
        },
      },
      {
        id: 'power',
        title: 'Not enough heater power',
        why: 'A capped max_power, a weak heater or a supply voltage below the heater rating heats slowly.',
        score: ({ a, f }) => {
          const h = a.which === 'heater_bed' ? f.sys.bed : f.sys.extruder;
          return a.what === 'slow' ? (has(h.maxPower) && h.maxPower < 1 ? 3 : 2) : 0;
        },
        evidence: ({ a, f }) => {
          const h = a.which === 'heater_bed' ? f.sys.bed : f.sys.extruder;
          return pick(
            ['answer', 'Heats slowly or stops short'],
            has(h.maxPower) && h.maxPower < 1 && ['today', `max_power ${h.maxPower}`],
          );
        },
        test: {
          label: 'Check max_power and the heater rating',
          how: 'max_power 1.0 unless the heater needs a limit; a 24 V heater on 12 V has a quarter of its power.',
          page: 'config',
          change: 'Change only max_power.',
        },
      },
      {
        id: 'air',
        title: 'Air cooling the heater',
        why: 'Part cooling or a draft on the bare heater block pulls heat away.',
        score: ({ a }) => (a.what === 'fan' ? 3 : 0),
        evidence: () => [['answer', 'Drops when the part fan starts']],
        test: {
          label: 'Fit a silicone sock and tune PID with the fan on',
          how: 'The sock keeps the airflow off the block.',
          calib: 'pid',
          change: 'Change only the sock first.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ machine: fan
  {
    id: 'm_fan',
    kind: 'machine',
    icon: 'fan',
    name: 'A fan does not spin',
    desc: 'Part, hotend or another fan stays still',
    words: ['fan not spinning', 'fan not working', 'hotend fan', 'part fan', 'fan çalışmıyor', 'fan dönmüyor'],
    questions: [
      {
        id: 'which',
        q: 'Which fan?',
        opts: [
          { v: 'part', label: 'Part cooling fan' },
          { v: 'hotend', label: 'Hotend fan' },
          { v: 'other', label: 'Another fan' },
        ],
      },
      {
        id: 'low',
        q: 'Does it spin at 100%?',
        opts: [
          { v: 'yes', label: 'Yes, only low speeds fail' },
          { v: 'no', label: 'No, never' },
        ],
      },
    ],
    causes: [
      {
        id: 'auto',
        title: 'The hotend fan waits for heat',
        why: 'A heater_fan only starts above heater_temp (50° by default); that is normal when cold.',
        score: ({ a }) => (a.which === 'hotend' ? 2 : 0),
        evidence: () => [['answer', 'The hotend fan']],
        test: {
          label: 'Heat the hotend above 50° and check',
          how: 'If it still does not spin, it is wiring or the fan.',
          change: '',
        },
      },
      {
        id: 'kick',
        title: 'Too little power to start',
        why: 'Many fans do not start at low PWM; kick_start_time and off_below fix that.',
        score: ({ a }) => (a.low === 'yes' ? 3 : 0),
        evidence: () => [['answer', 'Only low speeds fail']],
        test: {
          label: 'Set kick_start_time and off_below',
          how: 'For example kick_start_time: 0.5 and off_below: 0.10 in the fan section.',
          page: 'config',
          change: 'Change only these two options.',
        },
      },
      {
        id: 'wire',
        title: 'Wiring, pin or a dead fan',
        why: 'A fan that never spins is not getting power: wrong pin, loose connector, a blown fan output or a dead fan.',
        score: ({ a }) => (a.low === 'no' ? 3 : 1),
        evidence: () => [['answer', 'It never spins']],
        test: {
          label: 'Set it to 100% from the dashboard and measure',
          how: 'The Devices card sets fans; with a meter, the connector should show the fan voltage.',
          page: 'dashboard',
          change: 'Change only the connector or pin.',
        },
      },
    ],
  },
  // ------------------------------------------------------------------ print: Z banding
  {
    id: 'zband',
    kind: 'print',
    icon: 'layers',
    name: 'Z banding',
    desc: 'Repeating horizontal lines on the walls',
    words: ['z banding', 'ribbing', 'horizontal lines', 'wobble', 'z wobble', 'katman çizgileri', 'yatay çizgiler'],
    questions: [
      {
        id: 'even',
        q: 'Are the lines evenly spaced?',
        opts: [
          { v: 'even', label: 'Yes, at a regular distance' },
          { v: 'uneven', label: 'No, here and there' },
        ],
      },
    ],
    causes: [
      {
        id: 'step',
        title: 'Layer height is not a multiple of the Z full step',
        why: 'Layers that fall between motor full steps alternate in height and show as fine regular lines.',
        score: ({ f }) => {
          const fs = f.sys.zFullStep;
          if (!fs || !has(f.file.layer)) return 0;
          const r = f.file.layer / fs;
          return Math.abs(r - Math.round(r)) > 0.01 ? 3 : 0;
        },
        evidence: ({ f }) => [
          ['file', `Layer height ${f.file.layer} mm`],
          ['today', `Z full step ${+f.sys.zFullStep.toFixed(4)} mm`],
        ],
        test: {
          label: 'Use a layer height that is a multiple of the full step',
          how: 'Pick the multiple nearest to what you use and slice again.',
          change: 'Change only the layer height.',
        },
      },
      {
        id: 'screw',
        title: 'Lead screw or Z coupling wobble',
        why: 'A bent screw or a loose coupler moves the bed or gantry once per turn, at a regular spacing.',
        score: ({ a }) => (a.even === 'even' ? 2 : 0),
        evidence: ({ f }) =>
          pick(
            ['answer', 'Evenly spaced lines'],
            f.sys.zFullStep && ['today', `Z moves ${+(f.sys.zFullStep * 200).toFixed(1)} mm per turn`],
          ),
        test: {
          label: 'Measure the line spacing',
          how: 'If it equals the Z travel per turn, check the screws, couplers and Z nut.',
          change: 'Change only the coupler or screw.',
        },
      },
      {
        id: 'bedpid',
        title: 'Bed temperature swinging',
        why: 'A bed that heats and cools in cycles changes its height a little each time.',
        score: ({ a }) => (a.even === 'uneven' ? 2 : 1),
        evidence: ({ f }) => pick(has(f.sys.bed.control) && ['today', `Bed control: ${f.sys.bed.control}`]),
        test: {
          label: 'Tune the bed PID',
          how: 'A watermark-controlled bed swings; PID holds it steady.',
          calib: 'pid_bed',
          change: 'Change only the bed control.',
        },
      },
    ],
  },
];
