import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
base = r'D:\二次开发\desktop'

# Check: does electron-vite build output include office assets?
dist_office = os.path.join(base, 'dist', 'renderer', 'office')
dist_assets_office = os.path.join(base, 'dist', 'renderer', 'assets', 'office')

print('After electron-vite renderer build:')
print(f'  dist/renderer/office/         : {\"EXISTS\" if os.path.exists(dist_office) else \"MISSING\"}')
print(f'  dist/renderer/assets/office/  : {\"EXISTS\" if os.path.exists(dist_assets_office) else \"MISSING\"}')

# What does the asset-loader expect in file:// mode?
print('\nAsset resolution in production (file:// mode):')
print('  HTML location: dist/renderer/index.html')
print('  Base dir would be: dist/renderer/')
print('  Asset path resolved: dist/renderer/office/iso/furniture/desk.png')
print('  So assets need to be at: dist/renderer/office/iso/...')

# Check the vite config for publicDir
import json
print('\nVite renderer root: src/')
print('Default publicDir: src/public/')
print('Office assets location: src/assets/office/iso/ (652 files)')
print('Vite does NOT copy src/assets/ to dist unless imported by code')
print('Dynamic URL loading bypasses Vite asset handling')

# Check if there's a copy script in package.json
with open(os.path.join(base, 'package.json'), 'rb') as f:
    d = f.read()
if d[:3] == b'\xef\xbb\xbf':
    d = d[3:]
pkg = json.loads(d)
scripts = pkg.get('scripts', {})
print('\nBuild scripts:')
for k, v in scripts.items():
    if 'build' in k.lower() or 'copy' in k.lower() or 'asset' in k.lower():
        print(f'  {k}: {v}')
