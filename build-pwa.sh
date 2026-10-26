#!/bin/bash
# Bygger Vagt-app (PWA) i denne mappe ud fra ../app/src. Indeholder INGEN vagter eller persondata.
set -e
cd "$(dirname "$0")"
(cd ../app && ./build.sh >/dev/null)
python3 - <<'PY'
import hashlib,re
s=open('../app/vagtapp.html',encoding='utf-8').read()
head='''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="48x48" href="icons/favicon-48.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Vagt-app">
<meta name="application-name" content="Vagt-app">
'''
s=re.sub(r'<title>.*?</title>','<title>Vagt-app</title>\n'+head,s,count=1)
s=re.sub(r'(oplyst|bekræftet|Oplyst) af Robert( [0-9.]+)?',r'\1 lokalt',s)
s=s.replace('<h1>Vagtplan</h1>','<h1>Vagt-app</h1>',1)
open('index.html','w',encoding='utf-8').write(s)
ver=hashlib.sha256((s+open('tools/sw.template.js').read()+open('manifest.webmanifest').read()).encode()).hexdigest()[:10]
open('sw.js','w').write(open('tools/sw.template.js').read().replace('__VERSION__',ver))
print('index.html',len(s.encode()),'bytes · sw version',ver)
PY
touch .nojekyll
# sikkerhed: ingen vagt-/backupfiler må ligge her
if ls | grep -Eiq '\.(ics|csv|json)$|backup'; then echo "FEJL: persondata-fil i pwa-mappen"; exit 1; fi
grep -q "Robert" index.html && { echo "FEJL: navn fundet i index.html"; exit 1; } || true
echo OK
