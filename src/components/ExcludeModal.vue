<script setup>
// Exclude object dialog: pick an object on the bed map (ObjectMap) or in the list, confirm, and
// EXCLUDE_OBJECT is sent. The picked object turns red on the map and the question takes the list's place, so the
// map stays in view while confirming; pointing at a row lights its object up on the map and the other way round. Needs [exclude_object] in Klipper and labelled objects in the G-code.
// Excluding the last object that is still printing would leave nothing to print while the printer keeps running
// the file (heating, moving, only without plastic), so the dialog offers to cancel the print instead.
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import ObjectMap from './ObjectMap.vue';
import { state, S, gcode, cancelPrint } from '../store';
import { t } from '../i18n';
const emit = defineEmits(['close']);
// an object clicked in the G-code viewer arrives already picked
const pick = ref(state.excludePick || null);
const hot = ref(null); // object under the pointer, in the list or on the map
state.excludePick = null;
const skipText = computed(() => t('The printer will skip it for the rest of this print. This cannot be undone.'));
// the object picked is the only one left
const isLast = computed(() => {
  const eo = S('exclude_object');
  const left = (eo.objects || []).map((o) => o.name).filter((n) => !eo.excluded_objects?.includes(n));
  return !!pick.value && left.length === 1 && left[0] === pick.value;
});
function cancelInstead() {
  pick.value = null;
  emit('close');
  cancelPrint();
}
async function doExclude() {
  const n = pick.value;
  pick.value = null;
  await gcode(`EXCLUDE_OBJECT NAME="${n}"`).catch(() => {});
}
</script>
<template>
  <Modal :title="t('Exclude Object')" width="760px" @close="emit('close')">
    <div v-if="!S('exclude_object').objects?.length" class="empty">
      {{ t('No objects defined in this print. Enable object labels in the slicer.') }}
    </div>
    <div v-else class="row" style="align-items: stretch; gap: 16px; flex-wrap: wrap">
      <ObjectMap
        style="flex: 1 1 360px; min-height: 340px"
        :marked="pick"
        :hot="hot"
        @pick="pick = $event"
        @hover="hot = $event"
      />
      <div v-if="pick" class="col ask">
        <b>{{ isLast ? t('Last object') : t('Exclude object?') }}</b>
        <span class="mono nm">{{ pick }}</span>
        <p v-if="isLast" class="mu">
          {{
            t(
              'This is the last object still printing. After excluding it the printer keeps running the file (heating and moving) without printing anything. Cancel the print instead?',
            )
          }}
        </p>
        <p v-else class="mu">{{ skipText }}</p>
        <div class="col" style="gap: 8px; margin-top: auto">
          <template v-if="isLast">
            <button class="btn lg dgf" @click="cancelInstead">{{ t('Cancel print') }}</button>
            <button class="btn lg" @click="doExclude">{{ t('Exclude only') }}</button>
            <button class="btn lg" @click="pick = null">{{ t('Back') }}</button>
          </template>
          <template v-else>
            <button class="btn lg dgf" @click="doExclude">{{ t('Exclude') }}</button>
            <button class="btn lg" @click="pick = null">{{ t('Cancel') }}</button>
          </template>
        </div>
      </div>
      <div v-else class="col" style="flex: 0 0 260px; gap: 4px; max-height: 420px; overflow: auto">
        <div
          v-for="o in S('exclude_object').objects"
          :key="o.name"
          class="row orow"
          :class="{ hot: hot === o.name }"
          @mouseenter="hot = o.name"
          @mouseleave="hot = null"
        >
          <span
            class="mono grow"
            :style="{
              fontSize: '12px',
              color: S('exclude_object').excluded_objects?.includes(o.name)
                ? 'var(--mu)'
                : o.name === S('exclude_object').current_object
                  ? 'var(--ac)'
                  : 'var(--tx)',
              textDecoration: S('exclude_object').excluded_objects?.includes(o.name) ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }"
            >{{ o.name }}</span
          >
          <span v-if="S('exclude_object').excluded_objects?.includes(o.name)" class="chip" style="color: var(--dg)"
            ><i></i>{{ t('Excluded') }}</span
          >
          <button v-else class="btn" @click="pick = o.name">{{ t('Exclude') }}</button>
        </div>
      </div>
    </div>
  </Modal>
</template>
<style scoped>
.orow {
  height: 40px;
  border-bottom: 1px solid var(--bd);
  padding: 0 6px;
  border-radius: 6px;
}
.orow.hot {
  background: var(--s2);
}
.ask {
  flex: 0 0 260px;
  gap: 10px;
  padding: 14px;
  border-radius: 10px;
  background: color-mix(in srgb, #e5484d 8%, var(--s2));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #e5484d 35%, transparent);
}
.ask .nm {
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.ask p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.mu {
  color: var(--mu);
}
</style>
