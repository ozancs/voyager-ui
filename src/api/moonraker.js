// Minimal Moonraker JSON-RPC websocket client + HTTP helpers.

export class Moonraker {
  constructor() {
    this.ws = null
    this.id = 1
    this.pending = new Map()
    this.handlers = {}
    this.host = ''
    this.retry = null
    // Moonraker login (only used when Moonraker asks for it, trusted clients never see a login)
    this.auth = { token: '', refresh: '', user: '' }
    try { Object.assign(this.auth, JSON.parse(localStorage.getItem('voyager-ui-auth') || '{}')) } catch {}
  }

  saveAuth() { try { localStorage.setItem('voyager-ui-auth', JSON.stringify(this.auth)) } catch {} }
  headers(extra = {}) { return this.auth.token ? { ...extra, Authorization: 'Bearer ' + this.auth.token } : extra }
  // Moonraker endpoints get the token in the query when a header is impossible (<img>, downloads)
  isMoonrakerPath(p) { return /^\/(server|printer|machine|access|api)\//.test(p) }

  // host '' = same origin (served by our nginx). host 'klipper.local' = dev mode.
  get httpBase() {
    return this.host ? `${location.protocol}//${this.host}` : ''
  }

  // /server/files/<root>/<path> with every path segment encoded (names with #, %, ? or spaces)
  fileUrl(root, path) {
    const enc = String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/')
    return this.url(`/server/files/${root}/${enc}`)
  }

  url(path) {
    if (!path) return ''
    if (/^https?:\/\//.test(path)) return path
    const p = path.startsWith('/') ? path : '/' + path
    const tok = this.auth.token && this.isMoonrakerPath(p) ? (p.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(this.auth.token) : ''
    return this.httpBase + p + tok
  }

  // fetch with the login token, refreshing it once when it expired
  async fetch(path, opts = {}, retry = true) {
    const r = await fetch(this.httpBase + (path.startsWith('/') ? path : '/' + path), { cache: 'no-store', ...opts, headers: this.headers(opts.headers) })
    if (r.status === 401 && retry && this.auth.refresh && (await this.refreshToken())) return this.fetch(path, opts, false)
    return r
  }
  async refreshToken() {
    try {
      const r = await fetch(this.httpBase + '/access/refresh_jwt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: this.auth.refresh }) })
      if (!r.ok) return false
      const j = (await r.json()).result
      this.auth.token = j.token; this.saveAuth()
      return true
    } catch { return false }
  }
  async login(username, password, source = 'moonraker') {
    const r = await fetch(this.httpBase + '/access/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, source }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error?.message || 'HTTP ' + r.status)
    this.auth = { token: j.result.token, refresh: j.result.refresh_token, user: j.result.username }
    this.saveAuth()
    this.connect(this.host)
  }
  async logout() {
    try { await this.fetch('/access/logout', { method: 'POST' }, false) } catch {}
    this.auth = { token: '', refresh: '', user: '' }; this.saveAuth()
    try { this.ws?.close() } catch {}
  }
  // Decide how to open the websocket: '' (trusted), '?token=…' (logged in) or null (login needed)
  async wsQuery() {
    let r
    try { r = await this.fetch('/server/info') } catch { return '' } // network error: let the websocket fail and retry
    if (r.status === 401 || r.status === 403) { this.emit('auth-required', await this.authInfo()); return null }
    if (!this.auth.token) return ''
    try {
      const o = await this.fetch('/access/oneshot_token')
      if (o.ok) return '?token=' + encodeURIComponent((await o.json()).result)
    } catch {}
    return ''
  }
  async authInfo() {
    try { const r = await fetch(this.httpBase + '/access/info'); return (await r.json()).result || {} } catch { return {} }
  }

  on(method, fn) {
    ;(this.handlers[method] ||= []).push(fn)
  }

  off(method, fn) {
    const l = this.handlers[method]
    if (l) this.handlers[method] = l.filter((f) => f !== fn)
  }

  emit(method, params) {
    for (const fn of this.handlers[method] || []) {
      try { fn(params) } catch (e) { console.error(method, e) }
    }
  }

  async connect(host = '') {
    if (host && !/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) host = '' // host[:port] only, never a path or credentials
    this.host = host
    clearTimeout(this.retry)
    const q = await this.wsQuery()
    if (q === null) return // waiting for the user to log in, login() connects again
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const target = host || location.host
    const ws = new WebSocket(`${proto}://${target}/websocket${q}`)
    this.ws = ws
    ws.onopen = () => this.emit('open')
    ws.onclose = () => {
      for (const [, p] of this.pending) p.reject(new Error('disconnected'))
      this.pending.clear()
      this.emit('close')
      this.retry = setTimeout(() => this.connect(this.host), 2000)
    }
    ws.onerror = () => {}
    ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message || 'error'), { code: msg.error.code }))
        else p.resolve(msg.result)
      } else if (msg.method) {
        this.emit(msg.method, msg.params)
      }
    }
  }

  // optional hook so the UI can show what is being loaded
  onTask = null

  call(method, params) {
    const done = this.onTask ? this.onTask(method) : null
    const p = this._call(method, params)
    if (done) { const tm = setTimeout(done, 30000); const fin = () => { clearTimeout(tm); done() }; p.then(fin, fin) }
    return p
  }

  // Wait (briefly) for the socket to come up. Pages that load data in onMounted otherwise fail with 'not connected'
  // when they are opened by deep link or reload, before the socket has finished connecting.
  ready() {
    if (this.ws?.readyState === 1) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const ok = () => { clearTimeout(tm); this.off('open', ok); resolve() }
      const tm = setTimeout(() => { this.off('open', ok); reject(new Error('not connected')) }, 8000)
      this.on('open', ok)
    })
  }

  async _call(method, params) {
    await this.ready()
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) return reject(new Error('not connected'))
      const id = this.id++
      this.pending.set(id, { resolve, reject })
      const msg = { jsonrpc: '2.0', method, id }
      if (params !== undefined) msg.params = params
      this.ws.send(JSON.stringify(msg))
    })
  }

  gcode(script) {
    return this.call('printer.gcode.script', { script })
  }

  async getText(path) {
    const done = this.onTask ? this.onTask('GET ' + path.split('/').pop()) : null
    try {
      const r = await this.fetch(path)
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return await r.text()
    } finally { done && done() }
  }

  // Upload a File/Blob. root: 'gcodes' | 'config'. Returns moonraker response.
  upload(file, { root = 'gcodes', path = '', name, print = false, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const fd = new FormData()
      fd.append('root', root)
      if (path) fd.append('path', path)
      if (print) fd.append('print', 'true')
      fd.append('file', file, name || file.name)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', this.httpBase + '/server/files/upload')
      if (this.auth.token) xhr.setRequestHeader('Authorization', 'Bearer ' + this.auth.token)
      xhr.upload.onprogress = (e) => onProgress && e.lengthComputable && onProgress(e.loaded / e.total)
      xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText || '{}')) : reject(new Error(xhr.responseText || xhr.statusText)))
      xhr.onerror = () => reject(new Error('upload failed'))
      xhr.send(fd)
    })
  }
}

export const api = new Moonraker()
