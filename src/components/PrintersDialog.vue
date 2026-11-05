<script setup>
// The printer list: printers this copy of the UI can switch between, each with a nickname and an address.
// Kept in this browser (printers.js). Saving and picking a printer reloads the page on that printer.
import { ref, computed, onBeforeUnmount } from 'vue';
import { state } from '../store';
import { api } from '../api/moonraker';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import PrinterIconPicker from './PrinterIconPicker.vue';
import { pruneListIcons } from '../printerIcon';
import { loadPrinters, savePrinters, currentPrinter, selectPrinter, HOST_RE, newId } from '../printers';
import { testPrinter, looksIncomplete, scanNetwork } from '../fleet';
import { t } from '../i18n';
const emit = defineEmits(['close']);
const rows = ref(loadPrinters().map((p) => ({ ...p })));
const cur = currentPrinter();
const here = location.host;
const add = () => rows.value.push({ id: newId(), name: '', host: '' });
const remove = (i) => rows.value.splice(i, 1);
// Test: tries the address, the result is only information (a printer can be saved either way)
const tests = ref({}); // id -> { busy } or testPrinter() result
async function test(r) {
  tests.value[r.id] = { busy: true };
  const host = clean(r.host);
  tests.value[r.id] = { ...(await testPrinter(host)), host };
}
const result = (r) => {
  const x = tests.value[r.id];
  if (x && !x.busy && x.host !== clean(r.host)) return null; // the address changed since the test
  return x;
};
// Scan network: the other printers on this printer's network (fleet.js)
const scan = ref(null); // { done, total, found, busy, err }
let scanCtl = null;
async function startScan() {
  scanCtl?.abort();
  scanCtl = new AbortController();
  scan.value = { done: 0, total: 0, found: [], busy: true, err: '' };
  try {
    const info = await api.call('machine.system_info');
    const ips = [];
    for (const n of Object.values(info.system_info?.network || {}))
      for (const a of n.ip_addresses || [])
        if (a.family === 'ipv4' && !a.is_link_local && !a.address.startsWith('127.')) ips.push(a.address);
    if (!ips.length) throw new Error(t('The printer did not report its network address.'));
    const skip = rows.value.map((r) => clean(r.host)).concat(here.split(':')[0]);
    scan.value.found = await scanNetwork(ips, {
      skip,
      signal: scanCtl.signal,
      onProgress: (d, tot) => scan.value && Object.assign(scan.value, { done: d, total: tot }),
    });
  } catch (e) {
    if (scan.value) scan.value.err = e.message;
  }
  if (scan.value) scan.value.busy = false;
}
function addFound(f) {
  rows.value.push({ id: newId(), name: f.name, host: f.host });
  scan.value.found = scan.value.found.filter((x) => x !== f);
}
onBeforeUnmount(() => scanCtl?.abort());
const clean = (h) =>
  String(h || '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '');
const bad = (r) => !HOST_RE.test(clean(r.host));
const canSave = computed(() => rows.value.every((r) => !bad(r)));
function save(openId) {
  const list = rows.value.map((r) => ({ id: r.id, name: r.name.trim() || clean(r.host), host: clean(r.host) }));
  savePrinters(list);
  // kept on the printer too, so another browser opening it gets the same list
  if (state.settingsLoaded) state.settings.printers = list.map(({ name, host }) => ({ name, host }));
  pruneListIcons(list.map((p) => p.id));
  // the printer on screen was removed or another one was picked: go there
  if (openId !== undefined) return selectPrinter(openId);
  if (cur && !list.some((p) => p.id === cur.id)) return selectPrinter('');
  emit('close');
}
</script>
<template>
  <Modal :title="t('Printers')" width="620px" @close="emit('close')">
    <p class="mu sm" style="margin: 0">
      {{
        t(
          'Printers this browser can switch between. Address: the printer’s IP or name, with a port when Moonraker is not behind the web server on port 80 (Moonraker’s own port is usually 7125). Each printer’s moonraker.conf has to allow this page in cors_domains.',
        )
      }}
    </p>
    <div class="pr on0">
      <PrinterIconPicker id="" :name="t('This address')" />
      <b class="grow">{{ t('This address') }}</b>
      <span class="mono mu">{{ here }}</span>
      <button class="btn" :disabled="!cur" @click="save('')">{{ cur ? t('Open') : t('Current') }}</button>
    </div>
    <div v-for="(r, i) in rows" :key="r.id" class="prw">
      <div class="pr">
        <PrinterIconPicker :id="r.id" :name="r.name || r.host" />
        <input v-model="r.name" class="input nm" :placeholder="t('Nickname')" :aria-label="t('Nickname')" />
        <input
          v-model="r.host"
          class="input mono grow hs"
          :class="{ bad: r.host && bad(r) }"
          placeholder="192.168.1.20:7125"
          spellcheck="false"
          :aria-label="t('Address')"
        />
        <button class="btn" :disabled="bad(r) || tests[r.id]?.busy" @click="test(r)">
          <Icon :name="tests[r.id]?.busy ? 'refresh' : 'plug'" :class="{ spin: tests[r.id]?.busy }" :size="15" />{{
            t('Test')
          }}
        </button>
        <button class="btn" :disabled="bad(r) || cur?.id === r.id" @click="save(r.id)">
          {{ cur?.id === r.id ? t('Current') : t('Open') }}
        </button>
        <button class="btn clear ibtn sm rm" :aria-label="t('Remove')" @click="remove(i)">
          <Icon name="trash" :size="16" />
        </button>
      </div>
      <p v-if="result(r) && !result(r).busy" class="res" :class="result(r).level">
        {{ t(result(r).text, result(r).params) }}
        <span v-for="step in result(r).steps || []" :key="step.label" style="display: block">
          {{ t(step.label) }} · {{ t(step.status) }}
        </span>
      </p>
      <p v-if="r.host && !bad(r) && looksIncomplete(clean(r.host))" class="res wn">
        {{ t('This address looks incomplete (an IP address has four numbers, like 192.168.1.20).') }}
      </p>
    </div>
    <div class="row" style="gap: 8px; flex-wrap: wrap">
      <button class="btn" @click="add"><Icon name="plus" :size="16" />{{ t('Add printer') }}</button>
      <button class="btn" :disabled="scan?.busy || !state.connected" @click="startScan">
        <Icon name="search" :size="16" />{{ t('Scan network') }}
      </button>
    </div>
    <div v-if="scan" class="scan">
      <p v-if="scan.busy" class="mu sm" style="margin: 0">
        <Icon name="refresh" :size="14" class="spin" />
        {{ t('Looking for printers on this network… {done} / {total}', { done: scan.done, total: scan.total || '…' }) }}
      </p>
      <p v-else-if="scan.err" class="res dg" style="margin: 0">{{ scan.err }}</p>
      <p v-else-if="!scan.found.length" class="mu sm" style="margin: 0">
        {{
          t(
            'No other printers answered. A printer only answers when its moonraker.conf allows this page in cors_domains; add it by its address otherwise.',
          )
        }}
      </p>
      <div v-for="f in scan.found" :key="f.host" class="pr">
        <Icon name="l:printer" :size="16" class="mu" />
        <b class="grow">{{ f.name }}</b>
        <span class="mono mu">{{ f.host }}</span>
        <span v-if="f.login" class="mu sm">{{ t('needs a login') }}</span>
        <button class="btn" @click="addFound(f)"><Icon name="plus" :size="15" />{{ t('Add') }}</button>
      </div>
    </div>
    <template #foot>
      <button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn lg acc" :disabled="!canSave" @click="save()">{{ t('Save') }}</button>
    </template>
  </Modal>
</template>
<style scoped>
.scan {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--bd);
  border-radius: 12px;
  background: var(--s2);
}
.pr {
  display: flex;
  align-items: center;
  gap: 8px;
}
.prw {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.res {
  margin: 0 0 0 224px;
  font-size: 12px;
  color: var(--mu);
}
.res.ok {
  color: var(--ok, var(--ac));
}
.res.wn {
  color: var(--wn);
}
.res.dg {
  color: var(--dg);
}
.on0 {
  padding: 8px 10px;
  background: var(--s2);
  border-radius: 8px;
}
.nm {
  width: 170px;
}
.bad {
  border-color: var(--dg);
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
/* phone: icon, nickname and remove on one row, the address with Test and Open under it */
@media (max-width: 600px) {
  .prw .pr {
    flex-wrap: wrap;
  }
  .prw .nm {
    flex: 1 1 calc(100% - 96px); /* fills row 1 next to the icon and remove, so the address starts row 2 */
    width: auto;
    min-width: 0;
  }
  .prw .rm {
    order: 1;
  }
  .prw .hs {
    order: 2;
    flex: 1 1 120px;
    min-width: 0;
  }
  .prw .pr > .btn:not(.rm):not(.pic) {
    order: 3;
  }
  .res {
    margin-left: 0;
  }
  .on0 .mono {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
