<script setup>
// Shown only when Moonraker refuses this browser (force_logins, or not a trusted client).
import { ref } from 'vue';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import { state, printerName } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const user = ref(api.auth.user || '');
const pass = ref('');
const busy = ref(false);
const err = ref('');
const SNIP = '[authorization]\ntrusted_clients:\n  192.168.0.0/16\n  10.0.0.0/8\n  FE80::/10\n  ::1/128';
async function submit() {
  if (!user.value || !pass.value) return;
  busy.value = true;
  err.value = '';
  try {
    await api.login(user.value.trim(), pass.value, state.login?.source || 'moonraker');
    pass.value = '';
  } catch (e) {
    err.value = /401|invalid|password/i.test(e.message) ? t('Wrong user name or password') : e.message;
  }
  busy.value = false;
}
</script>
<template>
  <div v-if="state.login?.needed" class="ov">
    <form class="lg card" @submit.prevent="submit">
      <div class="top">
        <Logo :size="42" />
        <div class="col" style="gap: 0">
          <b>{{ printerName || 'Klipper' }}</b
          ><span class="mu">{{ t('Moonraker asks for a login') }}</span>
        </div>
      </div>
      <label class="col f"
        ><span class="lbl">{{ t('User name') }}</span
        ><input v-model="user" class="input" autocomplete="username" autofocus
      /></label>
      <label class="col f"
        ><span class="lbl">{{ t('Password') }}</span
        ><input v-model="pass" class="input" type="password" autocomplete="current-password"
      /></label>
      <div v-if="state.login.sources?.length > 1" class="seg">
        <button
          v-for="s in state.login.sources"
          :key="s"
          type="button"
          :class="{ on: state.login.source === s }"
          @click="state.login.source = s"
        >
          {{ s }}
        </button>
      </div>
      <div v-if="err" class="err"><Icon name="warn" :size="15" />{{ err }}</div>
      <button class="btn lg acc" type="submit" :disabled="busy || !user || !pass">
        <Icon name="lock" :size="16" />{{ busy ? t('Signing in…') : t('Sign in') }}
      </button>
      <p v-if="state.login.forced" class="mu hint">
        {{
          t(
            'force_logins is on in moonraker.conf and a Moonraker user exists, so every browser signs in. Use that user, or turn force_logins off.',
          )
        }}
      </p>
      <template v-else>
        <p class="mu hint">
          {{
            t(
              'Moonraker does not trust this device’s address. Without a Moonraker user there is nothing to sign in with: add your network to trusted_clients in moonraker.conf and restart Moonraker.',
            )
          }}
        </p>
        <pre class="snip mono">{{ SNIP }}</pre>
        <p class="mu hint">
          {{
            t(
              'Opening the printer by a .local name can connect over IPv6, which needs its own line. The IP address works too.',
            )
          }}
        </p>
      </template>
    </form>
  </div>
</template>
<style scoped>
.snip {
  margin: 0;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--bd);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  user-select: all;
  white-space: pre;
  overflow-x: auto;
}
.ov {
  position: fixed;
  inset: 0;
  z-index: 170;
  background: var(--bg);
  display: flex;
  align-items: safe center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
}
.lg {
  width: 380px;
  max-width: 100%;
  gap: 14px;
  padding: 26px;
}
.top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.top b {
  font-size: 17px;
}
.logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--ac);
  color: var(--oa);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mu {
  color: var(--mu);
  font-size: 13px;
}
.f {
  gap: 5px;
}
.err {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dg);
  font-size: 13px;
}
.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
