// Helpers to find and replace a key inside Klipper config text.
// Returns new text or null if section not found.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function setOption(text, section, key, value) {
  const lines = text.split('\n')
  const sec = section.trim().toLowerCase()
  // 1) SAVE_CONFIG autosave block takes precedence
  const autoStart = lines.findIndex((l) => l.startsWith('#*# <---------------------- SAVE_CONFIG'))
  if (autoStart >= 0) {
    let cur = null
    for (let i = autoStart; i < lines.length; i++) {
      const m = lines[i].match(/^#\*#\s*\[([^\]]+)\]/)
      if (m) { cur = m[1].trim().toLowerCase(); continue }
      if (cur === sec) {
        const km = lines[i].match(new RegExp('^#\\*#\\s*' + esc(key) + '\\s*[:=]\\s*(.*)$', 'i'))
        if (km) { lines[i] = `#*# ${key} = ${value}`; return { text: lines.join('\n'), where: 'autosave' } }
      }
    }
  }
  // 2) normal sections
  let cur = null, secLine = -1
  const end = autoStart >= 0 ? autoStart : lines.length
  for (let i = 0; i < end; i++) {
    const l = lines[i]
    const m = l.match(/^\[([^\]]+)\]/)
    if (m) {
      if (cur === sec && secLine >= 0) break
      cur = m[1].trim().toLowerCase()
      if (cur === sec) secLine = i
      continue
    }
    if (cur !== sec) continue
    const km = l.match(new RegExp('^(' + esc(key) + ')(\\s*[:=]\\s*)([^#;\\n]*?)(\\s*[#;].*)?$', 'i'))
    if (km) {
      lines[i] = km[1] + km[2] + value + (km[4] || '')
      return { text: lines.join('\n'), where: 'line ' + (i + 1) }
    }
  }
  if (secLine >= 0) {
    lines.splice(secLine + 1, 0, `${key}: ${value}`)
    return { text: lines.join('\n'), where: 'added after line ' + (secLine + 1) }
  }
  return null
}

export function hasSection(text, section) {
  const sec = section.trim().toLowerCase()
  return text.split('\n').some((l) => {
    const m = l.match(/^(?:#\*#\s*)?\[([^\]]+)\]/)
    return m && m[1].trim().toLowerCase() === sec
  })
}
