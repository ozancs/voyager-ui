<script setup>
// The PA Sensei sensor page (by OznLab, earlier called OznLab Sensor), inside Voyager. The sensor's Klipper module links its own oznlab.html next to Mainsail and
// Fluidd at every Klipper start, so the page shown here is always the one of the module that is installed: Voyager
// keeps no copy, and a sensor update brings its new page with it. Looked for on Voyager's own address first (in case
// the module ever links it there too), otherwise on the printer's port 80 where Mainsail / Fluidd live.
// The side menu shows this page only when Klipper has an oznlab_sensor object.
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { api } from '../api/moonraker';
import { t } from '../i18n';

// the same printer's port 80 (Mainsail / Fluidd), whatever port Voyager or Moonraker is on
const port80 = computed(() => {
  const host = api.host ? api.host.split(':')[0] : location.hostname;
  return `${location.protocol}//${host}/oznlab.html`;
});
const src = ref('');
const fromOwn = ref(false);
onMounted(async () => {
  // Voyager's nginx answers any unknown path with its own index.html: check that this really is the sensor page
  try {
    const own = (api.webBase || '') + '/oznlab.html';
    const r = await fetch(own, { cache: 'no-store' });
    if (r.ok && /<title>\s*(PA Sensei|OznLab Sensor)/i.test(await r.text())) {
      fromOwn.value = true;
      src.value = own;
      return;
    }
  } catch {}
  src.value = port80.value;
});
</script>
<template>
  <div class="oz">
    <div v-if="src && !fromOwn" class="row note">
      <span class="mu"
        >{{ t('Shown from Mainsail / Fluidd on this printer (port 80). If it does not load, one of them is needed.') }}
      </span>
      <a class="btn clear sm" :href="src" target="_blank" rel="noopener"
        ><Icon name="ext" :size="14" />{{ t('Open in a new tab') }}</a
      >
    </div>
    <iframe v-if="src" :src="src" title="PA Sensei" class="frame" allow="clipboard-write"></iframe>
  </div>
</template>
<style scoped>
/* the page's own console sits at its bottom: the frame ends above Voyager's footer, never under it */
.oz {
  flex: 1 1 0;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.note {
  gap: 10px;
  justify-content: space-between;
  font-size: 12.5px;
  padding: 0 4px;
}
.mu {
  color: var(--mu);
}
.frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 0;
  border-radius: var(--r);
  background: #17191a;
}
</style>
