<script setup>
// Print notifications through Moonraker's [notifier] (Apprise): Telegram, Discord, ntfy, Pushover or any
// Apprise URL. Works with the browser closed. Adding one writes a section to moonraker.conf (after a backup)
// and restarts Moonraker; Klipper keeps printing.
import { ref, computed, onMounted, watch } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { state, toast, backupBeforeWrite, printerName } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'

const list = ref([])
const loading = ref(false)
async function load() {
  loading.value = true
  try { list.value = (await api.call('server.notifiers.list')).notifiers || [] } catch { list.value = [] }
  loading.value = false
}
onMounted(load)
watch(() => state.connected, (c) => c && load())

const SERVICES = [
  { k: 'telegram', label: 'Telegram', fields: [['token', 'Bot token'], ['chat', 'Chat ID']], url: (f) => `tgram://${f.token}/${f.chat}`, help: 'Create a bot with @BotFather, send it a message, then read your chat id from @userinfobot.' },
  { k: 'discord', label: 'Discord', fields: [['hook', 'Webhook URL']], url: (f) => { const m = f.hook.match(/webhooks\/(\d+)\/([\w-]+)/); return m ? `discord://${m[1]}/${m[2]}` : '' }, help: 'Channel settings, Integrations, Webhooks, New webhook, Copy URL.' },
  { k: 'ntfy', label: 'ntfy', fields: [['topic', 'Topic'], ['server', 'Server (empty for ntfy.sh)']], url: (f) => (f.server ? `ntfys://${f.server.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${f.topic}` : `ntfys://${f.topic}`), help: 'Install the ntfy app and subscribe to the same topic. Pick a topic nobody can guess.' },
  { k: 'pushover', label: 'Pushover', fields: [['user', 'User key'], ['token', 'Application token']], url: (f) => `pover://${f.user}@${f.token}`, help: 'User key from the Pushover dashboard, token from a new application.' },
  { k: 'custom', label: 'Apprise URL', fields: [['raw', 'Apprise URL']], url: (f) => f.raw.trim(), help: 'Any service Apprise supports, see github.com/caronc/apprise/wiki.' },
]
const EVENTS = [['started', 'Print started'], ['complete', 'Print finished'], ['error', 'Error'], ['cancelled', 'Cancelled'], ['paused', 'Paused'], ['resumed', 'Resumed']]
const form = ref(null)
function add() { form.value = { svc: 'telegram', name: '', f: {}, events: ['complete', 'error', 'cancelled', 'paused'], snap: !!state.webcams.length } }
const svc = computed(() => SERVICES.find((s) => s.k === form.value?.svc))
const url = computed(() => { try { return svc.value?.url(form.value.f) || '' } catch { return '' } })
const safeName = computed(() => (form.value?.name || form.value?.svc || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'notify')
const valid = computed(() => form.value && svc.value.fields.every(([k]) => k === 'server' || (form.value.f[k] || '').trim()) && url.value && form.value.events.length)
const saving = ref(false)

function section(name, body) { return `[notifier ${name}]\n${body}` }
function stripSection(text, name) { return text.replace(new RegExp(`\\n?\\[notifier ${name}\\][^\\[]*`, 'g'), '\n').replace(/\n{3,}/g, '\n\n') }
async function writeConf(change) {
  const raw = await api.getText('/server/files/config/moonraker.conf')
  const crlf = raw.includes('\r\n')
  const next = change(raw.replace(/\r\n/g, '\n'))
  await backupBeforeWrite('config', 'moonraker.conf')
  await api.upload(new Blob([crlf ? next.replace(/\n/g, '\r\n') : next], { type: 'text/plain' }), { root: 'config', path: '', name: 'moonraker.conf' })
  await api.call('server.restart').catch(() => {})
  toast(t('moonraker.conf saved, Moonraker restarts'))
  setTimeout(load, 8000)
}
async function save() {
  const fm = form.value
  const cam = state.webcams[0]?.snapshot_url || '/webcam/?action=snapshot'
  const snap = /^https?:/.test(cam) ? cam : `http://127.0.0.1${location.port ? ':' + location.port : ''}${cam.startsWith('/') ? '' : '/'}${cam}`
  const body = [
    `url: ${url.value}`,
    `events: ${fm.events.join(', ')}`,
    `title: ${printerName.value}: {event_name}`,
    'body: {event_message}',
    ...(fm.snap ? [`attach: ${snap}`] : []),
  ].join('\n')
  saving.value = true
  try {
    await writeConf((text) => stripSection(text, safeName.value).replace(/\s*$/, '\n\n') + section(safeName.value, body) + '\n')
    form.value = null
  } catch (e) { toast(e.message, 'error') }
  saving.value = false
}
const del = ref(null)
async function remove() {
  const n = del.value; del.value = null
  try { await writeConf((text) => stripSection(text, n.name)) } catch (e) { toast(e.message, 'error') }
}
const scheme = (u) => (u || '').split('://')[0]
</script>

<template>
  <div class="col" style="gap:10px">
    <span class="mu" style="font-size:12.5px">{{ t('Sent by Moonraker, so they arrive with this page closed.') }}</span>
    <div v-for="n in list" :key="n.name" class="nr">
      <Icon name="bell" :size="17" />
      <div class="col grow" style="gap:1px;min-width:0"><b>{{ n.name }}</b><span class="mu sm">{{ scheme(n.url) }} · {{ (Array.isArray(n.events) ? n.events : [n.events]).join(', ') }}</span></div>
      <button class="btn clear ibtn sm" :aria-label="t('Remove {name}', { name: n.name })" @click="del = n"><Icon name="trash" :size="15" /></button>
    </div>
    <div v-if="!list.length && !loading" class="mu sm">{{ t('No notifications set up.') }}</div>
    <button class="btn" style="align-self:flex-start" @click="add"><Icon name="plus" :size="15" />{{ t('Add notification') }}</button>
  </div>

  <Modal v-if="form" :title="t('Add notification')" width="560px" @close="form = null">
    <div class="seg"><button v-for="s in SERVICES" :key="s.k" :class="{ on: form.svc === s.k }" @click="form.svc = s.k; form.f = {}">{{ s.label }}</button></div>
    <span class="mu sm">{{ t(svc.help) }}</span>
    <label v-for="[k, l] in svc.fields" :key="k" class="col" style="gap:4px"><span class="lbl">{{ t(l) }}</span><input v-model="form.f[k]" class="input" :aria-label="t(l)" spellcheck="false" /></label>
    <label class="col" style="gap:4px"><span class="lbl">{{ t('Name') }}</span><input v-model="form.name" class="input" :placeholder="form.svc" :aria-label="t('Name')" /></label>
    <span class="lbl">{{ t('Send when') }}</span>
    <div class="evs"><label v-for="[e, l] in EVENTS" :key="e" class="row" style="gap:8px"><input v-model="form.events" type="checkbox" :value="e" />{{ t(l) }}</label></div>
    <label class="row" style="gap:8px"><input v-model="form.snap" type="checkbox" :disabled="!state.webcams.length" />{{ t('Attach a webcam snapshot') }}</label>
    <div class="pre code">[notifier {{ safeName }}]<br />url: {{ url || '…' }}<br />events: {{ form.events.join(', ') }}</div>
    <span class="mu sm">{{ t('This is added to moonraker.conf (a backup is saved first) and Moonraker restarts. Klipper keeps running.') }}</span>
    <template #foot><button class="btn lg" @click="form = null">{{ t('Cancel') }}</button><button class="btn lg acc" :disabled="!valid || saving" @click="save">{{ t('Save') }}</button></template>
  </Modal>
  <Modal v-if="del" :title="t('Remove {name}?', { name: del.name })" @close="del = null">
    <p class="mu" style="margin:0">{{ t('The section is removed from moonraker.conf and Moonraker restarts.') }}</p>
    <template #foot><button class="btn lg" @click="del = null">{{ t('Cancel') }}</button><button class="btn lg dgf" @click="remove">{{ t('Remove') }}</button></template>
  </Modal>
</template>

<style scoped>
.nr { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; background: var(--s2); }
.nr :deep(svg) { color: var(--mu); flex-shrink: 0; }
.mu { color: var(--mu); } .sm { font-size: 12.5px; }
.evs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 13.5px; }
.pre { font-size: 12px; padding: 10px 12px; border-radius: 8px; background: var(--s2); color: var(--code); overflow-wrap: anywhere; }
</style>
