#!/usr/bin/env python3
"""
Fix GBK→UTF-8 double-encoding garbled text in TypeScript files.
- Comments with garbled text: remove the comment content
- String literals with garbled text: replace with empty string
- Preserve normal Chinese text
- Preserve all code logic
- Write UTF-8 no BOM
"""

import re
import os

# CJK Extension A range: U+3400-U+4DBF
# CJK Compatibility Ideographs: U+F900-U+FAFF
# Private Use Area: U+E000-U+F8FF
# CJK Unified Ideographs Extension B+: U+20000-U+2A6DF
# Common garbled chars from GBK→UTF-8 double encoding
GARBLED_CHARS = set('閸閻鐎鐟瀹缁缂绾娑婵濞闁鐠閺閿鐏鐣鏉鏌椤濡鏀閵閹鐢鐥閽鐧鍡鍢鍣鍥鍧鍨鍩鍪鍫鍬鍭鍮鍯鍰鍱鍲鍳鍵鍶鍷鍸鍹鍺鍻鍼鍽鍾鍿鎀鎁鎂鎃鎄鎅鎆鎇鎈鎉鎊鎋鎌鎍鎎鎏鎐鎑鎒鎓鎔鎕鎖鎗鎘鎙鎚鎛鎜鎝鎞鎟鎠鎡鎢鎣鎤鎥鎦鎧鎨鎩鎪鎫鎬鎭鎮鎯鎰鎱鎲鎳鎴鎵鎶鎷鎸鎹鎺鎻鎼鎽鎾鎿鏀鏁鏂鏃鏄鏅鏆鏇鏈鏉鏊鏋鏌鏍鏎鏏鏐鏑鏒鏓鏔鏕鏖鏗鏘鏙鏚鏛鏜鏝鏞鏟鏠鏡鏢鏣鏤鏥鏦鏧鏨鏩鏪鏫鏬鏭鏮鏯鏰鏱鏲鏳鏴鏵鏶鏷鏸鏹鏺鏻鏼鏽鏾鏿鐀鐁鐂鐃鐄鐅鐆鐇鐈鐉鐊鐋鐌鐍鐎鐏鐐鐑鐒鐓鐔鐕鐖鐗鐘鐙鐚鐛鐜鐝鐞鐟鐠鐡鐢鐣鐤鐥鐦鐧鐨鐩鐪鐫鐬鐭鐮鐯鐰鐱鐲鐳鐴鐵鐶鐷鐸鐹鐺鐻鐼鐽鐾鐿鑀鑁鑂鑃鑄鑅鑆鑇鑈鑉鑊鑋鑌鑍鑎鑏鑐鑑鑒鑓鑔鑕鑖鑗鑘鑙鑚鑛鑜鑝鑞鑟鑠鑡鑢鑣鑤鑥鑦鑧鑨鑩鑪鑬鑭鑮鑯鑰鑱鑲鑳鑴鑵鑶鑷鑸鑹鑺鑻鑼鑽鑾鑿钀钁钂钃钄钅钆钇针钉钊钋钌钍钎钏钐钑钒钓钔钕钖钘钙钚钛钜钝钞钟钠钡钢钣钤钥钦钧钨钩钪钫钬钭钮钯钰钱钲钳钴钵钶钷钸钹钺钻钼钽钾钿铀铁铂铃铄铅铆铇铈铉铊铋铌铍铎铏铐铑铒铓铔铕铖铗铘铙铚铛铜铝铞铟铠铡铢铣铤铥铦铧铨铩铪铫铬铭铮铯铰铱铲铳铴铵银铷铸铹铺铻铼铽链铿鋀鋁鋂鋃鋄鋅鋆鋇鋈鋉鋊鋋鋌鋍鋎鋏鋐鋑鋒鋓鋔鋕鋖鋗鋘鋙鋚鋛鋜鋝鋞鋟鋠鋡鋢鋣鋤鋥鋦鋧鋨鋩鋪鋫鋬鋭鋮鋯鋰鋱鋲鋳鋴鋵鋶鋷鋸鋹鋺鋻鋼鋽鋾鋿錀錁錂錃錄錅錆錇錈錉錊錋錌錍錎錏錐錑錒錓錔錕錖錗錘錙錚錛錜錝錞錟錠錡錢錣錤錥錦錧錨錩錪錫錬錭錮錯錰錱録錳錴錵錶錷錸錹錺錻錼錽錾錿鍀鍁鍂鍃鍄鍅鍆鍇鍈鍉鍊鍋鍌鍍鍎鍏鍐鍑鍒鍓鍔鍕鍖鍗鍘鍙鍚鍛鍜鍝鍞鍟鍠鍡鍢鍣鍤鍥鍦鍧鍨鍩鍪鍫鍬鍭鍮鍯鍰鍱鍲鍳鍵鍶鍷鍸鍹鍺鍻鍼鍽鍾鍿鎀鎁鎂鎃鎄鎅鎆鎇鎈鎉鎊鎋鎌鎍鎎鎏鎐鎑鎒鎓鎔鎕鎖鎗鎘鎙鎚鎛鎜鎝鎞鎟鎠鎡鎢鎣鎤鎥鎦鎧鎨鎩鎪鎫鎬鎭鎮鎯鎰鎱鎲鎳鎴鎵鎶鎷鎸鎹鎺鎻鎼鎽鎾鎿鏀鏁鏂鏃鏄鏅鏆鏇鏈鏉鏊鏋鏌鏍鏎鏏鏐鏑鏒鏓鏔鏕鏖鏗鏘鏙鏚鏛鏜鏝鏞鏟鏠鏡鏢鏣鏤鏥鏦鏧鏨鏩鏪鏫鏬鏭鏮鏯鏰鏱鏲鏳鏴鏵鏶鏷鏸鏹鏺鏻鏼鏽鏾鏿')

def is_garbled(text):
    """Check if text contains GBK→UTF-8 double-encoding garbled characters."""
    for ch in text:
        cp = ord(ch)
        # CJK Extension A
        if 0x3400 <= cp <= 0x4DBF:
            return True
        # Private Use Area
        if 0xE000 <= cp <= 0xF8FF:
            return True
        # CJK Compatibility Ideographs
        if 0xF900 <= cp <= 0xFAFF:
            return True
        # CJK Extension B+
        if cp >= 0x20000:
            return True
        # Check known garbled chars
        if ch in GARBLED_CHARS:
            return True
    return False

def has_normal_chinese(text):
    """Check if text contains normal Chinese characters (CJK Unified Ideographs U+4E00-U+9FFF)."""
    for ch in text:
        if 0x4E00 <= ord(ch) <= 0x9FFF and ch not in GARBLED_CHARS:
            return True
    return False

def fix_line(line):
    """Fix a single line by removing garbled comments and replacing garbled strings."""
    result = []
    
    # Process the line character by character, tracking state
    i = 0
    n = len(line)
    
    while i < n:
        # Check for single-line comment
        if i + 1 < n and line[i] == '/' and line[i+1] == '/':
            # Find the comment content
            comment_start = i + 2
            comment_end = n
            # Check if there's a newline
            nl_pos = line.find('\n', comment_start)
            if nl_pos != -1:
                comment_end = nl_pos
            
            comment_content = line[comment_start:comment_end]
            
            if is_garbled(comment_content):
                # If the entire comment is garbled (or garbled + normal mixed), remove the comment
                # But preserve any trailing newline
                if nl_pos != -1:
                    result.append(line[i:comment_start] + '' + line[nl_pos:])
                    i = nl_pos
                else:
                    # Remove the entire comment line
                    result.append('//')
                    i = n
            else:
                # Keep the comment as-is
                result.append(line[i:comment_end])
                i = comment_end
            continue
        
        # Check for block comment
        if i + 1 < n and line[i] == '/' and line[i+1] == '*':
            # Find the end of the block comment
            block_end = line.find('*/', i + 2)
            if block_end == -1:
                # Block comment extends beyond this line
                block_content = line[i+2:]
                if is_garbled(block_content):
                    result.append('/* */')
                    i = n
                else:
                    result.append(line[i:])
                    i = n
            else:
                block_content = line[i+2:block_end]
                if is_garbled(block_content):
                    result.append('/* */')
                    i = block_end + 2
                else:
                    result.append(line[i:block_end+2])
                    i = block_end + 2
            continue
        
        # Check for string literals (single, double, backtick)
        ch = line[i]
        if ch == "'" or ch == '"' or ch == '`':
            quote = ch
            # Find the matching closing quote, handling escapes
            j = i + 1
            string_content = []
            while j < n:
                if line[j] == '\\':
                    # Escape sequence - take next char too
                    string_content.append(line[j])
                    j += 1
                    if j < n:
                        string_content.append(line[j])
                        j += 1
                    continue
                if line[j] == quote:
                    break
                string_content.append(line[j])
                j += 1
            
            str_content = ''.join(string_content)
            
            if j < n and line[j] == quote:
                # Properly closed string
                if is_garbled(str_content):
                    # Replace with empty string
                    result.append(quote + quote)
                else:
                    result.append(line[i:j+1])
                i = j + 1
            else:
                # String not properly closed - could be garbled text with quotes
                # Try to find the actual end by looking for quotes further out
                # This handles cases where garbled chars contain ' or "
                # Find the next quote that might be the real end
                search_from = i + 1
                found = False
                while search_from < n:
                    next_quote = line.find(quote, search_from)
                    if next_quote == -1:
                        break
                    # Check the content between quotes
                    candidate = line[i+1:next_quote]
                    if is_garbled(candidate):
                        # Replace with empty string
                        result.append(quote + quote)
                        i = next_quote + 1
                        found = True
                        break
                    search_from = next_quote + 1
                
                if not found:
                    # No closing quote found, check if the rest of line is garbled
                    rest = line[i+1:]
                    if is_garbled(rest):
                        result.append(quote + quote)
                        i = n
                    else:
                        result.append(line[i])
                        i += 1
            continue
        
        # Regular character
        result.append(ch)
        i += 1
    
    return ''.join(result)


def fix_file(filepath):
    """Fix a single file."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    # Split into lines preserving line endings
    lines = content.split('\n')
    fixed_lines = []
    
    for line in lines:
        # Check if line has any garbled characters at all
        if not is_garbled(line):
            fixed_lines.append(line)
            continue
        
        fixed = fix_line(line)
        fixed_lines.append(fixed)
    
    fixed_content = '\n'.join(fixed_lines)
    
    # Write UTF-8 no BOM
    with open(filepath, 'w', encoding='utf-8', newline='') as f:
        f.write(fixed_content)
    
    return True


def main():
    base = r'D:\二次开发\desktop'
    files = [
        r'src\api\http-client.ts',
        r'src\api\opc-api.ts',
        r'src\api\chat-api.ts',
        r'src\api\admin-auth-api.ts',
        r'src\api\admin-user-api.ts',
        r'src\api\knowledge-api.ts',
        r'src\api\sync-service.ts',
        r'src\api\workflow-api.ts',
        r'src\store\auth.ts',
        r'src\store\admin-auth.ts',
        r'src\types\admin-user.ts',
        r'src\types\knowledge.ts',
        r'src\components\MainLayout\index.tsx',
        r'src\components\MainLayout\TopBar.tsx',
        r'src\pages\AgentMarket\index.tsx',
        r'src\pages\Chat\components\MessageList.tsx',
        r'src\pages\Chat\components\ToolCallBadge.tsx',
        r'src\pages\Credits\index.tsx',
        r'src\pages\Hermes\Detail.tsx',
        r'src\pages\Hermes\SkillMarket.tsx',
        r'src\pages\Knowledge\index.tsx',
        r'src\pages\Plugin\index.tsx',
        r'src\pages\Workflow\Detail.tsx',
        r'src\pages\Workflow\Editor.tsx',
        r'src\pages\Workflow\index.tsx',
        r'src\env.d.ts',
        r'src\main.tsx',
    ]
    
    for f in files:
        filepath = os.path.join(base, f)
        if os.path.exists(filepath):
            fix_file(filepath)
            print(f"Fixed: {f}")
        else:
            print(f"NOT FOUND: {f}")


if __name__ == '__main__':
    main()
