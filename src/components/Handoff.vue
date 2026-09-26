<script setup>
// "Open on phone": a QR code of this exact page (same tab, same printer), made in the browser, no internet needed.
import { ref, computed } from 'vue';
import qrcode from 'qrcode-generator';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { state, toast } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const open = ref(false);
const ips = ref([]);
const pick = ref(0);
const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h);
async function show() {
  open.value = true;
  const C = (state.cache.machine ||= {});
  try {
    if (!C.sys) C.sys = (await api.call('machine.system_info')).system_info;
  } catch {}
  const found = [];
  for (const [k, n] of Object.entries(C.sys?.network || {})) {
    if (k === 'lo') continue;
    for (const a of n.ip_addresses || []) if (a.family === 'ipv4' && !a.is_link_local) found.push(a.address);
  }
  ips.value = [...new Set(found)];
}
// phones often cannot resolve printer.local, so the IP address is offered first
const hosts = computed(() => {
  const h = location.hostname;
  const local = /^(localhost|127\.)/.test(h);
  const list = isIp(h) ? [h] : local && ips.value.length ? ips.value : [...ips.value, h];
  return [...new Set(list)];
});
const url = computed(
  () =>
    `${location.protocol}//${hosts.value[pick.value] || location.hostname}${location.port ? ':' + location.port : ''}${location.pathname}${location.hash}`,
);
const svg = computed(() => {
  const q = qrcode(0, 'M');
  q.addData(url.value);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return { d, s: n + 4 };
});
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    toast(t('Link copied'));
  } catch {
    toast(url.value);
  }
}
</script>
<template>
  <button class="ho" :aria-label="t('Open on phone')" @click="show">
    <Icon name="qr" :size="14" :stroke="2.2" />{{ t('Open on phone') }}
  </button>
  <Modal v-if="open" :title="t('Open on phone')" width="380px" @close="open = false">
    <div class="qrw">
      <svg :viewBox="`0 0 ${svg.s} ${svg.s}`" class="qr" shape-rendering="crispEdges" role="img" :aria-label="url">
        <rect :width="svg.s" :height="svg.s" fill="#fff" />
        <path :d="svg.d" fill="#111" />
      </svg>
    </div>
    <p class="mu" style="margin: 0; font-size: 13px; text-align: center">
      {{ t('Scan with the phone camera. The same page opens, the phone has to be on the same network.') }}
    </p>
    <div v-if="hosts.length > 1" class="seg">
      <button v-for="(h, i) in hosts" :key="h" :class="{ on: pick === i }" @click="pick = i">{{ h }}</button>
    </div>
    <div class="row">
      <code class="u grow">{{ url }}</code
      ><button class="btn ibtn sm" :aria-label="t('Copy link')" @click="copy"><Icon name="copy" :size="15" /></button>
    </div>
  </Modal>
</template>
<style scoped>
.ho {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  color: var(--mu);
  font: inherit;
  cursor: pointer;
}
.ho:hover {
  color: var(--ac);
}
.qrw {
  display: flex;
  justify-content: center;
}
.qr {
  width: 240px;
  height: 240px;
  border-radius: 12px;
}
.u {
  font-family: var(--fm);
  font-size: 12px;
  padding: 8px 10px;
  background: var(--s2);
  border-radius: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
