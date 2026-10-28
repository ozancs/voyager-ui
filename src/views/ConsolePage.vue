<script setup>
// Full console page: the console plus a searchable list of commands and macros with their help text.
import { ref, computed } from 'vue';
import Icon from '../components/Icon.vue';
import ConsoleView from '../components/ConsoleView.vue';
import { state, macroList, clearConsole } from '../store';
import { t } from '../i18n';
import { macroDesc } from '../macros';
const cv = ref(null);
const q = ref('');
const find = ref(''); // search in the console output
const errOnly = ref(false);
const list = computed(() => {
  const all = [...new Set([...macroList.value, ...Object.keys(state.commands)])].sort();
  const f = q.value.toUpperCase();
  return f ? all.filter((c) => c.toUpperCase().includes(f)) : all;
});
const desc = (c) => macroDesc(c, state.settings.cardOpts?.macros?.descs, state.commands[c]) || state.commands[c] || '';
</script>
<template>
  <div class="split cp">
    <section class="card grow">
      <div class="card-h">
        <h2>{{ t('Console') }}</h2>
        <div class="acts">
          <label class="row input fnd"
            ><Icon name="search" :size="15" /><input
              v-model="find"
              :placeholder="t('Search')"
              :aria-label="t('Search the console')"
              @keydown.esc="find = ''"
          /></label>
          <button class="btn" :class="{ on: errOnly }" :aria-pressed="errOnly" @click="errOnly = !errOnly">
            <Icon name="warn" :size="15" />{{ t('Errors') }}
          </button>
          <button
            class="btn"
            :class="{ on: state.settings.consoleHideTemps }"
            :aria-pressed="!!state.settings.consoleHideTemps"
            @click="state.settings.consoleHideTemps = !state.settings.consoleHideTemps"
          >
            {{ t('Hide temps') }}</button
          ><button class="btn" @click="clearConsole"><Icon name="trash" :size="16" />{{ t('Clear') }}</button>
        </div>
      </div>
      <ConsoleView ref="cv" :limit="600" :search="find" :errors="errOnly" />
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
.fnd {
  height: 34px;
  width: 180px;
  gap: 6px;
}
.fnd input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--tx);
}
.cp {
  height: calc(var(--main-h, 100vh) - 105px);
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
/* stacked (narrow window / phone): the console keeps most of the window, the command list scrolls in its own
   card below it instead of pushing the console out of its card */
@media (max-width: 1100px) {
  .cp {
    height: auto;
    min-height: 0;
  }
  .cp > .card.grow {
    flex: none;
    height: max(360px, calc(var(--main-h, 100vh) - 105px)); /* landscape phone or open keyboard: still usable */
  }
  .cp > .side-col {
    max-height: 60vh;
  }
  .cp > .side-col > .col {
    flex-shrink: 1;
  }
}
</style>
