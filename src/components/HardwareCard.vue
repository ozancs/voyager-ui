<script setup>
// Dashboard card "Connected hardware": what is plugged into the host, as Moonraker sees it (machine.peripherals):
// serial ports with their /dev/serial/by-id path (what [mcu] serial: wants), USB devices, CAN boards waiting for a
// canbus_uuid and cameras. A path or UUID copies with one click. Reading only; the CAN query asks the bus which
// boards answer, boards Klipper already uses do not show up there.
import { ref, computed, onMounted, watch } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import { state, S, toast } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';

const TABS = [
  ['serial', 'Serial'],
  ['usb', 'USB'],
  ['can', 'CAN'],
  ['video', 'Cameras'],
];
const tab = ref('serial');
const data = ref({ serial: null, usb: null, can: null, video: null });
const busy = ref('');
const err = ref('');
// the CAN interface the config uses, can0 when none says
const canIf = ref(
  Object.values(S('configfile').settings || {}).find((c) => c?.canbus_interface)?.canbus_interface || 'can0',
);
async function load(which) {
  busy.value = which;
  err.value = '';
  try {
    if (which === 'serial') data.value.serial = (await api.call('machine.peripherals.serial')).serial_devices || [];
    if (which === 'usb') data.value.usb = (await api.call('machine.peripherals.usb')).usb_devices || [];
    if (which === 'video') {
      const r = await api.call('machine.peripherals.video');
      data.value.video = [...(r.v4l2_devices || []), ...(r.libcamera_devices || [])];
    }
    if (which === 'can')
      data.value.can = (await api.call('machine.peripherals.canbus', { interface: canIf.value })).can_uuids || [];
  } catch (e) {
    err.value = /method not found|-32601/i.test(e.message || '')
      ? t('This Moonraker is too old to list devices. Update it on the Machine page.')
      : e.message;
  } finally {
    busy.value = '';
  }
}
onMounted(() => load('serial'));
// the CAN query takes a few seconds and talks to the bus: only when asked
watch(tab, (k) => {
  err.value = ''; // an error belongs to the tab it came from
  if (k !== 'can' && data.value[k] == null) load(k);
});

const rows = computed(() => {
  const d = data.value[tab.value];
  if (!d) return null;
  if (tab.value === 'serial')
    return d.map((s) => ({
      key: s.device_path,
      title: s.device_name || s.device_path,
      sub: [s.driver_name, s.usb_location && 'USB ' + s.usb_location].filter(Boolean).join(' · '),
      copy: s.path_by_id || s.device_path,
    }));
  if (tab.value === 'usb')
    return d.map((u) => ({
      key: u.bus_num + ':' + u.device_num,
      title: u.product || u.description || `${u.vendor_id}:${u.product_id}`,
      sub: [u.manufacturer, `${u.vendor_id}:${u.product_id}`, u.usb_location && 'USB ' + u.usb_location]
        .filter(Boolean)
        .join(' · '),
      copy: null,
    }));
  if (tab.value === 'can')
    return d.map((c) => ({ key: c.uuid, title: c.uuid, sub: c.application || '', copy: c.uuid }));
  return d.map((v) => ({
    key: v.path || v.camera_id || v.device_name,
    title: v.camera_name || v.device_name || v.model || v.path,
    sub: v.driver_name || v.hardware_bus || '',
    copy: v.path || null,
  }));
});
const copied = ref('');
async function copy(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    copied.value = txt;
    setTimeout(() => (copied.value = ''), 1500);
  } catch {
    toast(txt, 'info');
  }
}
const busyHere = computed(() => busy.value === tab.value);
const EMPTY = {
  serial: 'No serial ports found.',
  usb: 'No USB devices found.',
  can: 'No CAN boards are waiting for a UUID. Boards Klipper already uses do not answer the query.',
  video: 'No cameras found.',
};
</script>

<template>
  <section class="card hw">
    <div class="card-h">
      <CardTitle :text="t('Connected hardware')" />
      <div class="acts">
        <button
          class="btn clear ibtn sm"
          :aria-label="t('Refresh')"
          :data-tip="t('Refresh')"
          :disabled="!!busy"
          @click="load(tab)"
        >
          <Icon name="refresh" :size="16" :class="{ spin: busyHere }" />
        </button>
      </div>
      <CardCollapse />
    </div>
    <div class="seg tabs" role="tablist">
      <button
        v-for="[k, l] in TABS"
        :key="k"
        role="tab"
        :aria-selected="tab === k"
        :class="{ on: tab === k }"
        @click="tab = k"
      >
        {{ t(l) }}
      </button>
    </div>
    <div v-if="tab === 'can'" class="row canq">
      <input v-model="canIf" class="input mono" :aria-label="t('CAN interface')" spellcheck="false" />
      <button class="btn" :disabled="!!busy || !canIf || state.klippy === 'startup'" @click="load('can')">
        <Icon name="search" :size="15" />{{ busyHere ? t('Asking the bus…') : t('Query CAN bus') }}
      </button>
    </div>
    <p v-if="err" class="mu sm">{{ err }}</p>
    <div v-else-if="rows" class="list" data-fit>
      <div v-for="r in rows" :key="r.key" class="it">
        <span class="col grow" style="gap: 2px; min-width: 0">
          <b class="ti">{{ r.title }}</b>
          <span v-if="r.copy && r.copy !== r.title" class="mono mu sm path">{{ r.copy }}</span>
          <span v-if="r.sub" class="mu sm">{{ r.sub }}</span>
        </span>
        <button
          v-if="r.copy"
          class="btn clear ibtn sm"
          :aria-label="t('Copy')"
          :data-tip="copied === r.copy ? t('Copied') : t('Copy')"
          @click="copy(r.copy)"
        >
          <Icon :name="copied === r.copy ? 'check' : 'copy'" :size="15" />
        </button>
      </div>
      <p v-if="!rows.length" class="mu sm">{{ t(EMPTY[tab]) }}</p>
    </div>
    <p v-else-if="busyHere" class="mu sm">{{ t('Loading…') }}</p>
    <p v-else-if="tab === 'can'" class="mu sm">
      {{ t('Lists CAN boards that do not have a canbus_uuid in the config yet, for setting up a new board.') }}
    </p>
  </section>
</template>

<style scoped>
.sm {
  font-size: 12.5px;
}
.mu {
  color: var(--mu);
  margin: 0;
}
.tabs {
  align-self: flex-start;
  flex-wrap: wrap;
}
.canq {
  gap: 8px;
  align-items: center;
}
.canq .input {
  width: 90px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow: auto;
}
.it {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--s2);
}
.ti {
  font-size: 13.5px;
  overflow-wrap: anywhere;
}
.path {
  overflow-wrap: anywhere;
}
</style>
