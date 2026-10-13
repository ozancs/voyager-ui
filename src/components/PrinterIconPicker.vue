<script setup>
// The icon of one printer in the Printers dialog: a button showing it, a pop-up with the Voyager mark, the
// bundled logos and an own image. The open printer changes right away; another printer gets it when it is opened.
import { ref, computed } from 'vue';
import Popover from './Popover.vue';
import Logo from './Logo.vue';
import Icon from './Icon.vue';
import { LOGOS, listIconUrl, listIcon, setListIcon, readIcon } from '../printerIcon';
import { toast } from '../store';
import { t } from '../i18n';
const props = defineProps({ id: { type: String, default: '' }, name: String });
const btn = ref(null);
const open = ref(false);
const file = ref(null);
const url = computed(() => listIconUrl(props.id));
const cur = computed(() => listIcon(props.id));
const isOn = (kind, logo = '') => cur.value.kind === kind && (kind !== 'logo' || cur.value.logo === logo);
function pick(pi) {
  setListIcon(props.id, pi);
  open.value = false;
}
async function upload(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    pick({ kind: 'image', img: await readIcon(f) });
  } catch (err) {
    toast(err.message, 'error');
  }
}
</script>
<template>
  <button
    ref="btn"
    class="btn pic"
    :aria-label="t('Icon of {name}', { name: name || t('this printer') })"
    :data-tip="t('Printer icon')"
    @click="open = !open"
  >
    <img v-if="url" :src="url" width="26" height="26" alt="" /><Logo v-else :size="26" />
  </button>
  <Popover v-if="open" :anchor="btn" :width="268" @close="open = false">
    <span class="sec-lbl">{{ t('Printer icon') }}</span>
    <div class="grid">
      <button
        class="btn clear ic"
        :class="{ on: isOn('voyager') }"
        data-tip="Voyager"
        aria-label="Voyager"
        @click="pick({ kind: 'voyager' })"
      >
        <Logo :size="30" />
      </button>
      <button
        v-for="l in LOGOS"
        :key="l.id"
        class="btn clear ic"
        :class="{ on: isOn('logo', l.id) }"
        :data-tip="l.name"
        :aria-label="l.name"
        @click="pick({ kind: 'logo', logo: l.id })"
      >
        <img :src="l.url" width="30" height="30" alt="" />
      </button>
      <button
        v-if="cur.kind === 'image' && url"
        class="btn clear ic on"
        :data-tip="t('Own image')"
        :aria-label="t('Own image')"
      >
        <img :src="url" width="30" height="30" alt="" />
      </button>
    </div>
    <button class="btn clear up" @click="file.click()"><Icon name="upload" :size="15" />{{ t('Choose image') }}</button>
    <input
      ref="file"
      type="file"
      accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
      hidden
      @change="upload"
    />
  </Popover>
</template>
<style scoped>
.pic {
  width: 38px;
  padding: 0;
  flex-shrink: 0;
}
.pic img {
  object-fit: contain;
  border-radius: 6px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}
.ic {
  height: 44px;
  padding: 0;
}
.ic img {
  object-fit: contain;
}
.ic.on {
  background: var(--s2);
  box-shadow: inset 0 0 0 1.5px var(--ac);
}
.up {
  justify-content: flex-start;
  height: 36px;
  color: var(--tx);
}
</style>
