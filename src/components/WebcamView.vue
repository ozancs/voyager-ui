<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { api } from '../api/moonraker'
const props = defineProps({ cam: Object, overlay: { type: Boolean, default: true } })
const src = ref('')
const fps = ref(0)
let timer = null, frames = 0, fpsTimer = null, busy = false
const mode = computed(() => {
  const s = props.cam?.service || 'mjpegstreamer'
  if (s === 'mjpegstreamer') return 'mjpeg'
  return 'snapshot'
})
const transform = computed(() => {
  const c = props.cam || {}
  const t = []
  if (c.rotation) t.push(`rotate(${c.rotation}deg)`)
  if (c.flip_horizontal) t.push('scaleX(-1)')
  if (c.flip_vertical) t.push('scaleY(-1)')
  return t.join(' ')
})
function snapUrl() {
  const u = api.url(props.cam?.snapshot_url || '/webcam/?action=snapshot')
  return u + (u.includes('?') ? '&' : '?') + 't=' + Date.now()
}
function poll() {
  if (busy) return
  busy = true
  const img = new Image()
  img.onload = () => { src.value = img.src; frames++; busy = false }
  img.onerror = () => { busy = false }
  img.src = snapUrl()
}
function start() {
  stop()
  if (!props.cam) return
  if (mode.value === 'mjpeg') {
    src.value = api.url(props.cam.stream_url || '/webcam/?action=stream')
  } else {
    const iv = 1000 / Math.max(1, Math.min(props.cam.target_fps || 10, 15))
    timer = setInterval(poll, iv)
    poll()
  }
  fpsTimer = setInterval(() => { fps.value = frames; frames = 0 }, 1000)
}
function stop() { clearInterval(timer); clearInterval(fpsTimer); src.value = '' }
function onVis() { document.hidden ? stop() : start() }
onMounted(() => { start(); document.addEventListener('visibilitychange', onVis) })
onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', onVis) })
watch(() => props.cam, start)
</script>
<template>
  <div class="wc">
    <img v-if="src" :src="src" :style="{ transform }" alt="Webcam" @load="mode === 'mjpeg' && frames++" />
    <span v-else class="mono mu">{{ cam ? 'Loading stream…' : 'No webcam configured' }}</span>
    <template v-if="overlay && cam">
      <span class="live"><i></i>LIVE</span>
      <span class="info mono">{{ cam.name }}<template v-if="mode !== 'mjpeg'"> · {{ fps }} fps</template></span>
    </template>
  </div>
</template>
<style scoped>
.wc { position: relative; flex: 1; min-height: 200px; background: #0a0a0a; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.wc img { width: 100%; height: 100%; object-fit: contain; position: absolute; inset: 0; }
.mu { color: #8a8a8a; font-size: 13px; }
.live { position: absolute; top: 10px; left: 10px; display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: rgba(0,0,0,.6); color: #fff; border-radius: 4px; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.live i { width: 8px; height: 8px; border-radius: 4px; background: #ff3b30; }
.info { position: absolute; bottom: 10px; right: 10px; padding: 4px 8px; background: rgba(0,0,0,.6); color: #fff; border-radius: 4px; font-size: 11px; }
</style>
