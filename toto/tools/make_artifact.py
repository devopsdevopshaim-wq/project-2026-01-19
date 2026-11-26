#!/usr/bin/env python3
"""Copy the app into an output folder in the form the claude.ai Artifact page expects
(no <html>/<head>/<body> wrapper; supporting files beside it).
Usage: python3 toto/tools/make_artifact.py <out_dir>   (prints the files map as JSON)"""
import sys, os, re, shutil, json
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
s = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
s = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', s, flags=re.I)
for pat in [r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*', r'<link rel="manifest"[^>]*>\s*', r'<link rel="icon"[^>]*>\s*']:
    s = re.sub(pat, '', s)
s = s.replace('</head>\n<body>\n', '').replace('</body>\n</html>\n', '')
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(s)
files = {}
for rel in ['css/style.css', 'js/names.js', 'js/engine.js', 'js/basket.js', 'js/pages.js', 'js/app.js', 'js/live.js', 'data/history.json', 'data/basketball.json', 'data/model.json', 'data/predictions.json', 'data/toto_week.json']:
    src = os.path.join(root, rel)
    if os.path.exists(src):
        os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
        shutil.copy(src, os.path.join(out, rel)); files[rel] = rel
fdir = os.path.join(root, 'data', 'frozen')
if os.path.isdir(fdir):
    os.makedirs(os.path.join(out, 'data', 'frozen'), exist_ok=True)
    for f in sorted(os.listdir(fdir)):
        if f.endswith('.json'):
            shutil.copy(os.path.join(fdir, f), os.path.join(out, 'data', 'frozen', f)); files['data/frozen/' + f] = 'data/frozen/' + f
print(json.dumps(files, ensure_ascii=False))
