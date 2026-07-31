import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
base = r'D:\二次开发\desktop'

# Check if src/public exists
src_public = os.path.join(base, 'src', 'public')
if os.path.exists(src_public):
    count = sum(1 for _ in os.walk(src_public) for f in _[2])
    print(f'src/public/: EXISTS ({count} files)')
else:
    print('src/public/: MISSING')

# Check src/assets/office
src_assets_office = os.path.join(base, 'src', 'assets', 'office')
if os.path.exists(src_assets_office):
    count = sum(1 for _ in os.walk(src_assets_office) for f in _[2])
    print(f'src/assets/office/: EXISTS ({count} files)')
    # Show directory structure
    for root, dirs, files in os.walk(src_assets_office):
        level = root.replace(src_assets_office, '').count(os.sep)
        indent = '  ' * level
        folder = os.path.basename(root)
        print(f'{indent}{folder}/ ({len(files)} files)')
        if level < 2:
            for f in sorted(files)[:3]:
                print(f'{indent}  {f}')
            if len(files) > 3:
                print(f'{indent}  ...')
else:
    print('src/assets/office/: MISSING')

# Check the electron-builder config for asset inclusion
print('\n=== Full electron-builder config in package.json ===')
import json
with open(os.path.join(base, 'package.json'), 'rb') as f:
    d = f.read()
if d[:3] == b'\xef\xbb\xbf':
    d = d[3:]
pkg = json.loads(d)
build_config = pkg.get('build', {})
import pprint
pprint.pprint(build_config)
