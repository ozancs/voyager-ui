<script setup>
// The printer list: printers this copy of the UI can switch between, each with a nickname and an address.
// Kept in this browser (printers.js). Saving and picking a printer reloads the page on that printer.
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { loadPrinters, savePrinters, currentPrinter, selectPrinter, HOST_RE, newId } from '../printers';
import { testPrinter, looksIncomplete } from '../fleet';
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
  tests.value[r.id] = { ...(await testPrinter(clean(r.host))), host: clean(r.host) };
}
const result = (r) => {
  const x = tests.value[r.id];
  if (x && !x.busy && x.host !== clean(r.host)) return null; // the address changed since the test
  return x;
};
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
      <Icon name="printer3d" :size="18" />
      <b class="grow">{{ t('This address') }}</b>
      <span class="mono mu">{{ here }}</span>
      <button class="btn" :disabled="!cur" @click="save('')">{{ cur ? t('Open') : t('Current') }}</button>
    </div>
    <div v-for="(r, i) in rows" :key="r.id" class="prw">
      <div class="pr">
        <input v-model="r.name" class="input nm" :placeholder="t('Nickname')" :aria-label="t('Nickname')" />
        <input
          v-model="r.host"
          class="input mono grow"
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
        <button class="btn clear ibtn sm" :aria-label="t('Remove')" @click="remove(i)">
          <Icon name="trash" :size="16" />
        </button>
      </div>
      <p v-if="result(r) && !result(r).busy" class="res" :class="result(r).level">
        {{ t(result(r).text, result(r).params) }}
      </p>
      <p v-if="r.host && !bad(r) && looksIncomplete(clean(r.host))" class="res wn">
        {{ t('This address looks incomplete (an IP address has four numbers, like 192.168.1.20).') }}
      </p>
    </div>
    <button class="btn" style="align-self: flex-start" @click="add">
      <Icon name="plus" :size="16" />{{ t('Add printer') }}
    </button>
    <template #foot>
      <button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn lg acc" :disabled="!canSave" @click="save()">{{ t('Save') }}</button>
    </template>
  </Modal>
</template>
<style scoped>
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
  margin: 0 0 0 178px;
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
</style>
