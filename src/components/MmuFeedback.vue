<script setup>
// Happy Hare sync feedback (a filament buffer between the MMU and the extruder) and FlowGuard, from printer.mmu:
//   sync_feedback_bias_modelled  -1 tension .. +1 compression: where the buffer sits (the slider)
//   sync_feedback_state          'compressed' | 'tension' | 'neutral' (or 'unavailable', 'inactive', 'disabled')
//   sync_feedback_flow_rate      estimated flow rate in % (proportional buffer sensors)
//   flowguard                    { level -1 tangle .. +1 clog, max_clog, max_tangle, active, enabled, trigger, reason }
// Shown only when the MMU reports a buffer or FlowGuard.
import { computed } from 'vue';
import { t } from '../i18n';
// part: 'buffer' = the slider (under the filament path, same width as its tube), 'gauges' = the two dials
const props = defineProps({ mmu: Object, part: { type: String, default: 'buffer' } });

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

const sfState = computed(() => props.mmu.sync_feedback_state);
const hasBuffer = computed(() => !!sfState.value && sfState.value !== 'unavailable');
const bias = computed(() => num(props.mmu.sync_feedback_bias_modelled) ?? num(props.mmu.sync_feedback_bias_raw));
const flow = computed(() => num(props.mmu.sync_feedback_flow_rate));
const fg = computed(() => props.mmu.flowguard || null);
const show = computed(() =>
  props.part === 'buffer' ? hasBuffer.value : (hasBuffer.value && flow.value != null) || !!fg.value,
);

// the slider: -1 (tension) on the left, +1 (compression) on the right
const biasPos = computed(() => ((clamp(bias.value ?? 0, -1, 1) + 1) / 2) * 100);
const biasCol = computed(() => {
  const a = Math.abs(bias.value ?? 0);
  return a >= 0.8 ? 'var(--dg)' : a >= 0.5 ? 'var(--wn)' : 'var(--ok)';
});
const stateLbl = computed(
  () =>
    ({ compressed: t('Compression'), tension: t('Tension'), neutral: t('Neutral') })[sfState.value] ||
    (sfState.value === 'disabled' || sfState.value === 'inactive' ? t('Off') : ''),
);

// semicircle gauges: angle 180° (left) .. 0° (right), centre (30, 30), radius 24
const R = 24;
const pt = (f) => {
  const a = Math.PI * (1 - f); // f 0 = left end, 1 = right end
  return [30 + R * Math.cos(a), 30 - R * Math.sin(a)];
};
const arc = (f0, f1) => {
  if (f1 < f0) [f0, f1] = [f1, f0];
  if (f1 - f0 < 0.002) return '';
  const [x0, y0] = pt(f0),
    [x1, y1] = pt(f1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const TRACK = arc(0, 1);

const flowF = computed(() => clamp((flow.value ?? 0) / 100, 0, 1));
const flowCol = computed(() =>
  (flow.value ?? 0) >= 85 ? 'var(--ok)' : (flow.value ?? 0) >= 60 ? 'var(--wn)' : 'var(--dg)',
);

// FlowGuard: needle at the level, the band from the centre to it; ticks at the worst tangle and clog seen
const fgLevel = computed(() => clamp(num(fg.value?.level) ?? 0, -1, 1));
const fgF = computed(() => (fgLevel.value + 1) / 2);
const fgCol = computed(() => {
  const a = Math.abs(fgLevel.value);
  return a >= 0.7 ? 'var(--dg)' : a >= 0.35 ? 'var(--wn)' : 'var(--ok)';
});
const needle = computed(() => {
  const a = Math.PI * (1 - fgF.value);
  return [30 + (R - 7) * Math.cos(a), 30 - (R - 7) * Math.sin(a)];
});
const tick = (f) => {
  const a = Math.PI * (1 - f);
  const c = Math.cos(a),
    s = Math.sin(a);
  return `M${(30 + (R - 4) * c).toFixed(2)} ${(30 - (R - 4) * s).toFixed(2)} L${(30 + (R + 4) * c).toFixed(2)} ${(30 - (R + 4) * s).toFixed(2)}`;
};
const maxClog = computed(() => clamp(num(fg.value?.max_clog) ?? 0, 0, 1));
const maxTangle = computed(() => clamp(num(fg.value?.max_tangle) ?? 0, -1, 0));
const fgOn = computed(() => !!fg.value?.enabled);
const fgTrip = computed(() => fg.value?.trigger || '');
const fgLbl = computed(() =>
  fgTrip.value
    ? fgTrip.value === 'clog'
      ? t('Clog')
      : fgTrip.value === 'tangle'
        ? t('Tangle')
        : fgTrip.value
    : !fgOn.value
      ? t('Off')
      : fg.value?.active
        ? t('Watching')
        : t('Standby'),
);
</script>

<template>
  <div v-if="show && part === 'buffer'" class="buf" :data-tip="t('Filament buffer between the MMU and the extruder')">
    <div class="bh">
      <span class="lbl">{{ t('Buffer') }}</span>
      <span class="mono val" :style="{ color: biasCol }"
        >{{ bias == null ? '—' : (bias > 0 ? '+' : '') + bias.toFixed(2) }}
        <small v-if="stateLbl" class="mu">{{ stateLbl }}</small></span
      >
    </div>
    <div class="rail">
      <i class="mid"></i>
      <i class="knob" :style="{ left: biasPos + '%', borderColor: biasCol }"></i>
    </div>
    <div class="ends mu">
      <span>{{ t('Tension') }}</span
      ><span>{{ t('Compression') }}</span>
    </div>
  </div>
  <div v-else-if="show" class="gs">
    <div v-if="hasBuffer && flow != null" class="g" :data-tip="t('Estimated flow rate from the buffer')">
      <svg viewBox="0 0 60 38">
        <path :d="TRACK" class="trk" />
        <path :d="arc(0, flowF)" class="val" :style="{ stroke: flowCol }" />
        <text x="30" y="31" class="num">{{ Math.round(flow) }}%</text>
      </svg>
      <span class="gl">{{ t('Flowrate') }}</span>
    </div>
    <div v-if="fg" class="g" :class="{ off: !fgOn }" :data-tip="fg.reason || t('FlowGuard: clog and tangle detection')">
      <svg viewBox="0 0 60 38">
        <path :d="TRACK" class="trk" />
        <path v-if="fgOn" :d="arc(0.5, fgF)" class="val" :style="{ stroke: fgCol }" />
        <path v-if="fgOn && maxTangle < 0" :d="tick((maxTangle + 1) / 2)" class="tk" />
        <path v-if="fgOn && maxClog > 0" :d="tick((maxClog + 1) / 2)" class="tk" />
        <line v-if="fgOn" x1="30" y1="30" :x2="needle[0]" :y2="needle[1]" class="ndl" />
        <circle cx="30" cy="30" r="2.2" class="hub" />
        <text x="5" y="37" class="end">{{ t('Tangle') }}</text>
        <text x="55" y="37" class="end r">{{ t('Clog') }}</text>
      </svg>
      <span class="gl" :style="{ color: fgTrip ? 'var(--dg)' : null }">FlowGuard · {{ fgLbl }}</span>
    </div>
  </div>
</template>

<style scoped>
/* same left and right inset as the filament path's tube (MmuPath .tube), so the two lines are equally long */
.buf {
  padding: 0 5% 0 8%;
}
.bh {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.lbl {
  font-size: 11px;
  color: var(--mu);
}
.val {
  font-size: 13px;
  font-weight: 600;
}
.val small {
  font-weight: 400;
  font-size: 11px;
  margin-left: 4px;
}
.rail {
  position: relative;
  height: 8px;
  margin: 7px 0 4px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--dg) 45%, var(--s3)),
    var(--s3) 30%,
    var(--s3) 70%,
    color-mix(in srgb, var(--dg) 45%, var(--s3))
  );
}
.rail i {
  position: absolute;
  display: block;
}
.mid {
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: var(--mu2, var(--mu));
  opacity: 0.6;
}
.knob {
  top: 50%;
  width: 12px;
  height: 16px;
  border-radius: 4px;
  border: 2px solid var(--ok);
  background: var(--s2);
  transform: translate(-50%, -50%);
  transition: left 0.4s ease;
}
.ends {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
}
.gs {
  display: flex;
  gap: 10px;
  flex: none;
}
.g {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 86px;
}
.g.off {
  opacity: 0.5;
}
.g svg {
  width: 86px;
  height: 54px;
  overflow: visible;
}
.trk,
.val,
.tk {
  fill: none;
  stroke-linecap: round;
}
.trk {
  stroke: var(--s3);
  stroke-width: 5;
}
.val {
  stroke-width: 5;
  transition: d 0.4s ease;
}
.tk {
  stroke: var(--mu);
  stroke-width: 1.2;
}
.ndl {
  stroke: var(--tx);
  stroke-width: 1.6;
  stroke-linecap: round;
}
.hub {
  fill: var(--tx);
}
.num {
  fill: var(--tx);
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
}
.end {
  fill: var(--mu);
  font-size: 5.5px;
  text-anchor: start;
}
.end.r {
  text-anchor: end;
}
.gl {
  font-size: 10.5px;
  color: var(--mu);
  white-space: nowrap;
}
</style>
