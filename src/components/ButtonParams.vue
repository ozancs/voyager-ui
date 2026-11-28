<script setup>
// Parameter fields for a button whose command runs a macro with parameters (MY_MACRO VALUE=50): each field edits that
// value in the command, and "Ask when clicked" opens the fields before the macro runs instead of using them as is.
// A command over several lines gets the fields of each macro line in it.
import { computed } from 'vue';
import Toggle from './Toggle.vue';
import { askLines, withLineArgs, badParamValue } from '../macros';
import { t } from '../i18n';
const props = defineProps({ b: Object });
const groups = computed(() => askLines(props.b.gcode));
function set(g, name, v) {
  props.b.gcode = withLineArgs(props.b.gcode, g.i, { [name]: v });
}
</script>
<template>
  <div v-if="groups.length" class="bp">
    <template v-for="g in groups" :key="g.i + g.word">
      <span v-if="groups.length > 1" class="code wd">{{ g.word }}</span>
      <label v-for="p in g.params" :key="p.name" class="pf"
        ><span class="code">{{ p.name }}</span
        ><input
          class="input code"
          :class="{ bad: badParamValue(g.args[p.name]) }"
          :value="g.args[p.name] ?? ''"
          :placeholder="p.def || t('default')"
          @change="set(g, p.name, $event.target.value.trim())"
          @keydown.enter="$event.target.blur()"
      /></label>
    </template>
    <label class="ak"
      ><Toggle v-model="b.ask" :label="t('Ask when clicked')" /><span>{{ t('Ask when clicked') }}</span></label
    >
  </div>
</template>
<style scoped>
.bp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 4px 0 2px;
}
.pf {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mu);
}
.pf input {
  width: 90px;
  height: 30px;
  font-size: 12.5px;
}
.pf input.bad {
  border-color: var(--dg);
}
.ak {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  margin-left: auto;
}
/* with several macro lines, each line's fields start on a new row under its name */
.wd {
  flex-basis: 100%;
  font-size: 11.5px;
  color: var(--mu2);
}
</style>
