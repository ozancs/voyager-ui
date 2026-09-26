// selected items -> file paths, folders replaced by every file under them (from server.files.list)
export function expandPaths(items, all) {
  const out = items.filter((i) => !i.dir).map((i) => i.path);
  const dirs = items.filter((i) => i.dir).map((i) => i.path.replace(/\/+$/, ''));
  for (const f of all || []) if (dirs.some((d) => d === '' || f.path.startsWith(d + '/'))) out.push(f.path);
  return [...new Set(out)];
}
