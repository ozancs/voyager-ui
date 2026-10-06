<script setup>
// Parameter fields for a button whose command is a macro with parameters (MY_MACRO VALUE=50): each field edits that
// value in the command, and "Ask when clicked" opens the fields before the macro runs instead of using them as is.
import { computed } from 'vue';
import Toggle from './Toggle.vue';
import { macroParams, parseCmd, withArgs, badParamValue } from '../macros';
import { t } from '../i18n';
const props = defineProps({ b: Object });
const cmd = computed(() => parseCmd(props.b.gcode));
const params = computed(() => (cmd.value.word ? macroParams(cmd.value.word) : []));
function set(name, v) {
  props.b.gcode = withArgs(props.b.gcode, { [name]: v });
}
</script>
<template>
  <div v-if="params.length" class="bp">
    <label v-for="p in params" :key="p.name" class="pf"
      ><span class="code">{{ p.name }}</span
      ><input
        class="input code"
        :class="{ bad: badParamValue(cmd.args[p.name]) }"
        :value="cmd.args[p.name] ?? ''"
        :placeholder="p.def || t('default')"
        @change="set(p.name, $event.target.value.trim())"
        @keydown.enter="$event.target.blur()"
    /></label>
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
</style>
