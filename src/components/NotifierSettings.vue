<script setup>
// Print notifications through Moonraker's [notifier] (Apprise): Telegram, Discord, ntfy, Pushover or any
// Apprise URL. Works with the browser closed. Adding one writes a section to moonraker.conf (after a backup)
// and restarts Moonraker; Klipper keeps printing.
import { ref, computed, onMounted, watch } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { state, toast, backupBeforeWrite, printerName, firstCam } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
import { discoverNotificationConfigs, updateIniSection } from '../notificationConfig';

const list = ref([]);
const loading = ref(false);
const discovered = ref([]),
  scanWarnings = ref([]);
let configFiles = new Map();
async function load() {
  loading.value = true;
  try {
    const [runtime, configs] = await Promise.all([
      api.call('server.notifiers.list').catch(() => ({ notifiers: [] })),
      discoverNotificationConfigs(api),
    ]);
    configFiles = configs.files;
    scanWarnings.value = configs.warnings;
    discovered.value = configs.entries.filter((n) => n.external);
    const active = runtime.notifiers || [];
    list.value = configs.entries
      .filter((n) => !n.external)
      .map((n) => ({ ...n, active: active.some((x) => x.name === n.name) }));
    for (const n of active) if (!list.value.some((x) => x.name === n.name)) list.value.push(n);
  } finally {
    loading.value = false;
  }
}
const editing = ref(null);
function editExisting(n) {
  editing.value = {
    ...n,
    events: n.events?.includes('*') ? EVENTS.map(([event]) => event) : [...(n.events || [])],
    original: configFiles.get(n.path),
  };
}
async function saveExisting() {
  const n = editing.value;
  if (!n || saving.value) return;
  saving.value = true;
  try {
    const raw = await api.getText('/server/files/config/' + n.path.split('/').map(encodeURIComponent).join('/'));
    if (raw !== n.original)
      throw Error(t('The config changed elsewhere. Close this dialog and refresh before saving.'));
    const updates = n.external
      ? { bot_token: n.token.trim(), chat_id: n.chat.trim() }
      : { url: n.url.trim(), events: n.events.join(', ') };
    const next = updateIniSection(raw, n.section, updates);
    await backupBeforeWrite('config', n.path);
    const parts = n.path.split('/');
    await api.upload(new Blob([next], { type: 'text/plain' }), {
      root: 'config',
      name: parts.pop(),
      path: parts.join('/'),
    });
    editing.value = null;
    if (n.external) toast(t('Bot config saved. Restart your Telegram bot service to apply it.'));
    else {
      await api.call('server.restart').catch(() => {});
      toast(t('Notifier config saved. Moonraker restarts.'));
    }
    await load();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    saving.value = false;
  }
}
onMounted(load);
watch(
  () => state.connected,
  (c) => c && load(),
);

const SERVICES = [
  {
    k: 'telegram',
    label: 'Telegram',
    fields: [
      ['token', 'Bot token'],
      ['chat', 'Chat ID'],
    ],
    url: (f) => (f.token && f.chat ? `tgram://${f.token}/${f.chat}` : ''),
    help: 'Create a bot with @BotFather, send it a message, then read your chat id from @userinfobot.',
  },
  {
    k: 'discord',
    label: 'Discord',
    fields: [['hook', 'Webhook URL']],
    url: (f) => {
      const m = f.hook.match(/webhooks\/(\d+)\/([\w-]+)/);
      return m ? `discord://${m[1]}/${m[2]}` : '';
    },
    help: 'Channel settings, Integrations, Webhooks, New webhook, Copy URL.',
  },
  {
    k: 'ntfy',
    label: 'ntfy',
    fields: [
      ['topic', 'Topic'],
      ['server', 'Server (empty for ntfy.sh)'],
    ],
    url: (f) =>
      f.server ? `ntfys://${f.server.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${f.topic}` : `ntfys://${f.topic}`,
    help: 'Install the ntfy app and subscribe to the same topic. Pick a topic nobody can guess.',
  },
  {
    k: 'pushover',
    label: 'Pushover',
    fields: [
      ['user', 'User key'],
      ['token', 'Application token'],
    ],
    url: (f) => (f.user && f.token ? `pover://${f.user}@${f.token}` : ''),
    help: 'User key from the Pushover dashboard, token from a new application.',
  },
  {
    k: 'custom',
    label: 'Apprise URL',
    fields: [['raw', 'Apprise URL']],
    url: (f) => f.raw.trim(),
    help: 'Any service Apprise supports, see github.com/caronc/apprise/wiki.',
  },
];
const EVENTS = [
  ['started', 'Print started'],
  ['complete', 'Print finished'],
  ['error', 'Error'],
  ['cancelled', 'Cancelled'],
  ['paused', 'Paused'],
  ['resumed', 'Resumed'],
];
const form = ref(null);
function add() {
  form.value = {
    svc: 'telegram',
    name: '',
    f: {},
    events: ['complete', 'error', 'cancelled', 'paused'],
    snap: !!state.webcams.length,
  };
}
const svc = computed(() => SERVICES.find((s) => s.k === form.value?.svc));
const url = computed(() => {
  if (!form.value || !svc.value?.fields.every(([key]) => key === 'server' || String(form.value.f[key] || '').trim()))
    return '';
  try {
    const value = svc.value?.url(form.value.f) || '';
    return /[\r\n]/.test(value) ? '' : value;
  } catch {
    return '';
  }
});
const safeName = computed(
  () =>
    (form.value?.name || form.value?.svc || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_|_$/g, '') || 'notify',
);
const valid = computed(
  () =>
    form.value &&
    svc.value.fields.every(([k]) => k === 'server' || (form.value.f[k] || '').trim()) &&
    url.value &&
    form.value.events.length,
);
const saving = ref(false);

function section(name, body) {
  return `[notifier ${name}]\n${body}`;
}
// the section runs from its header to the next line that starts a section; a [ inside a value
// ({event_args[1].filename}) is not a header, which a plain [^\[]* cut on. Only a [ in the first column
// starts a section: an indented line is the continuation of a multi-line value.
function stripSection(text, name) {
  const lines = text.split('\n');
  const out = [];
  let skip = false;
  for (const l of lines) {
    if (/^\[/.test(l)) skip = l.trim().toLowerCase() === `[notifier ${name}]`.toLowerCase();
    if (!skip) out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
async function writeConf(change, path = 'moonraker.conf') {
  const raw = await api.getText('/server/files/config/' + path);
  const crlf = raw.includes('\r\n');
  const next = change(raw.replace(/\r\n/g, '\n'));
  await backupBeforeWrite('config', path);
  await api.upload(new Blob([crlf ? next.replace(/\n/g, '\r\n') : next], { type: 'text/plain' }), {
    root: 'config',
    path: path.split('/').slice(0, -1).join('/'),
    name: path.split('/').pop(),
  });
  await api.call('server.restart').catch(() => {});
  toast(t('moonraker.conf saved, Moonraker restarts'));
  setTimeout(load, 8000);
}
async function save() {
  if (!valid.value || saving.value) return;
  if (list.value.some((n) => n.name === safeName.value)) {
    toast(t('A notifier with this name already exists. Edit it instead.'), 'error');
    return;
  }
  const fm = form.value;
  const cam = firstCam.value?.snapshot_url || '/webcam/?action=snapshot';
  const snap = /^https?:/.test(cam)
    ? cam
    : `http://127.0.0.1${location.port ? ':' + location.port : ''}${cam.startsWith('/') ? '' : '/'}${cam}`;
  const body = [
    `url: ${url.value}`,
    `events: ${fm.events.join(', ')}`,
    `title: ${printerName.value}: {event_name}`,
    'body: {event_message}',
    ...(fm.snap ? [`attach: ${snap}`] : []),
  ].join('\n');
  saving.value = true;
  try {
    await writeConf(
      (text) => stripSection(text, safeName.value).replace(/\s*$/, '\n\n') + section(safeName.value, body) + '\n',
    );
    form.value = null;
  } catch (e) {
    toast(e.message, 'error');
  }
  saving.value = false;
}
const del = ref(null);
async function remove() {
  const n = del.value;
  del.value = null;
  try {
    await writeConf((text) => stripSection(text, n.name), n.path);
  } catch (e) {
    toast(e.message, 'error');
  }
}
const scheme = (u) => (u || '').split('://')[0];
</script>

<template>
  <div class="col" style="gap: 10px">
    <span class="mu" style="font-size: 12.5px">{{
      t('Sent by Moonraker, so they arrive with this page closed.')
    }}</span>
    <div v-for="n in list" :key="(n.path || '') + n.name" class="nr">
      <Icon name="bell" :size="17" />
      <div class="col grow" style="gap: 1px; min-width: 0">
        <b>{{ n.name }}</b
        ><span class="mu sm"
          >{{ scheme(n.url) }} · {{ (Array.isArray(n.events) ? n.events : [n.events]).join(', ') }}</span
        >
      </div>
      <span v-if="n.path" class="mu sm">{{ n.path }}</span>
      <button v-if="n.path" class="btn sm" @click="editExisting(n)">{{ t('Edit') }}</button>
      <button
        v-if="n.path"
        class="btn clear ibtn sm"
        :aria-label="t('Remove {name}', { name: n.name })"
        @click="del = n"
      >
        <Icon name="trash" :size="15" />
      </button>
    </div>
    <div v-for="n in discovered" :key="n.path + n.section" class="nr">
      <Icon name="bell" :size="17" />
      <div class="col grow">
        <b>Telegram</b><span class="mu sm">{{ t('Existing bot installation') }} · {{ n.path }}</span>
      </div>
      <button class="btn sm" @click="editExisting(n)">{{ t('Edit connection') }}</button>
    </div>
    <span v-for="warning in scanWarnings" :key="warning" class="wn sm">{{ t(warning) }}</span>
    <span class="mu sm">{{
      t(
        'Discovery reads the config folder and its subfolders. Bot files outside Moonraker’s shared config folder cannot be read here. Existing bots keep their own notification rules; adding a second notifier may send duplicate messages.',
      )
    }}</span>
    <button class="btn sm" :disabled="loading" @click="load">
      {{ loading ? t('Checking…') : t('Scan configs again') }}
    </button>
    <div v-if="!list.length && !discovered.length && !loading" class="mu sm">{{ t('No notifications set up.') }}</div>
    <button class="btn" style="align-self: flex-start" @click="add">
      <Icon name="plus" :size="15" />{{ t('Add notification') }}
    </button>
  </div>

  <Modal v-if="editing" :title="t('Edit notification connection')" width="560px" @close="editing = null">
    <span class="mu"
      >{{ t('Changes are saved to the original config file, with a backup first.') }} <b>{{ editing.path }}</b></span
    >
    <template v-if="editing.external">
      <label class="col"
        >{{ t('Bot token') }}<input class="input" type="password" autocomplete="off" v-model="editing.token"
      /></label>
      <label class="col">{{ t('Chat ID') }}<input class="input" v-model="editing.chat" /></label>
      <span class="mu">{{
        t(
          'This edits your existing Telegram bot connection. Its event and camera settings stay unchanged. Restart the bot service after saving.',
        )
      }}</span>
    </template>
    <template v-else>
      <label class="col"
        >{{ t('Apprise URL') }}<input class="input" type="password" autocomplete="off" v-model="editing.url"
      /></label>
      <div class="evs">
        <label v-for="[event, label] in EVENTS" :key="event" class="row"
          ><input type="checkbox" v-model="editing.events" :value="event" />{{ t(label) }}</label
        >
      </div>
      <span class="mu">{{ t('Moonraker restarts after saving. Klipper keeps running.') }}</span>
    </template>
    <template #foot
      ><button class="btn" @click="editing = null">{{ t('Cancel') }}</button
      ><button
        class="btn acc"
        :disabled="
          saving ||
          (editing.external
            ? !editing.token?.trim() || !editing.chat?.trim()
            : !editing.url?.trim() || !editing.events.length)
        "
        @click="saveExisting"
      >
        {{ t('Save') }}
      </button></template
    >
  </Modal>
  <Modal v-if="form" :title="t('Add notification')" width="560px" @close="form = null">
    <div class="seg">
      <button
        v-for="s in SERVICES"
        :key="s.k"
        :class="{ on: form.svc === s.k }"
        @click="
          form.svc = s.k;
          form.f = {};
        "
      >
        {{ s.label }}
      </button>
    </div>
    <span class="mu sm">{{ t(svc.help) }}</span>
    <label v-for="[k, l] in svc.fields" :key="k" class="col" style="gap: 4px"
      ><span class="lbl">{{ t(l) }}</span
      ><input
        v-model="form.f[k]"
        :type="['token', 'hook', 'raw'].includes(k) ? 'password' : 'text'"
        autocomplete="off"
        class="input"
        :aria-label="t(l)"
        spellcheck="false"
    /></label>
    <label class="col" style="gap: 4px"
      ><span class="lbl">{{ t('Name') }}</span
      ><input v-model="form.name" class="input" :placeholder="form.svc" :aria-label="t('Name')"
    /></label>
    <span class="lbl">{{ t('Send when') }}</span>
    <div class="evs">
      <label v-for="[e, l] in EVENTS" :key="e" class="row" style="gap: 8px"
        ><input v-model="form.events" type="checkbox" :value="e" />{{ t(l) }}</label
      >
    </div>
    <label class="row" style="gap: 8px"
      ><input v-model="form.snap" type="checkbox" :disabled="!state.webcams.length" />{{
        t('Attach a webcam snapshot')
      }}</label
    >
    <!-- prettier-ignore -->
    <div class="pre code">[notifier {{ safeName }}]<br />url: {{ url ? scheme(url) + '://••••' : '…' }}<br />events: {{ form.events.join(', ') }}</div>
    <span class="mu sm">{{
      t('This is added to moonraker.conf (a backup is saved first) and Moonraker restarts. Klipper keeps running.')
    }}</span>
    <template #foot
      ><button class="btn lg" @click="form = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" :disabled="!valid || saving" @click="save">{{ t('Save') }}</button></template
    >
  </Modal>
  <Modal v-if="del" :title="t('Remove {name}?', { name: del.name })" @close="del = null">
    <p class="mu" style="margin: 0">
      {{ t('The section is removed from its source config file and Moonraker restarts.') }}
    </p>
    <template #foot
      ><button class="btn lg" @click="del = null">{{ t('Cancel') }}</button
      ><button class="btn lg dgf" @click="remove">{{ t('Remove') }}</button></template
    >
  </Modal>
</template>

<style scoped>
.nr {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--s2);
}
.nr :deep(svg) {
  color: var(--mu);
  flex-shrink: 0;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
.evs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  font-size: 13.5px;
}
.pre {
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--s2);
  color: var(--code);
  overflow-wrap: anywhere;
}
</style>
