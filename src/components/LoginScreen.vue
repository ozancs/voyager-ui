<script setup>
// Shown only when Moonraker refuses this browser (force_logins, or not a trusted client).
import { ref } from 'vue'
import Icon from './Icon.vue'
import Logo from './Logo.vue'
import { state, printerName } from '../store'
import { api } from '../api/moonraker'
import { t } from '../i18n'
const user = ref(api.auth.user || '')
const pass = ref('')
const busy = ref(false)
const err = ref('')
async function submit() {
  if (!user.value || !pass.value) return
  busy.value = true; err.value = ''
  try { await api.login(user.value.trim(), pass.value, state.login?.source || 'moonraker'); pass.value = '' }
  catch (e) { err.value = /401|invalid|password/i.test(e.message) ? t('Wrong user name or password') : e.message }
  busy.value = false
}
</script>
<template>
  <div v-if="state.login?.needed" class="ov">
    <form class="lg card" @submit.prevent="submit">
      <div class="top"><Logo :size="42" /><div class="col" style="gap:0"><b>{{ printerName || 'Klipper' }}</b><span class="mu">{{ t('Moonraker asks for a login') }}</span></div></div>
      <label class="col f"><span class="lbl">{{ t('User name') }}</span><input v-model="user" class="input" autocomplete="username" autofocus /></label>
      <label class="col f"><span class="lbl">{{ t('Password') }}</span><input v-model="pass" class="input" type="password" autocomplete="current-password" /></label>
      <div v-if="state.login.sources?.length > 1" class="seg"><button v-for="s in state.login.sources" :key="s" type="button" :class="{ on: state.login.source === s }" @click="state.login.source = s">{{ s }}</button></div>
      <div v-if="err" class="err"><Icon name="warn" :size="15" />{{ err }}</div>
      <button class="btn lg acc" type="submit" :disabled="busy || !user || !pass"><Icon name="lock" :size="16" />{{ busy ? t('Signing in…') : t('Sign in') }}</button>
      <p class="mu hint">{{ t('Users are managed in Moonraker. To skip the login on your home network, add it to trusted_clients in moonraker.conf.') }}</p>
    </form>
  </div>
</template>
<style scoped>
.ov { position: fixed; inset: 0; z-index: 170; background: var(--bg); display: flex; align-items: center; justify-content: center; padding: 16px; }
.lg { width: 380px; max-width: 100%; gap: 14px; padding: 26px; }
.top { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.top b { font-size: 17px; }
.logo { width: 42px; height: 42px; border-radius: 12px; background: var(--ac); color: var(--oa); display: flex; align-items: center; justify-content: center; }
.mu { color: var(--mu); font-size: 13px; }
.f { gap: 5px; }
.err { display: flex; align-items: center; gap: 8px; color: var(--dg); font-size: 13px; }
.hint { margin: 0; font-size: 12px; line-height: 1.5; }
</style>
