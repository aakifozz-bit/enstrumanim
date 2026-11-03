import base64, sys
mp4, out = sys.argv[1], sys.argv[2]
b64 = base64.b64encode(open(mp4, 'rb').read()).decode()
html = f'''<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Son Sayfa</title>
<style>
html,body{{margin:0;height:100%;background:#000;overflow:hidden}}
body{{display:flex;align-items:center;justify-content:center}}
.frame{{position:relative;width:min(100vw,calc(100vh*1280/544));aspect-ratio:1280/544;background:#000}}
video{{width:100%;height:100%;display:block;background:#000}}
button{{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
border:1px solid rgba(255,255,255,.28);background:rgba(0,0,0,.25);cursor:pointer;opacity:.55;transition:opacity .4s}}
button:hover,button:focus-visible{{opacity:.95;outline:none}}
button::after{{content:"";position:absolute;left:26px;top:21px;border-style:solid;border-width:11px 0 11px 17px;border-color:transparent transparent transparent rgba(255,255,255,.85)}}
button.hide{{opacity:0;pointer-events:none}}
</style></head>
<body><div class="frame"><video id="v" playsinline preload="auto" src="data:video/mp4;base64,{b64}"></video>
<button id="p" aria-label="Oynat"></button></div>
<script>
const v=document.getElementById('v'),p=document.getElementById('p');
p.onclick=()=>{{v.currentTime=0;v.play();p.classList.add('hide');}};
v.onended=()=>{{p.classList.remove('hide');}};
</script></body></html>'''
open(out, 'w').write(html)
print(len(html) / 1e6, 'MB')
