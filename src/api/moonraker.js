// Minimal Moonraker JSON-RPC websocket client + HTTP helpers.

export class Moonraker {
  constructor() {
    this.ws = null
    this.id = 1
    this.pending = new Map()
    this.handlers = {}
    this.host = ''
    this.retry = null
  }

  // host '' = same origin (served by our nginx). host 'klipper.local' = dev mode.
  get httpBase() {
    return this.host ? `${location.protocol}//${this.host}` : ''
  }

  url(path) {
    if (!path) return ''
    if (/^https?:\/\//.test(path)) return path
    return this.httpBase + (path.startsWith('/') ? path : '/' + path)
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

  connect(host = '') {
    this.host = host
    clearTimeout(this.retry)
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const target = host || location.host
    const ws = new WebSocket(`${proto}://${target}/websocket`)
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
    if (done) p.then(done, done)
    return p
  }

  _call(method, params) {
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
      const r = await fetch(this.url(path), { cache: 'no-store' })
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
      xhr.open('POST', this.url('/server/files/upload'))
      xhr.upload.onprogress = (e) => onProgress && e.lengthComputable && onProgress(e.loaded / e.total)
      xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText || '{}')) : reject(new Error(xhr.responseText || xhr.statusText)))
      xhr.onerror = () => reject(new Error('upload failed'))
      xhr.send(fd)
    })
  }
}

export const api = new Moonraker()
