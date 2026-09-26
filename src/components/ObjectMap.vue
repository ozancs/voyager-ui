<script setup>
import { computed } from 'vue';
import { S } from '../store';
import { t } from '../i18n';
const emit = defineEmits(['pick']);
const bed = computed(() => {
  const t = S('toolhead');
  const min = t.axis_minimum || [0, 0],
    max = t.axis_maximum || [300, 300];
  return { x0: min[0], y0: min[1], w: max[0] - min[0], h: max[1] - min[1] };
});
const objs = computed(() => {
  const eo = S('exclude_object');
  return (eo.objects || []).map((o) => ({
    name: o.name,
    pts: (o.polygon || []).map(([x, y]) => `${x - bed.value.x0},${bed.value.h - (y - bed.value.y0)}`).join(' '),
    c: o.center ? [o.center[0] - bed.value.x0, bed.value.h - (o.center[1] - bed.value.y0)] : null,
    excluded: eo.excluded_objects?.includes(o.name),
    current: eo.current_object === o.name,
  }));
});
const pos = computed(() => {
  const p = S('toolhead').position;
  return p ? [p[0] - bed.value.x0, bed.value.h - (p[1] - bed.value.y0)] : null;
});
</script>
<template>
  <svg
    :viewBox="`-4 -4 ${bed.w + 8} ${bed.h + 8}`"
    preserveAspectRatio="xMidYMid meet"
    style="background: #0b0c0e; border-radius: 8px; width: 100%; height: 100%"
    :aria-label="t('Objects on bed')"
  >
    <rect
      x="0"
      y="0"
      :width="bed.w"
      :height="bed.h"
      fill="var(--plate)"
      stroke="var(--grid)"
      stroke-width="1.5"
      rx="4"
    />
    <g v-for="o in objs" :key="o.name" style="cursor: pointer" @click="!o.excluded && emit('pick', o.name)">
      <polygon
        v-if="o.pts"
        :points="o.pts"
        :fill="
          o.excluded
            ? 'rgba(229,72,77,.15)'
            : o.current
              ? 'color-mix(in srgb, var(--ac) 35%, transparent)'
              : 'color-mix(in srgb, var(--tx) 8%, transparent)'
        "
        :stroke="o.excluded ? '#e5484d' : o.current ? 'var(--ac)' : 'var(--mu)'"
        stroke-width="1.5"
      />
      <circle v-else-if="o.c" :cx="o.c[0]" :cy="o.c[1]" r="6" :fill="o.excluded ? '#e5484d' : 'var(--ac)'" />
      <title>{{ o.name }}</title>
    </g>
    <circle v-if="pos" :cx="pos[0]" :cy="pos[1]" r="3" fill="#fff" />
  </svg>
</template>
