<script setup>
import { ref } from 'vue'
import Modal from './Modal.vue'
import ObjectMap from './ObjectMap.vue'
import { S, gcode } from '../store'
const emit = defineEmits(['close'])
const pick = ref(null)
async function doExclude() {
  const n = pick.value
  pick.value = null
  await gcode(`EXCLUDE_OBJECT NAME="${n}"`).catch(() => {})
}
</script>
<template>
  <Modal title="Exclude Object" width="760px" @close="emit('close')">
    <div v-if="!S('exclude_object').objects?.length" class="empty">No objects defined in this print. Enable object labels in the slicer.</div>
    <div v-else class="row" style="align-items:stretch;gap:16px;flex-wrap:wrap">
      <ObjectMap style="flex:1 1 360px;min-height:340px" @pick="pick = $event" />
      <div class="col" style="flex:0 0 260px;gap:4px;max-height:420px;overflow:auto">
        <div v-for="o in S('exclude_object').objects" :key="o.name" class="row" style="height:40px;border-bottom:1px solid var(--bd)">
          <span class="mono grow" :style="{ fontSize: '12px', color: S('exclude_object').excluded_objects?.includes(o.name) ? 'var(--mu)' : o.name === S('exclude_object').current_object ? 'var(--ac)' : 'var(--tx)', textDecoration: S('exclude_object').excluded_objects?.includes(o.name) ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">{{ o.name }}</span>
          <span v-if="S('exclude_object').excluded_objects?.includes(o.name)" class="chip" style="color:var(--dg)"><i></i>Excluded</span>
          <button v-else class="btn" @click="pick = o.name">Exclude</button>
        </div>
      </div>
    </div>
  </Modal>
  <Modal v-if="pick" title="Exclude object?" @close="pick = null">
    <p style="margin:0">The printer will skip <b class="mono">{{ pick }}</b> for the rest of this print. This can't be undone.</p>
    <template #foot><button class="btn lg" @click="pick = null">Cancel</button><button class="btn lg dgf" @click="doExclude">Exclude</button></template>
  </Modal>
</template>
