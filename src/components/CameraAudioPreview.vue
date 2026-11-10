<script setup>
// Explicit, receive-only microphone preview. Closes on leaving settings; reconnects after a filter change.
import { ref, onBeforeUnmount } from 'vue';
import { findCamAudio } from '../camAudio';
import { t } from '../i18n';
const props = defineProps({ busy: Boolean });
const player = ref(null),
  on = ref(false),
  connecting = ref(false),
  error = ref('');
let peer,
  generation = 0,
  retry;
function stop() {
  generation++;
  clearTimeout(retry);
  peer?.close();
  peer = null;
  if (player.value) player.value.srcObject = null;
  on.value = connecting.value = false;
}
async function start() {
  stop();
  const request = generation;
  on.value = connecting.value = true;
  error.value = '';
  try {
    const source = await findCamAudio();
    if (request !== generation) return;
    if (!source) throw Error('No camera audio stream is available.');
    const pc = (peer = new RTCPeerConnection());
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (event) => {
      if (request !== generation || !player.value) return;
      player.value.srcObject = event.streams[0] || new MediaStream([event.track]);
      player.value.play().catch(() => {
        error.value = t('Press Play in the audio controls to listen.');
      });
    };
    pc.onconnectionstatechange = () => {
      if (request === generation && pc.connectionState === 'failed') {
        stop();
        error.value = t('Audio connection lost. Try listening again.');
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, 1500);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });
    if (request !== generation) return;
    const response = await fetch(`${source.base}/api/webrtc?src=${encodeURIComponent(source.name)}`, {
      method: 'POST',
      body: pc.localDescription.sdp,
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw Error('Could not start camera audio.');
    const sdp = await response.text();
    if (request !== generation) return;
    await pc.setRemoteDescription({ type: 'answer', sdp });
    if (request === generation) connecting.value = false;
  } catch (e) {
    if (request !== generation) return;
    stop();
    error.value = t(e.message);
  }
}
function reconnect() {
  if (!on.value) return;
  stop();
  on.value = connecting.value = true;
  retry = setTimeout(start, 2500);
}
defineExpose({ reconnect });
onBeforeUnmount(stop);
</script>
<template>
  <div class="audio-preview">
    <button class="btn" :disabled="busy" @click="on ? stop() : start()">
      {{ on ? t('Stop listening') : t('Listen to camera audio') }}
    </button>
    <span v-if="connecting" class="mu">{{ t('Connecting…') }}</span>
    <audio ref="player" v-show="on" controls autoplay :aria-label="t('Camera audio preview')"></audio>
    <span v-if="error" class="wn">{{ error }}</span>
    <span class="mu">{{ t('Listen while changing the filter. Audio briefly reconnects when go2rtc restarts.') }}</span>
  </div>
</template>
<style scoped>
.audio-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  font-size: 12px;
}
audio {
  width: 240px;
  max-width: 100%;
  height: 32px;
}
</style>
