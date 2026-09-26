<script setup>
// Moonraker [power] devices with an on/off switch. Turning something off while printing, or a device
// that Moonraker locks during prints, asks first.
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import { state, isPrinting, prettyName } from '../store';
import { flipPower, powerBusy as busy } from '../power';
import { t } from '../i18n';
defineProps({ compact: Boolean });
const on = (d) => d.status === 'on';
const flip = (d, v) => flipPower(d, v);
const COLOR = { on: 'var(--ok)', off: 'var(--mu2)', error: 'var(--dg)', init: 'var(--wn)' };
</script>
<template>
  <div class="pl" :class="{ compact }">
    <div v-for="d in state.power" :key="d.device" class="pd">
      <i class="dot" :style="{ background: COLOR[d.status] || 'var(--mu2)' }"></i>
      <div class="col grow" style="gap: 0; min-width: 0">
        <b class="nm">{{ prettyName(d.device) }}</b
        ><span v-if="!compact" class="mu"
          >{{ d.type }}<template v-if="d.locked_while_printing"> · {{ t('locked while printing') }}</template
          ><template v-if="d.status === 'error'"> · {{ t('error') }}</template></span
        >
      </div>
      <Icon v-if="d.locked_while_printing && isPrinting" name="lock" :size="14" class="mu" />
      <Toggle
        :model-value="on(d)"
        :label="prettyName(d.device)"
        :disabled="busy === d.device || (d.locked_while_printing && isPrinting) || d.status === 'init'"
        @update:model-value="(v) => flip(d, v)"
      />
    </div>
    <div v-if="!state.power.length" class="empty">
      {{ t('No power devices. Add a [power] section to moonraker.conf for a smart plug or relay.') }}
    </div>
  </div>
</template>
<style scoped>
.pl {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pd {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 4px;
  border-bottom: 1px solid var(--bd);
}
.pd:last-child {
  border-bottom: none;
}
.compact .pd {
  min-height: 40px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 5px;
  flex-shrink: 0;
}
.nm {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mu {
  color: var(--mu);
  font-size: 12px;
}
</style>
