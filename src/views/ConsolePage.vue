<script setup>
// Full console page: the console plus a searchable list of commands and macros with their help text.
import { ref, computed } from 'vue';
import Icon from '../components/Icon.vue';
import ConsoleView from '../components/ConsoleView.vue';
import { state, macroList } from '../store';
import { t } from '../i18n';
const cv = ref(null);
const q = ref('');
const list = computed(() => {
  const all = [...new Set([...macroList.value, ...Object.keys(state.commands)])].sort();
  const f = q.value.toUpperCase();
  return f ? all.filter((c) => c.toUpperCase().includes(f)) : all;
});
const desc = (c) => state.commands[c] || state.status['gcode_macro ' + c]?.description || '';
</script>
<template>
  <div class="split cp">
    <section class="card grow" style="min-height: 0">
      <div class="card-h">
        <h2>{{ t('Console') }}</h2>
        <div class="acts">
          <button
            class="btn"
            :class="{ on: state.settings.consoleHideTemps }"
            :aria-pressed="!!state.settings.consoleHideTemps"
            @click="state.settings.consoleHideTemps = !state.settings.consoleHideTemps"
          >
            {{ t('Hide temps') }}</button
          ><button class="btn" @click="state.console = []"><Icon name="trash" :size="16" />{{ t('Clear') }}</button>
        </div>
      </div>
      <ConsoleView ref="cv" :limit="600" />
    </section>
    <section class="card side-col">
      <div class="card-h">
        <h2>{{ t('Commands') }}</h2>
        <span class="mono mu" style="font-size: 12px">{{ list.length }}</span>
      </div>
      <label class="row input"
        ><Icon name="search" :size="16" /><input
          v-model="q"
          :placeholder="t('Filter')"
          :aria-label="t('Filter commands')"
          style="flex: 1; background: transparent; border: none; outline: none"
      /></label>
      <div class="col" style="gap: 0; overflow: auto; min-height: 0; flex: 1">
        <button v-for="c in list" :key="c" class="ci" :title="desc(c)" @click="cv?.setCmd(c + ' ')">
          <span class="mono">{{ c }}</span
          ><span class="d">{{ desc(c) }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.cp {
  height: calc(100vh / var(--zoom, 1) - 196px);
  min-height: 420px;
  flex: 0 0 auto;
}
.cp > .card {
  min-height: 0;
}
.ci {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  text-align: left;
}
.ci:hover {
  background: var(--s2);
}
.ci .mono {
  font-size: 12px;
  font-weight: 700;
}
.ci .d {
  font-size: 11px;
  color: var(--mu);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 290px;
}
.mu {
  color: var(--mu);
}
</style>
