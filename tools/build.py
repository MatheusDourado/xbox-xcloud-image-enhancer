from pathlib import Path
import json,re,hashlib
source=Path('script.js').read_text(encoding='utf-8')
assert '// @version      6.7.12' in source
upstream=source
marker='class VideoPlayer extends BaseStreamPlayer'
assert source.count(marker)==1
# Embed shader assets once for both userscript and standalone test player.
a=source.index('class WebGL2Player');b=source.index(marker,a)
cas=re.search(r'gl.shaderSource\(fShader, `([^`]+)`\)',source[a:b]).group(1)
cas=cas.replace('precision mediump float;','precision highp float;\nprecision highp sampler2D;').replace('1.0 / maxRgb','1.0 / max(maxRgb, vec3(1e-6))').replace('inversesqrt(amplifyRgb)','inversesqrt(max(amplifyRgb, vec3(1e-6)))')
# Upstream takes the texel size from the canvas, which equals the video there. Here the canvas can
# be larger (Auto/2K/4K output): neighbors must stay one source texel apart, or the reference
# sharpening fades (USM 4x weaker at 2x output).
texel='vec2 texelSize = 1.0 / iResolution.xy;'
assert cas.count(texel)==1
cas=cas.replace(texel,'vec2 texelSize = 1.0 / vec2(textureSize(tex, 0));')
shaders={p.stem:p.read_text(encoding='utf-8') for p in sorted(Path('src/shaders').glob('*.glsl'))}
# Neural restoration: weights from src/nn/restore.json (tools/nn/train.py) become shader constants.
import sys; sys.path.insert(0,'tools')
from nn_glsl import generate
shaders['nnFeatures'],shaders['nnApply']=generate('src/nn/restore.json')
# Fuse finishing into sharpening to avoid a full-frame pass and RGBA8 rounding.
finish=shaders['finish'].split('vec3 finishColor',1)[1].split('void main()',1)[0]
shaders['rcas']=shaders['rcas'].replace('/* FINISH_COLOR */','vec3 finishColor'+finish)
shaders['sgsr']=shaders['sgsr'].replace('/* FINISH_COLOR */','vec3 finishColor'+finish)
cas=cas.replace('vec3 clarityBoost', 'uniform float shadows,deband;uniform bool diagnostic;\nvec3 finishColor'+finish+'\nvec3 clarityBoost')
cas=cas.replace('fragColor = vec4(color, 1.0);','fragColor = vec4(finishColor(color), 1.0);')
shaders['cas']=cas
# Bound both sharpening methods and avoid amplifying tiny low-contrast differences.
# Only +-1 level noise/dither is excluded; real low-contrast texture keeps full gain.
# The halo margin follows the selected strength (4/255 at 2, 12/255 at 10).
# Luma-only sharpening applies the luma change to all channels, so 4:2:0 color blocks
# and chroma noise are not amplified.
limiter='''uniform float haloMargin,noiseFloor;uniform bool lumaSharpen;
vec3 limitSharpen(vec3 center,vec3 sharpened,vec3 lo,vec3 hi){
 float range=max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b);
 float detail=smoothstep(noiseFloor,noiseFloor+4.0/255.0,range);
 vec3 result=clamp(mix(center,sharpened,detail),lo-vec3(haloMargin),hi+vec3(haloMargin));
 if(lumaSharpen)result=clamp(center+vec3(dot(result-center,vec3(0.2126,0.7152,0.0722))),0.0,1.0);
 return result;
}\n'''
filtered=cas.replace('vec3 clarityBoost',limiter+'vec3 clarityBoost')
bounds='min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h)'
for expression in ['e + (e - gaussianBlur) * sharpenFactor / 3.0','mix(e, outColor, sharpenFactor / 2.0)']:
    needle='return '+expression+';'
    assert filtered.count(needle)==1
    filtered=filtered.replace(needle,'return limitSharpen(e,'+expression+','+bounds+');')
shaders['casFiltered']=filtered
inputs=[Path('script.js'),Path('tools/build.py'),Path('tools/nn_glsl.py'),*sorted(Path('src').rglob('*.*'))]
fingerprint=hashlib.sha256(b''.join(p.as_posix().encode()+b'\0'+p.read_bytes() for p in inputs if p.is_file())).hexdigest()
build='globalThis.BxBuild='+json.dumps({'version':'6.7.12-imagefilter.10.1.2','sourceSha256':fingerprint})+';\n'
# WebGPU renderer (Spec 4): the WGSL ports, prelude included, and the engine that draws them.
wgsl={p.stem:p.read_text(encoding='utf-8') for p in sorted(Path('src/webgpu').glob('*.wgsl'))}
bundle=build+'globalThis.BxShaders='+json.dumps(shaders)+';\n'+'globalThis.BxWgsl='+json.dumps(wgsl)+';\n'+Path('src/restoration-engine.js').read_text(encoding='utf-8')+'\n'+Path('src/webgpu-engine.js').read_text(encoding='utf-8')
Path('output/restoration.bundle.js').parent.mkdir(parents=True,exist_ok=True)
Path('output/restoration.bundle.js').write_text(bundle,encoding='utf-8',newline='\n')
# Repair upstream singleton lifecycle: a destroyed canvas must be recreated next session.
old='destroy() {this.cleanUpCanvasPlayer();}}'
assert source.count(old)==1
source=source.replace(old,'destroy() {this.cleanUpCanvasPlayer();this.playerType = \"default\";}}')
menu='\"video.processing.sharpness\",\"video.saturation\"'
assert source.count(menu)==1
source=source.replace(menu,'\"video.processing.sharpness\",($parent) => {window.BxImageFilter.mountControls($parent);},\"video.saturation\"')
source=source.replace(marker,bundle+'\n'+Path('src/frame-pacing.js').read_text(encoding='utf-8')+'\n'+'\n'.join(Path('src/'+n).read_text(encoding='utf-8') for n in ('image-filter.js','panel.js','hud.js'))+'\n'+marker)
source=source.replace('// @name         Better xCloud','// @name         Better xCloud — Image Filter Experimental').replace('// @version      6.7.12','// @version      6.7.12-imagefilter.10.1.2')
source='\n'.join(line for line in source.split('\n') if not line.startswith(('// @updateURL','// @downloadURL')))
source=source.replace('// @grant        none','// @grant        none\n// @updateURL    none\n// @downloadURL  none').replace('CheckForUpdate: !0','CheckForUpdate: !1',1)
Path('better-xcloud-image-filter.user.js').write_text(source,encoding='utf-8',newline='\n')
# play.xbox.com: Better xCloud 6.7.x does not run on the new site. A separate userscript binds the same
# treatment straight to the stream's <video> (docs/play-xbox-com.md), reusing upstream's canvas player
# classes unchanged (MIT) so the adapter patches the same WebGL2Player.
def between(start,end):
    assert upstream.count(start)==1 and upstream.count(end)==1
    a=upstream.index(start);b=upstream.index(end,a)
    return upstream[a:b].rstrip()+'\n'
players=between('class BaseStreamPlayer {','class WebGPUPlayer extends BaseCanvasPlayer')+between('class WebGL2Player extends BaseCanvasPlayer',marker)
play_header='''// ==UserScript==
// @name         xCloud Image Filter — play.xbox.com (experimental)
// @namespace    xcloud-image-filter
// @version      10.1.2-play
// @description  Image treatment (WebGL2) for Xbox Cloud Gaming on play.xbox.com, bound directly to the stream video. Includes Better xCloud's canvas player by redphx (MIT).
// @license      MIT
// @match        https://play.xbox.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @updateURL    none
// @downloadURL  none
// ==/UserScript==
"use strict";
'''
play=play_header+Path('src/play/prelude.js').read_text(encoding='utf-8')+players+bundle+'\n'+Path('src/frame-pacing.js').read_text(encoding='utf-8')+'\n'+'\n'.join(Path('src/'+n).read_text(encoding='utf-8') for n in ('image-filter.js','panel.js','hud.js','play/host.js'))
Path('xcloud-image-filter-play.user.js').write_text(play,encoding='utf-8',newline='\n')
print('Built userscript v10.1.2, play.xbox.com userscript and shared player bundle')
