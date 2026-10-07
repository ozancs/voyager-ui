<script setup>
// Moonraker users and the API key (the [authorization] section). Lists the accounts, adds one, removes one, changes
// the password of the account this browser is logged in with, shows and renews the API key. Shown when Moonraker
// answers access.users.list, which it does for a logged-in user or a trusted client.
import { ref, onMounted } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { api } from '../api/moonraker';
import { toast, askConfirm } from '../store';
import { t } from '../i18n';
const users = ref(null); // null until the first answer; [] = none
const avail = ref(false);
const key = ref('');
const showKey = ref(false);
const add = ref(null); // { username, password }
const pw = ref(null); // { password, new1, new2 }
const busy = ref(false);
async function load() {
  try {
    const r = await api.call('access.users.list', {});
    users.value = r.users || [];
    avail.value = true;
  } catch {
    avail.value = false;
  }
  try {
    key.value = await api.call('access.get_api_key', {});
  } catch {
    key.value = '';
  }
}
onMounted(load);
async function create() {
  const { username, password } = add.value;
  if (!username.trim() || password.length < 4) return toast(t('Name and a password of at least 4 characters'), 'warn');
  busy.value = true;
  try {
    await api.call('access.post_user', { username: username.trim(), password });
    toast(t('User {name} added', { name: username.trim() }));
    add.value = null;
    await load();
  } catch (e) {
    toast(e.message, 'error');
  }
  busy.value = false;
}
async function remove(u) {
  if (!(await askConfirm({ title: t('Remove user?'), text: u.username, ok: t('Remove') }))) return;
  try {
    await api.call('access.delete_user', { username: u.username });
    await load();
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function changePw() {
  const { password, new1, new2 } = pw.value;
  if (new1.length < 4) return toast(t('Name and a password of at least 4 characters'), 'warn');
  if (new1 !== new2) return toast(t('The new passwords do not match'), 'warn');
  busy.value = true;
  try {
    await api.call('access.user.password', { password, new_password: new1 });
    toast(t('Password changed'));
    pw.value = null;
  } catch (e) {
    toast(e.message, 'error');
  }
  busy.value = false;
}
async function renewKey() {
  if (
    !(await askConfirm({
      title: t('Renew the API key?'),
      text: t(
        'Everything that uses the current key (slicer upload, scripts, apps) stops working until it gets the new one.',
      ),
      ok: t('Renew'),
    }))
  )
    return;
  try {
    key.value = await api.call('access.post_api_key', {});
    showKey.value = true;
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function copyKey() {
  try {
    await navigator.clipboard.writeText(key.value);
    toast(t('Copied'));
  } catch {
    showKey.value = true;
  }
}
const when = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString() : '');
</script>
<template>
  <section v-if="avail" class="card">
    <div class="card-h">
      <h2>{{ t('Users') }}</h2>
      <button class="btn" @click="add = { username: '', password: '' }">
        <Icon name="plus" :size="16" />{{ t('Add user') }}
      </button>
    </div>
    <div v-if="users && !users.length" class="mu sm">
      {{ t('No users. Without a user, anyone on the network who is a trusted client gets in.') }}
    </div>
    <div v-for="u in users" :key="u.username" class="row" style="height: 40px; gap: 10px">
      <Icon name="user" :size="16" style="color: var(--mu)" />
      <span class="grow">
        <b>{{ u.username }}</b>
        <span v-if="u.username === api.auth.user" class="chip" style="margin-left: 8px"><i></i>{{ t('you') }}</span>
      </span>
      <span class="mono mu sm"
        >{{ u.source }}<template v-if="u.created_on"> · {{ when(u.created_on) }}</template></span
      >
      <button
        v-if="u.username === api.auth.user"
        class="btn clear ibtn sm"
        :aria-label="t('Change password')"
        :data-tip="t('Change password')"
        @click="pw = { password: '', new1: '', new2: '' }"
      >
        <Icon name="key" :size="15" />
      </button>
      <button
        v-else
        class="btn clear ibtn sm"
        :aria-label="t('Remove user')"
        :disabled="u.source !== 'moonraker'"
        :data-tip="u.source !== 'moonraker' ? t('Managed outside Moonraker') : t('Remove user')"
        @click="remove(u)"
      >
        <Icon name="trash" :size="15" />
      </button>
    </div>
    <div class="col" style="gap: 6px; border-top: 1px solid var(--bd); padding-top: 10px">
      <span class="lbl">{{ t('API key') }}</span>
      <div class="row" style="gap: 8px">
        <code class="key mono grow">{{ showKey ? key : key ? '•'.repeat(32) : t('none') }}</code>
        <button class="btn clear ibtn sm" :aria-label="showKey ? t('Hide') : t('Show')" @click="showKey = !showKey">
          <Icon :name="showKey ? 'eyeoff' : 'eye'" :size="15" />
        </button>
        <button class="btn clear ibtn sm" :aria-label="t('Copy')" :disabled="!key" @click="copyKey">
          <Icon name="copy" :size="15" />
        </button>
        <button class="btn" @click="renewKey"><Icon name="refresh" :size="15" />{{ t('Renew') }}</button>
      </div>
      <span class="mu sm">{{
        t('For slicers and scripts that talk to Moonraker from outside the trusted network (X-Api-Key header).')
      }}</span>
    </div>

    <Modal v-if="add" :title="t('Add user')" width="400px" @close="add = null">
      <label class="col" style="gap: 4px"
        ><span class="lbl">{{ t('User name') }}</span
        ><input v-model="add.username" class="input" autocomplete="off"
      /></label>
      <label class="col" style="gap: 4px"
        ><span class="lbl">{{ t('Password') }}</span
        ><input
          v-model="add.password"
          class="input"
          type="password"
          autocomplete="new-password"
          @keydown.enter="create"
      /></label>
      <template #foot>
        <button class="btn lg" @click="add = null">{{ t('Cancel') }}</button>
        <button class="btn lg acc" :disabled="busy" @click="create">{{ t('Add') }}</button>
      </template>
    </Modal>
    <Modal v-if="pw" :title="t('Change password')" width="400px" @close="pw = null">
      <label class="col" style="gap: 4px"
        ><span class="lbl">{{ t('Current password') }}</span
        ><input v-model="pw.password" class="input" type="password" autocomplete="current-password"
      /></label>
      <label class="col" style="gap: 4px"
        ><span class="lbl">{{ t('New password') }}</span
        ><input v-model="pw.new1" class="input" type="password" autocomplete="new-password"
      /></label>
      <label class="col" style="gap: 4px"
        ><span class="lbl">{{ t('Repeat the new password') }}</span
        ><input v-model="pw.new2" class="input" type="password" autocomplete="new-password" @keydown.enter="changePw"
      /></label>
      <template #foot>
        <button class="btn lg" @click="pw = null">{{ t('Cancel') }}</button>
        <button class="btn lg acc" :disabled="busy" @click="changePw">{{ t('Change') }}</button>
      </template>
    </Modal>
  </section>
</template>
<style scoped>
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
.key {
  font-size: 12px;
  padding: 6px 10px;
  background: var(--s2);
  border-radius: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
