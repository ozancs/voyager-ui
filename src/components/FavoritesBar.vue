<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'
import { state, gcode } from '../store'
import { go } from '../router'
const busy = ref(null)
const INKS = ['var(--heat)', 'var(--cool)', 'var(--sense)', 'var(--light)', 'var(--spool)']
async function run(f) {
  busy.value = f.id
  try { await gcode(f.gcode) } catch {}
  busy.value = null
}
</script>
<template>
  <div class="fb">
    <div class="list">
      <button v-for="(f, i) in state.settings.favorites" :key="f.id" class="fav" :class="{ hot: f.highlight, busy: busy === f.id }" :style="{ '--k': INKS[i % INKS.length] }" :data-tip="f.gcode" @click="run(f)">
        <Icon :name="f.icon" :size="20" :stroke="2.3" class="fi" />
        <span>{{ f.name }}</span>
      </button>
    </div>
    <button class="side" aria-label="Add macro" @click="go('theme')"><Icon name="plus" :size="18" :stroke="2.4" /></button>
    <button class="side" aria-label="Edit favorites" @click="go('theme')"><Icon name="pencil" :size="16" :stroke="2.4" /></button>
  </div>
</template>
<style scoped>
.fb { height: 72px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 20px; background: var(--bg); }
.list { flex: 1; display: flex; gap: 8px; min-width: 0; overflow-x: auto; }
.fav { flex: 1 0 auto; min-width: 120px; height: 48px; display: flex; align-items: center; justify-content: center; gap: 10px; background: var(--s1); color: var(--tx); border: none; border-radius: 12px; font-weight: 600; font-size: 13.5px; white-space: nowrap; transition: background .12s, transform .08s; padding: 0 16px; }
.fav:hover { background: var(--s2); }
.fav:active { transform: scale(.97); }
.fav .fi { color: var(--k); flex-shrink: 0; }
.fav.hot { background: var(--ac); color: var(--oa); }
.fav.hot:hover { filter: brightness(1.08); }
.fav.hot .fi { color: var(--oa); }
.fav.busy { opacity: .6; }
.side { width: 40px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; color: var(--mu2); border: 1px dashed var(--s3); border-radius: 12px; }
.side:hover { color: var(--tx); border-color: var(--mu2); }
@media (max-width: 1100px) { .fb { padding: 0 10px; } .fav { min-width: 96px; } }
</style>
