<script setup>
// Shared editor; send only after OK, so Cancel never changes the physical LED.
import { computed } from 'vue';
import { S } from '../store';
import { rgbHex, hexRgb } from '../colorMath';
import ColorEditor from './ColorEditor.vue';
const props = defineProps({ id: String });
const emit = defineEmits(['set', 'close']);
const hasWhite = computed(() => {
  const c = S('configfile').settings?.[props.id.toLowerCase()];
  return /w/i.test(String(c?.color_order || '')) || !!c?.white_pin;
});
const channels = S(props.id).color_data?.[0] || [0, 0, 0, 0];
const initial = rgbHex(channels.slice(0, 3).map((x) => x * 255));
function confirm(hex, white) {
  emit(
    'set',
    hexRgb(hex).map((x) => x / 255),
    hasWhite.value ? white / 255 : null,
  );
  emit('close');
}
</script>
<template>
  <ColorEditor
    :color="initial"
    :white="hasWhite ? Math.round((channels[3] || 0) * 255) : null"
    @confirm="confirm"
    @cancel="emit('close')"
  />
</template>
