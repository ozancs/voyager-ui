// Read notifier/bot connections without logging credentials; edit only selected keys in the original section.
export function iniSections(text) {
  const sections = [];
  let current, key;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\[([^\]]+)\]\s*(?:[#;].*)?$/);
    if (header) {
      current = { name: header[1], values: {} };
      sections.push(current);
      key = null;
      continue;
    }
    if (!current || /^\s*[#;]/.test(line)) continue;
    const field = line.match(/^([\w.-]+)\s*[:=]\s*(.*)$/);
    if (field) {
      key = field[1].toLowerCase();
      current.values[key] = field[2].trim();
    } else if (key && /^\s+\S/.test(line)) current.values[key] += '\n' + line.trim();
  }
  return sections;
}
export function notificationEntries(text, path) {
  return iniSections(text).flatMap(({ name, values }) => {
    if (/^notifier\s+/i.test(name))
      return [
        {
          name: name.slice(9),
          section: name,
          path,
          url: values.url || '',
          events: (values.events || '').split(/[,\s]+/).filter(Boolean),
          values,
        },
      ];
    if (/^(bot|secrets)$/i.test(name) && values.bot_token && values.chat_id)
      return [
        {
          name: 'Telegram bot',
          section: name,
          path,
          external: true,
          token: values.bot_token,
          chat: values.chat_id,
          values,
        },
      ];
    return [];
  });
}
export function updateIniSection(text, section, updates) {
  for (const value of Object.values(updates))
    if (/[\r\n]/.test(String(value))) throw Error('Values must be on one line.');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(
    (l) => l.match(/^\[([^\]]+)\]\s*(?:[#;].*)?$/)?.[1]?.toLowerCase() === section.toLowerCase(),
  );
  if (start < 0) throw Error('The config section changed. Refresh and try again.');
  let end = lines.findIndex((l, i) => i > start && /^\[/.test(l));
  if (end < 0) end = lines.length;
  const pending = { ...updates },
    body = [];
  let skipping = false;
  for (const line of lines.slice(start + 1, end)) {
    const field = line.match(/^([\w.-]+)(\s*[:=]\s*)/);
    if (field) {
      skipping = Object.hasOwn(updates, field[1].toLowerCase());
      if (skipping) {
        const key = field[1].toLowerCase();
        if (Object.hasOwn(pending, key)) body.push(`${field[1]}${field[2]}${pending[key]}`);
        delete pending[key];
        continue;
      }
    } else if (skipping && /^\s+\S/.test(line) && !/^\s*[#;]/.test(line)) continue;
    else if (line.trim() && !/^\s*[#;]/.test(line)) skipping = false;
    body.push(line);
  }
  for (const [key, value] of Object.entries(pending)) body.push(`${key}: ${value}`);
  return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join(newline);
}
export async function discoverNotificationConfigs(api) {
  const found = [],
    files = new Map(),
    warnings = [];
  let visited = 0;
  async function scan(dir, depth = 0) {
    if (++visited > 80 || depth > 4) {
      warnings.push('Some config folders were not scanned.');
      return;
    }
    let listing;
    try {
      listing = await api.call('server.files.get_directory', {
        path: 'config' + (dir ? '/' + dir : ''),
        extended: false,
      });
    } catch {
      warnings.push('A config folder could not be read.');
      return;
    }
    for (const f of listing.files || []) {
      if (!/\.(conf|ini|cfg)$/i.test(f.filename) || /(?:backup|\.bak|\.old|\d{8})/i.test(f.filename) || f.size > 256000)
        continue;
      const path = (dir ? dir + '/' : '') + f.filename;
      try {
        const text = await api.getText('/server/files/config/' + path.split('/').map(encodeURIComponent).join('/'));
        files.set(path, text);
        found.push(...notificationEntries(text, path));
      } catch {
        warnings.push('A config file could not be read.');
      }
    }
    for (const d of listing.dirs || []) {
      if (/^\.|backup|archive|\.git|logs|timelapse/i.test(d.dirname)) continue;
      await scan((dir ? dir + '/' : '') + d.dirname, depth + 1);
    }
  }
  await scan('');
  return { entries: found, files, warnings: [...new Set(warnings)] };
}
