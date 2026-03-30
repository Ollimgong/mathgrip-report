import re

with open('css/style.css') as f: css = f.read()
with open('js/parser.js') as f: parser_js = f.read()
with open('js/store.js') as f: store_js = f.read()
with open('js/renderer.js') as f: renderer_js = f.read()
with open('js/print.js') as f: print_js = f.read()
with open('js/googleSheets.js') as f: sheets_js = f.read()
with open('index.html') as f: html = f.read()

def strip_modules(code):
    code = re.sub(r"^import\s*\{[^}]*\}\s*from\s*['\"].*?['\"];?\s*$", "", code, flags=re.MULTILINE | re.DOTALL)
    code = re.sub(r"^import\s+.*?;\s*$", "", code, flags=re.MULTILINE)
    code = re.sub(r"^export\s+(function|const|class|async\s+function)", r"\1", code, flags=re.MULTILINE)
    code = re.sub(r"^export\s+default\s+", "// default export: ", code, flags=re.MULTILINE)
    return code

def remove_duplicate_fn(code, fn_name):
    pattern = rf"(^|\n)(function\s+{fn_name}\s*\([^)]*\)\s*\{{)"
    match = re.search(pattern, code)
    if not match:
        pattern2 = rf"^function\s+{fn_name}\s*\(.*$"
        match2 = re.search(pattern2, code, re.MULTILINE)
        if match2:
            code = code[:match2.start()] + code[match2.end():]
        return code
    start = match.start() + len(match.group(1))
    depth = 0
    i = code.index('{', start)
    while i < len(code):
        if code[i] == '{': depth += 1
        elif code[i] == '}':
            depth -= 1
            if depth == 0:
                code = code[:start] + code[i+1:]
                break
        i += 1
    return code

parser_clean = strip_modules(parser_js)
store_clean = strip_modules(store_js)
renderer_clean = strip_modules(renderer_js)
print_clean = strip_modules(print_js)
sheets_clean = strip_modules(sheets_js)

store_clean = remove_duplicate_fn(store_clean, 'parseMonthLabel')
renderer_clean = remove_duplicate_fn(renderer_clean, 'parseMonthLabel')
print_clean = remove_duplicate_fn(print_clean, 'getGradeColor')

combined_js = f"""
// =======================================================
//  매쓰그립 월말평가 레포트 - Bundled JS (v4)
// =======================================================

// -- parser.js --
{parser_clean}

// -- store.js --
{store_clean}

// -- googleSheets.js --
{sheets_clean}

// -- renderer.js --
{renderer_clean}

// -- print.js --
{print_clean}
"""

script_match = re.search(r'<script type="module">(.*?)</script>', html, re.DOTALL)
inline_js = script_match.group(1) if script_match else ""

inline_js_clean = re.sub(
    r"import\s*\{[^}]*\}\s*from\s*['\"][^'\"]*['\"];?\s*\n?",
    "", inline_js
)
inline_js_clean = re.sub(r"^import\s+.*?;\s*$", "", inline_js_clean, flags=re.MULTILINE)
inline_js_clean = re.sub(r"^export\s+(function|const|class|async\s+function)", r"\1", inline_js_clean, flags=re.MULTILINE)
inline_js_clean = re.sub(r"^export\s+default\s+", "// default export: ", inline_js_clean, flags=re.MULTILINE)

# Remove duplicate gradeOrder from inline (already in parser.js)
inline_js_clean = remove_duplicate_fn(inline_js_clean, 'gradeOrder')

html_out = html.replace(
    '<link rel="stylesheet" href="css/style.css">',
    f'<style>\n{css}\n</style>'
)

old_script_block = script_match.group(0)
new_script_block = f"""<script>
{combined_js}

// -- index.html inline logic --
{inline_js_clean}
</script>"""

html_out = html_out.replace(old_script_block, new_script_block)

with open('index_bundled.html', 'w') as f:
    f.write(html_out)

remaining_imports = re.findall(r"^import\s", html_out, re.MULTILINE)
if remaining_imports:
    print(f"ERROR: {len(remaining_imports)} import statements remain!")
else:
    print("All imports removed!")

dup_check = {}
for m in re.finditer(r'^function\s+(\w+)\s*\(', html_out, re.MULTILINE):
    fn = m.group(1)
    dup_check[fn] = dup_check.get(fn, 0) + 1
dups = {k:v for k,v in dup_check.items() if v > 1}
if dups:
    print(f"WARNING: Remaining duplicates: {dups}")
else:
    print("No duplicate functions!")

print(f"Size: {len(html_out):,} bytes")
