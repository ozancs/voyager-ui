#!/usr/bin/env python3
# Collect every UI string (t('...'), tn(n, '...', '...')) into scripts/i18n-keys.json and list what a
# language file is missing:  python3 scripts/i18n_keys.py [lang]
import re, glob, json, os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
keys, seen = [], set()
old = json.load(open(os.path.join(root, 'scripts/i18n-keys.json'))) if os.path.exists(os.path.join(root, 'scripts/i18n-keys.json')) else []
def add(k):
    if k not in seen: seen.add(k); keys.append(k)
for k in old: add(k)  # keeps strings used through variables (menu labels, states)
for f in sorted(glob.glob(os.path.join(root, 'src/**/*.*'), recursive=True)):
    if not f.endswith(('.vue', '.js')) or '/locales/' in f: continue
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r"\bt\(\s*'((?:[^'\\]|\\.)+)'", s): add(m.group(1).replace("\\'", "'"))
    for m in re.finditer(r"\btn\([^,]+,\s*'((?:[^'\\]|\\.)+)'\s*,\s*'((?:[^'\\]|\\.)+)'", s): add(m.group(1)); add(m.group(2))
json.dump(keys, open(os.path.join(root, 'scripts/i18n-keys.json'), 'w'), ensure_ascii=False, indent=0)
print(len(keys), 'keys')
if len(sys.argv) > 1:
    d = json.loads(subprocess.check_output(['node', '-e', f"import('{root}/src/locales/{sys.argv[1]}.js').then(m=>console.log(JSON.stringify(m.default)))"]))
    for k in keys:
        if k not in d: print('missing:', k)
