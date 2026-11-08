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
// audio: a sound button in the top right corner when the printer runs go2rtc with a sound stream (camAudio.js).
// Off whenever the page opens; on = a WebRTC connection that receives only sound, off = that connection closed, so
// go2rtc stops ffmpeg and the microphone on the Pi.
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { api } from '../api/moonraker';
import { t } from '../i18n';
import { state, toast } from '../store';
import { findCamAudio } from '../camAudio';
const props = defineProps({ cam: Object, overlay: { type: Boolean, default: true }, audio: Boolean });
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
// Same order as Mainsail: flips first in the list, rotate last. CSS applies the list right to left, so the picture
// is rotated and then flipped. With rotate first (the old order) a 90°/270° camera with a flip came out upside
// down compared to Mainsail and crowsnest. A 90°/270° picture is also scaled down so it still fits the box.
const aspect = ref(0); // measured width / height of the picture, 0 until the first frame
function camAspect() {
  if (aspect.value) return aspect.value;
  const [w, h] = String(props.cam?.aspect_ratio || '')
    .split(':')
    .map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}
const transform = computed(() => {
  const c = props.cam || {};
  const rot = Number(c.rotation) || 0;
  const tf = [];
  if (c.flip_horizontal) tf.push('scaleX(-1)');
  if (c.flip_vertical) tf.push('scaleY(-1)');
  if (rot) {
    tf.push(`rotate(${rot}deg)`);
    const a = camAspect();
    // a landscape picture turned on its side would stick out above and below the box
    if (rot % 180 && a > 1) tf.push(`scale(${1 / a})`);
  }
  return tf.join(' ');
});
function measure(el) {
  const w = el?.naturalWidth || el?.videoWidth;
  const h = el?.naturalHeight || el?.videoHeight;
  if (w && h) aspect.value = w / h;
}
const streamUrl = computed(() => api.url(props.cam?.stream_url || '/webcam/?action=stream'));
function snapUrl() {
  const u = api.url(props.cam?.snapshot_url || '/webcam/?action=snapshot');
  return u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
}
function gotFrame() {
  frames++;
  if (!aspect.value) measure(imgEl.value || video.value);
  if (status.value !== 'live') {
    status.value = 'live';
    clearTimeout(watchdog);
  }
}
// mjpegstreamer-adaptive polls snapshot_url. Cameras that only have a stream (phone apps, ESP32-CAM, other
// servers: stream_url like /video) never answer there, so after a failure the stream is shown instead.
const viaStream = ref(false);
const kind = computed(() => (mode.value === 'snapshot' && viaStream.value ? 'mjpeg' : mode.value));
const tried = computed(() =>
  kind.value === 'snapshot' ? api.url(props.cam?.snapshot_url || '/webcam/?action=snapshot') : props.cam?.stream_url,
);
function fail(msg) {
  if (
    mode.value === 'snapshot' &&
    !viaStream.value &&
    props.cam?.stream_url &&
    props.cam.stream_url !== props.cam.snapshot_url
  ) {
    viaStream.value = true;
    start();
    return;
  }
  status.value = 'error';
  errMsg.value = msg || '';
}
// Each request belongs to one start(): a frame still on its way from the camera shown before is dropped, so it
// cannot land in this view after switching cameras. A request that never answers frees the slot after 5 s
// instead of blocking every later poll (the view used to stay on "Connecting" for good).
function poll() {
  if (busy) return;
  const g = gen;
  busy = true;
  const img = new Image();
  let ended = false; // the timeout's img.src = '' fires onerror too: free the slot once
  const done = () => {
    if (ended) return;
    ended = true;
    clearTimeout(to);
    if (g === gen) busy = false;
  };
  const to = setTimeout(() => {
    img.src = '';
    done();
  }, 5000);
  img.onload = () => {
    done();
    if (g !== gen) return;
    src.value = img.src;
    gotFrame();
  };
  img.onerror = done;
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
  const p = (pc = new RTCPeerConnection({ iceServers: offer.iceServers || [] }));
  p.addTransceiver('video', { direction: 'recvonly' });
  p.ontrack = (e) => {
    if (g === gen && video.value) video.value.srcObject = e.streams[0];
  };
  p.onicecandidate = (e) => {
    if (e.candidate && g === gen)
      post(url, JSON.stringify({ id: offer.id, type: 'remote_candidate', candidates: [e.candidate] })).catch(() => {});
  };
  await p.setRemoteDescription(offer);
  const answer = await p.createAnswer();
  if (g !== gen) return;
  await p.setLocalDescription(answer);
  await post(url, JSON.stringify({ type: answer.type, id: offer.id, sdp: answer.sdp }));
}
// go2rtc and MediaMTX: we make the offer and POST the SDP, the answer comes back as SDP
async function startSdpPost(url, g) {
  // the connection is held in a local: `pc` may already belong to the next camera when an await returns
  const p = (pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] }));
  p.addTransceiver('video', { direction: 'recvonly' });
  p.addTransceiver('audio', { direction: 'recvonly' });
  p.ontrack = (e) => {
    if (g === gen && video.value && e.track.kind === 'video') video.value.srcObject = e.streams[0];
  };
  const offer = await p.createOffer();
  await p.setLocalDescription(offer);
  // wait briefly for ICE gathering so the offer carries candidates (no trickle over plain HTTP)
  await new Promise((r) => {
    if (p.iceGatheringState === 'complete') return r();
    const to = setTimeout(r, 1500);
    p.onicegatheringstatechange = () => {
      if (p.iceGatheringState === 'complete') {
        clearTimeout(to);
        r();
      }
    };
  });
  if (g !== gen) return;
  const sdp = await (await post(url, p.localDescription.sdp, 'application/sdp')).text();
  if (g !== gen) return;
  await p.setRemoteDescription({ type: 'answer', sdp });
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
async function startHls(g) {
  const v = video.value;
  if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = streamUrl.value;
    return;
  }
  const { default: Hls } = await import('hls.js');
  if (g !== gen) return; // the view switched cameras or closed while the player was loading
  if (!Hls.isSupported()) throw new Error('HLS not supported by this browser');
  hls = new Hls({ lowLatencyMode: true });
  hls.on(Hls.Events.ERROR, (_, d) => {
    if (d.fatal) fail(d.details);
  });
  hls.loadSource(streamUrl.value);
  hls.attachMedia(v);
}

async function start(fresh) {
  stop();
  const g = gen;
  if (fresh === true) viaStream.value = false;
  if (mode.value === 'snapshot' && !props.cam?.snapshot_url && props.cam?.stream_url) viaStream.value = true;
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
    if (kind.value === 'mjpeg') {
      // stop() just emptied src: set the stream on the next tick, or Vue sees the same URL and a retry reloads nothing
      await nextTick();
      if (g !== gen) return;
      src.value = streamUrl.value;
      // browsers do not reliably fire "load" for MJPEG streams, so look at the decoded size instead
      timer = setInterval(() => {
        if (imgEl.value?.naturalWidth > 0) {
          gotFrame();
          clearInterval(timer);
        }
      }, 400);
    } else if (kind.value === 'snapshot') {
      const iv = 1000 / Math.max(1, Math.min(props.cam.target_fps || 10, 15));
      timer = setInterval(poll, iv);
      poll();
    } else {
      await nextTick();
      if (mode.value === 'video') video.value.src = streamUrl.value;
      else if (mode.value === 'hls') await startHls(g);
      else if (mode.value === 'webrtc-cs') await startCameraStreamer(g);
      else if (mode.value === 'webrtc-go2rtc') await startSdpPost(go2rtcUrl(), g);
      else if (mode.value === 'webrtc-whep') await startSdpPost(whepUrl(), g);
    }
  } catch (e) {
    if (g === gen) fail(e.message);
  }
}
function stop() {
  gen++; // anything still running for the previous camera now sees a stale generation
  busy = false;
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
  stop();
  document.removeEventListener('visibilitychange', onVis);
});
watch(
  () => props.cam,
  (n, o) => {
    if (n?.name !== o?.name || n?.stream_url !== o?.stream_url || n?.snapshot_url !== o?.snapshot_url) aspect.value = 0;
    start(true);
  },
);
// ---- camera sound (go2rtc) ----
const snd = ref(null); // { base, name } once go2rtc and its sound stream were found
const sndOn = ref(false); // always off when the page opens
const sndBusy = ref(false);
const VOL_KEY = 'voyager-ui-cam-volume';
const vol = ref(
  (() => {
    try {
      const v = parseFloat(localStorage.getItem(VOL_KEY));
      return v >= 0 && v <= 1 ? v : 0.8;
    } catch {
      return 0.8;
    }
  })(),
);
const audioEl = ref(null);
let apc = null; // the sound's own peer connection
let sgen = 0;
watch(vol, (v) => {
  if (audioEl.value) audioEl.value.volume = v;
  try {
    localStorage.setItem(VOL_KEY, String(v));
  } catch {}
});
// on stays on through a reload of the page (sessionStorage: this tab only), a newly opened browser starts off
const SND_KEY = 'voyager-ui-cam-sound';
function remember(on) {
  try {
    on ? sessionStorage.setItem(SND_KEY, '1') : sessionStorage.removeItem(SND_KEY);
  } catch {}
}
function remembered() {
  try {
    return sessionStorage.getItem(SND_KEY) === '1';
  } catch {
    return false;
  }
}
// after a reload the browser may hold the sound back until the page is clicked once (autoplay rule): the first
// click or key anywhere starts it
let gesture = null;
function waitForGesture() {
  if (gesture) return;
  gesture = () => {
    dropGesture();
    audioEl.value?.play().catch(() => {});
  };
  document.addEventListener('pointerdown', gesture, true);
  document.addEventListener('keydown', gesture, true);
  toast(t('Click anywhere on the page to hear the camera'));
}
function dropGesture() {
  if (!gesture) return;
  document.removeEventListener('pointerdown', gesture, true);
  document.removeEventListener('keydown', gesture, true);
  gesture = null;
}
function soundOff() {
  sgen++;
  dropGesture();
  try {
    apc?.close(); // closed, not muted: go2rtc stops the microphone once nobody listens
  } catch {}
  apc = null;
  if (audioEl.value) audioEl.value.srcObject = null;
  sndOn.value = false;
  sndBusy.value = false;
}
async function soundStart() {
  const s = snd.value;
  if (!s) return;
  soundOff();
  const g = sgen;
  sndOn.value = true;
  sndBusy.value = true;
  const p = (apc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] }));
  const lost = () => {
    if (g !== sgen) return;
    soundOff();
    remember(false);
    toast(t('Camera sound stopped'), 'warn');
  };
  // dropped: a short "disconnected" can come back by itself, "failed" or a few seconds of it cannot
  let dropT = null;
  p.onconnectionstatechange = () => {
    const st = p.connectionState;
    clearTimeout(dropT);
    if (st === 'failed' || st === 'closed') lost();
    else if (st === 'disconnected') dropT = setTimeout(() => p.connectionState !== 'connected' && lost(), 4000);
  };
  p.ontrack = (e) => {
    if (g !== sgen || !audioEl.value) return;
    audioEl.value.srcObject = e.streams[0] || new MediaStream([e.track]);
    audioEl.value.volume = vol.value;
    audioEl.value.play().catch((err) => err?.name === 'NotAllowedError' && g === sgen && waitForGesture());
  };
  try {
    p.addTransceiver('audio', { direction: 'recvonly' });
    await p.setLocalDescription(await p.createOffer());
    await new Promise((r) => {
      if (p.iceGatheringState === 'complete') return r();
      const to = setTimeout(r, 1500);
      p.onicegatheringstatechange = () => {
        if (p.iceGatheringState === 'complete') {
          clearTimeout(to);
          r();
        }
      };
    });
    if (g !== sgen) return;
    // the offer as plain text: a simple request, so the browser sends no CORS preflight first
    const r = await fetch(`${s.base}/api/webrtc?src=${encodeURIComponent(s.name)}`, {
      method: 'POST',
      body: p.localDescription.sdp,
      headers: { 'Content-Type': 'text/plain' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const sdp = await r.text();
    if (g !== sgen) return;
    await p.setRemoteDescription({ type: 'answer', sdp });
    sndBusy.value = false;
  } catch {
    if (g !== sgen) return;
    soundOff();
    remember(false);
    toast(t('Could not start the camera sound'), 'warn');
  }
}
function toggleSound() {
  remember(!sndOn.value);
  sndOn.value ? soundOff() : soundStart();
}
// asked once Moonraker is connected (the view can mount before that), again after a reconnect; sound that was on
// before a reload comes back on
function askSound() {
  if (!props.audio || !state.connected) return;
  findCamAudio().then((s) => {
    snd.value = s;
    if (s && remembered() && !sndOn.value) soundStart();
  });
}
onMounted(askSound);
watch(() => state.connected, askSound);
onBeforeUnmount(soundOff);
// another camera: this connection closes; if the sound was on it opens again for the new view
watch(
  () => props.cam?.name,
  () => {
    soundOff();
    if (snd.value && props.cam && remembered()) soundStart();
  },
);
const touch = typeof matchMedia === 'function' && !matchMedia('(hover: hover)').matches;
defineExpose({ retry: start });
</script>
<template>
  <div class="wc">
    <img
      v-if="kind === 'mjpeg' || kind === 'snapshot'"
      ref="imgEl"
      v-show="src && status !== 'error'"
      :src="src"
      :style="{ transform }"
      :alt="t('Camera')"
      @load="gotFrame"
      @error="kind === 'mjpeg' && $event.target.src && fail()"
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
      :title="cam?.name || t('Camera')"
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
      <code>{{ service }} · {{ tried }}</code>
      <span v-if="mode === 'snapshot'" class="hint2">{{
        t(
          'Adaptive MJPEG loads single pictures from the snapshot address. If the camera only has a stream, set the service to MJPEG.',
        )
      }}</span>
      <span v-if="errMsg" class="mono em">{{ errMsg }}</span>
      <button class="btn" @click="start(true)"><Icon name="refresh" :size="15" />{{ t('Try again') }}</button>
    </div>
    <div v-else-if="status === 'unsupported'" class="msg">
      <Icon name="cam" :size="26" />
      <b>{{ t('{service} is not supported yet', { service }) }}</b>
      <span>{{
        t('Switch this camera to MJPEG or WebRTC (camera-streamer, go2rtc, MediaMTX) in the webcam settings.')
      }}</span>
    </div>

    <div v-if="audio && snd && cam" class="snd" :class="{ on: sndOn, touch }">
      <button
        class="sb"
        :class="{ on: sndOn, busy: sndBusy }"
        :aria-label="sndOn ? t('Turn the camera sound off') : t('Turn the camera sound on')"
        :aria-pressed="sndOn"
        :data-tip="sndOn ? t('Turn the camera sound off') : t('Turn the camera sound on')"
        @click="toggleSound"
      >
        <Icon :name="sndOn ? 'volume2' : 'volumex'" :size="17" :stroke="2.2" />
      </button>
      <label class="sv">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="vol"
          :aria-label="t('Volume')"
          @input="vol = +$event.target.value"
        />
      </label>
      <audio ref="audioEl" autoplay></audio>
    </div>
    <template v-if="overlay && cam && status === 'live'">
      <span class="live">{{ t('LIVE') }}</span>
      <span class="info"
        >{{ cam.name }}<template v-if="kind === 'snapshot'"> · {{ fps }} fps</template
        ><template v-else-if="isVideo">
          · {{ mode.startsWith('webrtc') ? 'WebRTC' : mode === 'hls' ? 'HLS' : 'video' }}</template
        ></span
      >
    </template>
  </div>
</template>
<style scoped>
.hint2 {
  font-size: 12px;
  opacity: 0.75;
  max-width: 440px;
}
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
  font-weight: 600;
}
/* camera sound: a round button in the top right corner, the volume slides out to its left */
.snd {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 6px;
}
.sb {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--bd);
  background: var(--s2);
  color: var(--tx);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  transition:
    background 0.12s,
    scale 0.08s;
}
.sb:hover {
  background: var(--s3);
}
.sb:active {
  scale: 0.9;
}
.sb.on {
  color: var(--ac);
}
.sb.busy {
  opacity: 0.6;
}
.sv {
  display: none;
  align-items: center;
  height: 34px;
  padding: 0 10px;
  border-radius: 17px;
  border: 1px solid var(--bd);
  background: var(--s2);
}
.sv input {
  width: 90px;
  accent-color: var(--ac);
}
/* the volume: on hover with a mouse, always while the sound is on with a touch screen */
.snd:not(.touch):hover .sv,
.snd:has(:focus-visible) .sv,
.snd.touch.on .sv {
  display: flex;
}
.snd audio {
  display: none;
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
