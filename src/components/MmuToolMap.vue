<script setup>
// Happy Hare tool-to-gate map: which gate each T command loads from, as the slicer sees it. Edited in place and
// sent as one MMU_TTG_MAP MAP=... command; Reset puts T0=gate 0, T1=gate 1 and so on back. Endless spool: when a
// gate runs out, Happy Hare continues from the next gate in the same group.
import { ref, computed, watch } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import { S, gcode, toast, isPrinting } from '../store';
import { t } from '../i18n';
const emit = defineEmits(['close']);
const m = computed(() => S('mmu'));
const n = computed(() => m.value.num_gates || (m.value.gate_status || []).length);
const cur = computed(() => (m.value.ttg_map || []).slice(0, n.value));
const map = ref([...cur.value]);
watch(cur, (v) => (map.value = [...v]), { deep: true });
const changed = computed(() => map.value.some((g, i) => g !== cur.value[i]));
const groups = computed(() => m.value.endless_spool_groups || []);
const rgb = (c) => {
  if (!c) return null;
  if (Array.isArray(c))
    return `rgb(${c
      .slice(0, 3)
      .map((x) => Math.round(x * 255))
      .join(',')})`;
  const s = String(c).replace(/^#/, '');
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? '#' + s.slice(0, 6) : c;
};
const gate = (g) => ({
  color: rgb(m.value.gate_color_rgb?.[g]) || rgb(m.value.gate_color?.[g]),
  material: m.value.gate_material?.[g] || '',
  name: m.value.gate_name?.[g] || '',
  status: m.value.gate_status?.[g] ?? -1,
});
const busy = ref(false);
async function apply() {
  busy.value = true;
  try {
    await gcode(`MMU_TTG_MAP MAP=${map.value.join(',')}`);
  } catch (e) {
    toast(e.message, 'error');
  }
  busy.value = false;
}
async function reset() {
  busy.value = true;
  try {
    await gcode('MMU_TTG_MAP RESET=1');
  } catch (e) {
    toast(e.message, 'error');
  }
  busy.value = false;
}
async function endless(on) {
  try {
    await gcode(`MMU_ENDLESS_SPOOL ENABLE=${on ? 1 : 0}`);
  } catch (e) {
    toast(e.message, 'error');
  }
}
// the gates in the same endless spool group as this gate, in the order Happy Hare would use them
const sameGroup = (g) =>
  groups.value.length
    ? groups.value.map((grp, i) => (grp === groups.value[g] && i !== g ? i : null)).filter((x) => x != null)
    : [];
</script>
<template>
  <Modal :title="t('Tool map')" width="560px" @close="emit('close')">
    <div class="tm">
      <p class="mu hint">
        {{
          t(
            'Each tool (T0, T1…) in the sliced file loads from the gate set here. Swap gates to print a file with filament that sits in another gate, without reslicing.',
          )
        }}
      </p>
      <div class="rows">
        <div v-for="(g, tool) in map" :key="tool" class="tr" :class="{ ch: g !== cur[tool] }">
          <b class="tool">T{{ tool }}</b>
          <Icon name="right" :size="14" class="mu" />
          <div class="sel">
            <button
              v-for="k in n"
              :key="k - 1"
              class="g"
              :class="{ on: map[tool] === k - 1, gempty: gate(k - 1).status === 0 }"
              :title="gate(k - 1).name || gate(k - 1).material || t('Gate {n}', { n: k - 1 })"
              @click="map[tool] = k - 1"
            >
              <span
                class="sw"
                :style="{ background: gate(k - 1).color || 'transparent' }"
                :class="{ none: !gate(k - 1).color }"
              ></span
              >{{ k - 1 }}
            </button>
          </div>
          <span class="mu mat">{{ gate(g).material || '—' }}</span>
        </div>
      </div>
      <div class="row" style="justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <button class="btn" :disabled="busy || isPrinting" @click="reset">
          <Icon name="refresh" :size="14" />{{ t('Reset (T0 = gate 0 …)') }}
        </button>
        <button class="btn acc" :disabled="!changed || busy || isPrinting" @click="apply">
          <Icon name="check" :size="14" />{{ t('Apply map') }}
        </button>
      </div>
      <span v-if="isPrinting" class="mu hint">{{ t('Not while printing') }}</span>

      <div v-if="'endless_spool' in m" class="es">
        <label class="rw">
          <span class="col" style="gap: 2px">
            <b>{{ t('Endless spool') }}</b>
            <span class="mu hint">{{ t('When a gate runs out, continue from the next gate in its group.') }}</span>
          </span>
          <Toggle :model-value="!!m.endless_spool" :label="t('Endless spool')" @update:model-value="endless" />
        </label>
        <div v-if="groups.length" class="grps mono">
          <span v-for="(grp, g) in groups" :key="g" class="gg" :title="t('Gate {n}', { n: g })">
            <span
              class="sw"
              :style="{ background: gate(g).color || 'transparent' }"
              :class="{ none: !gate(g).color }"
            ></span
            >{{ g }}
            <template v-if="sameGroup(g).length"> → {{ sameGroup(g).join(', ') }}</template>
          </span>
        </div>
        <span class="mu hint">{{ t('Groups are set in mmu_vars.cfg (endless_spool_groups).') }}</span>
      </div>
    </div>
  </Modal>
</template>
<style scoped>
.tm {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hint {
  font-size: 12px;
  margin: 0;
}
.mu {
  color: var(--mu);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--s2);
}
.tr.ch {
  outline: 1px solid var(--ac);
}
.tool {
  width: 28px;
  font-size: 13px;
}
.sel {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}
.g {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: var(--s3);
  color: var(--mu);
  font-size: 12px;
  font-weight: 600;
}
.g.on {
  color: var(--tx);
  border-color: var(--ac);
}
.g.gempty {
  opacity: 0.55;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.sw.none {
  border: 1px dashed var(--mu2);
}
.mat {
  font-size: 12px;
  width: 52px;
  text-align: right;
}
.es {
  border-top: 1px solid var(--bd);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rw {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.grps {
  display: flex;
  gap: 6px 14px;
  flex-wrap: wrap;
  font-size: 12px;
}
.gg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
