// Runs before anything else reads localStorage: browser data saved under the earlier names of this UI
// (oznlab_klipperui, carbon-ui) is moved to the current name once.
const APP = 'voyager-ui'
const OLD = ['oznlab_klipperui', 'carbon-ui']
try {
  for (const old of OLD) for (const k of ['settings', 'objects', 'heaters', 'dismissed', 'host', 'theme', 'scale', 'lang', 'auth']) {
    const o = localStorage.getItem(old + '-' + k)
    if (o !== null && localStorage.getItem(APP + '-' + k) === null) localStorage.setItem(APP + '-' + k, o)
    localStorage.removeItem(old + '-' + k)
  }
} catch {}
