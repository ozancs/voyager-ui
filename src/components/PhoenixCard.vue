<script setup>
// Phoenix dashboard card: what print recovery is doing on this printer, in a tile as small as an MCU tile (the
// dashboard scales it up with the card). Recording shows the last saved point (time and Z), the point a recovery
// would continue from; the live toolhead position is the Toolhead card's job. An interrupted print or a recovery
// under way opens the recovery window; an unfinished setup opens the setup window. Nothing here sends G-code.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import CardTitle from './CardTitle.vue';
import CardCollapse from './CardCollapse.vue';
import { ph, phoenixKnown, openWizard, openSetup } from '../phoenix';
import { t } from '../i18n';

const p = ph;
const now = ref(Date.now() / 1000);
let tm;
onMounted(() => (tm = setInterval(() => (now.value = Date.now() / 1000), 1000)));
onBeforeUnmount(() => clearInterval(tm));
const last = computed(() => (p.value.checkpoints || [])[0] || null);
const since = computed(() => {
  if (!last.value?.saved_at) return '';
  const s = Math.max(0, now.value - last.value.saved_at);
  return s < 90 ? t('{n} s ago', { n: Math.round(s) }) : t('{n} min ago', { n: Math.round(s / 60) });
});
const setupDone = computed(() => p.value.setup?.complete !== false);
const GOING = ['preparing', 'prepared', 'heating', 'returning'];
// one view per situation: tone (colour + icon, never colour alone), title, the line under it, the button
const view = computed(() => {
  const s = p.value;
  if (!phoenixKnown.value)
    return { tone: 'mu', icon: 'info', title: t('Unsupported version'), sub: 'API ' + (s.api_version ?? '?') };
  if (s.phase === 'detected')
    return {
      tone: 'wn',
      icon: 'warn',
      title: t('Interrupted print'),
      sub: s.filename || '',
      act: [t('Review recovery'), openWizard],
    };
  if (s.phase === 'blocked')
    return { tone: 'dg', icon: 'warn', title: t('Needs attention'), sub: '', act: [t('Review recovery'), openWizard] };
  if (GOING.includes(s.phase))
    return { tone: 'ac', icon: 'refresh', title: t('Recovering'), sub: '', act: [t('Open'), openWizard] };
  if (s.phase === 'recording')
    return {
      tone: 'ok',
      icon: 'check',
      title: t('Recording'),
      sub: last.value
        ? t('Saved {when}', { when: since.value }) + ' · Z ' + Number(last.value.gcode_position?.[2] ?? 0).toFixed(2)
        : t('Waiting for the first save'),
    };
  if (!setupDone.value)
    return {
      tone: 'wn',
      icon: 'wrench',
      title: t('Setup needed'),
      sub: t('Prints are not protected yet'),
      act: [t('Finish setup'), openSetup],
    };
  return { tone: 'ok', icon: 'check', title: t('Ready'), sub: t('Records your next print'), link: true };
});
</script>
<template>
  <section class="card phx">
    <div class="card-h">
      <CardTitle text="Phoenix" icon="fire" />
      <CardCollapse />
    </div>
    <div class="st" :class="view.tone" role="status">
      <span class="ic"
        ><Icon :name="view.icon" :size="20" :stroke="2.4" :class="{ spin: view.icon === 'refresh' }"
      /></span>
      <b class="ti">{{ view.title }}</b>
      <span v-if="view.sub" class="sub mono">{{ view.sub }}</span>
      <button v-if="view.act" class="btn sm" :class="view.tone === 'mu' ? '' : 'acc'" @click="view.act[1]()">
        {{ view.act[0] }}
      </button>
      <button v-else-if="view.link" class="btn clear sm lk" @click="openSetup">{{ t('Setup') }}</button>
    </div>
  </section>
</template>
<style scoped>
.phx {
  overflow: hidden;
}
.st {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  text-align: center;
  --tone: var(--mu);
}
.st.ok {
  --tone: var(--ok);
}
.st.wn {
  --tone: var(--wn);
}
.st.dg {
  --tone: var(--dg);
}
.st.ac {
  --tone: var(--ac);
}
.ic {
  width: 40px;
  height: 40px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, var(--s2));
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tone) 35%, transparent);
}
.ti {
  font-size: 14px;
}
.sub {
  font-size: 11.5px;
  color: var(--mu);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn.sm {
  margin-top: 2px;
  height: 30px;
  padding: 0 12px;
  font-size: 12.5px;
}
.lk {
  color: var(--mu);
}
</style>
