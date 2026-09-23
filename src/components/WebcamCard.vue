<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import WebcamView from './WebcamView.vue'
import { state } from '../store'
import { api } from '../api/moonraker'
import { go } from '../router'
const cam = computed(() => state.webcams.find((w) => w.enabled !== false) || null)
function snapshot() { if (cam.value) window.open(api.url(cam.value.snapshot_url), '_blank') }
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>Webcam</h2><div class="acts"><button class="btn" :disabled="!cam" @click="snapshot"><Icon name="snap" :size="16" :stroke="2.4" />Snapshot</button><button class="btn" @click="go('webcam')"><Icon name="ext" :size="16" :stroke="2.4" />Open</button></div></div>
    <WebcamView :cam="cam" />
  </section>
</template>
