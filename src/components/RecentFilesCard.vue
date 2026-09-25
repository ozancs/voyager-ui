<script setup>
import { ref, onMounted } from 'vue'
import Icon from './Icon.vue'
import { state, fmtTime, fmtDate, toast, isPrinting, useApiEvent } from '../store'
import { queueApi } from '../features'
import { api } from '../api/moonraker'
import { go } from '../router'
import { t } from '../i18n'

const files = ref([])
async function load() {
  try {
    const r = await api.call('server.files.list', { root: 'gcodes' })
    const top = r.filter((f) => /\.(gcode|g|gco|ufp)$/i.test(f.path)).sort((a, b) => b.modified - a.modified).slice(0, 12)
    files.value = top.map((f) => ({ ...f, meta: null }))
    for (const f of files.value) api.call('server.files.metadata', { filename: f.path }).then((m) => (f.meta = m)).catch(() => {})
  } catch {}
}
onMounted(load)
let tm
useApiEvent('notify_filelist_changed', ([p]) => { if (p?.item?.root === 'gcodes') { clearTimeout(tm); tm = setTimeout(load, 500) } })
function thumb(f) {
  const th = (f.meta?.thumbnails || []).sort((a, b) => a.width - b.width).find((x) => x.width >= 32)
  if (!th) return null
  const dir = f.path.split('/').slice(0, -1).join('/')
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + th.relative_path)
}
const print = (f) => api.call('printer.print.start', { filename: f.path }).then(() => toast(t('Print started'))).catch((e) => toast(e.message, 'error'))
</script>

<template>
  <section class="card">
    <div class="card-h"><h2>{{ t('Recent files') }}</h2><button class="btn clear" @click="go('files')">{{ t('All files') }}</button></div>
    <div class="list">
      <div v-for="f in files" :key="f.path" class="fr">
        <div class="th"><img v-if="thumb(f)" :src="thumb(f)" alt="" loading="lazy" /><Icon v-else name="cube" :size="18" :stroke="1.8" /></div>
        <div class="col grow" style="gap:1px;min-width:0"><b class="fn">{{ f.path.split('/').pop() }}</b><span class="mono mu">{{ fmtTime(f.meta?.estimated_time) }} · {{ fmtDate(f.modified) }}</span></div>
        <button v-if="state.queue.enabled" class="btn ibtn sm" :aria-label="t('Add to queue')" @click="queueApi.add([f.path])"><Icon name="queue" :size="15" /></button>
        <button class="btn acc ibtn sm" :aria-label="t('Print')" :disabled="isPrinting" @click="print(f)"><Icon name="play" :size="15" :stroke="2.4" /></button>
      </div>
      <div v-if="!files.length" class="empty">{{ t('No G-code files yet') }}</div>
    </div>
  </section>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; flex: 1; }
.fr { display: flex; align-items: center; gap: 10px; padding: 4px; border-radius: 10px; }
.fr:hover { background: var(--s2); }
.th { width: 40px; height: 40px; border-radius: 8px; background: var(--s2); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; flex-shrink: 0; }
.th img { width: 100%; height: 100%; object-fit: contain; }
.fn { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu { color: var(--mu); font-size: 11.5px; }
</style>
