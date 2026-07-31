import os, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
base = r'D:\二次开发\desktop'

# Check electron-vite config
ev_path = os.path.join(base, 'electron.vite.config.ts')
if os.path.exists(ev_path):
    with open(ev_path, 'rb') as f:
        d = f.read()
    if d[:3] == b'\xef\xbb\xbf':
        d = d[3:]
    text = d.decode('utf-8')
    print('=== electron.vite.config.ts ===')
    for i, l in enumerate(text.split('\n')):
        for kw in ['publicDir', 'public', 'assets', 'copy', 'static']:
            if kw.lower() in l.lower():
                print(f'  L{i+1}: {l.strip()[:120]}')

# Check package.json build config
with open(os.path.join(base, 'package.json'), 'rb') as f:
    d = f.read()
if d[:3] == b'\xef\xbb\xbf':
    d = d[3:]
pkg = json.loads(d)
build = pkg.get('build', {})
print('\n=== electron-builder config ===')
print('  appId:', build.get('appId', 'N/A'))
print('  productName:', build.get('productName', 'N/A'))
dirs = build.get('directories', {})
print('  directories:', dirs)
files_cfg = build.get('files', [])
print('  files:', files_cfg if files_cfg else '(default)')
extra = build.get('extraResources', [])
print('  extraResources:', extra if extra else '(none)')
win_cfg = build.get('win', {})
print('  win target:', win_cfg.get('target', 'N/A'))

# Check public directory
root_public = os.path.join(base, 'public')
if os.path.exists(root_public):
    count = sum(1 for _ in os.walk(root_public) for f in _[2])
    print(f'\n  public/: {count} files')

# Check dist after build
dist_assets = os.path.join(base, 'dist', 'renderer', 'assets')
if os.path.exists(dist_assets):
    count = sum(1 for _ in os.walk(dist_assets) for f in _[2])
    print(f'  dist/renderer/assets: {count} files')
    office_assets = os.path.join(dist_assets, 'office')
    if os.path.exists(office_assets):
        count2 = sum(1 for _ in os.walk(office_assets) for f in _[2])
        print(f'  dist/renderer/assets/office: {count2} files')
    else:
        print('  dist/renderer/assets/office: MISSING (will be filled after full build)')
else:
    print('  dist/renderer/assets: not yet built')
