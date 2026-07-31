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
        print('Fixed string')

# Fix hashCode
old_h = b'hash = ((hash << 5) - hash) + char\n  return hash'
zh = bytes.fromhex('e8bdace4b8ba3332e4bd8de695b4e695b0')  # 转为32位整数
new_h = b'hash = ((hash << 5) - hash) + char\n    hash = hash & hash; // ' + zh + b'\n  }\n  return hash'
if old_h in d:
    d = d.replace(old_h, new_h)
    print('Fixed hashCode')

# Fix merged instanceMap line
old_m = bytes.fromhex('2f2f20e98f8be58babe7bc93204865726d657320e780b9e782b0e7b7a5e98f8ce383a6e5a398e7909b3f2020636f6e737420696e7374616e63654d6170203d206e6577204d61703c6e756d6265722c204865726d6573496e7374616e63653e2829')
new_m = bytes.fromhex('2f2f20e98f8be58babe7bc93204865726d657320e780b9e782b0e7b7a5e98f8ce383a6e5a398e7909b0a2020636f6e737420696e7374616e63654d6170203d206e6577204d61703c6e756d6265722c204865726d6573496e7374616e63653e2829')
if old_m in d:
    d = d.replace(old_m, new_m)
    print('Fixed instanceMap merged line')
else:
    print('instanceMap pattern not found')

with open(path, 'wb') as f:
    f.write(d)
print('Done')
