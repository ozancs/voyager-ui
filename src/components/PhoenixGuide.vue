<script setup>
// Explanatory drawing for the Phoenix recovery wizard (after phoenix-for-klipper's RecoveryGuide.vue): inspect,
// clearance (a gap opens between nozzle and part), clean (at the park point), return. Not telemetry and not the
// printer's real position, so it always says so. Colours come from the theme; no motion with reduced motion.
import { t } from '../i18n';
defineProps({ step: { type: String, default: 'inspect' } });
</script>
<template>
  <figure class="pg" :data-step="step">
    <svg viewBox="0 0 360 200" role="img" :aria-label="t('Illustration only, not the actual printer position')">
      <path class="frame" d="M32 166V22h296v144M32 42h296" />
      <path class="bed" d="M53 165h254" />
      <path class="print" d="M118 163v-59h99v59M118 113h99m-99 10h99m-99 10h99m-99 10h99m-99 10h99" />
      <path class="route" d="M167 102V67H270" />
      <g class="head">
        <rect x="153" y="68" width="28" height="21" rx="4" />
        <path d="M161 89h12l-6 13z" />
      </g>
      <circle class="blob" cx="167" cy="102" r="5" />
      <path class="check" d="m238 117 8 8 16-18" />
    </svg>
    <figcaption>{{ t('Illustration only, not the actual printer position') }}</figcaption>
  </figure>
</template>
<style scoped>
.pg {
  margin: 0;
  padding: 14px;
  border: 1px solid var(--bd);
  border-radius: var(--rb);
  background: var(--s2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
svg {
  display: block;
  width: 100%;
  max-height: 200px;
}
.frame {
  fill: none;
  stroke: var(--s3);
  stroke-width: 5;
  stroke-linecap: round;
}
.bed {
  stroke: var(--mu);
  stroke-width: 5;
  stroke-linecap: round;
}
.print {
  fill: var(--s1);
  stroke: var(--mu2);
  stroke-width: 1.5;
}
.head {
  fill: var(--ac);
}
.route {
  fill: none;
  stroke: var(--ac);
  stroke-dasharray: 4 5;
  opacity: 0;
}
.blob {
  fill: var(--wn);
}
.check {
  fill: none;
  stroke: var(--ok);
  stroke-width: 4;
  opacity: 0;
}
figcaption {
  color: var(--mu);
  font-size: 12px;
  text-align: center;
}
[data-step='clearance'] .head {
  animation: lift 4s ease-in-out infinite;
}
[data-step='clearance'] .route,
[data-step='return'] .route {
  opacity: 0.5;
}
[data-step='clean'] .head {
  transform: translate(103px, -35px);
}
[data-step='clean'] .blob {
  animation: clean 3s ease-in-out infinite;
}
[data-step='clean'] .check {
  opacity: 1;
}
[data-step='return'] .head {
  animation: back 4s ease-in-out infinite;
}
[data-step='return'] .blob {
  opacity: 0;
}
@keyframes lift {
  0%,
  15% {
    transform: translate(0, 0);
  }
  40% {
    transform: translate(0, -35px);
  }
  70%,
  100% {
    transform: translate(103px, -35px);
  }
}
@keyframes back {
  0%,
  15% {
    transform: translate(103px, -35px);
  }
  55% {
    transform: translate(0, -35px);
  }
  85%,
  100% {
    transform: translate(0, 0);
  }
}
@keyframes clean {
  0%,
  25% {
    opacity: 1;
  }
  65%,
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .head,
  .blob {
    animation: none !important;
  }
  [data-step='clearance'] .head {
    transform: translate(0, -35px);
  }
}
</style>
