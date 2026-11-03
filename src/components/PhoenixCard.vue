<script setup>
// Phoenix dashboard card: what print recovery is doing on this printer, in a tile as small as an MCU tile (the
// dashboard scales it up with the card). Recording shows the last saved point (time and Z), the point a recovery
// would continue from; the live toolhead position is the Toolhead card's job. An interrupted print or a recovery
// under way opens the recovery window; an unfinished setup opens the setup window. Nothing here sends G-code.
import Icon from './Icon.vue';
import CardTitle from './CardTitle.vue';
import CardCollapse from './CardCollapse.vue';
import { usePhoenixView, openSetup } from '../phoenix';
import { t } from '../i18n';

const view = usePhoenixView(); // the same status as the Phoenix tile above the dashboard
</script>
<template>
  <section class="card phx">
    <div class="card-h">
      <CardTitle text="Phoenix" icon="fire" />
      <CardCollapse />
    </div>
    <div class="st" :class="view.tone" role="status">
      <span class="ic"
        ><Icon :name="view.icon" :size="18" :stroke="2.4" :class="{ spin: view.icon === 'refresh' }"
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
/* the card shrinks as a whole (data-scale); a leftover pixel must not bring up a scrollbar (the grid's own rule
   for cards is overflow: auto, so this needs the same weight) */
:global(.vgl-item .cell > .card.phx) {
  overflow: hidden;
}
/* nothing else in the header: the title may use all of it at the smallest size */
.phx :deep(.ctt) {
  max-width: calc(100% - 28px);
}
/* the status block grows with its content instead of overflowing it, so the dashboard sees the real height and
   shrinks the whole card (data-scale) when it is made small; centred only in the space that is left */
.st {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 4px 4px;
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
  width: 34px;
  height: 34px;
  border-radius: 17px;
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
