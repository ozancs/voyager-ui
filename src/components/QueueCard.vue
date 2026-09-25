<script setup>
defineOptions({ inheritAttrs: false })
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { state, toast, fmtTime, isPrinting } from '../store'
import { queueApi, enableQueue, loadQueue } from '../features'
import { api } from '../api/moonraker'
import { t } from '../i18n'

const q = computed(() => state.queue)
const meta = ref({})
const busy = ref(false)
const askEnable = ref(false)
const picking = ref(false)
const pickList = ref([])
const pickQ = ref('')

// estimated time per queued file (metadata is cached)
async function metaFor(fn) {
  if (meta.value[fn] !== undefined) return
  meta.value[fn] = null
  try { const m = await api.call('server.files.metadata', { filename: fn }); meta.value = { ...meta.value, [fn]: m } } catch {}
}
const jobs = computed(() => { for (const j of q.value.jobs) metaFor(j.filename); return q.value.jobs })
const total = computed(() => jobs.value.reduce((a, j) => a + (meta.value[j.filename]?.estimated_time || 0), 0))
const run = (p) => { busy.value = true; Promise.resolve(p).catch((e) => toast(e.message, 'error')).finally(() => (busy.value = false)) }
async function enable() {
  askEnable.value = false
  try { await enableQueue(); setTimeout(loadQueue, 6000) } catch (e) { toast(e.message, 'error') }
}
async function openPicker() {
  picking.value = true
  try { const r = await api.call('server.files.list', { root: 'gcodes' }); pickList.value = r.filter((f) => /\.(gcode|g|gco|ufp)$/i.test(f.path)).sort((a, b) => b.modified - a.modified) } catch {}
}
const pickShown = computed(() => pickList.value.filter((f) => !pickQ.value || f.path.toLowerCase().includes(pickQ.value.toLowerCase())).slice(0, 80))
const thumb = (fn) => {
  const t = (meta.value[fn]?.thumbnails || []).sort((a, b) => a.width - b.width).find((t) => t.width >= 32)
  if (!t) return null
  const dir = fn.split('/').slice(0, -1).join('/')
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + t.relative_path)
}
</script>

<template>
  <section v-bind="$attrs" class="card qc">
    <div class="card-h">
      <h2>{{ t('Job queue') }}</h2>
      <div v-if="q.enabled" class="acts">
        <span class="chip" :style="{ color: q.state === 'ready' ? 'var(--ok)' : 'var(--wn)' }"><i></i>{{ q.state === 'ready' ? t('running') : t(q.state || '…') }}</span>
        <button class="btn ibtn sm" :aria-label="t('Add file to queue')" @click="openPicker"><Icon name="plus" :size="16" /></button>
      </div>
    </div>
    <template v-if="q.enabled === false">
      <p class="mu" style="margin:0">{{ t('The job queue is a Moonraker feature that prints files one after another. It is not turned on in moonraker.conf yet.') }}</p>
      <button class="btn acc" style="align-self:flex-start" @click="askEnable = true"><Icon name="queue" :size="16" />{{ t('Turn on job queue') }}</button>
    </template>
    <template v-else-if="q.enabled">
      <div class="list">
        <div v-for="(j, i) in jobs" :key="j.job_id" class="jr">
          <span class="n mono">{{ i + 1 }}</span>
          <div class="th"><img v-if="thumb(j.filename)" :src="thumb(j.filename)" alt="" /><Icon v-else name="cube" :size="18" :stroke="1.8" /></div>
          <div class="col grow" style="gap:0;min-width:0"><b class="fn">{{ j.filename.split('/').pop() }}</b><span class="mono mu" style="font-size:11.5px">{{ fmtTime(meta[j.filename]?.estimated_time) }}</span></div>
          <button v-if="i > 0" class="btn clear ibtn sm" :aria-label="t('Move to front')" :title="t('Print next')" @click="run(queueApi.jump(j.job_id))"><Icon name="jump" :size="15" /></button>
          <button class="btn clear ibtn sm" :aria-label="t('Remove from queue')" @click="run(queueApi.remove([j.job_id]))"><Icon name="x" :size="15" /></button>
        </div>
        <div v-if="!jobs.length" class="empty" style="padding:14px">{{ t('Queue is empty. Use + here or the queue button next to a file.') }}</div>
      </div>
      <div v-if="jobs.length" class="row">
        <span class="mono mu grow" style="font-size:12px">{{ t('{n} jobs · {time}', { n: jobs.length, time: fmtTime(total) }) }}</span>
        <button class="btn clear" :disabled="busy" @click="run(queueApi.clear())">{{ t('Clear') }}</button>
        <button v-if="q.state === 'ready'" class="btn" :disabled="busy" @click="run(queueApi.pause())"><Icon name="pause" :size="16" />{{ t('Pause queue') }}</button>
        <button v-else class="btn acc" :disabled="busy" @click="run(queueApi.start())"><Icon name="play" :size="16" />{{ isPrinting ? t('Resume queue') : t('Start queue') }}</button>
      </div>
    </template>
    <div v-else class="empty">{{ t('Loading…') }}</div>
  </section>

  <Modal v-if="askEnable" :title="t('Turn on the job queue?')" @close="askEnable = false">
    <p style="margin:0">{{ t('This adds the lines below to') }} <b class="code">moonraker.conf</b> {{ t('(a backup is saved first) and restarts Moonraker. Klipper keeps running.') }}</p>
    <pre class="code pre">[job_queue]
load_on_startup: False</pre>
    <template #foot><button class="btn lg" @click="askEnable = false">{{ t('Cancel') }}</button><button class="btn lg acc" @click="enable">{{ t('Turn on') }}</button></template>
  </Modal>
  <Modal v-if="picking" :title="t('Add to queue')" width="560px" @close="picking = false">
    <input v-model="pickQ" class="input" :placeholder="t('Search files')" :aria-label="t('Search files')" />
    <div class="pl">
      <button v-for="f in pickShown" :key="f.path" class="btn clear pi" @click="run(queueApi.add([f.path])); picking = false"><Icon name="cube" :size="16" /><span class="grow">{{ f.path }}</span><Icon name="plus" :size="16" /></button>
    </div>
  </Modal>
</template>

<style scoped>
.qc { min-height: 0; }
.list { display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; flex: 1; }
.jr { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 10px; background: var(--s2); }
.jr .n { width: 18px; text-align: center; color: var(--mu2); font-size: 12px; }
.th { width: 36px; height: 36px; border-radius: 8px; background: var(--s3); display: flex; align-items: center; justify-content: center; color: var(--mu); overflow: hidden; flex-shrink: 0; }
.th img { width: 100%; height: 100%; object-fit: contain; }
.fn { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu { color: var(--mu); font-size: 13px; }
.pre { background: var(--s2); padding: 10px 12px; border-radius: 8px; margin: 0; font-size: 12.5px; }
.pl { max-height: calc(50vh / var(--zoom, 1)); overflow: auto; display: flex; flex-direction: column; }
.pi { justify-content: flex-start; height: 38px; font-weight: 500; color: var(--tx); }
</style>
