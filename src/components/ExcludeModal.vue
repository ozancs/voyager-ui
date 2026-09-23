<script setup>
import { ref, computed } from 'vue'
import Modal from './Modal.vue'
import ObjectMap from './ObjectMap.vue'
import { S, gcode } from '../store'
import { t } from '../i18n'
const emit = defineEmits(['close'])
const pick = ref(null)
// split around {name} so the object name stays bold in any language
const skipMsg = computed(() => t("The printer will skip {name} for the rest of this print. This can't be undone.").split('{name}'))
async function doExclude() {
  const n = pick.value
  pick.value = null
  await gcode(`EXCLUDE_OBJECT NAME="${n}"`).catch(() => {})
}
</script>
<template>
  <Modal :title="t('Exclude Object')" width="760px" @close="emit('close')">
    <div v-if="!S('exclude_object').objects?.length" class="empty">{{ t('No objects defined in this print. Enable object labels in the slicer.') }}</div>
    <div v-else class="row" style="align-items:stretch;gap:16px;flex-wrap:wrap">
      <ObjectMap style="flex:1 1 360px;min-height:340px" @pick="pick = $event" />
      <div class="col" style="flex:0 0 260px;gap:4px;max-height:420px;overflow:auto">
        <div v-for="o in S('exclude_object').objects" :key="o.name" class="row" style="height:40px;border-bottom:1px solid var(--bd)">
          <span class="mono grow" :style="{ fontSize: '12px', color: S('exclude_object').excluded_objects?.includes(o.name) ? 'var(--mu)' : o.name === S('exclude_object').current_object ? 'var(--ac)' : 'var(--tx)', textDecoration: S('exclude_object').excluded_objects?.includes(o.name) ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">{{ o.name }}</span>
          <span v-if="S('exclude_object').excluded_objects?.includes(o.name)" class="chip" style="color:var(--dg)"><i></i>{{ t('Excluded') }}</span>
          <button v-else class="btn" @click="pick = o.name">{{ t('Exclude') }}</button>
        </div>
      </div>
    </div>
  </Modal>
  <Modal v-if="pick" :title="t('Exclude object?')" @close="pick = null">
    <p style="margin:0">{{ skipMsg[0] }}<b class="mono">{{ pick }}</b>{{ skipMsg[1] }}</p>
    <template #foot><button class="btn lg" @click="pick = null">{{ t('Cancel') }}</button><button class="btn lg dgf" @click="doExclude">{{ t('Exclude') }}</button></template>
  </Modal>
</template>
