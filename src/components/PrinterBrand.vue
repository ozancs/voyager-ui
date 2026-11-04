<script setup>
// The printer at the top of the side menu: its icon, name and address, and the switcher to the other printers
// (the same list as the top bar's on small screens). rail: only the icon, which opens the switcher.
import { ref } from 'vue';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import Popover from './Popover.vue';
import { state, printerName } from '../store';
import { printerList, currentPrinter, selectPrinter } from '../printers';
import { listIconUrl } from '../printerIcon';
import { go } from '../router';
import { t } from '../i18n';
defineProps({ rail: Boolean });
const here = location.host;
const hostName = currentPrinter()?.host || here;
const printers = printerList;
const curId = currentPrinter()?.id || '';
const open = ref(false);
const box = ref(null);
</script>
<template>
  <div ref="box" class="pbr" :class="{ rail }">
    <button
      class="pbb"
      :class="{ on: open }"
      :aria-label="t('Printers')"
      :data-tip="rail ? printerName : null"
      @click.stop="open = !open"
    >
      <Logo :size="rail ? 34 : 36" own />
      <span v-if="!rail" class="col" style="gap: 1px; min-width: 0; flex: 1">
        <b class="pn" :title="printerName">{{ printerName }}</b>
        <span class="mono mu hn">{{ hostName }}</span>
      </span>
      <Icon v-if="!rail" name="down" :size="15" :stroke="2.4" class="mu" />
    </button>
    <Popover v-if="open" :anchor="box" :width="280" @close="open = false">
      <button
        v-if="printers.length"
        class="btn clear pmi all"
        @click="
          open = false;
          go('fleet');
        "
      >
        <Icon name="grid" :size="15" /><span class="grow">{{ t('All printers') }}</span
        ><span class="mono mu">{{ printers.length + 1 }}</span>
      </button>
      <button class="btn clear pmi" :class="{ cur: !curId }" :disabled="!curId" @click="selectPrinter('')">
        <img v-if="listIconUrl('')" class="pmic" :src="listIconUrl('')" alt="" /><Logo v-else :size="22" />
        <span class="grow">{{ t('This address') }}</span
        ><span class="mono mu">{{ here }}</span>
      </button>
      <button
        v-for="p in printers"
        :key="p.id"
        class="btn clear pmi"
        :class="{ cur: p.id === curId }"
        :disabled="p.id === curId"
        @click="selectPrinter(p.id)"
      >
        <img v-if="listIconUrl(p.id)" class="pmic" :src="listIconUrl(p.id)" alt="" /><Logo v-else :size="22" />
        <span class="grow">{{ p.name }}</span
        ><span class="mono mu">{{ p.host }}</span>
      </button>
      <button
        class="btn clear pmi"
        @click="
          open = false;
          state.printersOpen = true;
        "
      >
        <Icon name="gear" :size="15" /><span class="grow">{{ t('Manage printers') }}</span>
      </button>
    </Popover>
  </div>
</template>
<style scoped>
.pbr {
  flex-shrink: 0;
  padding: 0 0 12px;
  margin: 0 0 8px;
  border-bottom: 1px solid var(--bd);
}
.pbb {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 6px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--tx);
  text-align: left;
  cursor: pointer;
}
.pbb:hover,
.pbb.on {
  background: var(--s2);
}
.pn {
  font-size: 15px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hn {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mu {
  color: var(--mu);
}
.rail .pbb {
  justify-content: center;
  padding: 4px;
}
.pmi {
  justify-content: flex-start;
  text-align: left;
  gap: 8px;
  height: 38px;
  color: var(--tx);
  font-weight: 600;
}
.pmic {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 5px;
  flex-shrink: 0;
}
.pmi.all {
  border-bottom: 1px solid var(--bd);
  border-radius: 0;
  margin-bottom: 4px;
}
.pmi .mono {
  font-size: 11px;
  font-weight: 400;
}
.pmi.cur,
.pmi:disabled {
  opacity: 1;
  background: var(--s2);
}
</style>
