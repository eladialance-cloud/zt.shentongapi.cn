import os
base = r'D:\二次开发\desktop'
path = os.path.join(base, r'src\pages\Office\office-config.ts')
with open(path, 'rb') as f:
    d = f.read()

# All string fixes
fixes = [
    (bytes.fromhex('27e6b6933f'), bytes.fromhex('27e8bf9be8a18ce4b8ad27')),
    (bytes.fromhex('e98eb6e282ace991b33f'), bytes.fromhex('e68a80e883bd')),
    (bytes.fromhex('e5afb0e591ade5a799'), bytes.fromhex('e5be85e58a9e')),
    (bytes.fromhex('27e6b6933f2c202020'), bytes.fromhex('27e8bf9be8a18ce4b8ad272c202020')),
    (bytes.fromhex('27e5aeb8e68f92e795ace98eb43f2c202020'), bytes.fromhex('27e5b7b2e5ae8ce68890272c202020')),
    (bytes.fromhex('e996abe6b0b1e695a4'), bytes.fromhex('e9809ae794a8')),
    (bytes.fromhex('27e6beb6e58bade6828ae6b5a0e8afb2e5a79fe6b6933f'), bytes.fromhex('27e5a484e79086e4bbbbe58aa1e4b8ad27')),
]
for old, new in fixes:
    if old in d:
        d = d.replace(old, new)
        print(f'Fixed: {old.hex()[:20]}...')

# Fix hashCode
old_h = b'hash = ((hash << 5) - hash) + char\n  return hash'
new_h = b'hash = ((hash << 5) - hash) + char\n    hash = hash & hash; // 转为32位整数\n  }\n  return hash'
if old_h in d:
    d = d.replace(old_h, new_h)
    print('Fixed hashCode')

# Fix merged instanceMap line
old_m = b'// \xe9\x8f\x8b\xe5\x8b\xab\xe7\xbc\x93 Hermes \xe7\x80\xb9\xe7\x82\xb0\xe7\xb7\xa5\xe9\x8f\x8c\xe3\x83\xa6\xe5\xa3\x98\xe7\x90\x9b?  const instanceMap = new Map<number, HermesInstance>()'
new_m = b'// \xe9\x8f\x8b\xe5\x8b\xab\xe7\xbc\x93 Hermes \xe7\x80\xb9\xe7\x82\xb0\xe7\xb7\xa5\xe9\x8f\x8c\xe3\x83\xa6\xe5\xa3\x98\xe7\x90\x9b\n  const instanceMap = new Map<number, HermesInstance>()'
if old_m in d:
    d = d.replace(old_m, new_m)
    print('Fixed instanceMap merged line')
else:
    print('instanceMap pattern not found, checking...')
    idx = d.find(b'Hermes \xe7\x80\xb9')
    if idx >= 0:
        print(f'Found at {idx}: {d[idx:idx+100]}')

with open(path, 'wb') as f:
    f.write(d)
print('Done fixing office-config.ts')
