"""Visual preview of the image-filter panel and in-game HUD inside a mock Better xCloud settings dialog.

Writes output/playwright/ui-preview.html: the real Better xCloud 6.7.12 CSS (extracted from script.js),
a mock of the video settings tab (native rows around our panel, mounted exactly where Better xCloud
calls it), the shared bundle with a stub WebGL2Player, src/image-filter.js + panel.js + hud.js, a fake
WebRTC getStats (H264 High, ~16 Mb/s, QP ~28, occasional loss) and fake frame pacing so every
indicator has a value. Then takes Playwright screenshots (phone 853x394 @3.25, TV 1920x1080 and
1280x720, warnings, no stream, gamepad focus).

Run: python3 tools/build.py && python3 tools/ui-preview.py [--out DIR] [--only NAME,...]
Scene parameters can also be tried by hand: open the HTML with #scene=normal&device=phone&hud=full.
"""
import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / 'output/playwright/ui-preview.html'


def better_xcloud_css():
    source = (ROOT / 'script.js').read_text()
    start = source.index("function addCss() {let css = '") + len("function addCss() {let css = '")
    end = source.index("';if (getGlobalPref(\"ui.reduceAnimations\"))", start)
    css = source[start:end].replace("\\'", "'")
    # No network: drop the remote promptfont.
    head, _, rest = css.partition('@font-face{')
    return head + rest.split('}', 1)[1]


def webgl2_player():
    source = (ROOT / 'script.js').read_text()
    a = source.index('class WebGL2Player')
    return source[a:source.index('class VideoPlayer', a)]


BASE = r'''
const prefs={'video.player.type':'webgl2','video.processing':'cas','video.processing.mode':'performance','video.processing.sharpness':2,'video.ratio':'16:9','video.maxFps':60,
 'stream.video.resolution':'1080p','stream.video.codecProfile':'high','stream.video.maxBitrate':0,'server.region':'default','userAgent.profile':'default'};
function getStreamPref(key){return prefs[key]??'default';}
function getGlobalPref(key){return prefs[key];}
class BaseCanvasPlayer {
 constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;this.$canvas.style.cssText='position:fixed;left:-500px;top:0;width:128px;height:96px';document.body.append(this.$canvas);
  this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}
 toFilterId(){return 2;}destroy(){}
}
'''

PRELUDE = r'''
// Scene from the URL hash, applied before the adapter loads its saved settings.
const Q=Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const SCENE=Q.scene||'normal',DEVICE=Q.device||'phone';
try{localStorage.clear();}catch{}
if(SCENE==='warnings'){prefs['stream.video.maxBitrate']=6*1024000;prefs['stream.video.resolution']='720p';}
if(DEVICE==='phone')window.BxAndroid={getRefreshRates:()=>'[60,90,120]',getRefreshRate:()=>Number(Q.hz??120),setRefreshRate(v){this._r=v;},getAppInfo:()=>'{"version":"9.7"}'};
'''

PREVIEW = r'''
(()=>{
 const api=window.BxImageFilter,st=api.status,set=api.settings;
 const E=(tag,cls,props={},...kids)=>{const e=document.createElement(tag);if(cls)e.className=cls;for(const k in props)e.setAttribute(k,props[k]);for(const c of kids)e.append(c);return e;};
 // ---- game-like background: a letterboxed 16:9 frame with its own HUD elements ----
 function drawGame(){
  const cv=document.getElementById('game'),dpr=devicePixelRatio||1,W=innerWidth,H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;
  const g=cv.getContext('2d');g.scale(dpr,dpr);g.fillStyle='#000';g.fillRect(0,0,W,H);
  const ratio=16/9,vw=Math.min(W,H*ratio),vh=vw/ratio,x0=(W-vw)/2,y0=(H-vh)/2;
  g.save();g.beginPath();g.rect(x0,y0,vw,vh);g.clip();
  let sky=g.createLinearGradient(0,y0,0,y0+vh*.62);sky.addColorStop(0,'#2b4a7a');sky.addColorStop(.55,'#c98a5a');sky.addColorStop(1,'#f3c27a');g.fillStyle=sky;g.fillRect(x0,y0,vw,vh);
  g.fillStyle='rgba(255,236,190,.95)';g.beginPath();g.arc(x0+vw*.68,y0+vh*.45,vh*.07,0,7);g.fill();
  let seed=7;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(const [base,amp,col] of [[.52,.16,'#5b4a6b'],[.6,.12,'#3b3550'],[.68,.08,'#262338']]){g.fillStyle=col;g.beginPath();g.moveTo(x0,y0+vh);for(let i=0;i<=24;i++){g.lineTo(x0+vw*i/24,y0+vh*(base-amp*r()));}g.lineTo(x0+vw,y0+vh);g.fill();}
  let ground=g.createLinearGradient(0,y0+vh*.66,0,y0+vh);ground.addColorStop(0,'#1c2a22');ground.addColorStop(1,'#0c130f');g.fillStyle=ground;g.fillRect(x0,y0+vh*.66,vw,vh*.34);
  g.strokeStyle='rgba(240,220,170,.55)';g.lineWidth=2;for(let i=0;i<7;i++){const t=i/6;g.beginPath();g.moveTo(x0+vw*(.5-.02*t),y0+vh*(.68+.32*t*t));g.lineTo(x0+vw*(.5-.025*(t+.12)),y0+vh*(.68+.32*(t+.08)*(t+.08)));g.stroke();}
  g.fillStyle='#0b0d10';g.beginPath();g.moveTo(x0+vw*.36,y0+vh);g.lineTo(x0+vw*.49,y0+vh*.67);g.lineTo(x0+vw*.51,y0+vh*.67);g.lineTo(x0+vw*.64,y0+vh);g.fill();
  // game HUD: health bar top-left, minimap top-right, speed bottom-right
  const u=vh/400;g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x0+18*u,y0+16*u,150*u,14*u);g.fillStyle='#d94a4a';g.fillRect(x0+20*u,y0+18*u,104*u,10*u);
  g.fillStyle='rgba(255,255,255,.9)';g.font=`${11*u}px sans-serif`;g.fillText('HP 72',x0+20*u,y0+44*u);
  g.strokeStyle='rgba(255,255,255,.7)';g.lineWidth=2*u;g.fillStyle='rgba(20,30,25,.55)';g.beginPath();g.arc(x0+vw-52*u,y0+52*u,34*u,0,7);g.fill();g.stroke();
  g.fillStyle='#fff';g.font=`bold ${26*u}px sans-serif`;g.textAlign='right';g.fillText('142',x0+vw-30*u,y0+vh-30*u);g.font=`${10*u}px sans-serif`;g.fillText('KM/H',x0+vw-30*u,y0+vh-18*u);
  g.restore();
 }
 // ---- the Better xCloud settings dialog (video tab), built like SettingsDialog does ----
 function row(pref,label,control){const r=E('label','bx-settings-row',{for:'bx_setting_'+pref.replace(/\./g,'-')},E('span','bx-settings-label',{},label),control);r.prefKey=pref;return r;}
 function select(text,sub){const lab=E('label',null,{},text);if(sub)lab.append(E('span',null,{},sub));
  return E('div','bx-select',{'data-controller-friendly':'true'},E('button','bx-button bx-focusable',{tabindex:'0'},'<'),E('div',null,{},lab),E('button','bx-button bx-focusable',{tabindex:'0'},'>'));}
 function stepper(v,suffix=''){const r=E('input',null,{type:'range',min:'0',max:'10',value:String(v),tabindex:'-1'});
  return E('div','bx-number-stepper',{},E('div',null,{},E('button','bx-button bx-focusable',{tabindex:'0'},'-'),E('span',null,{},v+suffix),E('button','bx-button bx-focusable',{tabindex:'0'},'+')),r);}
 function buildDialog(){
  const overlay=document.getElementById('overlay'),nav=document.getElementById('nav');
  const tabs=E('div','bx-settings-tabs bx-hide-scroll-bar');for(let i=0;i<6;i++)tabs.append(E('div','bxp-tab'+(i===1?' bxp-active':''),{tabindex:'0'}));
  const tabsC=E('div','bx-settings-tabs-container',{},tabs,E('div',null,{},E('button','bx-button',{},'↻'),E('button','bx-button',{},'×')));
  const sel=E('div','bx-stream-settings-selection',{},E('div',null,{},select('Todos os jogos','Configurações de stream')),E('p','bx-gone',{},'Q: restaurar configuração destacada'));
  const group=E('div',null,{'data-tab-group':'stream'});
  const tc=E('div','bx-settings-tab-content',{},group);
  const contents=E('div','bx-settings-tab-contents',{},sel,tc);
  nav.append(E('div','bx-settings-dialog',{},tabsC,contents));
  group.append(E('h2',null,{},E('span',null,{},'Áudio')),row('audio.volume','Volume',stepper(100,'%')),E('h2',null,{},E('span',null,{},'Vídeo')));
  group.append(row('video.player.type','Renderizador',select(prefs['video.player.type']==='webgl2'?'WebGL2':'Padrão')),row('video.maxFps','Limite de FPS',stepper(60)),
   row('video.player.powerPreference','Preferência de energia',select('Alto desempenho')),row('video.processing','Processamento',select('AMD FidelityFX CAS')),
   row('video.processing.mode','Modo de processamento',select('Desempenho')),row('video.ratio','Proporção',select('16:9 (padrão)')),row('video.position','Posição',select('Centro (padrão)')),
   row('video.processing.sharpness','Nitidez',stepper(2)));
  // Better xCloud calls our menu function here, while it renders the tab.
  api.mountControls(group);
  group.append(row('video.saturation','Saturação',stepper(100,'%')),row('video.contrast','Contraste',stepper(100,'%')),row('video.brightness','Brilho',stepper(100,'%')));
  return contents;
 }
 // ---- fake telemetry and pacing ----
 let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,gauss=()=>{let s=0;for(let i=0;i<6;i++)s+=rnd();return (s-3)/1.2;};
 const warn=SCENE==='warnings',tv=DEVICE!=='phone';
 const net={bitrate:warn?5.8:16.2,qp:warn?35:28,rtt:tv?18:24,loss:0,decoder:tv?'D3D11VideoDecoder':'MediaCodec',dt:tv?3.2:4.1,jitter:18};
 let rtp={framesDecoded:1000,totalDecodeTime:4,jitterBufferDelay:18,jitterBufferEmittedCount:1000,bytesReceived:1e8,packetsLost:20,packetsReceived:100000,qpSum:28000,framesDropped:0,freezeCount:0},pollN=0;
 if(SCENE!=='nostream')window.STATES={currentStream:{peerConnection:{getReceivers:()=>[{track:{kind:'video'},jitterBufferTarget:null}],getStats:async()=>{
  pollN++;const fr=60,lossNow=warn?2.1:pollN%7===3?1.1:0;
  rtp={...rtp,framesDecoded:rtp.framesDecoded+fr,totalDecodeTime:rtp.totalDecodeTime+fr*(net.dt+gauss()*.2)/1000,jitterBufferDelay:rtp.jitterBufferDelay+fr*(net.jitter+gauss())/1000,
   jitterBufferEmittedCount:rtp.jitterBufferEmittedCount+fr,bytesReceived:rtp.bytesReceived+(net.bitrate+gauss()*.4)*1e6/8,packetsReceived:rtp.packetsReceived+1500,
   packetsLost:rtp.packetsLost+Math.round(1500*lossNow/(100-lossNow)),qpSum:rtp.qpSum+fr*(net.qp+gauss()*.8)};
  return new Map([['v',{type:'inbound-rtp',kind:'video',id:'v',codecId:'c',timestamp:Date.now(),framesPerSecond:59.9,powerEfficientDecoder:true,decoderImplementation:net.decoder,frameWidth:1920,frameHeight:1080,...rtp}],
   ['c',{mimeType:'video/H264',sdpFmtpLine:'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'}],
   ['p',{type:'candidate-pair',nominated:true,state:'succeeded',currentRoundTripTime:(net.rtt+gauss()*1.5)/1000}]]);}}}};
 const out=tv?[1920,1080]:[2276,1280];let frames=0,dropped=0,captured=0,tick=0;
 function fakeFrames(){
  if(SCENE==='nostream'){st.mode='waiting';st.lastFrame=0;return;}
  tick++;const T=1000/60;
  for(let i=0;i<6;i++){let v=T+gauss()*(warn?2.2:.55);if(tick%31===7&&i===2)v=2*T;if(warn&&tick%9===4&&i===3)v=2.4*T;if(tick%53===20&&i===4)v=.45*T;st.intervals.push(Math.max(1,v));if(st.intervals.length>240)st.intervals.shift();}
  const w=st.intervals.slice(-120),sorted=[...w].sort((a,b)=>a-b),mean=w.reduce((a,b)=>a+b,0)/w.length,med=sorted[sorted.length>>1];
  st.pacing={meanMs:mean,deviationMs:Math.sqrt(w.reduce((a,b)=>a+(b-mean)**2,0)/w.length),p95Ms:sorted[Math.ceil(w.length*.95)-1],hitches:w.filter(v=>v>1.5*med).length,frames:w.length};
  const direct=set.fluidity!=='off'&&set.capture==='direct'&&api.directSupported();
  frames+=6;captured+=direct?6:0;st.frames=frames;st.lastFrame=Date.now();st.mode=api.diagnostic?'diagnostic':set.mode;st.fps=59.9+gauss()*.05;
  st.origin={server:{meanMs:16.7,deviationMs:.24+gauss()*.02},arrival:{meanMs:16.8,deviationMs:(warn?4.6:3.1)+gauss()*.15},presented:direct?null:120,missed:direct?null:(warn?4:0)};
  if(tick%40===10&&set.fluidity!=='off')dropped++;
  st.fluidity=set.fluidity==='off'?null:{mode:set.fluidity,extraMs:(set.fluidity==='max'?6.1:4.2)+gauss()*.15,dropped};
  st.capture=direct?{active:true,frames:captured+12000,reason:''}:{active:false,frames:0,reason:''};
  st.gpuP95=(warn?5.1:2.8)+gauss()*.08;st.measurement='gpu';st.adaptation=warn?'Estabilidade em movimento desligada (GPU acima de 6 ms)':'';
  st.display=out[1];st.resolution=`1920×1080 → ${set.output==='native'?'1920×1080':out.join('×')}`;
 }
 // ---- scene setup ----
 window.preview={
  ready:false,
  scroll(sel,offset=8){const c=document.querySelector('.bx-settings-tab-contents'),t=typeof sel==='string'?document.querySelector(sel):sel;if(!c||!t)return;
   const stickyH=document.querySelector('.bx-stream-settings-selection').offsetHeight;c.scrollTop+=t.getBoundingClientRect().top-c.getBoundingClientRect().top-stickyH-offset;},
  open(list){for(const s of document.querySelectorAll('.bxif-sec')){const want=list.includes(s.dataset.sec),is=s.hasAttribute('data-open');if(want!==is)s.querySelector('.bxif-sec-head').click();}},
  dialog(show){for(const id of ['overlay','nav'])document.getElementById(id).style.display=show?'':'none';},
  statsBar(pos){const b=document.querySelector('.bx-stats-bar');b.dataset.position=pos||'top-right';b.classList.toggle('bx-gone',!pos);},
  gamepadFocus(sel){document.documentElement.dataset.activeInput='gamepad';const el=document.querySelector(sel);el.focus({preventScroll:true});return !!el;},
  // Better xCloud's D-pad rule on a focused range.
  pad(dir){const r=document.activeElement;r.value=(parseInt(r.value)+parseInt(r.step)*dir).toString();r.dispatchEvent(new InputEvent('input'));},
 };
 window.addEventListener('resize',drawGame);
 (async()=>{
  try{
   drawGame();
   const patch={hud:Q.hud||'off',hudPosition:Q.pos||'top-left',fluidity:Q.fluidity||'balanced',capture:Q.capture||'direct'};
   if(warn)patch.output='1440';
   if(Q.ratio)prefs['video.ratio']=Q.ratio;
   api.update(patch);
   if(SCENE!=='nostream'){const src=document.createElement('canvas');src.width=192;src.height=108;src.currentTime=0;const p=new WebGL2Player(src);await p.setupShaders();p.updateFrame();}
   fakeFrames();setInterval(fakeFrames,100);
   const contents=buildDialog();
   if(Q.dialog==='0')preview.dialog(false);
   preview.open((Q.open??'fluidez,nitidez').split(','));
   api.hud.update();
   preview.ready=true;
  }catch(e){document.getElementById('result').textContent='ERROR '+e.message;console.error(e);}
 })();
})();
'''

CSS = r'''
html,body{margin:0;height:100%;background:#000;overflow:hidden}
#game{position:fixed;inset:0;width:100%;height:100%;display:block}
#result{position:fixed;left:0;bottom:0;margin:0;color:#f55;font:12px monospace;z-index:9999}
#bx-game-bar{left:0}#bx-game-bar[data-position=bottom-right]{left:auto;right:0}
#bx-game-bar::after{content:'';position:absolute;left:0;bottom:24px;width:14px;height:42px;border-radius:0 6px 6px 0;background:rgba(26,27,30,.75)}
#bx-game-bar[data-position=bottom-right]::after{left:auto;right:0;border-radius:6px 0 0 6px}
.bxp-tab{width:24px;height:24px;padding:10px;box-sizing:content-box;background:#131313;border-left:4px solid #1e1e1e;position:relative}
.bxp-tab::after{content:'';position:absolute;inset:14px;border:2px solid #9a9a9a;border-radius:3px}
.bxp-tab.bxp-active{background:#222;border-color:#008746}
.bx-settings-tab-contents{overflow-y:auto}
'''


def write_page(lang='pt-BR'):
    stats = ('<div class="bx-stats-bar bx-gone" data-position="top-right" data-stats="[time][fps][ping][dt][btr][pl]">'
             + ''.join(f'<div class="bx-stat-{k}"><label>{k.upper()}</label><span>{v}</span></div>'
                       for k, v in [('time', '00:12:41'), ('fps', '60'), ('ping', '24ms'), ('dt', '4.1ms'), ('btr', '16.2 Mbps'), ('pl', '0 (0.00%)')]) + '</div>')
    html = ('<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>UI preview</title><style>' + better_xcloud_css() + '</style><style>' + CSS + '</style></head><body>'
            '<canvas id="game"></canvas><div id="bx-game-bar" data-position="bottom-left"></div>' + stats +
            '<div class="bx-navigation-dialog-overlay" id="overlay" data-is-playing="true"></div><div class="bx-navigation-dialog" id="nav"></div>'
            '<pre id="result"></pre><script src="../restoration.bundle.js"></script><script>'
            + BASE + webgl2_player() + PRELUDE
            + ''.join((ROOT / 'src' / n).read_text() for n in ('image-filter.js', 'panel.js', 'hud.js'))
            + PREVIEW + '</script></body></html>')
    PAGE.parent.mkdir(parents=True, exist_ok=True)
    PAGE.write_text(html)


PHONE = dict(viewport={'width': 853, 'height': 394}, device_scale_factor=3.25, has_touch=True, is_mobile=False)
TV = dict(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
TV150 = dict(viewport={'width': 1280, 'height': 720}, device_scale_factor=1.5)

# name, context, hash, steps (python callables receive the page)
def shots():
    def at(sel, offset=8):
        return lambda p: p.evaluate('([s,o]) => preview.scroll(s,o)', [sel, offset])
    def js(code):
        return lambda p: p.evaluate(code)
    wait = lambda ms: (lambda p: p.wait_for_timeout(ms))
    return [
        ('phone-panel-top', PHONE, 'scene=normal&device=phone&hud=compact', [at('.bxif-panel'), wait(2600)]),
        ('phone-panel-fluidez', PHONE, 'scene=normal&device=phone&hud=compact', [at('[data-sec=fluidez]'), wait(2600)]),
        ('phone-panel-fluidez-2', PHONE, 'scene=normal&device=phone&hud=compact', [at('[data-bxif-row=smoothing]'), wait(2600)]),
        ('phone-panel-nitidez', PHONE, 'scene=normal&device=phone&hud=compact', [at('[data-sec=nitidez]'), wait(2600)]),
        ('phone-panel-nitidez-2', PHONE, 'scene=normal&device=phone&hud=compact', [at('[data-bxif-row=sharpening]'), wait(2600)]),
        ('phone-panel-ajuste', PHONE, 'scene=normal&device=phone&hud=compact&open=ajuste', [at('[data-sec=ajuste]'), wait(2600)]),
        ('phone-panel-desempenho', PHONE, 'scene=normal&device=phone&hud=compact&open=desempenho', [at('[data-sec=desempenho]'), wait(2600)]),
        ('phone-panel-desempenho-2', PHONE, 'scene=normal&device=phone&hud=compact&open=desempenho', [at('[data-bxif-out=latency]'), wait(2600)]),
        ('phone-panel-ferramentas', PHONE, 'scene=normal&device=phone&hud=compact&open=ferramentas', [at('[data-sec=ferramentas]'), wait(2600)]),
        ('phone-panel-closed', PHONE, 'scene=normal&device=phone&hud=compact&open=', [at('[data-sec=fluidez]', 120), wait(2600)]),
        ('phone-hud-compact', PHONE, 'scene=normal&device=phone&hud=compact&dialog=0', [js('preview.statsBar("top-right")'), wait(3200)]),
        ('phone-hud-compact-card', PHONE, 'scene=normal&device=phone&hud=compact&dialog=0&ratio=fill&pos=bottom-left', [wait(3200)]),
        ('phone-hud-full', PHONE, 'scene=normal&device=phone&hud=full&dialog=0', [wait(3200)]),
        ('phone-hud-full-warnings', PHONE, 'scene=warnings&device=phone&hud=full&dialog=0&pos=top-right', [wait(3200)]),
        ('phone-hud-compact-warnings', PHONE, 'scene=warnings&device=phone&hud=compact&dialog=0&ratio=fill', [wait(3200)]),
        ('phone-hud-with-menu', PHONE, 'scene=normal&device=phone&hud=compact', [at('[data-sec=nitidez]'), wait(3200)]),
        ('phone-warnings', PHONE, 'scene=warnings&device=phone&hud=compact', [at('.bxif-panel'), wait(3200)]),
        ('phone-nostream', PHONE, 'scene=nostream&device=phone&hud=compact', [at('.bxif-panel'), wait(2600)]),
        ('phone-focus', PHONE, 'scene=normal&device=phone&hud=compact', [js('preview.gamepadFocus("input[data-bxif-key=sharpness]")'), at('[data-bxif-row=sharpness]', 60),
                                                                        js('preview.pad(1)'), wait(2600)]),
        ('tv-panel', TV, 'scene=normal&device=tv&hud=full', [at('.bxif-panel'), wait(2600)]),
        ('tv-panel-2', TV, 'scene=normal&device=tv&hud=full&open=nitidez,desempenho', [at('[data-sec=nitidez]'), wait(2600)]),
        ('tv-focus', TV, 'scene=normal&device=tv&hud=full', [js('preview.gamepadFocus("input[data-bxif-key=fluidity]")'), at('[data-sec=fluidez]', 40), wait(2600)]),
        ('tv-hud-full', TV, 'scene=normal&device=tv&hud=full&dialog=0&pos=top-right', [js('preview.statsBar("top-right")'), wait(3200)]),
        ('tv-hud-compact', TV, 'scene=normal&device=tv&hud=compact&dialog=0&pos=bottom-left', [wait(3200)]),
        ('tv150-panel', TV150, 'scene=normal&device=tv&hud=full', [at('.bxif-panel'), wait(2600)]),
        ('tv150-hud-full', TV150, 'scene=warnings&device=tv&hud=full&dialog=0', [wait(3200)]),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default=str(ROOT / 'output/playwright/ui-shots'))
    parser.add_argument('--only', help='Comma-separated screenshot names')
    parser.add_argument('--lang', default='pt-BR', help='UI language via <html lang> (src/i18n.js), e.g. en-US or es-MX')
    args = parser.parse_args()
    write_page(args.lang)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(',')) if args.only else None
    written, problems = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, ctx, hash_, steps in shots():
            if only and name not in only:
                continue
            context = browser.new_context(**ctx)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type in ('error', 'warning') and 'WebGL' not in m.text else None)
            page.goto(PAGE.as_uri() + '#' + hash_)
            page.wait_for_function('() => window.preview?.ready || document.getElementById("result").textContent', timeout=30000)
            for step in steps:
                step(page)
            # Layout checks: no horizontal overflow inside the panel, HUD not clipping its content.
            check = page.evaluate('''() => {
              const r = [], panel = document.querySelector('.bxif-panel');
              if (panel && panel.offsetParent) {
                if (panel.scrollWidth > panel.clientWidth + 1) r.push('panel scrollWidth ' + panel.scrollWidth + ' > ' + panel.clientWidth);
                for (const e of panel.querySelectorAll('*')) { if (!e.offsetParent || e.closest('[data-hide]') || e.classList.contains('bxif-meter-clip')) continue;
                  const cs = getComputedStyle(e); if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp) continue;
                  if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'hidden') r.push('clipped: ' + e.className + ' ' + (e.textContent || '').slice(0, 40)); }
              }
              const hud = document.querySelector('.bxif-hud');
              if (hud && hud.offsetParent !== null) { const b = hud.getBoundingClientRect(); if (b.right > innerWidth || b.bottom > innerHeight || b.left < 0 || b.top < 0) r.push('HUD off screen'); }
              return r; }''')
            target = out / f'{name}.png'
            page.screenshot(path=str(target))
            written.append(str(target))
            if errors or check:
                problems.append({'shot': name, 'errors': errors, 'layout': check})
            context.close()
        browser.close()
    print('\n'.join(written))
    if problems:
        print(json.dumps(problems, indent=1, ensure_ascii=False))
    return 1 if any(p['errors'] for p in problems) else 0


if __name__ == '__main__':
    raise SystemExit(main())
