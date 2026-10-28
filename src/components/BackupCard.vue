<script setup>
// Config backup to GitHub through Klipper-Backup (backup.js): the last result, Back up now, and backing up by
// itself after config changes. Without Klipper-Backup it says where to get it.
import { computed, ref } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import { state, fmtDate } from '../store';
import { backup, backupCommand, runBackup } from '../backup';
import { t } from '../i18n';
const cmd = computed(() => backupCommand());
const last = computed(() => state.settings.backupLast);
const showLog = ref(false);
</script>
<template>
  <section class="card">
    <div class="card-h">
      <CardTitle :text="t('Config backup')" />
      <button v-if="cmd" class="btn" :disabled="backup.running || backup.waiting" @click="runBackup()">
        <Icon :name="backup.running ? 'refresh' : 'upload'" :size="16" :class="{ spin: backup.running }" />{{
          backup.running ? t('Backing up…') : t('Back up now')
        }}
      </button>
    </div>
    <template v-if="cmd">
      <div class="row sb">
        <span class="mu sm">{{ t('Last backup') }}</span>
        <span v-if="last" class="row" style="gap: 6px"
          ><Icon
            :name="last.ok ? 'check' : 'warn'"
            :size="15"
            :style="{ color: last.ok ? 'var(--ok)' : 'var(--dg)' }"
          /><span class="mono sm">{{ fmtDate(last.t / 1000) }}</span
          ><button v-if="last.lines?.length" class="btn clear sm" @click="showLog = !showLog">
            {{ showLog ? t('Hide') : t('Log') }}
          </button></span
        >
        <span v-else class="mu sm">{{ t('not from this interface yet') }}</span>
      </div>
      <pre v-if="showLog && last?.lines?.length" class="log mono">{{ last.lines.join('\n') }}</pre>
      <p v-if="backup.waiting" class="mu sm" style="margin: 0">
        {{ t('A print is running: the backup starts when it is done.') }}
      </p>
      <div class="row sb">
        <div class="col" style="gap: 2px; min-width: 0">
          <b class="sm">{{ t('Back up after config changes') }}</b>
          <span class="mu sm">{{
            t('A minute after a config file is saved or SAVE_CONFIG runs, never during a print.')
          }}</span>
        </div>
        <Toggle v-model="state.settings.backupAuto" :label="t('Back up after config changes')" />
      </div>
      <span class="mu xs mono">{{ cmd }}</span>
    </template>
    <template v-else>
      <p class="mu sm" style="margin: 0">
        {{
          t(
            'Klipper-Backup keeps the config folder in a GitHub repository. Install it and add the UPDATE_GIT macro from its manual page; this card then backs up with one click or after every config change.',
          )
        }}
      </p>
      <a class="row sm" href="https://klipperbackup.xyz/manual/" target="_blank" rel="noopener" style="gap: 6px"
        ><Icon name="ext" :size="15" />klipperbackup.xyz</a
      >
    </template>
  </section>
</template>
<style scoped>
.sm {
  font-size: 13px;
}
.xs {
  font-size: 11px;
}
.mu {
  color: var(--mu);
}
.log {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  font-size: 11.5px;
  line-height: 1.5;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--bd);
  border-radius: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
