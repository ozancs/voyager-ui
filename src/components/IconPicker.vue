<script setup>
// Icon picker for favorites and custom cards: the app's own icons plus ~750 Lucide ones that fit a printer UI,
// searchable by name and by keyword (search "temperature" finds thermometers), and an optional icon colour.
import { computed, ref, onMounted, nextTick } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import { ICON_NAMES } from '../icons'
import { extra, loadExtra } from '../iconsExtra'
import { t } from '../i18n'
const props = defineProps({ icon: String, color: String, withColor: { type: Boolean, default: true } })
const emit = defineEmits(['pick', 'color', 'close'])
const ICON_COLORS = ['#ff6b1a', '#f5b23a', '#f5c451', '#3dd68c', '#2fbf9b', '#38d6ff', '#4d8dff', '#8b6cff', '#c86cff', '#ff3d7f', '#e5484d', '#e8e6e1']
const q = ref('')
const inp = ref(null)
onMounted(() => { loadExtra(); nextTick(() => inp.value?.focus()) })
const words = computed(() => q.value.trim().toLowerCase().split(/\s+/).filter(Boolean))
const hit = (hay) => words.value.every((w) => hay.includes(w))
const basic = computed(() => ICON_NAMES.filter((n) => !words.value.length || hit(n)))
const more = computed(() => {
  if (!extra.value) return []
  return Object.entries(extra.value).filter(([n, [, tg]]) => !words.value.length || hit(n.replace(/-/g, ' ') + ' ' + tg)).map(([n]) => 'l:' + n)
})
const cur = computed(() => props.color || null)
function pick(n) { emit('pick', n); emit('close') }
</script>
<template>
  <Modal :title="t('Choose icon')" width="680px" @close="emit('close')">
    <input ref="inp" v-model="q" class="input" :placeholder="t('Search icons, e.g. fan, heat, light, cut')" :aria-label="t('Search icons')" />
    <div v-if="withColor" class="cr">
      <span class="lbl">{{ t('Icon colour') }}</span>
      <button class="dot none" :class="{ on: !cur }" :aria-label="t('Default colour')" @click="emit('color', null)"></button>
      <button v-for="c in ICON_COLORS" :key="c" class="dot" :class="{ on: cur === c }" :style="{ background: c }" :aria-label="c" @click="emit('color', c)"></button>
      <label class="dot cu" :aria-label="t('Custom colour')"><input type="color" :value="cur || '#ff6b1a'" @input="emit('color', $event.target.value)" /></label>
    </div>
    <div class="scr">
      <template v-if="basic.length">
        <span class="lbl">{{ t('Basic') }}</span>
        <div class="ig"><button v-for="n in basic" :key="n" class="btn" :class="{ acc: icon === n }" :aria-label="n" :data-tip="n" @click="pick(n)"><Icon :name="n" :size="22" :style="cur && icon !== n ? { color: cur } : null" /></button></div>
      </template>
      <span class="lbl">{{ t('More icons') }} <span class="mu">({{ more.length }})</span></span>
      <div v-if="!extra" class="mu">{{ t('Loading…') }}</div>
      <div v-else-if="!more.length && !basic.length" class="mu">{{ t('No icon matches') }}</div>
      <div class="ig"><button v-for="n in more" :key="n" class="btn" :class="{ acc: icon === n }" :aria-label="n.slice(2)" :data-tip="n.slice(2)" @click="pick(n)"><Icon :name="n" :size="22" :stroke="2" :style="cur && icon !== n ? { color: cur } : null" /></button></div>
    </div>
  </Modal>
</template>
<style scoped>
.scr { display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow: auto; padding-right: 4px; }
.ig { display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); gap: 6px; }
.ig .btn { height: 46px; padding: 0; }
.cr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cr .lbl { margin-right: 4px; }
.dot { width: 26px; height: 26px; border-radius: 13px; border: 2px solid transparent; padding: 0; cursor: pointer; }
.dot.on { border-color: var(--tx); }
.dot.none { background: var(--s2); background-image: linear-gradient(135deg, transparent 45%, var(--mu2) 45%, var(--mu2) 55%, transparent 55%); }
.dot.cu { position: relative; overflow: hidden; background: conic-gradient(#ff6b1a, #f5c451, #3dd68c, #38d6ff, #8b6cff, #ff3d7f, #ff6b1a); }
.dot.cu input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.mu { color: var(--mu); font-size: 13px; }
</style>
