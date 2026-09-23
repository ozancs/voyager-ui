<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
const props = defineProps({ z: Array, min: Array, max: Array, lim: Number })
const el = ref(null)
let Plotly = null
async function draw() {
  if (!props.z || !el.value) return
  if (!Plotly) Plotly = (await import('plotly.js-gl3d-dist-min')).default
  const rows = props.z.length, cols = props.z[0].length
  const [x0, y0] = props.min || [0, 0], [x1, y1] = props.max || [cols - 1, rows - 1]
  const xs = Array.from({ length: cols }, (_, i) => x0 + ((x1 - x0) * i) / Math.max(1, cols - 1))
  const ys = Array.from({ length: rows }, (_, i) => y0 + ((y1 - y0) * i) / Math.max(1, rows - 1))
  const lim = props.lim
  const ax = (t) => ({ title: { text: t, font: { color: '#a3a7ae' } }, color: '#a3a7ae', gridcolor: '#2e3238', zerolinecolor: '#3a3f46', backgroundcolor: 'rgba(0,0,0,0)', showbackground: false })
  Plotly.react(el.value, [{
    type: 'surface', x: xs, y: ys, z: props.z, cmin: -lim, cmax: lim,
    colorscale: [[0, '#3878ff'], [0.5, '#2e3238'], [1, '#ff6b1a']],
    colorbar: { thickness: 12, len: 0.7, tickfont: { color: '#a3a7ae', family: 'JetBrains Mono', size: 10 }, outlinewidth: 0 },
    contours: { z: { show: true, usecolormap: true, project: { z: true }, width: 1 } },
    hovertemplate: 'X %{x:.1f}<br>Y %{y:.1f}<br>Z %{z:.4f}<extra></extra>',
    lighting: { ambient: 0.8, diffuse: 0.6, specular: 0.1 },
  }], {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: 0, b: 0 },
    font: { family: 'Space Grotesk', color: '#f2f2ef' },
    scene: {
      xaxis: ax('X'), yaxis: ax('Y'), zaxis: { ...ax('Z'), range: [-Math.max(lim * 2, 0.2), Math.max(lim * 2, 0.2)] },
      aspectmode: 'manual', aspectratio: { x: 1, y: (y1 - y0) / Math.max(1, x1 - x0), z: 0.4 },
      camera: { eye: { x: -1.2, y: -1.5, z: 0.9 } },
    },
  }, { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['toImage', 'resetCameraLastSave3d'] })
}
onMounted(draw)
watch(() => [props.z, props.lim], draw)
onBeforeUnmount(() => { if (Plotly && el.value) Plotly.purge(el.value) })
</script>
<template><div ref="el" style="width:100%;height:100%;min-height:420px"></div></template>
