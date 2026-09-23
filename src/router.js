import { reactive } from 'vue'
export const route = reactive({ name: 'dashboard', arg: '' })
function parse() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  const [name, ...rest] = h.split('/')
  route.name = name || 'dashboard'
  route.arg = rest.join('/')
}
window.addEventListener('hashchange', parse)
parse()
export const go = (name, arg = '') => { location.hash = '/' + name + (arg ? '/' + encodeURIComponent(arg) : '') }
