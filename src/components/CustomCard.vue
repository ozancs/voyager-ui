<script setup>
// A card the user made in Customize: a single command button, a group of macro buttons or an extra
// webcam. Its settings live in state.settings.customCards[id]; the pencil opens the editor in Dashboard.vue.
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import WebcamCard from './WebcamCard.vue';
import { state, gcode } from '../store';
import { t } from '../i18n';
const props = defineProps({ id: String });
const emit = defineEmits(['edit']);
const c = computed(() => state.settings.customCards?.[props.id] || { type: 'btn', name: '?', icon: 'star', gcode: '' });
const busy = ref(null);
async function run(g, k) {
  if (state.editDash || !g) return;
  busy.value = k;
  try {
    await gcode(g);
  } catch {}
  busy.value = null;
}
</script>
<template>
  <section
    v-if="c.type === 'btn'"
    class="card cb"
    :class="{ hot: c.highlight, busy: busy === 'x' }"
    @click="run(c.gcode, 'x')"
    :data-tip="state.editDash ? '' : c.gcode"
  >
    <div class="card-h ch"></div>
    <div class="bi">
      <Icon :name="c.icon" :size="40" :stroke="2.2" :style="c.color && !c.highlight ? { color: c.color } : null" /><b>{{
        c.name
      }}</b>
    </div>
  </section>
  <WebcamCard v-else-if="c.type === 'cam'" :id="id" />
  <section v-else class="card">
    <div class="card-h">
      <h2>{{ c.name }}</h2>
    </div>
    <div class="mg">
      <button
        v-for="(b, k) in c.buttons || []"
        :key="k"
        class="mb"
        :class="{ hot: b.highlight, busy: busy === k }"
        :data-tip="b.gcode"
        @click="run(b.gcode, k)"
      >
        <Icon
          :name="b.icon || 'star'"
          :size="24"
          :stroke="2.4"
          :style="b.color && !b.highlight ? { color: b.color } : null"
        /><span>{{ b.name }}</span>
      </button>
      <div v-if="!(c.buttons || []).length" class="mu" style="font-size: 13px">
        {{ t('No buttons yet. Edit this card to add some.') }}
      </div>
    </div>
  </section>
</template>
<style scoped>
.cb {
  cursor: pointer;
  padding: 10px;
  gap: 0;
  transition: filter 0.12s;
}
.cb:hover {
  filter: brightness(1.15);
}
.cb.hot {
  background: var(--ac);
  border-color: var(--ac);
  color: var(--oa);
}
.cb.busy {
  opacity: 0.6;
}
.ch {
  min-height: 0;
  height: 24px;
}
.bi {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ac);
  text-align: center;
}
.cb.hot .bi {
  color: var(--oa);
}
.bi b {
  color: inherit;
  font-size: 15px;
}
.cb:not(.hot) .bi b {
  color: var(--tx);
}
.mg {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  grid-auto-rows: minmax(70px, 1fr);
  gap: 8px;
  overflow: auto;
}
.mb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--s2);
  border: 1px solid var(--bd);
  border-radius: 10px;
  font-weight: 700;
  font-size: 13px;
}
.mb :deep(svg) {
  color: var(--ac);
}
.mb:hover {
  filter: brightness(1.2);
}
.mb.hot {
  background: var(--ac);
  color: var(--oa);
  border-color: var(--ac);
}
.mb.hot :deep(svg) {
  color: var(--oa);
}
.mb.busy {
  opacity: 0.6;
}
.mu {
  color: var(--mu);
}
</style>
