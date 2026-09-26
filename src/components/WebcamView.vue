<script setup>
// One webcam, any Moonraker webcam service:
//   mjpegstreamer, uv4l-mjpeg            -> MJPEG stream in an <img>
//   mjpegstreamer-adaptive               -> snapshots polled at target_fps
//   webrtc-camerastreamer                -> camera-streamer WebRTC (HTTP signaling on stream_url)
//   webrtc-go2rtc                        -> go2rtc WebRTC (SDP offer POSTed to /api/webrtc)
//   webrtc-mediamtx                      -> MediaMTX WHEP
//   hlsstream                            -> HLS (native on Safari, hls.js elsewhere)
//   ipstream                             -> plain <video>
//   iframe                               -> the page in an iframe
// When nothing arrives for a while the view says so and what to check, instead of staying black.
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const props = defineProps({ cam: Object, overlay: { type: Boolean, default: true } });
const src = ref('');
const fps = ref(0);
const video = ref(null);
const imgEl = ref(null);
const status = ref('loading'); // loading | live | error | unsupported
const errMsg = ref('');
let timer = null,
  frames = 0,
  fpsTimer = null,
  busy = false,
  watchdog = null,
  pc = null,
  hls = null,
  gen = 0;

const service = computed(() => props.cam?.service || 'mjpegstreamer');
const mode = computed(() => {
  const s = service.value;
  if (s === 'mjpegstreamer' || s === 'uv4l-mjpeg') return 'mjpeg';
  if (s === 'mjpegstreamer-adaptive') return 'snapshot';
  if (s === 'webrtc-camerastreamer') return 'webrtc-cs';
  if (s === 'webrtc-go2rtc') return 'webrtc-go2rtc';
  if (s === 'webrtc-mediamtx') return 'webrtc-whep';
  if (s === 'hlsstream') return 'hls';
  if (s === 'ipstream') return 'video';
  if (s === 'iframe') return 'iframe';
  return 'unsupported'; // webrtc-janus, jmuxer-stream
});
const isVideo = computed(() => ['webrtc-cs', 'webrtc-go2rtc', 'webrtc-whep', 'hls', 'video'].includes(mode.value));
const transform = computed(() => {
  const c = props.cam || {};
  const tf = [];
  if (c.rotation) tf.push(`rotate(${c.rotation}deg)`);
  if (c.flip_horizontal) tf.push('scaleX(-1)');
  if (c.flip_vertical) tf.push('scaleY(-1)');
  return tf.join(' ');
});
const streamUrl = computed(() => api.url(props.cam?.stream_url || '/webcam/?action=stream'));
function snapUrl() {
  const u = api.url(props.cam?.snapshot_url || '/webcam/?action=snapshot');
  return u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
}
function gotFrame() {
  frames++;
  if (status.value !== 'live') {
    status.value = 'live';
    clearTimeout(watchdog);
  }
}
function fail(msg) {
  status.value = 'error';
  errMsg.value = msg || '';
}
function poll() {
  if (busy) return;
  busy = true;
  const img = new Image();
  img.onload = () => {
    src.value = img.src;
    gotFrame();
    busy = false;
  };
  img.onerror = () => {
    busy = false;
  };
  img.src = snapUrl();
}
const post = (url, body, type = 'application/json') =>
  fetch(url, { method: 'POST', body, headers: { 'Content-Type': type } }).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  });

async function startCameraStreamer(g) {
  const url = streamUrl.value;
  const offer = await (
    await post(
      url,
      JSON.stringify({ type: 'request', iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], keepAlive: true }),
    )
  ).json();
  if (g !== gen) return;
  pc = new RTCPeerConnection({ iceServers: offer.iceServers || [] });
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    if (video.value) video.value.srcObject = e.streams[0];
  };
  pc.onicecandidate = (e) => {
    if (e.candidate)
      post(url, JSON.stringify({ id: offer.id, type: 'remote_candidate', candidates: [e.candidate] })).catch(() => {});
  };
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await post(url, JSON.stringify({ type: answer.type, id: offer.id, sdp: answer.sdp }));
}
// go2rtc and MediaMTX: we make the offer and POST the SDP, the answer comes back as SDP
async function startSdpPost(url, g) {
  pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] });
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    if (video.value && e.track.kind === 'video') video.value.srcObject = e.streams[0];
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // wait briefly for ICE gathering so the offer carries candidates (no trickle over plain HTTP)
  await new Promise((r) => {
    if (pc.iceGatheringState === 'complete') return r();
    const to = setTimeout(r, 1500);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(to);
        r();
      }
    };
  });
  if (g !== gen) return;
  const sdp = await (await post(url, pc.localDescription.sdp, 'application/sdp')).text();
  await pc.setRemoteDescription({ type: 'answer', sdp });
}
function go2rtcUrl() {
  const u = new URL(streamUrl.value, location.href);
  // stream.html?src=x, webrtc.html?src=x or api/webrtc?src=x all become api/webrtc?src=x
  u.pathname = u.pathname.replace(/[^/]*$/, '').replace(/api\/$/, '') + 'api/webrtc';
  return u.toString();
}
function whepUrl() {
  const u = new URL(streamUrl.value, location.href);
  if (!u.pathname.endsWith('/whep')) u.pathname = u.pathname.replace(/\/?$/, '/') + 'whep';
  return u.toString();
}
async function startHls() {
  const v = video.value;
  if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = streamUrl.value;
    return;
  }
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) throw new Error('HLS not supported by this browser');
  hls = new Hls({ lowLatencyMode: true });
  hls.on(Hls.Events.ERROR, (_, d) => {
    if (d.fatal) fail(d.details);
  });
  hls.loadSource(streamUrl.value);
  hls.attachMedia(v);
}

async function start() {
  stop();
  const g = ++gen;
  if (!props.cam) return;
  status.value = mode.value === 'unsupported' ? 'unsupported' : 'loading';
  errMsg.value = '';
  if (mode.value === 'unsupported' || mode.value === 'iframe') {
    if (mode.value === 'iframe') status.value = 'live';
    return;
  }
  watchdog = setTimeout(() => {
    if (status.value === 'loading') fail();
  }, 10000);
  fpsTimer = setInterval(() => {
    fps.value = frames;
    frames = 0;
  }, 1000);
  try {
    if (mode.value === 'mjpeg') {
      src.value = streamUrl.value;
      // browsers do not reliably fire "load" for MJPEG streams, so look at the decoded size instead
      timer = setInterval(() => {
        if (imgEl.value?.naturalWidth > 0) {
          gotFrame();
          clearInterval(timer);
        }
      }, 400);
    } else if (mode.value === 'snapshot') {
      const iv = 1000 / Math.max(1, Math.min(props.cam.target_fps || 10, 15));
      timer = setInterval(poll, iv);
      poll();
    } else {
      await nextTick();
      if (mode.value === 'video') video.value.src = streamUrl.value;
      else if (mode.value === 'hls') await startHls();
      else if (mode.value === 'webrtc-cs') await startCameraStreamer(g);
      else if (mode.value === 'webrtc-go2rtc') await startSdpPost(go2rtcUrl(), g);
      else if (mode.value === 'webrtc-whep') await startSdpPost(whepUrl(), g);
    }
  } catch (e) {
    if (g === gen) fail(e.message);
  }
}
function stop() {
  clearInterval(timer);
  clearInterval(fpsTimer);
  clearTimeout(watchdog);
  src.value = '';
  try {
    pc?.close();
  } catch {}
  pc = null;
  try {
    hls?.destroy();
  } catch {}
  hls = null;
  if (video.value) {
    video.value.srcObject = null;
    video.value.removeAttribute('src');
  }
}
function onVis() {
  document.hidden ? stop() : start();
}
onMounted(() => {
  start();
  document.addEventListener('visibilitychange', onVis);
});
onBeforeUnmount(() => {
  gen++;
  stop();
  document.removeEventListener('visibilitychange', onVis);
});
watch(() => props.cam, start);
defineExpose({ retry: start });
</script>
<template>
  <div class="wc">
    <img
      v-if="mode === 'mjpeg' || mode === 'snapshot'"
      ref="imgEl"
      v-show="src && status !== 'error'"
      :src="src"
      :style="{ transform }"
      :alt="t('Webcam')"
      @load="gotFrame"
      @error="mode === 'mjpeg' && fail()"
    />
    <video
      v-else-if="isVideo"
      ref="video"
      v-show="status !== 'error'"
      autoplay
      muted
      playsinline
      :style="{ transform }"
      @playing="gotFrame"
      @timeupdate="gotFrame"
    ></video>
    <iframe
      v-else-if="mode === 'iframe'"
      :src="streamUrl"
      :title="cam?.name || t('Webcam')"
      allow="autoplay; fullscreen"
    ></iframe>

    <div v-if="!cam" class="msg">
      <Icon name="cam" :size="28" /><b>{{ t('No webcam configured') }}</b
      ><span>{{ t('Add one in Mainsail or in moonraker.conf with a [webcam] section.') }}</span>
    </div>
    <div v-else-if="status === 'loading'" class="msg">
      <Icon name="refresh" :size="22" class="spin" /><span>{{ t('Connecting to {name}…', { name: cam.name }) }}</span>
    </div>
    <div v-else-if="status === 'error'" class="msg">
      <Icon name="warn" :size="26" />
      <b>{{ t('No picture from {name}', { name: cam.name }) }}</b>
      <span>{{
        t('Check that the camera service (crowsnest) is running and the stream address opens in the browser.')
      }}</span>
      <code>{{ service }} · {{ cam.stream_url }}</code>
      <span v-if="errMsg" class="mono em">{{ errMsg }}</span>
      <button class="btn" @click="start"><Icon name="refresh" :size="15" />{{ t('Try again') }}</button>
    </div>
    <div v-else-if="status === 'unsupported'" class="msg">
      <Icon name="cam" :size="26" />
      <b>{{ t('{service} is not supported yet', { service }) }}</b>
      <span>{{
        t('Switch this camera to MJPEG or WebRTC (camera-streamer, go2rtc, MediaMTX) in the webcam settings.')
      }}</span>
    </div>

    <template v-if="overlay && cam && status === 'live'">
      <span class="live">{{ t('LIVE') }}</span>
      <span class="info"
        >{{ cam.name }}<template v-if="mode === 'snapshot'"> · {{ fps }} fps</template
        ><template v-else-if="isVideo">
          · {{ mode.startsWith('webrtc') ? 'WebRTC' : mode === 'hls' ? 'HLS' : 'video' }}</template
        ></span
      >
    </template>
  </div>
</template>
<style scoped>
.wc {
  position: relative;
  flex: 1;
  min-height: 200px;
  background: #0a0a0a;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wc img,
.wc video,
.wc iframe {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: absolute;
  inset: 0;
  border: 0;
}
.msg {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  max-width: 420px;
  text-align: center;
  color: #b8bcc4;
  font-size: 13px;
}
.msg b {
  color: #f0f0f0;
  font-size: 14px;
}
.msg code {
  font-family: var(--fm);
  font-size: 11.5px;
  color: #9aa0a8;
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 8px;
  border-radius: 6px;
  word-break: break-all;
}
.msg .em {
  font-size: 11px;
  color: #e58a8a;
}
.msg .btn {
  margin-top: 4px;
}
.live {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.info {
  position: absolute;
  bottom: 10px;
  right: 10px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
}
</style>
