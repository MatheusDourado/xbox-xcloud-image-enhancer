// ==UserScript==
// @name         xCloud Image Filter — play.xbox.com (experimental)
// @namespace    xcloud-image-filter
// @version      9.8.0-play
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
// play.xbox.com host, part 1 (before Better xCloud's player classes and the treatment).
// The new site has no Better xCloud: this supplies the few names the reused WebGL2Player and the
// adapter (image-filter.js) read, and records the WebRTC connection for telemetry and Suavização.
const BxLogger = {info() {}, warning() {}, error: (tag, ...args) => console.warn('[BxImageFilter]', tag, ...args)};
// WebGL2Player asks for video.player.powerPreference; the adapter checks typeof for the others.
function getStreamPref(key) { return key === 'video.player.powerPreference' ? 'default' : undefined; }
// Same shape the adapter reads on the old site (STATES.currentStream.peerConnection). var: the adapter
// tests typeof STATES while it loads, before this scope's later declarations would exist.
var STATES = {currentStream: {peerConnection: null}};
(() => {
 const Native = window.RTCPeerConnection;
 if (typeof Native !== 'function' || Native.bxTracked) return;
 // The stream's connection is the one that receives a video track (WebRtcStreamV1 ontrack). Runs at
 // document-start, before the site's webrtc-adapter captures the constructor.
 class TrackedPeerConnection extends Native {
  constructor(...args) {
   super(...args);
   const current = STATES.currentStream.peerConnection;
   if (!current || current.connectionState === 'closed') STATES.currentStream.peerConnection = this;
   this.addEventListener('track', e => { if (e.track?.kind === 'video') STATES.currentStream.peerConnection = this; });
  }
 }
 TrackedPeerConnection.bxTracked = true;
 window.RTCPeerConnection = TrackedPeerConnection;
 if (window.webkitRTCPeerConnection === Native) window.webkitRTCPeerConnection = TrackedPeerConnection;
})();
class BaseStreamPlayer {logTag;playerType;elementType;$video;options = {processing: "usm",sharpness: 0,brightness: 1,contrast: 1,saturation: 1};isStopped = !1;constructor(playerType, elementType, $video, logTag) {this.playerType = playerType, this.elementType = elementType, this.$video = $video, this.logTag = logTag;}init() {BxLogger.info(this.logTag, "Initialize");}updateOptions(newOptions, refresh = !1) {this.options = Object.assign(this.options, newOptions), refresh && this.refreshPlayer();}}
class BaseCanvasPlayer extends BaseStreamPlayer {$canvas;targetFps = 60;frameInterval = 0;lastFrameTime = 0;animFrameId = null;frameCallback;boundDrawFrame;constructor(playerType, $video, logTag) {super(playerType, "canvas", $video, logTag);let $canvas = document.createElement("canvas");$canvas.width = $video.videoWidth, $canvas.height = $video.videoHeight, this.$canvas = $canvas, $video.insertAdjacentElement("afterend", this.$canvas);let frameCallback;if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {let $video2 = this.$video;frameCallback = $video2.requestVideoFrameCallback.bind($video2);} else frameCallback = window.requestAnimationFrame.bind(window);this.frameCallback = frameCallback, this.boundDrawFrame = this.drawFrame.bind(this);}async init() {super.init(), await this.setupShaders(), this.setupRendering();}setTargetFps(target) {this.targetFps = target, this.lastFrameTime = 0, this.frameInterval = target ? Math.floor(1000 / target) : 0;}getCanvas() {return this.$canvas;}destroy() {if (BxLogger.info(this.logTag, "Destroy"), this.isStopped = !0, this.animFrameId) {if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) this.$video.cancelVideoFrameCallback(this.animFrameId);else cancelAnimationFrame(this.animFrameId);this.animFrameId = null;}if (this.$canvas.isConnected) this.$canvas.remove();this.$canvas.width = 1, this.$canvas.height = 1;}toFilterId(processing) {return processing === "cas" ? 2 : 1;}shouldDraw() {if (this.targetFps >= 60) return !0;else if (this.targetFps === 0) return !1;let currentTime = performance.now();if (currentTime - this.lastFrameTime < this.frameInterval) return !1;return this.lastFrameTime = currentTime, !0;}drawFrame() {if (this.isStopped) return;if (this.animFrameId = this.frameCallback(this.boundDrawFrame), !this.shouldDraw()) return;this.updateFrame();}setupRendering() {this.animFrameId = this.frameCallback(this.boundDrawFrame);}}
class WebGL2Player extends BaseCanvasPlayer {gl = null;resources = [];program = null;constructor($video) {super("webgl2", $video, "WebGL2Player");}updateCanvas() {console.log("updateCanvas", this.options);let gl = this.gl, program = this.program, filterId = this.toFilterId(this.options.processing);gl.uniform2f(gl.getUniformLocation(program, "iResolution"), this.$canvas.width, this.$canvas.height), gl.uniform1i(gl.getUniformLocation(program, "filterId"), filterId), gl.uniform1i(gl.getUniformLocation(program, "qualityMode"), this.options.processingMode === "quality" ? 1 : 0), gl.uniform1f(gl.getUniformLocation(program, "sharpenFactor"), this.options.sharpness / (this.options.processingMode === "quality" ? 1 : 1.2)), gl.uniform1f(gl.getUniformLocation(program, "brightness"), this.options.brightness / 100), gl.uniform1f(gl.getUniformLocation(program, "contrast"), this.options.contrast / 100), gl.uniform1f(gl.getUniformLocation(program, "saturation"), this.options.saturation / 100);}updateFrame() {let gl = this.gl;gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.$video), gl.drawArrays(gl.TRIANGLES, 0, 3);}async setupShaders() {let gl = this.$canvas.getContext("webgl2", {isBx: !0,antialias: !1,alpha: !1,depth: !1,preserveDrawingBuffer: !1,stencil: !1,desynchronized: globalThis.BxImageFilter?.settings?.desynchronized === !0,powerPreference: getStreamPref("video.player.powerPreference")});this.gl = gl, gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferWidth);let vShader = gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vShader, `#version 300 es
in vec4 position;void main() {gl_Position = position;}`), gl.compileShader(vShader);let fShader = gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fShader, `#version 300 es
precision mediump float;uniform sampler2D data;uniform vec2 iResolution;const int FILTER_UNSHARP_MASKING = 1;const int FILTER_CAS = 2;const float CAS_CONTRAST_PEAK = 0.8 * -3.0 + 8.0;const vec3 LUMINOSITY_FACTOR = vec3(0.299, 0.587, 0.114);uniform int filterId;uniform bool qualityMode;uniform float sharpenFactor;uniform float brightness;uniform float contrast;uniform float saturation;out vec4 fragColor;vec3 clarityBoost(sampler2D tex, vec2 coord, vec3 e) {vec2 texelSize = 1.0 / iResolution.xy;vec3 b = texture(tex, coord + texelSize * vec2(0, 1)).rgb;vec3 d = texture(tex, coord + texelSize * vec2(-1, 0)).rgb;vec3 f = texture(tex, coord + texelSize * vec2(1, 0)).rgb;vec3 h = texture(tex, coord + texelSize * vec2(0, -1)).rgb;vec3 a;vec3 c;vec3 g;vec3 i;if (filterId == FILTER_UNSHARP_MASKING || qualityMode) {a = texture(tex, coord + texelSize * vec2(-1, 1)).rgb;c = texture(tex, coord + texelSize * vec2(1, 1)).rgb;g = texture(tex, coord + texelSize * vec2(-1, -1)).rgb;i = texture(tex, coord + texelSize * vec2(1, -1)).rgb;}if (filterId == FILTER_UNSHARP_MASKING) {vec3 gaussianBlur = (a + c + g + i) * 1.0 + (b + d + f + h) * 2.0 + e * 4.0;gaussianBlur /= 16.0;return e + (e - gaussianBlur) * sharpenFactor / 3.0;}vec3 minRgb = min(min(min(d, e), min(f, b)), h);vec3 maxRgb = max(max(max(d, e), max(f, b)), h);if (qualityMode) {minRgb += min(min(a, c), min(g, i));maxRgb += max(max(a, c), max(g, i));}vec3 reciprocalMaxRgb = 1.0 / maxRgb;vec3 amplifyRgb = clamp(min(minRgb, 2.0 - maxRgb) * reciprocalMaxRgb, 0.0, 1.0);amplifyRgb = inversesqrt(amplifyRgb);vec3 weightRgb = -(1.0 / (amplifyRgb * CAS_CONTRAST_PEAK));vec3 reciprocalWeightRgb = 1.0 / (4.0 * weightRgb + 1.0);vec3 window = b + d + f + h;vec3 outColor = clamp((window * weightRgb + e) * reciprocalWeightRgb, 0.0, 1.0);return mix(e, outColor, sharpenFactor / 2.0);}void main() {vec2 uv = gl_FragCoord.xy / iResolution.xy;vec3 color = texture(data, uv).rgb;if (sharpenFactor > 0.0) {color = clarityBoost(data, uv, color);}color = mix(vec3(dot(color, LUMINOSITY_FACTOR)), color, saturation);color = contrast * (color - 0.5) + 0.5;color = brightness * color;fragColor = vec4(color, 1.0);}`), gl.compileShader(fShader);let program = gl.createProgram();if (this.program = program, gl.attachShader(program, vShader), gl.attachShader(program, fShader), gl.linkProgram(program), gl.useProgram(program), !gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(`Link failed: ${gl.getProgramInfoLog(program)}`), console.error(`vs info-log: ${gl.getShaderInfoLog(vShader)}`), console.error(`fs info-log: ${gl.getShaderInfoLog(fShader)}`);this.updateCanvas();let buffer = gl.createBuffer();this.resources.push(buffer), gl.bindBuffer(gl.ARRAY_BUFFER, buffer), gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW), gl.enableVertexAttribArray(0), gl.vertexAttribPointer(0, 2, gl.FLOAT, !1, 0, 0);let texture = gl.createTexture();this.resources.push(texture), gl.bindTexture(gl.TEXTURE_2D, texture), gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !0), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR), gl.uniform1i(gl.getUniformLocation(program, "data"), 0), gl.activeTexture(gl.TEXTURE0);}destroy() {super.destroy();let gl = this.gl;if (!gl) return;gl.getExtension("WEBGL_lose_context")?.loseContext(), gl.useProgram(null);for (let resource of this.resources)if (resource instanceof WebGLProgram) gl.deleteProgram(resource);else if (resource instanceof WebGLShader) gl.deleteShader(resource);else if (resource instanceof WebGLTexture) gl.deleteTexture(resource);else if (resource instanceof WebGLBuffer) gl.deleteBuffer(resource);this.gl = null;}refreshPlayer() {this.updateCanvas();}}
globalThis.BxBuild={"version": "6.7.12-imagefilter.9.8.0", "sourceSha256": "b294b69e0deccaed328fa003fd22c4f27bee9acc8d24efeb8c4acda668d46e73"};
globalThis.BxShaders={"antialias": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform float amount;\nout vec4 fragColor;\nfloat luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}\nvoid main(){\n vec2 stepSize=1./vec2(textureSize(source,0)),uv=gl_FragCoord.xy*stepSize;\n vec3 center=texture(source,uv).rgb;\n float nw=luminance(texture(source,uv+vec2(-1,1)*stepSize).rgb);\n float ne=luminance(texture(source,uv+vec2(1,1)*stepSize).rgb);\n float sw=luminance(texture(source,uv+vec2(-1,-1)*stepSize).rgb);\n float se=luminance(texture(source,uv+vec2(1,-1)*stepSize).rgb);\n float mid=luminance(center),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));\n float contrast=hi-lo;\n // Directional post-process AA: only high-contrast slanted edges are blended.\n // Flat regions and axis-aligned edges retain their original samples.\n vec2 direction=vec2(-(nw+ne-sw-se),nw+sw-ne-se);\n float major=max(abs(direction.x),abs(direction.y));\n float diagonal=min(abs(direction.x),abs(direction.y))/max(major,.00001);\n float weight=amount*smoothstep(.04,.15,contrast)*smoothstep(.05,.35,diagonal);\n if(weight<=0.){fragColor=vec4(center,1);return;}\n direction=direction/max(major,.00001)*stepSize;\n vec3 smoothColor=(texture(source,uv-direction*.5).rgb+texture(source,uv+direction*.5).rgb)*.5;\n // Clamp to the observed neighborhood to prevent new ringing.\n float smoothLum=luminance(smoothColor);\n if(smoothLum<lo||smoothLum>hi)smoothColor=center;\n fragColor=vec4(mix(center,smoothColor,weight),1);\n}\n", "copy": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform vec2 outputSize;\nout vec4 fragColor;\nvoid main(){fragColor=vec4(texture(source,gl_FragCoord.xy/outputSize).rgb,1);}\n", "cut": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source, previous;\nout vec4 fragColor;\nvoid main(){float difference=0.;for(int y=0;y<16;y++)for(int x=0;x<16;x++){\n vec2 uv=(vec2(x,y)+.5)/16.;vec3 d=abs(texture(source,uv).rgb-texture(previous,uv).rgb);\n difference+=dot(d,vec3(.2126,.7152,.0722))/256.;\n}fragColor=vec4(difference,0,0,1);}\n", "easu": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;uniform vec2 outputSize;out vec4 fragColor;\nfloat safeRcp(float x){return 1./max(x,1e-8);}float safeRsq(float x){return inversesqrt(max(x,1e-8));}\nfloat saturate(float x){return clamp(x,0.,1.);}vec3 min3(vec3 a,vec3 b,vec3 c){return min(a,min(b,c));}vec3 max3(vec3 a,vec3 b,vec3 c){return max(a,max(b,c));}\n// WebGL2 has no textureGather. Fetch each texel once (RGB) and split channels in gather order.\nvoid gatherRGB(vec2 uv,out vec4 r,out vec4 g,out vec4 b){ivec2 size=textureSize(source,0);ivec2 p=ivec2(floor(uv*vec2(size)-.5));\n vec3 t0=texelFetch(source,clamp(p+ivec2(0,1),ivec2(0),size-1),0).rgb,t1=texelFetch(source,clamp(p+ivec2(1,1),ivec2(0),size-1),0).rgb;\n vec3 t2=texelFetch(source,clamp(p+ivec2(1,0),ivec2(0),size-1),0).rgb,t3=texelFetch(source,clamp(p,ivec2(0),size-1),0).rgb;\n r=vec4(t0.r,t1.r,t2.r,t3.r);g=vec4(t0.g,t1.g,t2.g,t3.g);b=vec4(t0.b,t1.b,t2.b,t3.b);}\n\n// FidelityFX Super Resolution Sample\n//\n// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software and associated documentation files(the \"Software\"), to deal\n// in the Software without restriction, including without limitation the rights\n// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell\n// copies of the Software, and to permit persons to whom the Software is\n// furnished to do so, subject to the following conditions :\n// The above copyright notice and this permission notice shall be included in\n// all copies or substantial portions of the Software.\n// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE\n// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n// THE SOFTWARE.\n void FsrEasuTapF(\n inout vec3 aC, // Accumulated color, with negative lobe.\n inout float aW, // Accumulated weight.\n vec2 off, // Pixel offset from resolve position to tap.\n vec2 dir, // Gradient direction.\n vec2 len, // Length.\n float lob, // Negative lobe strength.\n float clp, // Clipping point.\n vec3 c){ // Tap color.\n  // Rotate offset by direction.\n  vec2 v;\n  v.x=(off.x*( dir.x))+(off.y*dir.y);\n  v.y=(off.x*(-dir.y))+(off.y*dir.x);\n  // Anisotropy.\n  v*=len;\n  // Compute distance^2.\n  float d2=v.x*v.x+v.y*v.y;\n  // Limit to the window as at corner, 2 taps can easily be outside.\n  d2=min(d2,clp);\n  // Approximation of lancos2 without sin() or rcp(), or sqrt() to get x.\n  //  (25/16 * (2/5 * x^2 - 1)^2 - (25/16 - 1)) * (1/4 * x^2 - 1)^2\n  //  |_______________________________________|   |_______________|\n  //                   base                             window\n  // The general form of the 'base' is,\n  //  (a*(b*x^2-1)^2-(a-1))\n  // Where 'a=1/(2*b-b^2)' and 'b' moves around the negative lobe.\n  float wB=float(2.0/5.0)*d2+float(-1.0);\n  float wA=lob*d2+float(-1.0);\n  wB*=wB;\n  wA*=wA;\n  wB=float(25.0/16.0)*wB+float(-(25.0/16.0-1.0));\n  float w=wB*wA;\n  // Do weighted average.\n  aC+=c*w;aW+=w;}\n//------------------------------------------------------------------------------------------------------------------------------\n // Accumulate direction and length.\n void FsrEasuSetF(\n inout vec2 dir,\n inout float len,\n vec2 pp,\n bool biS,bool biT,bool biU,bool biV,\n float lA,float lB,float lC,float lD,float lE){\n  // Compute bilinear weight, branches factor out as predicates are compiler time immediates.\n  //  s t\n  //  u v\n  float w = float(0.0);\n  if(biS)w=(float(1.0)-pp.x)*(float(1.0)-pp.y);\n  if(biT)w=           pp.x *(float(1.0)-pp.y);\n  if(biU)w=(float(1.0)-pp.x)*           pp.y ;\n  if(biV)w=           pp.x *           pp.y ;\n  // Direction is the '+' diff.\n  //    a\n  //  b c d\n  //    e\n  // Then takes magnitude from abs average of both sides of 'c'.\n  // Length converts gradient reversal to 0, smoothly to non-reversal at 1, shaped, then adding horz and vert terms.\n  float dc=lD-lC;\n  float cb=lC-lB;\n  float lenX=max(abs(dc),abs(cb));\n  lenX=safeRcp(lenX);\n  float dirX=lD-lB;\n  dir.x+=dirX*w;\n  lenX=saturate(abs(dirX)*lenX);\n  lenX*=lenX;\n  len+=lenX*w;\n  // Repeat for the y axis.\n  float ec=lE-lC;\n  float ca=lC-lA;\n  float lenY=max(abs(ec),abs(ca));\n  lenY=safeRcp(lenY);\n  float dirY=lE-lA;\n  dir.y+=dirY*w;\n  lenY=saturate(abs(dirY)*lenY);\n  lenY*=lenY;\n  len+=lenY*w;}\n//------------------------------------------------------------------------------------------------------------------------------\n void FsrEasuF(\n out vec3 pix,\n vec2 ip, // Integer pixel position in output.\n vec4 con0, // Constants generated by FsrEasuCon().\n vec4 con1,\n vec4 con2,\n vec4 con3){\n//------------------------------------------------------------------------------------------------------------------------------\n  // Get position of 'f'.\n  vec2 pp=vec2(ip)*vec2(con0.xy)+vec2(con0.zw);\n  vec2 fp=floor(pp);\n  pp-=fp;\n//------------------------------------------------------------------------------------------------------------------------------\n  // 12-tap kernel.\n  //    b c\n  //  e f g h\n  //  i j k l\n  //    n o\n  // Gather 4 ordering.\n  //  a b\n  //  r g\n  // For packed FP16, need either {rg} or {ab} so using the following setup for gather in all versions,\n  //    a b    <- unused (z)\n  //    r g\n  //  a b a b\n  //  r g r g\n  //    a b\n  //    r g    <- unused (z)\n  // Allowing dead-code removal to remove the 'z's.\n  vec2 p0=fp*vec2(con1.xy)+vec2(con1.zw);\n  // These are from p0 to avoid pulling two constants on pre-Navi hardware.\n  vec2 p1=p0+vec2(con2.xy);\n  vec2 p2=p0+vec2(con2.zw);\n  vec2 p3=p0+vec2(con3.xy);\n  vec4 bczzR,bczzG,bczzB,ijfeR,ijfeG,ijfeB,klhgR,klhgG,klhgB,zzonR,zzonG,zzonB;\n  gatherRGB(p0,bczzR,bczzG,bczzB);\n  gatherRGB(p1,ijfeR,ijfeG,ijfeB);\n  gatherRGB(p2,klhgR,klhgG,klhgB);\n  gatherRGB(p3,zzonR,zzonG,zzonB);\n//------------------------------------------------------------------------------------------------------------------------------\n  // Simplest multi-channel approximate luma possible (luma times 2, in 2 FMA/MAD).\n  vec4 bczzL=bczzB*vec4(0.5)+(bczzR*vec4(0.5)+bczzG);\n  vec4 ijfeL=ijfeB*vec4(0.5)+(ijfeR*vec4(0.5)+ijfeG);\n  vec4 klhgL=klhgB*vec4(0.5)+(klhgR*vec4(0.5)+klhgG);\n  vec4 zzonL=zzonB*vec4(0.5)+(zzonR*vec4(0.5)+zzonG);\n  // Rename.\n  float bL=bczzL.x;\n  float cL=bczzL.y;\n  float iL=ijfeL.x;\n  float jL=ijfeL.y;\n  float fL=ijfeL.z;\n  float eL=ijfeL.w;\n  float kL=klhgL.x;\n  float lL=klhgL.y;\n  float hL=klhgL.z;\n  float gL=klhgL.w;\n  float oL=zzonL.z;\n  float nL=zzonL.w;\n  // Accumulate for bilinear interpolation.\n  vec2 dir=vec2(0.0);\n  float len=float(0.0);\n  FsrEasuSetF(dir,len,pp,true, false,false,false,bL,eL,fL,gL,jL);\n  FsrEasuSetF(dir,len,pp,false,true ,false,false,cL,fL,gL,hL,kL);\n  FsrEasuSetF(dir,len,pp,false,false,true ,false,fL,iL,jL,kL,nL);\n  FsrEasuSetF(dir,len,pp,false,false,false,true ,gL,jL,kL,lL,oL);\n//------------------------------------------------------------------------------------------------------------------------------\n  // Normalize with approximation, and cleanup close to zero.\n  vec2 dir2=dir*dir;\n  float dirR=dir2.x+dir2.y;\n  bool zro=dirR<float(1.0/32768.0);\n  dirR=safeRsq(dirR);\n  dirR=zro?float(1.0):dirR;\n  dir.x=zro?float(1.0):dir.x;\n  dir*=vec2(dirR);\n  // Transform from {0 to 2} to {0 to 1} range, and shape with square.\n  len=len*float(0.5);\n  len*=len;\n  // Stretch kernel {1.0 vert|horz, to sqrt(2.0) on diagonal}.\n  float stretch=(dir.x*dir.x+dir.y*dir.y)*safeRcp(max(abs(dir.x),abs(dir.y)));\n  // Anisotropic length after rotation,\n  //  x := 1.0 lerp to 'stretch' on edges\n  //  y := 1.0 lerp to 2x on edges\n  vec2 len2=vec2(float(1.0)+(stretch-float(1.0))*len,float(1.0)+float(-0.5)*len);\n  // Based on the amount of 'edge',\n  // the window shifts from +/-{sqrt(2.0) to slightly beyond 2.0}.\n  float lob=float(0.5)+float((1.0/4.0-0.04)-0.5)*len;\n  // Set distance^2 clipping point to the end of the adjustable window.\n  float clp=safeRcp(lob);\n//------------------------------------------------------------------------------------------------------------------------------\n  // Accumulation mixed with min/max of 4 nearest.\n  //    b c\n  //  e f g h\n  //  i j k l\n  //    n o\n  vec3 min4=min(min3(vec3(ijfeR.z,ijfeG.z,ijfeB.z),vec3(klhgR.w,klhgG.w,klhgB.w),vec3(ijfeR.y,ijfeG.y,ijfeB.y)),\n               vec3(klhgR.x,klhgG.x,klhgB.x));\n  vec3 max4=max(max3(vec3(ijfeR.z,ijfeG.z,ijfeB.z),vec3(klhgR.w,klhgG.w,klhgB.w),vec3(ijfeR.y,ijfeG.y,ijfeB.y)),\n               vec3(klhgR.x,klhgG.x,klhgB.x));\n  // Accumulation.\n  vec3 aC=vec3(0.0);\n  float aW=float(0.0);\n  FsrEasuTapF(aC,aW,vec2( 0.0,-1.0)-pp,dir,len2,lob,clp,vec3(bczzR.x,bczzG.x,bczzB.x)); // b\n  FsrEasuTapF(aC,aW,vec2( 1.0,-1.0)-pp,dir,len2,lob,clp,vec3(bczzR.y,bczzG.y,bczzB.y)); // c\n  FsrEasuTapF(aC,aW,vec2(-1.0, 1.0)-pp,dir,len2,lob,clp,vec3(ijfeR.x,ijfeG.x,ijfeB.x)); // i\n  FsrEasuTapF(aC,aW,vec2( 0.0, 1.0)-pp,dir,len2,lob,clp,vec3(ijfeR.y,ijfeG.y,ijfeB.y)); // j\n  FsrEasuTapF(aC,aW,vec2( 0.0, 0.0)-pp,dir,len2,lob,clp,vec3(ijfeR.z,ijfeG.z,ijfeB.z)); // f\n  FsrEasuTapF(aC,aW,vec2(-1.0, 0.0)-pp,dir,len2,lob,clp,vec3(ijfeR.w,ijfeG.w,ijfeB.w)); // e\n  FsrEasuTapF(aC,aW,vec2( 1.0, 1.0)-pp,dir,len2,lob,clp,vec3(klhgR.x,klhgG.x,klhgB.x)); // k\n  FsrEasuTapF(aC,aW,vec2( 2.0, 1.0)-pp,dir,len2,lob,clp,vec3(klhgR.y,klhgG.y,klhgB.y)); // l\n  FsrEasuTapF(aC,aW,vec2( 2.0, 0.0)-pp,dir,len2,lob,clp,vec3(klhgR.z,klhgG.z,klhgB.z)); // h\n  FsrEasuTapF(aC,aW,vec2( 1.0, 0.0)-pp,dir,len2,lob,clp,vec3(klhgR.w,klhgG.w,klhgB.w)); // g\n  FsrEasuTapF(aC,aW,vec2( 1.0, 2.0)-pp,dir,len2,lob,clp,vec3(zzonR.z,zzonG.z,zzonB.z)); // o\n  FsrEasuTapF(aC,aW,vec2( 0.0, 2.0)-pp,dir,len2,lob,clp,vec3(zzonR.w,zzonG.w,zzonB.w)); // n\n//------------------------------------------------------------------------------------------------------------------------------\n  // Normalize and dering.\n  pix=min(max4,max(min4,aC*vec3(safeRcp(aW))));}\nvoid main(){vec2 size=vec2(textureSize(source,0)),scale=size/outputSize;\n vec4 con0=vec4(scale,.5*scale-.5),con1=vec4(1./size,vec2(1,-1)/size),con2=vec4(vec2(-1,2)/size,vec2(1,2)/size),con3=vec4(vec2(0,4)/size,0,0);\n vec3 c;FsrEasuF(c,gl_FragCoord.xy-.5,con0,con1,con2,con3);fragColor=vec4(c,1);}\n", "finish": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform vec2 outputSize;\nuniform float contrast,saturation,shadows,deband;\nuniform bool diagnostic;\nout vec4 fragColor;\n// Also embedded in the sharpening shader: round only at final presentation.\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\nvoid main(){vec3 c=texture(source,gl_FragCoord.xy/outputSize).rgb;\n float l=dot(c,vec3(.2126,.7152,.0722));\n c=mix(vec3(l),c,saturation);c=(c-.5)*contrast+.5;\n fragColor=vec4(finishColor(c),1.);}\n", "motion": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source, previous, cut, fullSource, fullPrevious;\nuniform vec2 outputSize;\nuniform bool validHistory;\nout vec4 fragColor;\nfloat lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}\nfloat lowLuma[5],fullLuma[5];\nfloat matchingError(vec2 uv,vec2 candidate,vec2 stepSize){\n float error=0.;for(int i=0;i<5;i++){\n  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);\n  error+=abs(lowLuma[i]-lum(texture(previous,uv+(d+candidate)*stepSize).rgb))*.2;\n }return error+length(candidate)*.00001;\n}\nfloat fineError(vec2 uv,vec2 offset){\n vec2 size=vec2(textureSize(fullSource,0));\n float error=0.;\n for(int i=0;i<5;i++){\n  vec2 d=i==0?vec2(0):i==1?vec2(3,0):i==2?vec2(-3,0):i==3?vec2(0,3):vec2(0,-3);\n  error+=abs(fullLuma[i]-lum(texture(fullPrevious,uv+(d+offset)/size).rgb))*.2;\n }\n return error;\n}\nvoid main(){\n if(!validHistory||texture(cut,vec2(.5)).r>.12){fragColor=vec4(vec2(128./255.),0,1);return;}\n vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(source,0));\n // Current-frame samples do not depend on the candidate vector. Fetch once.\n for(int i=0;i<5;i++){\n  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);\n  lowLuma[i]=lum(texture(source,uv+d*stepSize).rgb);\n  fullLuma[i]=lum(texture(fullSource,uv+d*3./vec2(textureSize(fullSource,0))).rgb);\n }\n float best=10.,second=10.;vec2 offset=vec2(0);\n // Keep the fine local search, then search coarse offsets up to 32 source pixels.\n for(int pass=0;pass<2;pass++)for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){\n  if(pass==1&&x==0&&y==0)continue;\n  vec2 candidate=vec2(x,y)*(pass==0?1.:4.);float error=matchingError(uv,candidate,stepSize);\n  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);\n }\n vec2 coarse=offset;\n // Refine only a winning coarse vector. Maximum supported displacement is 40px.\n if(any(greaterThan(abs(coarse),vec2(2))))for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){\n  vec2 candidate=coarse+vec2(x,y);\n  if(all(lessThanEqual(abs(candidate),vec2(2)))||all(lessThan(abs(mod(candidate,4.)),vec2(.001))))continue;\n  float error=matchingError(uv,candidate,stepSize);\n  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);\n }\n float coarseConfidence=smoothstep(.0002,.004,second-best);\n // Refine only at the small motion-field resolution. No extra full-frame pass.\n // Use the actual size ratio: odd source dimensions are not exactly 4:1.\n vec2 fullSize=vec2(textureSize(fullSource,0));\n vec2 center=offset*fullSize/vec2(textureSize(source,0)),fine=center;\n float fineBest=10.,fineSecond=10.;\n for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){\n  vec2 candidate=center+vec2(x,y);float error=fineError(uv,candidate);\n  if(error<fineBest){fineSecond=fineBest;fineBest=error;fine=candidate;}else fineSecond=min(fineSecond,error);\n }\n float confidence=(1.-smoothstep(.008,.045,fineBest))*max(coarseConfidence,smoothstep(.0002,.004,fineSecond-fineBest));\n center=fine;\n for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){\n  if(x==0&&y==0)continue;\n  vec2 candidate=center+vec2(x,y)*.5;float error=fineError(uv,candidate);\n  if(error<fineBest){fineBest=error;fine=candidate;}\n }\n // Exact half-pixel encoding in RGBA8, including zero (128), without float targets.\n fragColor=vec4((clamp(round(fine*2.),vec2(-128),vec2(127))+128.)/255.,confidence,1.);\n}\n", "rcas": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n// FidelityFX Super Resolution Sample\n//\n// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software and associated documentation files(the \"Software\"), to deal\n// in the Software without restriction, including without limitation the rights\n// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell\n// copies of the Software, and to permit persons to whom the Software is\n// furnished to do so, subject to the following conditions :\n// The above copyright notice and this permission notice shall be included in\n// all copies or substantial portions of the Software.\n// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE\n// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n// THE SOFTWARE.\n\n// RCAS port of vendor/ffx_fsr1.h FsrRcasF, denoise enabled.\n// Exact guarded reciprocals replace AMD approximations. Local halo limiter is ours.\nuniform sampler2D data;\nuniform vec2 outputSize;\nuniform float rcasStrength,haloMargin,noiseFloor,contrast,saturation,shadows,deband;\nuniform bool diagnostic,lumaSharpen;\nout vec4 fragColor;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nfloat luma2(vec3 c){return c.b*.5+c.r*.5+c.g;}\nvoid main(){\n vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(data,0));\n vec3 e=texture(data,uv).rgb,c=e;\n if(rcasStrength>0.){\n  vec3 b=texture(data,uv+vec2(0,-1)*stepSize).rgb,d=texture(data,uv+vec2(-1,0)*stepSize).rgb;\n  vec3 f=texture(data,uv+vec2(1,0)*stepSize).rgb,h=texture(data,uv+vec2(0,1)*stepSize).rgb;\n  float bl=luma2(b),dl=luma2(d),el=luma2(e),fl=luma2(f),hl=luma2(h);\n  float range=max(max(max(bl,dl),max(fl,hl)),el)-min(min(min(bl,dl),min(fl,hl)),el);\n  float noise=1.-.5*clamp(abs(.25*(bl+dl+fl+hl)-el)/max(range,1e-6),0.,1.);\n  vec3 mn=min(min(b,d),min(f,h)),mx=max(max(b,d),max(f,h));\n  vec3 hitMin=min(mn,e)/max(4.*mx,vec3(1e-6));\n  vec3 hitMax=(1.-max(mx,e))/min(4.*mn-4.,vec3(-1e-6));\n  vec3 lobes=max(-hitMin,hitMax);\n  float lobe=max(-.1875,min(max(max(lobes.r,lobes.g),lobes.b),0.))*rcasStrength*noise;\n  c=(lobe*(b+d+f+h)+e)/(4.*lobe+1.);\n  vec3 lo=min(mn,e),hi=max(mx,e);\n  float detail=smoothstep(noiseFloor,noiseFloor+4./255.,max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b));\n  c=clamp(mix(e,c,detail),lo-haloMargin,hi+haloMargin);\n  if(lumaSharpen)c=clamp(e+vec3(dot(c-e,vec3(.2126,.7152,.0722))),0.,1.);\n }\n float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,saturation);c=contrast*(c-.5)+.5;\n fragColor=vec4(finishColor(c),1);\n}\n", "sgsr": "#version 300 es\n// Snapdragon Game Super Resolution 1 (SGSR 1), adapted from\n// https://github.com/SnapdragonStudios/snapdragon-gsr sgsr/v1/include/glsl/sgsr1_shader_mobile.frag\n//\n// Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.\n// (LICENSE file of the repository: Copyright (c) 2023, Qualcomm Innovation Center, Inc. All rights reserved.)\n// SPDX-License-Identifier: BSD-3-Clause\n//\n// Redistribution and use in source and binary forms, with or without\n// modification, are permitted provided that the following conditions are met:\n//\n// 1. Redistributions of source code must retain the above copyright notice,\n//    this list of conditions and the following disclaimer.\n//\n// 2. Redistributions in binary form must reproduce the above copyright notice,\n//    this list of conditions and the following disclaimer in the documentation\n//    and/or other materials provided with the distribution.\n//\n// 3. Neither the name of the copyright holder nor the names of its contributors\n//    may be used to endorse or promote products derived from this software\n//    without specific prior written permission.\n//\n// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\"\n// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE\n// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE\n// POSSIBILITY OF SUCH DAMAGE.\n//\n// Changes here (docs/spec2-estudo.md, Spec 3 item 5): WebGL2 has no textureGather, so the 12 luma\n// samples are texelFetch reads of Rec.709 luma (upstream gathers the green channel); edge threshold\n// and sharpness are uniforms (measured 20/255 and 1.0 for compressed video: the original 8/255 and 2.0\n// enhance codec artifacts); a zero-sum guard; and the output finishing of the sharpening pass it\n// replaces (saturation, contrast, shadows, dither, diagnostic tint), appended by tools/build.py.\n// SGSR_PRECISION is mediump on half-precision GPUs (set by the engine), highp elsewhere.\n#ifndef SGSR_PRECISION\n#define SGSR_PRECISION highp\n#endif\nprecision SGSR_PRECISION float;\nprecision highp int;\nprecision SGSR_PRECISION sampler2D;\nuniform sampler2D source;uniform highp vec2 outputSize;uniform float sharp,threshold;\nuniform float brightness,contrast,saturation,shadows,deband;uniform bool diagnostic;\nout vec4 fragColor;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nfloat L(ivec2 p,ivec2 m){return dot(texelFetch(source,clamp(p,ivec2(0),m),0).rgb,vec3(.2126,.7152,.0722));}\nfloat fastLanczos2(float x){float wA=x-4.;float wB=x*wA-wA;wA*=wA;return wB*wA;}\nvec2 weightY(float dx,float dy,float c,float std){float x=(dx*dx+dy*dy)*.55+clamp(abs(c)*std,0.,1.);float w=fastLanczos2(x);return vec2(w,w*c);}\nvoid main(){\n highp vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/outputSize;ivec2 m=ivec2(size)-1;\n vec3 color=textureLod(source,uv,0.).rgb;float cy=dot(color,vec3(.2126,.7152,.0722));\n highp vec2 img=uv*size+vec2(-.5,.5),ip=floor(img);vec2 pl=vec2(img-ip);ivec2 P=ivec2(ip);\n vec4 left;left.y=L(P,m);left.z=L(P+ivec2(0,-1),m);\n float vote=abs(left.z-left.y)+abs(cy-left.y)+abs(cy-left.z);\n if(vote>threshold){\n  left.x=L(P+ivec2(-1,0),m);left.w=L(P+ivec2(-1,-1),m);\n  vec4 right=vec4(L(P+ivec2(1,0),m),L(P+ivec2(2,0),m),L(P+ivec2(2,-1),m),L(P+ivec2(1,-1),m));\n  vec4 ud=vec4(L(P+ivec2(0,-2),m),L(P+ivec2(1,-2),m),L(P+ivec2(1,1),m),L(P+ivec2(0,1),m));\n  float mean=(left.y+left.z+right.x+right.w)*.25;left-=mean;right-=mean;ud-=mean;float cw=cy-mean;\n  vec4 a=abs(left)+abs(right)+abs(ud);float std=2.181818/max(a.x+a.y+a.z+a.w,1e-4);\n  vec2 s=weightY(pl.x,pl.y+1.,ud.x,std)+weightY(pl.x-1.,pl.y+1.,ud.y,std)+weightY(pl.x-1.,pl.y-2.,ud.z,std)+weightY(pl.x,pl.y-2.,ud.w,std);\n  s+=weightY(pl.x+1.,pl.y-1.,left.x,std)+weightY(pl.x,pl.y-1.,left.y,std)+weightY(pl.x,pl.y,left.z,std)+weightY(pl.x+1.,pl.y,left.w,std);\n  s+=weightY(pl.x-1.,pl.y-1.,right.x,std)+weightY(pl.x-2.,pl.y-1.,right.y,std)+weightY(pl.x-2.,pl.y,right.z,std)+weightY(pl.x-1.,pl.y,right.w,std);\n  float fy=s.y/s.x,mx=max(max(left.y,left.z),max(right.x,right.w)),mn=min(min(left.y,left.z),min(right.x,right.w));\n  fy=clamp(sharp*fy,mn,mx);float dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,0.,1.);\n }\n // Same order as the sharpening pass it replaces (casFiltered): saturation, contrast, brightness, finish.\n color=mix(vec3(dot(color,vec3(.299,.587,.114))),color,saturation);color=contrast*(color-.5)+.5;color=brightness*color;\n fragColor=vec4(finishColor(color),1);\n}\n", "spatial": "#version 300 es\n// Compiled variants (restoration-engine.js, spatialSource) define SPATIAL_FIXED, the SPATIAL_* switches\n// below and SPATIAL_PRECISION after the #version line: disabled filters are compiled out and the loop\n// and flags become constants. Without them this is the generic shader driven by uniforms only.\n#ifndef SPATIAL_PRECISION\n#define SPATIAL_PRECISION highp\n#endif\n#ifndef SPATIAL_CLEANUP\n#define SPATIAL_CLEANUP 1\n#endif\n#ifndef SPATIAL_DEBAND\n#define SPATIAL_DEBAND 1\n#endif\n#ifndef SPATIAL_CHROMA\n#define SPATIAL_CHROMA 1\n#endif\n#ifndef SPATIAL_DETAIL\n#define SPATIAL_DETAIL 1\n#endif\n#ifndef SPATIAL_ANTIALIAS\n#define SPATIAL_ANTIALIAS 1\n#endif\n// Color math may run in mediump (half floats on Adreno/Mali); pixel coordinates stay highp.\nprecision SPATIAL_PRECISION float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform float cleanup, deband, chroma, detail, antialias;\n#ifdef SPATIAL_FIXED\nconst float debandTaps=SPATIAL_TAPS;\nconst bool quantize=SPATIAL_QUANTIZE,selective=SPATIAL_SELECTIVE;\n#else\nuniform float debandTaps;\nuniform bool quantize,selective;\n#endif\nout vec4 fragColor;\nfloat peak(vec3 c){return max(max(abs(c.r),abs(c.g)),abs(c.b));}\nfloat lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}\nvec3 at(highp vec2 p){return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;}\nvoid main(){\n highp vec2 p=gl_FragCoord.xy-.5;vec3 c=at(p), result=c;\n vec3 west=at(p-vec2(1,0)),east=at(p+vec2(1,0));\n vec3 south=at(p-vec2(0,1)),north=at(p+vec2(0,1));\n // Gradient sign reversals identify fine texture/extrema, even at low contrast.\n // Reuse these neighbors for cleanup; no extra classification render target.\n float reversal=sqrt(max(0.,max(-lum(c-west)*lum(east-c),-lum(c-south)*lum(north-c))));\n float textureMask=smoothstep(.003,.015,reversal);\n // Color extrema matter even on nearly isoluminant colored text and fine lines.\n if(selective){\n  vec3 rx=max(-(c-west)*(east-c),-(c-south)*(north-c));\n  textureMask=max(textureMask,smoothstep(.003,.015,sqrt(max(0.,max(max(rx.r,rx.g),rx.b)))));\n }\n // Detect a small step between smooth regions; do not assume a codec block grid.\n #if SPATIAL_CLEANUP\n if(cleanup>0.)for(int axis=0;axis<2;axis++){\n  vec2 d=axis==0?vec2(1,0):vec2(0,1);\n  vec3 l=axis==0?west:south,ll=at(p-2.*d),r=axis==0?east:north,rr=at(p+2.*d);\n  float left=selective?peak(c-l):abs(lum(c-l)),right=selective?peak(r-c):abs(lum(r-c));\n  float outerL=selective?peak(l-ll):abs(lum(l-ll)),outerR=selective?peak(rr-r):abs(lum(rr-r));\n  float jump=max(left,right),side=min(left,right);\n  float smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));\n  float smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));\n  // Reject a continuous ramp: it is not evidence of a compression boundary.\n  float confidence=selective?1.-smoothstep(.2,.7,max(max(outerL,outerR),side)/max(jump,1e-5)):1.;\n  vec3 across=left>right?l:r;\n  result=mix(result,(c+across)*.5,cleanup*confidence*smoothSides*smallStep*.8*(1.-textureMask));\n }\n #endif\n #if SPATIAL_DEBAND\n if(deband>0.){\n  vec3 avg=vec3(0);float diff=0.,weightSum=0.;\n  float radius=mix(2.,8.,deband);\n  for(int i=0;i<4;i++){\n   if(float(i)>=debandTaps)break;\n   vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);\n   vec3 n=at(p+floor(d*radius));\n   // Outlying samples across an edge cannot pull a smooth region toward it.\n   float weight=selective?1.-smoothstep(.006,.012+deband*.04,peak(n-c)):1.;\n   avg+=n*weight;weightSum+=weight;\n   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));\n  }\n  avg=weightSum>0.?avg/weightSum:c;\n  float flatRegion=1.-smoothstep(.006,.012+deband*.04,diff);\n  result=mix(result,avg,deband*flatRegion*.8*(1.-textureMask));\n }\n #endif\n #if SPATIAL_CHROMA\n if(chroma>0.){\n  // Chroma from luma. 4:2:0 color is upsampled with a ~2 px blur while luma\n  // stays sharp. Across a luma edge, samples 2 px away on each side carry\n  // clean color; the center luma says which side (or blend) it belongs to.\n  vec2 g=vec2(lum(east)-lum(west),lum(north)-lum(south));\n  float gl=length(g);\n  if(gl>4./255.){\n   highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size,d=g/gl*2./size;\n   vec3 A=texture(source,uv-d).rgb,B=texture(source,uv+d).rgb;\n   float yA=lum(A),yB=lum(B),Y=lum(result),span=yB-yA;\n   float s=clamp((Y-yA)/(abs(span)>1e-4?span:1e-4),0.,1.);\n   vec2 cA=vec2(A.b,A.r)-yA,cB=vec2(B.b,B.r)-yB,cur=vec2(result.b,result.r)-Y,pred=mix(cA,cB,s);\n   // Only a blend of both sides is treated as upsampling blur; color outside\n   // that range is real detail (thin colored lines, text) and is kept.\n   vec2 inside=step(min(cA,cB)-2./255.,cur)*step(cur,max(cA,cB)+2./255.);\n   vec2 weight=chroma*smoothstep(4./255.,12./255.,abs(span))*inside;\n   vec2 cb_cr=mix(cur,pred,weight);\n   float Bc=cb_cr.x+Y,Rc=cb_cr.y+Y;\n   result=vec3(Rc,(Y-.2126*Rc-.0722*Bc)/.7152,Bc);\n  }\n }\n #endif\n #if SPATIAL_DETAIL\n if(detail>0.){\n  // Reuse center/cross samples; fetch only diagonals and distance-2 cross.\n  vec3 w[8]=vec3[8](at(p+vec2(-1,-1)),at(p+vec2(1,-1)),at(p+vec2(-1,1)),at(p+vec2(1,1)),at(p+vec2(2,0)),at(p-vec2(2,0)),at(p+vec2(0,2)),at(p-vec2(0,2)));\n  float lo=min(min(lum(c),min(lum(west),lum(east))),min(lum(south),lum(north))),hi=max(max(lum(c),max(lum(west),lum(east))),max(lum(south),lum(north)));\n  for(int i=0;i<4;i++){float l=lum(w[i]);lo=min(lo,l);hi=max(hi,l);}\n  // Cleanup/deband already smoothed this pixel: do not restore what they removed.\n  float untouched=1.-smoothstep(.5/255.,2./255.,peak(result-c));\n  // Luma-only detail: no colored fringes. Coring grows near strong edges so\n  // encoder ringing/mosquito noise is not amplified with real texture. The\n  // wide range (5x5 cross + ring) finds strong edges up to ~3 px away.\n  float L=lum(result),range=hi-lo,wLo=lo,wHi=hi;\n  for(int i=4;i<8;i++){float l=lum(w[i]);wLo=min(wLo,l);wHi=max(wHi,l);}\n  float fine=lum(c)-.25*(lum(west)+lum(east)+lum(south)+lum(north));\n  highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size;float ring=0.;\n  for(int i=0;i<8;i++){\n   vec2 d=i==0?vec2(3.5,.5):i==1?vec2(-3.5,-.5):i==2?vec2(.5,-3.5):i==3?vec2(-.5,3.5):i==4?vec2(2.5):i==5?vec2(-2.5):i==6?vec2(2.5,-2.5):vec2(-2.5,2.5);\n   float l=lum(texture(source,uv+d/size).rgb);ring+=l;wLo=min(wLo,l);wHi=max(wHi,l);\n  }\n  float clarity=lum(c)-ring/8.;\n  float t=1.5/255.+.06*range+.04*(wHi-wLo);\n  fine=sign(fine)*max(abs(fine)-t,0.);clarity=sign(clarity)*max(abs(clarity)-t,0.);\n  float dL=detail*untouched*(1.2*fine+.8*clarity*(1.-smoothstep(.15,.4,wHi-wLo)));\n  float margin=detail*2./255.;\n  // Bound new overshoot only; never pull an existing value back.\n  result+=clamp(L+dL,min(L,lo-margin),max(L,hi+margin))-L;\n }\n #endif\n #if SPATIAL_ANTIALIAS\n if(antialias>0.){\n  // Same directional AA as antialias.glsl, fused here when temporal is off:\n  // saves a full-frame pass and render target (memory bandwidth on iGPUs).\n  // Direction and blend come from the source; the blend is applied as a delta.\n  float nw=lum(at(p+vec2(-1,1))),ne=lum(at(p+vec2(1,1))),sw=lum(at(p+vec2(-1,-1))),se=lum(at(p+vec2(1,-1)));\n  float mid=lum(c),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));\n  vec2 dir=vec2(-(nw+ne-sw-se),nw+sw-ne-se);\n  float major=max(abs(dir.x),abs(dir.y));\n  float weight=antialias*smoothstep(.04,.15,hi-lo)*smoothstep(.05,.35,min(abs(dir.x),abs(dir.y))/max(major,1e-5));\n  if(weight>0.){\n   highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size,d=dir/max(major,1e-5)/size*.5;\n   vec3 smoothColor=(texture(source,uv-d).rgb+texture(source,uv+d).rgb)*.5;\n   float sl=lum(smoothColor);\n   if(sl>=lo&&sl<=hi)result+=(smoothColor-c)*weight;\n  }\n }\n #endif\n // On devices without float color targets, dither before this first quantization.\n #if SPATIAL_DEBAND\n if(quantize&&deband>0.)result+=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5)/255.;\n #endif\n fragColor=vec4(clamp(result,0.,1.),1.);\n}\n", "temporal": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source, history, motion;\nuniform float temporal;\nout vec4 fragColor;\nvoid main(){\n vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/size;\n vec3 c=texture(source,uv).rgb,lo=c,hi=c;\n for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){\n  vec3 n=texture(source,uv+vec2(x,y)/size).rgb;lo=min(lo,n);hi=max(hi,n);\n }\n vec3 field=texture(motion,uv).rgb;\n vec2 offset=(round(field.xy*255.)-128.)*.5;\n vec2 prevUV=uv+offset/size;\n vec3 old=texture(history,prevUV).rgb;\n float disagreement=max(max(abs(old.r-c.r),abs(old.g-c.g)),abs(old.b-c.b));\n float confidence=field.z*(1.-smoothstep(.02,.08,disagreement));\n if(any(lessThan(prevUV,vec2(0)))||any(greaterThan(prevUV,vec2(1))))confidence=0.;\n // Neighborhood clamp prevents old edges becoming trails or invented textures.\n old=clamp(old,lo-vec3(.004),hi+vec3(.004));\n fragColor=vec4(mix(c,old,temporal*confidence*.35),1.);\n}\n", "nnFeatures": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nlayout(location=0) out vec4 featA;\nlayout(location=1) out vec4 featB;\nfloat Y(ivec2 p){return dot(texelFetch(source,clamp(p,ivec2(0),textureSize(source,0)-1),0).rgb,vec3(.2126,.7152,.0722));}\nvoid main(){ivec2 p=ivec2(gl_FragCoord.xy);\n vec4 hA=vec4(-0.226349,0.014705,0.006476,0.059624),hB=vec4(0.196681,-0.118776,0.014316,0.082932);float y;\n y=Y(p+ivec2(-1,-1));hA+=y*vec4(-0.157775,0.206327,0.434315,-0.279666);hB+=y*vec4(0.221413,-0.694872,0.093376,-0.538916);\n y=Y(p+ivec2(0,-1));hA+=y*vec4(-0.438596,0.246507,-0.337733,0.369609);hB+=y*vec4(-0.39346,-0.088393,0.514404,0.554256);\n y=Y(p+ivec2(1,-1));hA+=y*vec4(0.522971,0.3702,0.639016,-0.536868);hB+=y*vec4(0.07824,0.185036,-0.657592,0.70837);\n y=Y(p+ivec2(-1,0));hA+=y*vec4(-0.730832,-0.233706,0.42366,0.846775);hB+=y*vec4(-0.222371,-0.043975,-0.332283,-0.743265);\n y=Y(p+ivec2(0,0));hA+=y*vec4(-0.150888,0.408999,-0.659478,-0.365631);hB+=y*vec4(-1.388277,-0.823962,-0.268284,-0.802107);\n y=Y(p+ivec2(1,0));hA+=y*vec4(-1.056894,-0.842843,-0.174905,-0.26866);hB+=y*vec4(-0.053229,-0.506229,0.888183,0.175313);\n y=Y(p+ivec2(-1,1));hA+=y*vec4(-1.16294,-1.021929,0.190978,-0.160122);hB+=y*vec4(0.237714,-0.595438,-0.590489,0.173089);\n y=Y(p+ivec2(0,1));hA+=y*vec4(-0.953225,0.951,-0.07258,0.695426);hB+=y*vec4(0.172909,-0.472019,-0.1812,0.241279);\n y=Y(p+ivec2(1,1));hA+=y*vec4(-0.587355,-0.075366,-0.419964,-0.358507);hB+=y*vec4(0.174139,-0.177389,0.529243,0.159632);\n hA=max(hA,0.);hB=max(hB,0.);\n featA=max(vec4(0.025083,-0.005039,-0.060359,0.064819)+mat4(-0.621943,-0.463344,-0.115933,0.376332,-0.393935,-0.144085,-0.640372,-0.800653,-1.427048,0.260171,0.45471,-0.32547,0.45035,-0.165235,0.234294,-0.336041)*hA+mat4(-0.465179,-0.608917,-0.235469,0.379221,0.641487,-0.850979,-0.013973,-0.49559,0.025351,0.824426,0.423167,-0.268448,-0.549956,0.701361,0.319914,-0.337372)*hB,0.);\n featB=max(vec4(0.020966,-0.007923,0.005142,0.038897)+mat4(-0.037735,-0.190399,0.240126,-0.067749,0.437672,0.034552,-0.091689,0.037419,0.17063,-0.014929,0.061535,-0.013824,-0.149559,0.529273,0.026754,-0.18008)*hA+mat4(-1.681177,0.105725,-0.030044,0.226267,0.306316,-0.170306,0.534302,-0.007676,-0.225442,0.261837,-0.797967,-1.462143,0.689266,0.88499,0.075893,-0.010657)*hB,0.);\n}\n", "nnApply": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source,featA,featB;\nuniform float strength;\nout vec4 fragColor;\nvoid main(){ivec2 p=ivec2(gl_FragCoord.xy),m=textureSize(source,0)-1;float d=-0.001243;\n {ivec2 q=clamp(p+ivec2(-1,-1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.037956,0.00161,5e-06,-0.025074))+dot(texelFetch(featB,q,0),vec4(-0.02408,0.018034,-0.106278,0.06329));}\n {ivec2 q=clamp(p+ivec2(0,-1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.035505,0.034456,0.003953,0.118791))+dot(texelFetch(featB,q,0),vec4(0.010837,-0.026097,-0.028258,-0.03518));}\n {ivec2 q=clamp(p+ivec2(1,-1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.03049,-0.018461,0.041689,-0.108793))+dot(texelFetch(featB,q,0),vec4(0.010782,-0.002217,-0.072839,-0.080931));}\n {ivec2 q=clamp(p+ivec2(-1,0),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.049853,-0.006694,0.05851,-0.119233))+dot(texelFetch(featB,q,0),vec4(0.006983,-0.019536,-0.198451,0.127994));}\n {ivec2 q=clamp(p+ivec2(0,0),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.049783,-0.037383,-0.04415,-0.044615))+dot(texelFetch(featB,q,0),vec4(-0.023085,0.035699,-0.07822,0.01058));}\n {ivec2 q=clamp(p+ivec2(1,0),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.019708,-0.029916,0.051002,-0.002716))+dot(texelFetch(featB,q,0),vec4(0.003588,-0.010781,-0.050707,-0.038427));}\n {ivec2 q=clamp(p+ivec2(-1,1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.001052,-0.01583,0.031577,0.070275))+dot(texelFetch(featB,q,0),vec4(0.03957,-0.005504,-0.093555,-0.078156));}\n {ivec2 q=clamp(p+ivec2(0,1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.020044,-0.022556,0.023078,0.110389))+dot(texelFetch(featB,q,0),vec4(0.025218,0.022058,-0.119821,0.046273));}\n {ivec2 q=clamp(p+ivec2(1,1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.032938,0.012272,-0.004361,-0.02909))+dot(texelFetch(featB,q,0),vec4(0.00613,0.00159,-0.068138,0.020778));}\n vec3 c=texelFetch(source,p,0).rgb;\n // Luma correction applied to all channels: chroma is left to the chroma stage.\n fragColor=vec4(clamp(c+vec3(strength*d),0.,1.),1);\n}\n", "cas": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;uniform sampler2D data;uniform vec2 iResolution;const int FILTER_UNSHARP_MASKING = 1;const int FILTER_CAS = 2;const float CAS_CONTRAST_PEAK = 0.8 * -3.0 + 8.0;const vec3 LUMINOSITY_FACTOR = vec3(0.299, 0.587, 0.114);uniform int filterId;uniform bool qualityMode;uniform float sharpenFactor;uniform float brightness;uniform float contrast;uniform float saturation;out vec4 fragColor;uniform float shadows,deband;uniform bool diagnostic;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nvec3 clarityBoost(sampler2D tex, vec2 coord, vec3 e) {vec2 texelSize = 1.0 / vec2(textureSize(tex, 0));vec3 b = texture(tex, coord + texelSize * vec2(0, 1)).rgb;vec3 d = texture(tex, coord + texelSize * vec2(-1, 0)).rgb;vec3 f = texture(tex, coord + texelSize * vec2(1, 0)).rgb;vec3 h = texture(tex, coord + texelSize * vec2(0, -1)).rgb;vec3 a;vec3 c;vec3 g;vec3 i;if (filterId == FILTER_UNSHARP_MASKING || qualityMode) {a = texture(tex, coord + texelSize * vec2(-1, 1)).rgb;c = texture(tex, coord + texelSize * vec2(1, 1)).rgb;g = texture(tex, coord + texelSize * vec2(-1, -1)).rgb;i = texture(tex, coord + texelSize * vec2(1, -1)).rgb;}if (filterId == FILTER_UNSHARP_MASKING) {vec3 gaussianBlur = (a + c + g + i) * 1.0 + (b + d + f + h) * 2.0 + e * 4.0;gaussianBlur /= 16.0;return e + (e - gaussianBlur) * sharpenFactor / 3.0;}vec3 minRgb = min(min(min(d, e), min(f, b)), h);vec3 maxRgb = max(max(max(d, e), max(f, b)), h);if (qualityMode) {minRgb += min(min(a, c), min(g, i));maxRgb += max(max(a, c), max(g, i));}vec3 reciprocalMaxRgb = 1.0 / max(maxRgb, vec3(1e-6));vec3 amplifyRgb = clamp(min(minRgb, 2.0 - maxRgb) * reciprocalMaxRgb, 0.0, 1.0);amplifyRgb = inversesqrt(max(amplifyRgb, vec3(1e-6)));vec3 weightRgb = -(1.0 / (amplifyRgb * CAS_CONTRAST_PEAK));vec3 reciprocalWeightRgb = 1.0 / (4.0 * weightRgb + 1.0);vec3 window = b + d + f + h;vec3 outColor = clamp((window * weightRgb + e) * reciprocalWeightRgb, 0.0, 1.0);return mix(e, outColor, sharpenFactor / 2.0);}void main() {vec2 uv = gl_FragCoord.xy / iResolution.xy;vec3 color = texture(data, uv).rgb;if (sharpenFactor > 0.0) {color = clarityBoost(data, uv, color);}color = mix(vec3(dot(color, LUMINOSITY_FACTOR)), color, saturation);color = contrast * (color - 0.5) + 0.5;color = brightness * color;fragColor = vec4(finishColor(color), 1.0);}", "casFiltered": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;uniform sampler2D data;uniform vec2 iResolution;const int FILTER_UNSHARP_MASKING = 1;const int FILTER_CAS = 2;const float CAS_CONTRAST_PEAK = 0.8 * -3.0 + 8.0;const vec3 LUMINOSITY_FACTOR = vec3(0.299, 0.587, 0.114);uniform int filterId;uniform bool qualityMode;uniform float sharpenFactor;uniform float brightness;uniform float contrast;uniform float saturation;out vec4 fragColor;uniform float shadows,deband;uniform bool diagnostic;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nuniform float haloMargin,noiseFloor;uniform bool lumaSharpen;\nvec3 limitSharpen(vec3 center,vec3 sharpened,vec3 lo,vec3 hi){\n float range=max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b);\n float detail=smoothstep(noiseFloor,noiseFloor+4.0/255.0,range);\n vec3 result=clamp(mix(center,sharpened,detail),lo-vec3(haloMargin),hi+vec3(haloMargin));\n if(lumaSharpen)result=clamp(center+vec3(dot(result-center,vec3(0.2126,0.7152,0.0722))),0.0,1.0);\n return result;\n}\nvec3 clarityBoost(sampler2D tex, vec2 coord, vec3 e) {vec2 texelSize = 1.0 / vec2(textureSize(tex, 0));vec3 b = texture(tex, coord + texelSize * vec2(0, 1)).rgb;vec3 d = texture(tex, coord + texelSize * vec2(-1, 0)).rgb;vec3 f = texture(tex, coord + texelSize * vec2(1, 0)).rgb;vec3 h = texture(tex, coord + texelSize * vec2(0, -1)).rgb;vec3 a;vec3 c;vec3 g;vec3 i;if (filterId == FILTER_UNSHARP_MASKING || qualityMode) {a = texture(tex, coord + texelSize * vec2(-1, 1)).rgb;c = texture(tex, coord + texelSize * vec2(1, 1)).rgb;g = texture(tex, coord + texelSize * vec2(-1, -1)).rgb;i = texture(tex, coord + texelSize * vec2(1, -1)).rgb;}if (filterId == FILTER_UNSHARP_MASKING) {vec3 gaussianBlur = (a + c + g + i) * 1.0 + (b + d + f + h) * 2.0 + e * 4.0;gaussianBlur /= 16.0;return limitSharpen(e,e + (e - gaussianBlur) * sharpenFactor / 3.0,min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h));}vec3 minRgb = min(min(min(d, e), min(f, b)), h);vec3 maxRgb = max(max(max(d, e), max(f, b)), h);if (qualityMode) {minRgb += min(min(a, c), min(g, i));maxRgb += max(max(a, c), max(g, i));}vec3 reciprocalMaxRgb = 1.0 / max(maxRgb, vec3(1e-6));vec3 amplifyRgb = clamp(min(minRgb, 2.0 - maxRgb) * reciprocalMaxRgb, 0.0, 1.0);amplifyRgb = inversesqrt(max(amplifyRgb, vec3(1e-6)));vec3 weightRgb = -(1.0 / (amplifyRgb * CAS_CONTRAST_PEAK));vec3 reciprocalWeightRgb = 1.0 / (4.0 * weightRgb + 1.0);vec3 window = b + d + f + h;vec3 outColor = clamp((window * weightRgb + e) * reciprocalWeightRgb, 0.0, 1.0);return limitSharpen(e,mix(e, outColor, sharpenFactor / 2.0),min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h));}void main() {vec2 uv = gl_FragCoord.xy / iResolution.xy;vec3 color = texture(data, uv).rgb;if (sharpenFactor > 0.0) {color = clarityBoost(data, uv, color);}color = mix(vec3(dot(color, LUMINOSITY_FACTOR)), color, saturation);color = contrast * (color - 0.5) + 0.5;color = brightness * color;fragColor = vec4(finishColor(color), 1.0);}"};
/* Shared GPU video processing engine. GLSL assets are embedded by tools/build.py. */
(() => {
  // v9 defaults come from tools/eval (docs/analysis-v9.md): same sharpness as the clean
  // render with the highest fidelity on xCloud-like H.264 streams.
  const defaults = Object.freeze({mode:'filtered',fluidity:'off',capture:'video',adaptive:true,hud:'off',hudPosition:'top-left',smoothing:0,neural:0,cleanup:0,deband:.6,chroma:.75,detail:0,temporal:0,upscale:true,output:'auto',antialias:0,gpuBudget:6,sharpness:2,scaler:'easu',processing:'cas',sharpening:'usm',spatialMode:'selective',lumaSharpen:true,noiseFloor:4,processingMode:'performance',contrast:1,saturation:1,shadows:0,desynchronized:false});
  function normalize(value={}) {
    if(!value || typeof value!=='object')value={};
    const result={...defaults};
    if(['auto','native','1440','2160'].includes(value.output)||/^\d{3,4}$/.test(value.output)&&value.output>=360&&value.output<=2160)result.output=String(value.output);
    if([0,3,6,10].includes(value.gpuBudget))result.gpuBudget=value.gpuBudget;
    if(['original','cas','filtered'].includes(value.mode))result.mode=value.mode;
    if(['usm','cas','rcas','native'].includes(value.sharpening))result.sharpening=value.sharpening;
    if(['easu','sgsr'].includes(value.scaler))result.scaler=value.scaler;
    if([0,17,33,50].includes(value.smoothing))result.smoothing=value.smoothing;
    if(['off','balanced','max'].includes(value.fluidity))result.fluidity=value.fluidity;
    if(['video','direct'].includes(value.capture))result.capture=value.capture;
    if(['off','compact','full'].includes(value.hud))result.hud=value.hud;
    if(['top-left','top-right','bottom-left','bottom-right'].includes(value.hudPosition))result.hudPosition=value.hudPosition;
    if(['selective','legacy'].includes(value.spatialMode))result.spatialMode=value.spatialMode;
    if(['cas','usm'].includes(value.processing))result.processing=value.processing;
    if(['performance','quality'].includes(value.processingMode))result.processingMode=value.processingMode;
    if(typeof value.upscale==='boolean')result.upscale=value.upscale;
    if(typeof value.lumaSharpen==='boolean')result.lumaSharpen=value.lumaSharpen;
    if(typeof value.adaptive==='boolean')result.adaptive=value.adaptive;
    // Low-latency canvas (Spec 3 item 11): only an explicit true; it applies when the next canvas is created.
    if(value.desynchronized===true)result.desynchronized=true;
    for(const [key,min,max] of [['neural',0,1],['antialias',0,1],['sharpness',0,10],['cleanup',0,1],['deband',0,1],['chroma',0,1],['detail',0,1],['temporal',0,1],['contrast',.8,1.2],['noiseFloor',0,8],['saturation',0,1.3],['shadows',0,1]])
      if(typeof value[key]==='number'&&Number.isFinite(value[key]))result[key]=Math.min(max,Math.max(min,value[key]));
    return result;
  }
  function historyValid(previous,time,w,h){return !!previous && previous.w===w && previous.h===h && time>previous.time && time-previous.time<.25;}
  // Auto renders at the height the video occupies on screen in physical pixels, so
  // FSR and sharpening happen at final size instead of the compositor's bilinear
  // stretch (e.g. 1080p stream on a 1220-1280 px phone panel). Never above 2160p or
  // the display (an HDMI 1080p signal stays native); steps of 8 px avoid churn.
  function resolveOutput(output,displayHeight,sourceHeight){
    if(output!=='auto')return output;
    const height=Math.min(2160,Math.floor(displayHeight/8)*8);
    return height>sourceHeight*1.04?String(height):'native';
  }
  // SGSR 1 (Spec 3 item 5) parameters from the Nitidez slider. Measured on compressed video
  // (docs/spec2-estudo.md, Ganho visual): edge threshold 20/255 and strength 1.0 at the default
  // sharpness 2. The slope matches the edge energy of USM: SGSR 1.0/1.5 give 1.08/1.31 against USM
  // 2/3 at 1.04/1.26, so strength = 0.2 + 0.4 x sharpness (3 -> 1.4, 4.5 -> 2.0, the upstream value).
  // Sharpness 0 skips the edge step (threshold above any vote): plain bilinear scaling, no sharpening.
  function sgsrParams(sharpness){return sharpness>0?{sharp:.2+.4*sharpness,threshold:20/255}:{sharp:1,threshold:4};}
  function outputSize(w,h,output){const height=/^\d+$/.test(output)?Number(output):h;return {width:Math.round(w*height/h),height};}
  function createBudget(){return {limitMs:3,values:[],p95:null,cadenceOver:0,fenceOver:0,over:0,temporalAllowed:true,neuralAllowed:true,debandScale:1,debandTaps:4,antialiasAllowed:true,cleanupAllowed:true,enhanceAllowed:true,outputCap:Infinity,settings:defaults,sourceHeight:1080,revision:0,reason:'',
  configure(settings,height){this.settings=normalize(settings);this.sourceHeight=height;},
  outputFor(settings){
    if(settings.mode!=='filtered'||settings.gpuBudget===0||settings.output==='native'||this.outputCap===Infinity)return settings.output;
    const height=Math.min(Number(settings.output),this.outputCap);
    return height<=this.sourceHeight?'native':String(height);
  },degrade(){
    const s=this.settings;
    if(this.limitMs===0)return;
    if(s.temporal>0&&this.temporalAllowed){this.temporalAllowed=false;this.reason='Temporal desligado para preservar fluidez';}
    else if(s.output!=='native'&&Math.min(Number(s.output),this.outputCap)>this.sourceHeight){
      this.outputCap=Math.min(Number(s.output),this.outputCap)>1440&&this.sourceHeight<1440?1440:this.sourceHeight;
      this.reason='Saída reduzida para '+(this.outputCap===this.sourceHeight?'nativa':this.outputCap+'p')+' para preservar fluidez';
    }
    else if(s.antialias>0&&this.antialiasAllowed){this.antialiasAllowed=false;this.reason='Antialiasing desligado para preservar fluidez';}
    else if(s.neural>0&&this.neuralAllowed){this.neuralAllowed=false;this.reason='Reconstrução neural desligada para preservar fluidez';}
    else if(s.deband>0&&this.debandScale>0){this.debandScale=Math.max(0,this.debandScale-.5);this.debandTaps=this.debandScale>0?2:0;this.reason='Degradês reduzidos para preservar fluidez';}
    else if(s.cleanup>0&&this.cleanupAllowed){this.cleanupAllowed=false;this.reason='Limpeza desligada para preservar fluidez';}
    else if((s.detail>0||s.chroma>0)&&this.enhanceAllowed){this.enhanceAllowed=false;this.reason='Detalhe e cor desligados para preservar fluidez';}
    else return;
    // Do not let timings from a more expensive pipeline trigger the next reduction.
    this.values=[];this.over=0;this.cadenceOver=0;this.revision++;
  },cadence(reference,current,ratio=.95){
    if(this.limitMs===0)return;
    if(!Number.isFinite(reference)||reference<=0||!Number.isFinite(current))return;
    this.cadenceOver=current<reference*ratio?this.cadenceOver+1:0;
    if(this.cadenceOver>=3){this.degrade();this.cadenceOver=0;}
  },fenceTrend(p50,reference){
    // Early warning only (docs/spec2-estudo.md 10.4, an inference): the fence p50 above 1.5 frame
    // intervals for 3 windows in a row. It never reduces the treatment: the fence includes queued work,
    // so it is an upper bound, and the GPU occupancy, not milliseconds, is what the study validated.
    if(!Number.isFinite(p50)||!Number.isFinite(reference)||reference<=0){this.fenceOver=0;return false;}
    this.fenceOver=p50>1.5*1000/reference?this.fenceOver+1:0;
    return this.fenceOver>=3;
  },sample(ms,mode='filtered'){
    if(mode!=='filtered')return;
    if(!Number.isFinite(ms)||ms<0)return;
    this.values.push(ms);if(this.values.length>60)this.values.shift();
    const sorted=[...this.values].sort((a,b)=>a-b);this.p95=sorted[Math.ceil(sorted.length*.95)-1];
    if(this.values.length<60)return;
    this.over=this.limitMs>0&&this.p95>this.limitMs?this.over+1:0;
    if(this.over>=30){this.degrade();this.over=0;}
  }};}
  // Reference for the cadence adaptation without GPU timers: the frames the decoder delivers right now,
  // under Better xCloud's FPS limit. It follows the game (about 60 FPS in menus, 30 in a match) and falls
  // with the network, so a stream problem never reads as GPU overload. Under 10 FPS it is a stall: no reference.
  function liveCadence(received,limit){if(!Number.isFinite(received)||received<10)return null;return limit>0?Math.min(received,limit):received;}
  // Fraction of the live rate the frames shown must stay above, per path and target rate (Spec 3 item 6).
  // Direct capture shows every decoded frame: 5%. The <video> element skips frames that arrive together
  // without any GPU overload: 0.1% at 30 FPS on the Poco F7 (10% kept), but 5-17% of 60 FPS shown at
  // 60, with the GPU at 3.7% (bare video, 49.7 FPS) as well as at 88% (docs/medicoes/spec2 poco-base,
  // poco-fps, poco-candidatos, poco-longa60; a file clip, not WebRTC). There 20%: above the worst loss
  // without overload, while a sustained 30% fall still reduces.
  // 45 FPS splits the two targets (the live rate is about 30 or 60, lower only on a weak network).
  function cadenceMargin(direct,reference){return direct?.95:reference>45?.8:.9;}
  function createDiagnostics(){
    // One segment per distinct configuration: returning to an earlier one (e.g. the adaptive QP level)
    // continues its segment, with time counted only while it is current. Besides the GPU time, each
    // segment keeps the intervals between frames shown (display), reaching the treatment (arrival) and
    // captured by the server (server), the Fluidez wait per frame, its drops and the frames the <video>
    // element skipped; the report adds a per-second stream timeline, so pacing can be read from the
    // file, not only the average FPS.
    let recording=false,segments=[],byKey=new Map(),current=null,gpuCount=0,raw=0,disjoints=0,started=null,ended=null,stopReason=null,metadata={},timeline=[],timelineCut=false;
    const GPU_LIMIT=120000,RAW_LIMIT=300000,TIMELINE_LIMIT=3600,INTERVALS=['display','arrival','server','wait'];
    const percentile=(a,p)=>a.length?a[Math.ceil(a.length*p)-1]:null,round=v=>Math.round(v*100)/100;
    // Interval series: count, mean, deviation and maximum are exact and percentiles come from 0.1 ms bins,
    // so the summary covers the whole segment however long; only the raw samples stop at RAW_LIMIT in
    // total (samplesTruncated).
    const series=()=>({n:0,sum:0,sq:0,max:null,bins:new Map(),samples:[],cut:false});
    function push(x,v){x.n++;x.sum+=v;x.sq+=v*v;if(x.max===null||v>x.max)x.max=v;const b=Math.round(v*10);x.bins.set(b,(x.bins.get(b)||0)+1);
      if(raw<RAW_LIMIT){x.samples.push(round(v));raw++;}else x.cut=true;}
    // Hitches (display/arrival/server): intervals over 1.5x the median, i.e. a frame shown late. Not for waits.
    function summary(x,hitches=true){
      if(!x.n)return {count:0,meanMs:null,p50:null,p95:null,p99:null,maxMs:null,deviationMs:null,hitches:hitches?0:null,samplesMs:[],samplesTruncated:false};
      const bins=[...x.bins].sort((a,b)=>a[0]-b[0]),mean=x.sum/x.n;
      const at=p=>{const rank=Math.ceil(x.n*p);let acc=0;for(const [b,c] of bins){acc+=c;if(acc>=rank)return b/10;}return bins[bins.length-1][0]/10;};
      const median=at(.5);
      return {count:x.n,meanMs:mean,p50:median,p95:at(.95),p99:at(.99),maxMs:x.max,deviationMs:Math.sqrt(Math.max(0,x.sq/x.n-mean*mean)),
        hitches:hitches?bins.reduce((a,[b,c])=>b/10>median*1.5?a+c:a,0):null,samplesMs:x.samples,samplesTruncated:x.cut};}
    return {
      get active(){return recording;},get startedAt(){return started;},
      start(meta={}){recording=true;segments=[];byKey=new Map();current=null;gpuCount=raw=0;disjoints=0;started=Date.now();ended=null;stopReason=null;metadata=meta;timeline=[];timelineCut=false;},
      stop(reason=null){if(!recording)return;recording=false;ended=Date.now();stopReason=reason;},
      frame(config,time){if(!recording)return null;const key=JSON.stringify(config);
        if(current?.key!==key){if(current)current.activeMs+=current.last-current.since;
          let segment=byKey.get(key);
          if(!segment){if(segments.length>=256){this.stop('limite de 256 configurações');return null;}
            segment={key,config,frames:0,visits:0,activeMs:0,since:time,last:time,dropped:0,skipped:0,gpu:[],display:series(),arrival:series(),server:series(),wait:series()};segments.push(segment);byKey.set(key,segment);}
          segment.visits++;segment.since=segment.last=time;current=segment;}
        current.frames++;current.last=time;return current;
      },
      sample(segment,ms){if(!segment||!segments.includes(segment)||!Number.isFinite(ms)||ms<0)return;
        if(gpuCount>=GPU_LIMIT)return;segment.gpu.push(ms);gpuCount++;
      },
      // Interval (ms) of the configuration being rendered: 'display', 'arrival', 'server' or 'wait'.
      interval(kind,ms){if(!recording||!current||!INTERVALS.includes(kind)||!Number.isFinite(ms)||ms<0)return;push(current[kind],ms);},
      dropped(n){if(recording&&current&&n>0)current.dropped+=n;},
      skipped(n){if(recording&&current&&n>0)current.skipped+=n;},
      // One row per second of stream telemetry, t in seconds since the start; at most an hour.
      timeline(entry){if(!recording)return;if(timeline.length>=TIMELINE_LIMIT){timelineCut=true;return;}const row={t:round((Date.now()-started)/1000)};
        for(const [k,v] of Object.entries(entry))row[k]=typeof v==='number'?(Number.isFinite(v)?(k==='bitsPerPixel'?Math.round(v*1e4)/1e4:round(v)):null):v??null;timeline.push(row);},
      annotate(meta){if(recording)Object.assign(metadata,meta);},
      disjoint(){if(recording)disjoints++;},
      report(){return {schema:2,version:'9.8.0',build:globalThis.BxBuild??null,started,ended,stopReason,recording,metadata,disjoints,
        sampleLimit:{gpu:GPU_LIMIT,intervals:RAW_LIMIT,timeline:TIMELINE_LIMIT},truncated:gpuCount>=GPU_LIMIT||raw>=RAW_LIMIT||timelineCut||segments.length>=256,
        segments:segments.map(segment=>{const {config,frames,visits,gpu,dropped,skipped}=segment,durationMs=segment.activeMs+(segment===current?segment.last-segment.since:0);
          const sorted=[...gpu].sort((a,b)=>a-b);return {config,frames,durationMs,drawFps:durationMs>0?(frames-visits)*1000/durationMs:null,pacerDropped:dropped,videoSkipped:skipped,
            gpu:{count:gpu.length,p50:percentile(sorted,.5),p95:percentile(sorted,.95),p99:percentile(sorted,.99),samplesMs:[...gpu]},
            display:summary(segment.display),arrival:summary(segment.arrival),server:summary(segment.server),wait:summary(segment.wait,false)};}),
        timeline};}
    };
  }
  async function captureVideoStats(video,peer){
    const quality=video?.getVideoPlaybackQuality?.();
    const result={time:Date.now(),video:video?{width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,totalVideoFrames:quality?.totalVideoFrames??null,droppedVideoFrames:quality?.droppedVideoFrames??null}:null,rtc:[]};
    if(peer?.getStats)try{const stats=await peer.getStats();stats.forEach(item=>{
      if(item.type!=='inbound-rtp'||item.kind!=='video')return;
      const row={};for(const key of ['id','timestamp','ssrc','decoderImplementation','powerEfficientDecoder','framesDecoded','framesPerSecond','framesDropped','framesReceived','totalDecodeTime','jitterBufferDelay','jitterBufferEmittedCount','freezeCount','totalFreezesDuration','bytesReceived','packetsReceived','packetsLost','jitter'])row[key]=item[key]??null;
      const codec=stats.get(item.codecId);row.codec=codec?{mimeType:codec.mimeType,sdpFmtpLine:codec.sdpFmtpLine,h264Profile:h264Profile(codec.sdpFmtpLine)}:null;result.rtc.push(row);
    });}catch{result.rtcUnavailable=true;}return result;
  }
  // Decoder summary from two inbound-rtp video snapshots: DT as in Better xCloud's stats bar
  // (decode time per frame) plus hardware/software when the browser exposes it. Chrome may hide
  // decoderImplementation/powerEfficientDecoder for privacy; then the kind is 'unknown'.
  // H.264 profile from profile-level-id (first byte, profile_idc): 42 Baseline, 4d Main, 64 High.
  function h264Profile(fmtp){
    const id=/profile-level-id=([0-9a-f]{2})/i.exec(fmtp||'')?.[1]?.toLowerCase();
    return {'42':'Baseline','4d':'Main','58':'Extended','64':'High'}[id]||null;
  }
  // Video pipeline summary from two inbound-rtp snapshots: DT as in Better xCloud's stats bar
  // (decode time per frame), jitter buffer delay per emitted frame, received FPS, plus
  // hardware/software when the browser exposes it (Chrome may hide it; then 'unknown').
  function decoderSummary(previous,current){
    if(!current)return null;
    const frames=previous?current.framesDecoded-previous.framesDecoded:0;
    const dt=frames>0?(current.totalDecodeTime-previous.totalDecodeTime)/frames*1000:null;
    const emitted=previous?current.jitterBufferEmittedCount-previous.jitterBufferEmittedCount:0;
    const jitter=emitted>0?(current.jitterBufferDelay-previous.jitterBufferDelay)/emitted*1000:null;
    const kind=current.powerEfficientDecoder===true?'hardware':current.powerEfficientDecoder===false?'software':'unknown';
    return {kind,implementation:current.decoderImplementation||null,dtMs:Number.isFinite(dt)?dt:null,jitterMs:Number.isFinite(jitter)?jitter:null,
      fps:Number.isFinite(current.framesPerSecond)?current.framesPerSecond:null,codec:current.codec||null};
  }
  // Frame pacing from the arrival times (ms) of new frames: mean interval, deviation, p95 and
  // "hitches" (intervals over 1.5x the median, i.e. a frame shown late). 30 FPS ideal: 33.3 ms, 0 hitches.
  function frameStats(times){
    const d=[];for(let i=1;i<times.length;i++)d.push(times[i]-times[i-1]);
    if(d.length<3)return null;
    const sorted=[...d].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],mean=d.reduce((a,b)=>a+b,0)/d.length;
    const deviation=Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/d.length);
    return {meanMs:mean,deviationMs:deviation,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],hitches:d.filter(v=>v>median*1.5).length,frames:d.length};
  }
  // Requested WebRTC buffering target (ms), not a guarantee of actual delay.
  // The browser may clamp or gradually apply it; null restores its own policy.
  function applySmoothing(peer,ms){
    const result={requestedMs:ms,receivers:0,supported:0,applied:0,failed:0,state:'waiting'};
    if(!peer?.getReceivers)return result;
    for(const r of peer.getReceivers()){
      if(r.track?.kind!=='video')continue;
      result.receivers++;
      const key='jitterBufferTarget' in r?'jitterBufferTarget':'playoutDelayHint' in r?'playoutDelayHint':null;
      if(!key)continue;
      result.supported++;
      try{
        const value=ms>0?(key==='playoutDelayHint'?ms/1000:ms):null;
        if(r[key]!==value)r[key]=value;
        if(r[key]===value)result.applied++;else result.failed++;
      }catch{result.failed++;}
    }
    result.state=!result.receivers?'waiting':!result.supported?'unsupported':result.applied===result.receivers?'requested':result.applied?'partial':'error';
    return result;
  }
  // RTP video timestamps are 90 kHz, 32-bit: unwrap to a monotonic millisecond clock.
  function createRtpClock(){let last=null,ms=0;return v=>{if(!Number.isFinite(v))return null;if(last===null){last=v;return ms;}
    let d=(v-last)>>>0;if(d>0x80000000)d-=0x100000000;last=v;ms+=d/90;return ms;};}
  // Frame pacer ("Fluidez"): frames are processed on arrival and shown on a steady clock instead of
  // the moment they arrive, delayed like a jitter buffer by the recent network transit.
  // balanced: the clock is the server capture time (RTP), keeping the game's own cadence; max: an
  // ideal 30/60 FPS grid that follows the capture clock's drift but not its jitter, also evening out
  // an irregular game/server cadence. Without RTP times, both use the grid on arrival times.
  function createPacer(mode='balanced',{minDelay=3,lead=4,maxQueue=2}={}){
    const queue=[],deltas=[],transits=[];let lastP=null,lastRef=null,clock=null,grid=null,offset=null,cadence=null,dropped=0,extra=null;
    // Cadence: median of recent intervals, so missing source frames (a 2x interval) do not stretch it,
    // snapped to exact 30/60 FPS when close. A mean of 34 ms (30 FPS, 2% missing) drifted the grid.
    function updateCadence(d){if(d>2&&d<200){deltas.push(d);if(deltas.length>30)deltas.shift();}
      if(deltas.length>=5){const m=[...deltas].sort((a,b)=>a-b)[deltas.length>>1];cadence=Math.abs(m-1000/30)<2?1000/30:Math.abs(m-1000/60)<1?1000/60:m;}}
    function schedule(f){
      // Clocks: 'rtp' (rVFC RTP times, from 0), 'frame' (VideoFrame times, monotonic since boot) or
      // 'arrival'. A change of clock, or a jump of more than a second (stall, RTP restart), restarts the
      // clock-relative state; lastP keeps the display order.
      const kind=f.rtp==null?'arrival':f.clock||'rtp',ref=f.rtp??f.arrival;
      if(kind!==clock||lastRef!==null&&(ref<lastRef||ref-lastRef>1000)){clock=kind;lastRef=grid=offset=null;transits.length=0;}
      const interval=lastRef===null?null:ref-lastRef;if(interval!==null)updateCadence(interval);lastRef=ref;
      let base=null,p;
      if(mode==='balanced'&&kind!=='arrival')base=ref;
      else if(cadence){
        // Whole periods since the last slot: a missing source frame holds the previous one for exactly
        // two. Following the clock by 5% per frame absorbs drift and filters jitter.
        const next=grid===null?ref:grid+cadence*Math.max(1,Math.round((ref-grid)/cadence));
        base=grid=next+.05*(ref-next);
      }
      if(base!==null){
        // Like a jitter buffer: delay = recent transit (arrival - clock) + margin, its 95th percentile
        // (balanced) or the latest of the last 3 s (max: no frame misses its slot). It rises at once
        // (a later slot only shows the frame late) and falls 0.25 ms per frame once late frames leave
        // the window, so the slots stay steady instead of following each sample.
        transits.push(f.arrival-base);if(transits.length>90)transits.shift();
        const sorted=[...transits].sort((a,b)=>a-b),target=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*(mode==='max'?1:.95)))]+minDelay;
        offset=offset===null||target>offset?target:Math.max(target,offset-.25);p=base+offset;
      }else p=f.arrival+minDelay;
      if(p<f.arrival)p=f.arrival;
      // Never let the schedule fall behind real time by more than about a frame and a half.
      if(cadence&&p-f.arrival>cadence*1.5)p=f.arrival+minDelay;
      if(lastP!==null&&p<lastP)p=lastP;
      f.p=p;lastP=p;
    }
    return {
      mode,
      get queued(){return queue.length;},get pending(){return queue.slice();},get dropped(){return dropped;},get extraDelayMs(){return extra;},get cadenceMs(){return cadence;},
      add(frame){queue.push(frame);while(queue.length>maxQueue+1){queue.shift();dropped++;}return frame;},
      attach(rtp){for(let i=queue.length-1;i>=0;i--)if(queue[i].rtp==null&&queue[i].p==null){queue[i].rtp=rtp;return true;}return false;},
      // Returns the frame to show at this display refresh (or null to keep the current one).
      tick(now){
        for(const f of queue)if(f.p==null)schedule(f);
        let pick=-1;for(let i=0;i<queue.length;i++)if(queue[i].p<=now+lead)pick=i;
        if(pick<0)return null;
        if(pick>0)dropped+=pick;
        const f=queue.splice(0,pick+1).pop();f.shown=now;
        const delay=now-f.arrival;extra=extra===null?delay:extra*.9+delay*.1;
        return f;
      },
      reset(){queue.length=0;deltas.length=0;transits.length=0;lastP=lastRef=clock=grid=offset=cadence=extra=null;dropped=0;}
    };
  }
  // Stream quality between two inbound-rtp video snapshots (getStats, ms timestamps): received bitrate,
  // packet loss and the mean H.264 QP per decoded frame (lower = less compression, 0-51).
  function streamSummary(previous,current){
    if(!current)return null;
    const seconds=previous?(current.timestamp-previous.timestamp)/1000:0,delta=k=>previous&&Number.isFinite(current[k])&&Number.isFinite(previous[k])?current[k]-previous[k]:null;
    const bytes=delta('bytesReceived'),lost=delta('packetsLost'),received=delta('packetsReceived'),qp=delta('qpSum'),frames=delta('framesDecoded');
    return {bitrateMbps:seconds>0&&bytes>=0?bytes*8/seconds/1e6:null,lossPct:lost!==null&&received!==null&&lost+received>0?Math.max(0,lost)*100/(lost+received):null,
      qp:qp!==null&&frames>0?qp/frames:null,frames,framesDropped:delta('framesDropped'),freezes:delta('freezeCount'),
      width:Number.isFinite(current.frameWidth)?current.frameWidth:null,height:Number.isFinite(current.frameHeight)?current.frameHeight:null,
      // Encoded bits per pixel of each frame: the compression estimate when the browser reports no QP.
      bitsPerPixel:bytes!==null&&bytes>=0&&frames>0&&current.frameWidth>0&&current.frameHeight>0?bytes*8/(frames*current.frameWidth*current.frameHeight):null};
  }
  // Without the decoder's QP (the Android WebView reports no qpSum), the bits per pixel stand in for it:
  // 0.12 bit/pixel (15 Mb/s at 1080p60, the middle of the v9 calibration streams) is the neutral QP 28,
  // and each doubling 4 QP less. H.264 needs about 6 QP per doubling; the gentler slope keeps an
  // estimate that cannot see the scene content closer to neutral.
  function qpFromBitsPerPixel(bpp){if(!(bpp>0)||!Number.isFinite(bpp))return null;return Math.min(51,Math.max(0,28-4*Math.log2(bpp/.12)));}
  // Compression-adaptive treatment: like a codec's deblocking filter, cleanup and debanding follow the
  // quantizer. Level 0 (QP <= 20, clean stream) to 1 (QP >= 36, heavy compression), in steps of 0.1;
  // QP 28 is neutral (all scales 1), so typical streams keep the measured v9 strengths.
  function compressionLevel(qp){if(!Number.isFinite(qp))return null;const t=Math.min(1,Math.max(0,(qp-20)/16));return Math.round(t*t*(3-2*t)*10)/10;}
  function compressionScales(level){if(level===null||!Number.isFinite(level))return {cleanup:1,deband:1,detail:1};
    return {cleanup:.6+.8*level,deband:.6+.8*level,detail:1.2-.4*level};}
  // One-tap starting points. natural = Spec 3 defaults (docs/spec3-implementacao.md); v9 = the previous defaults (docs/analysis-v9.md); console = sharpness
  // 2 for less texture flicker (docs/analysis-v9.1.md); the others trade fidelity for a purpose.
  const presets=Object.freeze({
    natural:{label:'Natural',description:'Padrão da Spec 3: nitidez 2, degradês 60%, sem Compressão nem Detalhe (menos GPU, índice visual maior).',values:{sharpness:2,cleanup:0,deband:.6,chroma:.75,detail:0,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    v9:{label:'Padrão v9',description:'Padrão anterior (v9): nitidez 3, Compressão 50%, Degradês 30%, Detalhe 20%. Mais GPU.',values:{sharpness:3,cleanup:.5,deband:.3,chroma:.75,detail:.2,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    console:{label:'Console',description:'Nitidez 2: menos cintilação de textura, aparência de console.',values:{sharpness:2,cleanup:.5,deband:.3,chroma:.75,detail:.1,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    sharp:{label:'Nítido',description:'Mais contorno e textura; mais cintilação em movimento.',values:{sharpness:4.5,cleanup:.35,deband:.2,chroma:.75,detail:.35,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    clean:{label:'Bitrate baixo',description:'Mais limpeza de blocos e degradês para streams muito comprimidos.',values:{sharpness:2.5,cleanup:.8,deband:.6,chroma:.75,detail:.1,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    light:{label:'Leve',description:'Menos passes na GPU: saída nativa, sem degradês nem detalhe.',values:{sharpness:3,cleanup:.35,deband:0,chroma:.5,detail:0,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'native'}},
  });
  function presetOf(settings){for(const [key,p] of Object.entries(presets))if(Object.entries(p.values).every(([k,v])=>settings[k]===v))return key;return 'custom';}
  // Indented JSON with each samplesMs array on one line (one number per line would multiply the size).
  function reportText(report){return JSON.stringify(report,(k,v)=>k==='samplesMs'&&Array.isArray(v)?'@@'+JSON.stringify(v)+'@@':v,2).replace(/"@@(\[[^"]*\])@@"/g,'$1');}
  // The Android app's WebView cannot download blobs: its bridge saves the file to Downloads instead.
  function downloadReport(report){const name='bx-v9.8.0-diagnostics-'+Date.now()+'.json';
    const text=reportText(report);
    if(typeof globalThis.BxAndroid?.saveFile==='function'){const where=globalThis.BxAndroid.saveFile(name,'application/json',text);if(where)return where;}
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const vertex='#version 300 es\nlayout(location=0) in vec2 position;void main(){gl_Position=vec4(position,0,1);}';
  // Spatial pass variants (Spec 3, docs/spec2-estudo.md 10.2). The precision profile comes from the GPU:
  // mediump color math where mediump really is half precision (Adreno/Mali report 10 bits, Poco F7
  // spatial 2.9 -> 2.3 ms), highp elsewhere (Iris Xe and SwiftShader gain nothing and keep the
  // generic shader's exact output). Strengths stay uniforms: the compression adaptation moves them.
  function spatialPrecision(gl,requested='auto'){
    if(requested==='highp'||requested==='mediump')return requested;
    try{const f=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.MEDIUM_FLOAT);return f&&f.precision>0&&f.precision<=10?'mediump':'highp';}catch{return 'highp';}
  }
  // What a variant compiles in: which filters run (strength > 0), the deband taps and the two flags.
  // These change only with the settings or an adaptation step, never per frame.
  function spatialProfile(u,precision='highp'){
    // Taps as the generic loop counts them: tap i runs while i < debandTaps.
    const deband=u.deband>0,taps=deband&&u.debandTaps>0?Math.min(4,Math.ceil(u.debandTaps)):0;
    return {precision,cleanup:u.cleanup>0,deband,taps,chroma:u.chroma>0,detail:u.detail>0,antialias:u.antialias>0,quantize:!!u.quantize,selective:!!u.selective};
  }
  function spatialKey(p){return [p.precision,p.cleanup,p.deband,p.taps,p.chroma,p.detail,p.antialias,p.quantize,p.selective].map(v=>v===true?1:v===false?0:v).join('.');}
  function spatialSource(code,p){
    const lines=['#define SPATIAL_FIXED 1','#define SPATIAL_PRECISION '+p.precision,'#define SPATIAL_TAPS '+p.taps.toFixed(1),'#define SPATIAL_QUANTIZE '+p.quantize,'#define SPATIAL_SELECTIVE '+p.selective];
    for(const k of ['cleanup','deband','chroma','detail','antialias'])lines.push('#define SPATIAL_'+k.toUpperCase()+' '+(p[k]?1:0));
    const at=code.indexOf('\n');return code.slice(0,at+1)+lines.join('\n')+'\n'+code.slice(at+1);
  }
  // SGSR precision as the spatial pass: mediump color math on half-precision GPUs, highp elsewhere.
  function sgsrSource(code,precision){const at=code.indexOf('\n');return code.slice(0,at+1)+'#define SGSR_PRECISION '+precision+'\n'+code.slice(at+1);}
  class Engine {
    // options.spatialPrecision: 'auto' (from the GPU), 'highp' or 'mediump'; options.spatialVariants:
    // false keeps the generic uniform-driven spatial shader (benches, comparisons).
    constructor(gl,shaders,options={}){
      this.gl=gl;this.programs={};this.targets={};this.queries=[];this.budget=createBudget();this.previous=null;this.frames=0;this.diagnostics=createDiagnostics();this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.fenceTiming=!this.ext&&typeof gl.fenceSync==='function';this.fence=null;this.fenceAt=-Infinity;this.fenceValues=[];this.fenceGeneration=0;this.gpuEstimate=null;
      this.floatTargets=!!gl.getExtension('EXT_color_buffer_float');
      this.spatialPrecision=spatialPrecision(gl,options.spatialPrecision);this.spatialCode=options.spatialVariants===false?null:shaders.spatial||null;
      this.spatialJobs=new Map();this.spatialUsed=new Map();this.spatialFailed=new Set();this.parallelCompile=gl.getExtension('KHR_parallel_shader_compile');
      try {
        this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        for(const [name,code]of Object.entries(shaders))this.programs[name]=this.compile(name==='sgsr'?sgsrSource(code,this.spatialPrecision):code);
        // Pre-warmed with the rest: the spatial variant of the default settings on an RGBA8 target.
        if(this.spatialCode){const d=defaults;this.spatialVariant({cleanup:d.cleanup,deband:d.deband,chroma:d.chroma,detail:d.detail,antialias:d.antialias,debandTaps:4,quantize:true,selective:d.spatialMode==='selective'},true);}
        this.input=gl.createTexture();this.configure(this.input);
      }catch(e){this.destroy();throw e;}finally{gl.bindVertexArray(null);}
    }
    // Compilation in two halves: start() issues the work without waiting, finish() reads the status
    // (which waits for the compiler) and deletes the shader objects.
    startProgram(fragment){const gl=this.gl,program=gl.createProgram(),objects=[];
      for(const [kind,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(kind);objects.push(s);gl.shaderSource(s,code);gl.compileShader(s);gl.attachShader(program,s);}
      gl.linkProgram(program);return {program,objects};}
    finishProgram({program,objects}){const gl=this.gl;try{
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
        for(const s of objects)if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
        throw new Error(gl.getProgramInfoLog(program));}
      return {program,locations:{}};
    }catch(e){gl.deleteProgram(program);throw e;}finally{for(const s of objects)gl.deleteShader(s);}}
    compile(fragment){return this.finishProgram(this.startProgram(fragment));}
    // Program name for the spatial pass with these uniforms. A new profile is compiled once and kept
    // (up to 8, least recently used out); until it is ready the generic shader draws, so a settings or
    // adaptation change never waits for the compiler inside a frame. Its status is read from the next
    // frame on (the browser's GPU process compiles in the meantime), or when KHR_parallel_shader_compile
    // reports it done. A variant that fails to build leaves the generic shader for that profile.
    spatialVariant(u,wait=false){
      if(!this.spatialCode)return 'spatial';
      const gl=this.gl,name='spatial@'+spatialKey(spatialProfile(u,this.spatialPrecision));
      if(!this.programs[name]){
        if(this.spatialFailed.has(name))return 'spatial';
        let job=this.spatialJobs.get(name);
        if(!job){job=this.startProgram(spatialSource(this.spatialCode,spatialProfile(u,this.spatialPrecision)));job.frame=this.frames;this.spatialJobs.set(name,job);}
        if(!wait&&(job.frame===this.frames||this.parallelCompile&&!gl.getProgramParameter(job.program,this.parallelCompile.COMPLETION_STATUS_KHR)))return 'spatial';
        this.spatialJobs.delete(name);
        try{this.programs[name]=this.finishProgram(job);}catch(e){this.spatialFailed.add(name);console.warn('[BxRestoration] spatial variant failed, using the generic shader',name,e);return 'spatial';}
      }
      this.spatialUsed.delete(name);this.spatialUsed.set(name,this.frames);
      if(this.spatialUsed.size>8){const [old]=this.spatialUsed.keys();this.spatialUsed.delete(old);gl.deleteProgram(this.programs[old].program);delete this.programs[old];}
      return name;
    }
    configure(texture){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);}
    target(name,w,h,precise=false){const gl=this.gl,fp=precise&&this.floatTargets;this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h&&t.fp===fp)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
      t={w,h,fp,texture:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;this.configure(t.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,fp?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,fp?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incompleto');return t;
    }
    // Two RGBA16F color attachments written by one pass (neural features).
    targetPair(name,w,h){const gl=this.gl;this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);}
      t={w,h,fp:true,texture:gl.createTexture(),second:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);
      for(const [i,texture] of [t.texture,t.second].entries()){this.configure(texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0);}
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incompleto');return t;
    }
    draw(name,target,w,h,textures={},uniforms={}){
      const gl=this.gl,p=this.programs[name];gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fbo:null);gl.viewport(0,0,w,h);gl.useProgram(p.program);
      // Cache misses too (null): shared uniform sets name uniforms some programs lack.
      const location=k=>Object.hasOwn(p.locations,k)?p.locations[k]:(p.locations[k]=gl.getUniformLocation(p.program,k));
      let slot=0;for(const [key,texture]of Object.entries(textures)){gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(location(key),slot++);}
      for(const [key,value]of Object.entries({outputSize:[w,h],...uniforms})){
        if(typeof value==='boolean')gl.uniform1i(location(key),value?1:0);
        else if(Array.isArray(value))gl.uniform2f(location(key),...value);
        else gl.uniform1f(location(key),value);
      }
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    dropQuery(item){for(const q of [].concat(item.q))this.gl.deleteQuery(q);}
    // A slot leaving the pacer without being presented: its render() time still counts.
    flushSlot(t){if(t.pendingQuery){this.queries.push(t.pendingQuery);t.pendingQuery=null;}t.final=null;}
    poll(){const gl=this.gl;if(!this.ext)return;
      if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const item of this.queries)this.dropQuery(item);this.queries=[];this.diagnostics.disjoint();return;}
      // A deferred frame (render + present) is one sample made of two queries.
      while(this.queries.length&&[].concat(this.queries[0].q).every(q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))){
        const item=this.queries.shift();if(item.revision===this.budget.revision){const ms=[].concat(item.q).reduce((a,q)=>a+gl.getQueryParameter(q,gl.QUERY_RESULT),0)/1e6;this.budget.sample(ms,item.mode);this.diagnostics.sample(item.segment,ms);}this.dropQuery(item);}
    }
    // Without the timer query (Android WebView), every 0.5 s a fence after a frame, polled on later tasks,
    // times it from its first command until the GPU finished it: an upper bound of the GPU time (it also
    // counts work queued before it), shown as an estimate and never used to reduce the treatment.
    startFence(start,mode,segment){const gl=this.gl,sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)return;gl.flush();
      this.fenceAt=start;this.fence={sync,start,mode,segment,generation:this.fenceGeneration,checked:null};setTimeout(()=>this.pollFence(),1);}
    pollFence(){const gl=this.gl,f=this.fence;if(!f)return;
      if(gl.isContextLost()){this.fence=null;return;}
      const now=performance.now(),signaled=gl.getSyncParameter(f.sync,gl.SYNC_STATUS)===gl.SIGNALED,gap=f.checked===null?0:now-f.checked;
      if(!signaled&&now-f.start<250){f.checked=now;setTimeout(()=>this.pollFence(),1);return;}
      // A late reading measures the delay, not the GPU: a hidden page throttles timers, and a long task
      // between two polls hides when the fence finished. The first poll waits for the rendering update.
      gl.deleteSync(f.sync);this.fence=null;if(!signaled||now-f.start>=250||gap>20)return;
      const ms=now-f.start;this.diagnostics.sample(f.segment,ms);
      if(f.mode!=='filtered'||f.generation!==this.fenceGeneration)return;
      this.fenceValues.push(ms);if(this.fenceValues.length>30)this.fenceValues.shift();
      const sorted=[...this.fenceValues].sort((a,b)=>a-b);this.gpuEstimate={p50:sorted[(sorted.length-1)>>1],p95:sorted[Math.ceil(sorted.length*.95)-1],count:sorted.length};
    }
    outputSize(w,h,settings){
      if(this.budget.limitMs!==settings.gpuBudget){this.resetBudget();this.budget.limitMs=settings.gpuBudget;}
      this.budget.configure(settings,h);this.poll();
      return outputSize(w,h,this.budget.outputFor(settings));
    }
    // outputTarget: draw the final pass into that persistent texture instead of the canvas, so a
    // frame pacer can present it later with present(). Names starting with 'paced' stay allocated.
    // deferFinal (Spec 3 item 8, with outputTarget): the texture keeps the input of the last pass
    // (sharpening or SGSR) and present() draws that pass straight to the canvas, instead of drawing
    // it here and copying the result there: one full-screen copy less per frame. The last
    // intermediate target is handed to the slot without a copy; the video upload and the temporal
    // history, which the next frame reuses, are copied at source size.
    render(video,outW,outH,rawSettings,time,diagnostic=false,outputTarget=null,deferFinal=false){
      const gl=this.gl,s=normalize(rawSettings),w=video.videoWidth||video.displayWidth||video.width,h=video.videoHeight||video.displayHeight||video.height;
      if(!w||!h||gl.isContextLost())return false;
      const started=performance.now();let deferredSlot=null;
      if(this.budget.limitMs!==s.gpuBudget){this.resetBudget();this.budget.limitMs=s.gpuBudget;}
      this.budget.configure(s,h);
      this.poll();let q=null;
      const revision=this.budget.revision;
      const filtered=s.mode==='filtered';
      const {hud:_hud,hudPosition:_position,...measured}=s;
      const segment=this.diagnostics.active?this.diagnostics.frame({settings:measured,diagnostic,source:[w,h],output:[outW,outH],revision,effective:{neural:filtered&&this.floatTargets&&this.budget.neuralAllowed?s.neural:0,temporal:filtered&&s.temporal>0&&this.budget.temporalAllowed,cleanup:filtered&&this.budget.cleanupAllowed?s.cleanup:0,chroma:filtered&&this.budget.enhanceAllowed?s.chroma:0,detail:filtered&&this.budget.enhanceAllowed?s.detail:0,deband:filtered?s.deband*this.budget.debandScale:0,debandTaps:filtered&&s.deband>0?this.budget.debandTaps:0,antialias:filtered&&this.budget.antialiasAllowed?s.antialias:0,scaler:filtered&&s.upscale&&outW>w&&outH>h?s.scaler:null}},performance.now()):null;
      this.usedTargets=new Set();
      if(this.ext&&this.queries.length<4){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
      try{
        gl.activeTexture(gl.TEXTURE0);this.configure(this.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        let source=this.input,sgsr=false;
        if(s.mode==='filtered'){
          // Neural restoration first: trained on decoded stream luma (tools/nn), needs float targets.
          if(s.neural>0&&this.floatTargets&&this.budget.neuralAllowed){
            const features=this.targetPair('nnFeatures',w,h),restored=this.target('neural',w,h,s.processingMode==='quality');
            this.draw('nnFeatures',features,w,h,{source});
            this.draw('nnApply',restored,w,h,{source,featA:features.texture,featB:features.second},{strength:s.neural});source=restored.texture;
          }
          const cleanup=this.budget.cleanupAllowed?s.cleanup:0,deband=s.deband*this.budget.debandScale;
          const chroma=this.budget.enhanceAllowed?s.chroma:0,detail=this.budget.enhanceAllowed?s.detail:0;
          const temporalEnabled=s.temporal>0&&this.budget.temporalAllowed;
          // Without temporal, AA runs inside the spatial pass (no extra full-frame pass).
          const antialias=s.antialias>0&&this.budget.antialiasAllowed?s.antialias:0,fusedAntialias=temporalEnabled?0:antialias;
          if(cleanup>0||deband>0||chroma>0||detail>0||fusedAntialias>0){
            const spatial=this.target('spatial',w,h,s.processingMode==='quality');
            const u={cleanup,deband,chroma,detail,antialias:fusedAntialias,debandTaps:this.budget.debandTaps,quantize:!spatial.fp,selective:s.spatialMode==='selective'};
            this.draw(this.spatialVariant(u),spatial,w,h,{source},u);source=spatial.texture;
          }
          if(temporalEnabled){
            const qw=Math.max(1,Math.ceil(w/4)),qh=Math.max(1,Math.ceil(h/4));
            const index=(this.historyIndex||0)^1;
            const low=this.target('low'+index,qw,qh),prevLow=this.target('low'+(index^1),qw,qh),history=this.target('history'+(index^1),w,h,true);
            this.draw('copy',low,qw,qh,{source:this.input});
            const valid=historyValid(this.previous,time,w,h);
            const cut=this.target('cut',1,1);this.draw('cut',cut,1,1,{source:low.texture,previous:prevLow.texture});
            const motion=this.target('motion',Math.max(1,Math.ceil(w/16)),Math.max(1,Math.ceil(h/16)));
            gl.bindTexture(gl.TEXTURE_2D,motion.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
            this.draw('motion',motion,motion.w,motion.h,{source:low.texture,previous:prevLow.texture,cut:cut.texture,fullSource:this.input,fullPrevious:history.texture},{validHistory:valid});
            const temporal=this.target('history'+index,w,h,true);
            this.draw('temporal',temporal,w,h,{source,history:history.texture,motion:motion.texture},{temporal:valid?s.temporal:0});source=temporal.texture;
            this.historyIndex=index; // Ping-pong retains both histories without two extra copies.
          }
          this.previous=temporalEnabled?{time,w,h}:null;
          if(temporalEnabled&&antialias>0){const aa=this.target('aa',w,h,s.processingMode==='quality');this.draw('antialias',aa,w,h,{source},{amount:antialias});source=aa.texture;}
          // Upscale: EASU then the sharpening pass, or SGSR alone as the last pass (item 5). At native
          // output SGSR is never used: the sharpening pass stays (SGSR was measured only when scaling).
          if(s.upscale&&outW>w&&outH>h){if(s.scaler==='sgsr')sgsr=true;else{const scaled=this.target('scaled',outW,outH,s.processingMode==='quality');this.draw('easu',scaled,outW,outH,{source});source=scaled.texture;}}
        }else this.previous=null;
        // One last pass to the output: SGSR (scaling and sharpening, with the finishing of the sharpening
        // pass), or one sharpening stage. 'native' follows the Better xCloud menu (CAS/USM). The
        // reference applies the same method and strength with the unmodified upstream shader.
        let final;
        if(sgsr)final={name:'sgsr',textures:{source},uniforms:{...sgsrParams(s.sharpness),brightness:1,contrast:s.contrast,saturation:s.saturation,shadows:s.shadows,deband:s.deband*this.budget.debandScale,diagnostic}};
        else{const method=s.sharpening==='native'?s.processing:s.sharpening;
          const casName=s.mode!=='original'&&method==='rcas'?'rcas':s.mode==='filtered'?'casFiltered':'cas';
          final={name:casName,filterId:method==='usm'?1:2,textures:{data:source},uniforms:{iResolution:[outW,outH],qualityMode:s.mode==='filtered'&&s.processingMode==='quality',rcasStrength:s.sharpness/10,haloMargin:(2+s.sharpness)/255,noiseFloor:s.noiseFloor/255,lumaSharpen:s.lumaSharpen,sharpenFactor:s.mode==='original'?0:s.mode==='cas'?s.sharpness/1.2:s.sharpness/(s.processingMode==='quality'?1:1.2),brightness:1,contrast:s.mode==='filtered'?s.contrast:1,saturation:s.mode==='filtered'?s.saturation:1,shadows:s.mode==='filtered'?s.shadows:0,deband:s.mode==='filtered'?s.deband*this.budget.debandScale:0,diagnostic}};}
        if(outputTarget&&deferFinal){
          const old=this.targets[outputTarget];if(old)this.flushSlot(old);
          const owner=source===this.input?null:Object.keys(this.targets).find(k=>this.targets[k].texture===source&&!k.startsWith('history')&&!k.startsWith('paced'));
          let slot;
          if(owner){slot=this.targets[owner];this.targets[outputTarget]=slot;if(old)this.targets[owner]=old;else delete this.targets[owner];}
          else{const fp=source!==this.input;slot=this.target(outputTarget,w,h,fp);this.draw('copy',slot,w,h,{source});}
          slot.final={name:final.name,filterId:final.filterId,key:Object.keys(final.textures)[0],uniforms:final.uniforms,w:outW,h:outH};deferredSlot=slot;
        }else this.drawFinal(final,outputTarget?this.target(outputTarget,outW,outH):null,outW,outH);
        if(this.fenceTiming&&!this.fence&&started-this.fenceAt>=500)this.startFence(started,s.mode,segment);
        this.frames++;return true;
      }finally{
        if(q){gl.endQuery(this.ext.TIME_ELAPSED_EXT);const item={q,mode:s.mode,revision,segment};if(deferredSlot)deferredSlot.pendingQuery=item;else this.queries.push(item);}
        for(const [name,t] of Object.entries(this.targets))if(!this.usedTargets.has(name)&&!name.startsWith('paced')){
          gl.deleteTexture(t.texture);if(t.second)gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);delete this.targets[name];
        }
        this.usedTargets=null;
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
      }
    }
    drawFinal(f,target,w,h){if(f.filterId){const p=this.programs[f.name];this.gl.useProgram(p.program);this.gl.uniform1i(this.gl.getUniformLocation(p.program,'filterId'),f.filterId);}
      this.draw(f.name,target,w,h,f.textures,f.uniforms);}
    // Shows a frame stored by render(...,outputTarget) on the canvas (exact copy at output size).
    // A deferred slot (render(...,deferFinal)) runs its last pass here, timed with its render().
    present(name){const t=this.targets[name],gl=this.gl;if(!t||gl.isContextLost())return false;
      if(t.final){const item=t.pendingQuery;t.pendingQuery=null;let q=null;if(item&&this.ext){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
        this.drawFinal({...t.final,textures:{[t.final.key]:t.texture}},null,t.final.w,t.final.h);
        if(q){gl.endQuery(this.ext.TIME_ELAPSED_EXT);item.q=[].concat(item.q,q);}if(item)this.queries.push(item);}
      else this.draw('copy',null,t.w,t.h,{source:t.texture});gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);return true;}
    releasePaced(){const gl=this.gl;for(const [name,t] of Object.entries(this.targets))if(name.startsWith('paced')){if(t.pendingQuery)this.dropQuery(t.pendingQuery);gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);delete this.targets[name];}}
    resetHistory(){this.previous=null;}
    resetBudget(){for(const item of this.queries)this.dropQuery(item);this.queries=[];for(const t of Object.values(this.targets))if(t.pendingQuery){this.dropQuery(t.pendingQuery);t.pendingQuery=null;}this.budget=createBudget();this.resetHistory();this.fenceGeneration++;this.fenceValues=[];this.gpuEstimate=null;}
    destroy(){const gl=this.gl;
      for(const t of Object.values(this.targets)){gl.deleteTexture(t.texture);if(t.second)gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);}
      for(const p of Object.values(this.programs))gl.deleteProgram(p.program);
      for(const item of this.queries)this.dropQuery(item);for(const t of Object.values(this.targets))if(t.pendingQuery)this.dropQuery(t.pendingQuery);
      if(this.fence){gl.deleteSync(this.fence.sync);this.fence=null;}
      for(const job of this.spatialJobs?.values()||[]){gl.deleteProgram(job.program);for(const s of job.objects)gl.deleteShader(s);}this.spatialJobs?.clear();this.spatialUsed?.clear();
      gl.deleteTexture(this.input);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);this.targets={};this.programs={};this.queries=[];
    }
  }
  globalThis.BxRestoration={sgsrParams,sgsrSource,spatialPrecision,spatialProfile,spatialKey,spatialSource,liveCadence,cadenceMargin,streamSummary,qpFromBitsPerPixel,compressionLevel,compressionScales,presets,presetOf,createPacer,createRtpClock,frameStats,applySmoothing,h264Profile,decoderSummary,createDiagnostics,captureVideoStats,downloadReport,Engine,defaults,normalize,historyValid,createBudget,outputSize,resolveOutput};
})();

/* BEGIN FRAME PACING */
// Keep the upstream source intact. Apply the cap to every canvas renderer.
(() => {
 const proto=BaseCanvasPlayer.prototype;
 proto.setTargetFps=function(target){
  this.targetFps=target;
  this.frameInterval=target>0?1000/target:0;
  this.bxNextFrameAt=null;
 };
 proto.shouldDraw=function(){
  if(this.targetFps>=60)return true;
  if(this.targetFps<=0)return false;
  const now=performance.now(),interval=this.frameInterval;
  if(this.bxNextFrameAt==null||now-this.bxNextFrameAt>interval){
   // Start immediately, and discard old deadlines after a long interruption.
   this.bxNextFrameAt=now+interval;
   return true;
  }
  // A small scheduling tolerance accepts early callbacks without moving the
  // next deadline. The cap stays at its requested average instead of drifting.
  if(now<this.bxNextFrameAt-2)return false;
  this.bxNextFrameAt+=interval;
  return true;
 };
})();
/* END FRAME PACING */

// Better xCloud adapter for the shared restoration engine: rendering, frame timing, stream telemetry
// and the window.BxImageFilter API read by the panel (panel.js) and the in-game HUD (hud.js).
(() => {
 // v9 has measured defaults; a new key keeps v8.x saved values from overriding them.
 const key='BxImageFilter.v9';let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
 // Spec 3 changed the defaults (sharpness 2, no Compression/Detail, Debanding 60%). A user still on the
 // untouched v9 defaults moves to the new ones once; anything customised stays. 'Padrão v9' brings them back.
 try{if(saved&&typeof saved==='object'&&!localStorage.getItem('BxImageFilter.spec3')){const v9=BxRestoration.presets.v9.values;
  if(Object.entries(v9).every(([k,v])=>saved[k]===undefined||saved[k]===v))for(const k of ['sharpness','cleanup','deband','detail'])delete saved[k];}
  localStorage.setItem('BxImageFilter.spec3','1');}catch{}
 const settings=BxRestoration.normalize(saved);
 // Native image controls own sharpening; removed experimental color overrides stay neutral.
 settings.contrast=1;settings.saturation=1;settings.shadows=0;
 const status={mode:'waiting',frames:0,lastFrame:0,resolution:'',error:'',gpuP95:null,measurement:'cadence',adaptation:'',fps:null,
  // Display intervals (ms) of the last ~8 s at 30 FPS, oldest first: the HUD's pacing graph.
  intervals:[],intervalsTotal:0,net:null,warnings:[],adaptive:null,capture:{active:false,frames:0,reason:''},
  // GPU time estimate {p50, p95, count} from fences when the browser has no GPU timer (see Engine.startFence).
  gpuEstimate:null,
  // Fence trend above 1.5 frame intervals for 3 windows (Engine budget.fenceTrend): a warning only.
  gpuTrend:false,
  // desynchronized attribute of the current canvas context (null before the first player).
  desynchronized:null};
 let activeEngine=null,activePlayer=null;
 // Physical pixels the video occupies on screen. The canvas CSS box is fixed by Better
 // xCloud (object-fit contain), so this does not depend on the canvas backing size.
 // Without layout yet, fall back to the display/HDMI mode height.
 function displayHeight(player,w,h){
  const dpr=window.devicePixelRatio||1,rect=player?.$canvas?.getBoundingClientRect?.();
  if(rect&&rect.width>0&&rect.height>0&&w&&h)return Math.round(Math.min(rect.height,rect.width*h/w)*dpr);
  return Math.round((screen?.height||0)*dpr);
 }
 // Settings that do not change the processed image keep the GPU adaptation.
 const LIVE_KEYS=new Set(['mode','smoothing','hud','hudPosition','desynchronized']);
 // Bumped by every capture/Fluidez change: a failed direct capture is retried after the user changes either.
 let captureEpoch=0;
 const api=window.BxImageFilter={settings,status,diagnostic:false,panelOpen:false,presets:BxRestoration.presets,
  // Restores the treatment; the HUD choice is a display preference and stays.
  reset(){const {hud,hudPosition}=settings;Object.assign(settings,BxRestoration.defaults,{hud,hudPosition});persist();api.diagnostic=false;activeEngine?.resetBudget();if(activePlayer){activePlayer.bxReferenceFps=null;activePlayer.bxTimes=[];activePlayer.bxCadenceMark=performance.now();}},
  // Unchanged values are ignored: the gamepad repeats a held direction ~10 times a second, even at the ends.
  update(patch){const changed=Object.keys(patch).filter(k=>settings[k]!==patch[k]);if(!changed.length)return;
   Object.assign(settings,patch);if(changed.includes('capture')||changed.includes('fluidity'))captureEpoch++;if(changed.some(k=>!LIVE_KEYS.has(k)))activeEngine?.resetBudget();persist(true);},
  applyPreset(name){const p=BxRestoration.presets[name];if(p)api.update({...p.values});},
  preset:()=>BxRestoration.presetOf(settings),
  // Better xCloud keeps stream.*, server.* and userAgent.* as global prefs; video.* per stream/game.
  nativePref(k){try{if(/^(stream|server|userAgent)\./.test(k))return typeof getGlobalPref==='function'?getGlobalPref(k):undefined;return typeof getStreamPref==='function'?getStreamPref(k):undefined;}catch{return undefined;}},
  get active(){return !!status.lastFrame&&Date.now()-status.lastFrame<2500;},
  directSupported:()=>typeof MediaStreamTrackProcessor==='function'&&typeof VideoFrame==='function',
  async startMeasurement(){const engine=activeEngine,video=activePlayer?.$video;if(!engine)return false;
   const initial=await BxRestoration.captureVideoStats(video,peer());if(activeEngine!==engine)return false;
   const sc=globalThis.screen;
   engine.diagnostics.start({userAgent:navigator.userAgent,renderer:engine.gl.getParameter(engine.gl.RENDERER),timer:!!engine.ext,gpuMethod:engine.ext?'timer':engine.fenceTiming?'fence':null,floatTargets:engine.floatTargets,
    screen:{width:sc?.width??null,height:sc?.height??null,dpr:window.devicePixelRatio??null,refreshPref:androidCall('getRefreshRate')},app:androidCall('getAppInfo'),
    betterXcloud:nativePrefs(),capture:{...status.capture},smoothing:status.smoothing??null,initial});
   const id=engine.diagnostics.startedAt;measureRefresh().then(hz=>{if(engine.diagnostics.startedAt===id)engine.diagnostics.annotate({refreshMeasuredHz:hz});});
   return true;},
  get measuring(){return !!activeEngine?.diagnostics.active;},
  async exportMeasurement(){const engine=activeEngine;if(!engine)return null;engine.poll();engine.diagnostics.stop();
   const report=engine.diagnostics.report();report.final=await BxRestoration.captureVideoStats(activePlayer?.$video,peer());report.net=status.net;
   report.status={capture:status.capture,fluidity:status.fluidity??null,adaptive:status.adaptive,smoothing:status.smoothing??null,pacing:status.pacing??null,origin:status.origin??null,gpuP95:status.gpuP95,gpuEstimate:status.gpuEstimate,warnings:status.warnings.map(w=>w.text)};
   BxRestoration.downloadReport(report);return report;},
  // Clipboard: the Android app's bridge first (its WebView may deny navigator.clipboard).
  async copyText(text){try{if(window.BxAndroid?.copyText?.(text))return true;}catch{}try{await navigator.clipboard.writeText(text);return true;}catch{return false;}},
  // Configuration summary to paste in a support conversation (no account data).
  configText(){const native=nativePrefs();
   const o=status.origin,round=v=>typeof v==='number'?Math.round(v*10)/10:v;
   return JSON.stringify({build:globalThis.BxBuild?.version,app:window.BxAndroid?.getAppInfo?.()??null,screen:`${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    status:{resolution:status.resolution,fps:round(status.fps),gpuP95:status.gpuP95,gpuEstimate:status.gpuEstimate,adaptation:status.adaptation,smoothing:status.smoothing,fluidity:status.fluidity,capture:status.capture,adaptive:status.adaptive},
    pacing:status.pacing&&{meanMs:round(status.pacing.meanMs),deviationMs:round(status.pacing.deviationMs),p95Ms:round(status.pacing.p95Ms),hitches:status.pacing.hitches},
    origin:o&&{server:o.server&&[round(o.server.meanMs),round(o.server.deviationMs)],arrival:o.arrival&&[round(o.arrival.meanMs),round(o.arrival.deviationMs)],missed:o.missed,presented:o.presented},
    net:status.net&&Object.fromEntries(Object.entries(status.net).map(([k,v])=>[k,k==='bitsPerPixel'&&typeof v==='number'?Math.round(v*1000)/1000:round(v)])),warnings:status.warnings.map(w=>w.text),
    preset:api.preset(),treatment:BxRestoration.normalize(settings),betterXcloud:native},null,1);},
 };
 // Better xCloud settings that shape the stream, for the configuration summary and the measurement.
 function nativePrefs(){const native={};for(const k of ['stream.video.resolution','stream.video.codecProfile','stream.video.maxBitrate','stream.video.preventResolutionDrops','server.region','server.bypassRestriction','userAgent.profile','video.player.type','video.processing','video.processing.mode','video.processing.sharpness','video.maxFps','video.player.powerPreference'])native[k]=api.nativePref(k)??null;return native;}
 function androidCall(name){try{const v=window.BxAndroid?.[name]?.();return v===undefined?null:v;}catch{return null;}}
 // Display refresh rate from 30 animation frames (median interval); null when the page is hidden.
 function measureRefresh(){return new Promise(resolve=>{const times=[],timer=window.setTimeout(()=>resolve(null),2000);
  const step=t=>{times.push(t);if(times.length<31){window.requestAnimationFrame(step);return;}
   const d=times.slice(1).map((v,i)=>v-times[i]).sort((a,b)=>a-b),m=d[d.length>>1];window.clearTimeout(timer);resolve(m>0?Math.round(10000/m)/10:null);};
  window.requestAnimationFrame(step);});}
 // Applies smoothing at once; the storage write is grouped (deferred=true) while a control is being moved.
 let saveTimer=0;
 function save(){saveTimer=0;try{localStorage.setItem(key,JSON.stringify(BxRestoration.normalize(settings)));}catch{}}
 function persist(deferred){window.clearTimeout(saveTimer);if(deferred)saveTimer=window.setTimeout(save,400);else save();smoothingTick();}
 // Follow the connection independently of the renderer and whether the menu is open.
 const peer=()=>typeof STATES==='undefined'?null:STATES.currentStream?.peerConnection;
 let smoothingPeer=null,smoothingTimer=null;
 function releaseSmoothing(){try{BxRestoration.applySmoothing(smoothingPeer,0);}catch{}smoothingPeer=null;}
 function smoothingTick(){
  const current=peer();if(current!==smoothingPeer){releaseSmoothing();smoothingPeer=current;}
  try{status.smoothing=BxRestoration.applySmoothing(current,settings.smoothing);}
  catch{status.smoothing={state:'error',requestedMs:settings.smoothing};}
 }
 // Stream telemetry for the panel, the HUD and the compression-adaptive treatment: one getStats per
 // second, only while one of them needs it.
 let telemetryBusy=false,lastRtp=null,telemetryPeer=null,bppSamples=[];
 async function pollTelemetry(){
  const pc=peer();
  // A new session starts from scratch: no deltas or QP level carried over from the previous game.
  if(pc!==telemetryPeer){telemetryPeer=pc;lastRtp=null;status.net=null;status.adaptive=null;bppSamples=[];}
  if(!pc?.getStats||telemetryBusy||!(api.panelOpen||settings.hud!=='off'||settings.adaptive||api.measuring||activeEngine&&!activeEngine.ext)){updateWarnings();return;}
  telemetryBusy=true;
  try{let rtp=null,rtt=null;const stats=await pc.getStats();
   if(peer()!==pc)return;
   stats.forEach(item=>{if(item.type==='inbound-rtp'&&item.kind==='video')rtp=item;
    if(item.type==='candidate-pair'&&item.nominated&&item.state==='succeeded'&&Number.isFinite(item.currentRoundTripTime))rtt=item.currentRoundTripTime*1000;});
   if(lastRtp&&rtp&&lastRtp.id!==rtp.id)lastRtp=null;
   const info=rtp&&stats.get?.(rtp.codecId),profile=BxRestoration.h264Profile(info?.sdpFmtpLine);
   const codec=info?.mimeType?info.mimeType.replace('video/','')+(profile?' '+profile:''):null;
   const d=BxRestoration.decoderSummary(lastRtp,rtp?{...rtp,codec}:null),q=BxRestoration.streamSummary(lastRtp,rtp);lastRtp=rtp;
   status.net=d&&{codec:d.codec,profile,fpsReceived:d.fps,decoder:d.kind,implementation:d.implementation,decodeMs:d.dtMs,bufferMs:d.jitterMs,rttMs:rtt,...q};
   if(Number.isFinite(rtp?.qpSum))adaptToCompression(q?.qp??null,q?.frames??0);else adaptToBitrate(q?.bitsPerPixel??null,q?.frames??0);
   const diag=activeEngine?.diagnostics;
   if(diag?.active&&d)diag.timeline({fpsReceived:d.fps,fpsShown:api.active?status.fps:null,bitrateMbps:q?.bitrateMbps,lossPct:q?.lossPct,rttMs:rtt,decodeMs:d.dtMs,bufferMs:d.jitterMs,
    qp:q?.qp,bitsPerPixel:q?.bitsPerPixel,level:status.adaptive?.level,gpuMs:status.gpuP95??status.gpuEstimate?.p95,waitMs:status.fluidity?.extraMs,
    decoderDropped:q?.framesDropped,freezes:q?.freezes,capture:activePlayer?.bxDirect?.rendered>0?'direct':'video'});
  }catch{status.net=null;}finally{telemetryBusy=false;updateWarnings();}
 }
 // The quantizer level moves the treatment only after a sustained change: an exponential mean of
 // the per-second QP, weighted by the frames behind each sample (a 2-frame keyframe second after a
 // stall barely counts), and a new level only when it moves by two steps (0.2) or more (no pumping).
 function adaptToCompression(qp,frames){
  if(!Number.isFinite(qp)||!(frames>0))return;
  const a=status.adaptive,weight=.3*Math.min(1,frames/30),mean=a?.qpMean==null?qp:a.qpMean*(1-weight)+qp*weight,target=BxRestoration.compressionLevel(mean);
  // Levels are multiples of 0.1: compare against 0.15, since 1.0-0.8 is 0.19999… in floating point.
  const level=a?.level==null||Math.abs(target-a.level)>.15?target:a.level;
  status.adaptive={source:'qp',qp,qpMean:mean,level,scales:BxRestoration.compressionScales(level)};
 }
 // Without the QP (Android WebView), the bits per pixel of the last minute: their 80th percentile, so
 // quiet scenes (few bits at a low QP) do not read as heavy compression. Seconds with under 10 frames
 // (stalls) are skipped; the first estimate needs 5 seconds. Same hysteresis as the QP.
 function adaptToBitrate(bpp,frames){
  if(!Number.isFinite(bpp)||!(bpp>0)||!(frames>=10))return;
  bppSamples.push(bpp);if(bppSamples.length>60)bppSamples.shift();if(bppSamples.length<5)return;
  const sorted=[...bppSamples].sort((a,b)=>a-b),p80=sorted[Math.ceil(sorted.length*.8)-1],qp=BxRestoration.qpFromBitsPerPixel(p80),target=BxRestoration.compressionLevel(qp);
  const a=status.adaptive,level=a?.level==null||Math.abs(target-a.level)>.15?target:a.level;
  status.adaptive={source:'bitrate',qp:null,qpMean:null,qpEstimate:qp,bitsPerPixel:p80,level,scales:BxRestoration.compressionScales(level)};
 }
 const MAX_BITRATE=15360000;
 function updateWarnings(){
  const w=[],pref=api.nativePref,net=status.net,dec=v=>v.toFixed(1).replace('.',',');
  if(pref('video.player.type')!==undefined&&pref('video.player.type')!=='webgl2')w.push({level:'error',key:'renderer',text:'Renderizador não é WebGL2: o tratamento está desligado.'});
  const bitrate=pref('stream.video.maxBitrate');if(bitrate>0&&bitrate<MAX_BITRATE)w.push({level:'warn',key:'bitrate',text:`Bitrate máximo limitado a ${dec(bitrate/1024000)} Mb/s no Better xCloud: use Ilimitado.`});
  const resolution=pref('stream.video.resolution');if(resolution&&!/^1080p/.test(resolution)&&resolution!=='auto')w.push({level:'warn',key:'resolution',text:'Resolução alvo abaixo de 1080p.'});
  if(net?.height&&net.height<1000)w.push({level:'warn',key:'stream',text:`O servidor está enviando ${net.height}p.`});
  if(net?.decoder==='software')w.push({level:'warn',key:'decoder',text:'Decodificação por software (CPU).'});
  if(net?.lossPct>1)w.push({level:net.lossPct>2?'error':'warn',key:'loss',text:`Perda de pacotes de ${dec(net.lossPct)}%.`});
  // Explicit 2K/4K above the display (e.g. 1080p HDMI to a 4K TV) is scaled back down by the browser.
  if(settings.mode==='filtered'&&['1440','2160'].includes(settings.output)&&status.display&&Number(settings.output)>status.display*1.1)w.push({level:'info',key:'output',text:`Tela em ${status.display}p: saída maior só aumenta custo. Use Auto.`});
  if(status.gpuTrend&&settings.mode==='filtered'&&status.measurement==='cadence'&&status.mode==='filtered')w.push({level:'info',key:'gpu-trend',text:'GPU perto do limite (estimativa): se o ritmo cair, reduza a Resolução de saída.'});
  if(status.mode==='error'&&status.error)w.push({level:'error',key:'engine',text:status.error});
  status.warnings=w;
 }
 function tick(){smoothingTick();pollTelemetry();}
 function startSmoothing(){if(smoothingTimer===null)smoothingTimer=window.setInterval(tick,1000);tick();}
 window.addEventListener('pagehide',()=>{window.clearInterval(smoothingTimer);smoothingTimer=null;releaseSmoothing();});
 window.addEventListener('pageshow',startSmoothing);
 startSmoothing();
 // Frame timing per player: capture time on the server (RTP), arrival (WebRTC receive time) and
 // display time, plus the optional pacer ("Fluidez") that shows processed frames on a steady clock.
 const keep=(list,value,now)=>{list.push([now,value]);while(list.length>1&&now-list[0][0]>2000)list.shift();};
 // While the page is hidden nothing is shown (no rAF/rVFC): an interval spanning that time measures the
 // app switch, not the stream, and stays out of the graph and the measurement.
 let hiddenAt=-Infinity;
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)hiddenAt=performance.now();});
 // Records a frame shown on screen: 2 s window for the panel's pacing line, longer ring for the HUD graph.
 function shownAt(t,now,engine){keep(t.display,now,now);if(t.lastShown!=null&&t.lastShown>hiddenAt){status.intervals.push(now-t.lastShown);status.intervalsTotal++;if(status.intervals.length>240)status.intervals.shift();engine?.diagnostics.interval('display',now-t.lastShown);}t.lastShown=now;}
 const statsOf=list=>BxRestoration.frameStats(list.map(e=>e[1]));
 function startTiming(player){
  if(player.bxTiming)return;
  const t=player.bxTiming={server:[],arrival:[],display:[],presentedLog:[],clock:BxRestoration.createRtpClock(),pendingRtp:null,metaId:null,raf:null,pacer:null,shown:null};
  const video=player.$video;if(!video?.requestVideoFrameCallback)return;
  // Registered before Better xCloud's own draw callback, so a frame's metadata usually comes first;
  // attach() covers the opposite order.
  const onMeta=(now,meta)=>{
   if(player.isStopped)return;t.metaId=video.requestVideoFrameCallback(onMeta);
   // Direct capture records server/arrival times from its own frames (every decoded one).
   if(player.bxDirect?.frames>0)return;
   const at=performance.now(),presented=meta?.presentedFrames;
   // Frames the browser presented between two callbacks never reached the treatment (nor the canvas).
   if(Number.isFinite(presented)){if(presented>t.presented){keep(t.presentedLog,presented-t.presented,at);player.bxEngine?.diagnostics.skipped(presented-t.presented-1);}t.presented=presented;}
   const rtp=meta&&Number.isFinite(meta.rtpTimestamp)?t.clock(meta.rtpTimestamp):null,arrival=Number.isFinite(meta?.receiveTime)?meta.receiveTime:at;
   if(rtp!==null)keep(t.server,rtp,at);
   keep(t.arrival,arrival,at);origin(player,t,rtp,arrival);
   if(rtp!==null&&!(t.pacer&&t.pacer.attach(rtp)))t.pendingRtp=rtp;
  };
  t.metaId=video.requestVideoFrameCallback(onMeta);
 }
 // Server and arrival intervals for the measurement, from the frames reaching the treatment.
 function origin(player,t,server,arrival){const diag=player.bxEngine?.diagnostics;
  if(diag?.active&&t.lastArrival!=null&&t.lastArrival>hiddenAt){if(server!==null&&t.lastServer!=null)diag.interval('server',server-t.lastServer);diag.interval('arrival',arrival-t.lastArrival);}
  t.lastServer=server;t.lastArrival=arrival;}
 // Switching between video and direct capture changes the clocks: start the origin windows over.
 function clearOrigin(player){const t=player.bxTiming;if(!t)return;t.server.length=0;t.arrival.length=0;t.presentedLog.length=0;t.lastServer=t.lastArrival=null;t.presented=undefined;}
 function stopPacer(player){const t=player.bxTiming;if(!t?.pacer)return;if(t.raf!==null)cancelAnimationFrame(t.raf);t.raf=null;t.pacer=null;t.shown=null;player.bxEngine?.releasePaced();}
 function stopTiming(player){const t=player.bxTiming;if(!t)return;stopPacer(player);if(t.metaId!==null)player.$video?.cancelVideoFrameCallback?.(t.metaId);player.bxTiming=null;}
 function ensurePacer(player,mode){
  const t=player.bxTiming;if(t.pacer?.mode===mode)return t.pacer;
  stopPacer(player);t.pacer=BxRestoration.createPacer(mode);t.pacerDropped=0;
  const tick=()=>{
   if(!t.pacer||player.isStopped){t.raf=null;return;}
   t.raf=requestAnimationFrame(tick);
   const now=performance.now(),f=t.pacer.tick(now),engine=player.bxEngine;t.lastTick=now;
   const dropped=t.pacer.dropped;if(dropped>t.pacerDropped){engine?.diagnostics.dropped(dropped-t.pacerDropped);t.pacerDropped=dropped;}
   if(f&&engine&&player.gl&&!player.gl.isContextLost()&&engine.present(f.slot)){t.shown=f.slot;shownAt(t,now,engine);if(f.arrival>hiddenAt)engine.diagnostics.interval('wait',now-f.arrival);player.gl.useProgram(player.program);}
  };
  t.raf=requestAnimationFrame(tick);return t.pacer;
 }
 // Five persistent output textures: the one on screen, up to three queued, one being written.
 function freeSlot(t){const used=new Set([t.shown,...t.pacer.pending.map(f=>f.slot)]);for(let i=0;i<5;i++){const name='paced'+i;if(!used.has(name))return name;}return t.pacer.pending[0]?.slot||'paced0';}
 const proto=WebGL2Player.prototype,setup=proto.setupShaders,frame=proto.updateFrame,destroy=proto.destroy;
 function fallback(player){const gl=player.gl;if(gl&&!gl.isContextLost()){gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,player.bxOriginalTexture);gl.useProgram(player.program);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,player.$canvas.width,player.$canvas.height);player.updateCanvas();frame.call(player);}}
 proto.setupShaders=async function(){
  await setup.call(this);if(this.isStopped||!this.gl)return;
  // Context attributes are fixed when the canvas gets its context (one canvas per player): the panel
  // compares this with the setting to say when a change waits for the next session.
  try{status.desynchronized=!!this.gl.getContextAttributes()?.desynchronized;}catch{status.desynchronized=null;}
  this.bxEngine?.destroy();this.bxOriginalTexture=this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  try{this.bxEngine=new BxRestoration.Engine(this.gl,BxShaders);activeEngine=this.bxEngine;activePlayer=this;status.mode='ready';status.error='';}
  catch(error){status.mode='error';status.error=String(error.message||error);console.warn('[Bx Restoration]',error);}
  finally{this.gl.bindVertexArray(null);this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,this.bxOriginalTexture);this.gl.useProgram(this.program);}
  this.bxLastFrame=null;this.bxLastSettings='';this.bxTimes=[];startTiming(this);
  if(!this.bxListeners){
   const reset=()=>{this.bxEngine?.resetHistory();this.bxLastFrame=null;this.bxReferenceFps=null;this.bxTimes=[];this.bxCadenceMark=performance.now();};
   const lost=e=>{e.preventDefault();reset();status.mode='error';status.error='Contexto GPU perdido; aguardando restauração';};
   const restored=()=>{stopPacer(this);this.bxEngine?.destroy();this.bxEngine=null;this.setupShaders().catch(e=>{status.error=String(e.message);});};
   this.bxListeners={reset,lost,restored};
   for(const name of ['seeking','pause','emptied'])this.$video.addEventListener(name,reset);
   this.$canvas.addEventListener('webglcontextlost',lost);this.$canvas.addEventListener('webglcontextrestored',restored);
  }
 };
 // Settings for one frame: native processing mode, compression-adaptive strengths and the output
 // resolved from the on-screen size. Also sizes the canvas (which restarts the pacer).
 function frameSettings(player,w,h){
  const renderSettings={...settings};
  // Sharpness comes from this panel, shared by the treatment and the CAS-only reference.
  if(typeof getStreamPref==='function'){
   const processing=getStreamPref('video.processing'),mode=getStreamPref('video.processing.mode');
   if(['cas','usm'].includes(processing))renderSettings.processing=processing;
   if(['quality','performance'].includes(mode))renderSettings.processingMode=mode;
  }
  // Compression-adaptive strengths (QP level from the telemetry; neutral until it is known).
  if(settings.adaptive&&settings.mode==='filtered'&&status.adaptive){const k=status.adaptive.scales;
   renderSettings.cleanup=Math.min(1,settings.cleanup*k.cleanup);renderSettings.deband=Math.min(1,settings.deband*k.deband);renderSettings.detail=Math.min(1,settings.detail*k.detail);}
  const shown=displayHeight(player,w,h);renderSettings.output=BxRestoration.resolveOutput(settings.output,shown,h);
  const size=player.bxEngine.outputSize(w,h,renderSettings),ow=size.width,oh=size.height;
  if(player.bxMode!==settings.mode){player.bxTimes=[];player.bxCadenceMark=performance.now();player.bxMode=settings.mode;}
  // Keep the reference cadence when the budget reduces output automatically.
  // Only user-selected output/source/FPS changes invalidate the comparison.
  // The frame source too: direct capture counts every decoded frame, the video path only those it presents.
  const conditions=`${w}:${h}:${settings.output}:${player.targetFps}:${player.bxDirect?'direct':'video'}`;
  if(player.bxConditions!==conditions){player.bxReferenceFps=null;player.bxTimes=[];player.bxCadenceMark=performance.now();player.bxConditions=conditions;}
  if(player.$canvas.width!==ow||player.$canvas.height!==oh){player.$canvas.width=ow;player.$canvas.height=oh;player.bxEngine.resetHistory();stopPacer(player);}
  return {renderSettings,shown,ow,oh};
 }
 // Status after a rendered frame; newFrame feeds the FPS and the cadence-based GPU adaptation.
 function publish(player,{w,h,ow,oh,shown,newFrame,timing}){
  const direct=!!player.bxDirect;
  status.mode=api.diagnostic?'diagnostic':settings.mode;status.frames=player.bxEngine.frames;status.lastFrame=Date.now();status.resolution=`${w}×${h} → ${ow}×${oh}`;
  status.gpuP95=player.bxEngine.budget.p95;status.measurement=player.bxEngine.ext?'gpu':'cadence';status.adaptation=player.bxEngine.budget.reason;
  status.gpuEstimate=player.bxEngine.ext?null:player.bxEngine.gpuEstimate;
  status.display=shown;
  const now=performance.now();if(newFrame)player.bxTimes.push(now);while(player.bxTimes.length>1&&now-player.bxTimes[0]>2000)player.bxTimes.shift();
  status.fps=player.bxTimes.length>1?(player.bxTimes.length-1)*1000/(player.bxTimes.at(-1)-player.bxTimes[0]):null;status.pacing=statsOf(timing.display)||BxRestoration.frameStats(player.bxTimes);
  // With direct capture every decoded frame reaches the treatment: the video element's skips do not apply.
  status.origin={server:statsOf(timing.server),arrival:statsOf(timing.arrival),arrivalNetwork:direct?!!timing.arrivalNetwork:true,presented:direct?null:timing.presentedLog.reduce((a,e)=>a+e[1],0),missed:direct?null:timing.presentedLog.reduce((a,e)=>a+e[1]-1,0)};
  status.fluidity=timing.pacer?{mode:timing.pacer.mode,extraMs:timing.pacer.extraDelayMs,dropped:timing.pacer.dropped}:null;
  if(direct)status.capture={active:true,frames:player.bxDirect.rendered,reason:''};
  if(newFrame&&now-(player.bxCadenceMark||0)>2000){
   if(settings.mode!=='filtered')player.bxReferenceFps=status.fps;
   else if(!player.bxEngine.ext){
    // Frames shown against frames decoded now. The <video> element also skips frames that arrive together
    // with no GPU overload, more at 60 FPS: the margin depends on the path and the rate (cadenceMargin).
    // A page that was just hidden leaves a gap in the window. Without a live figure, the reference
    // measured in CAS/original (same path) stays.
    const budget=player.bxEngine.budget,live=BxRestoration.liveCadence(status.net?.fpsReceived,player.targetFps),list=timing.display,span=list.length>1?list.at(-1)[0]-list[0][0]:0;
    if(live===null)budget.cadence(player.bxReferenceFps,status.fps);
    else if(span>0&&now-hiddenAt>4000)budget.cadence(live,(list.length-1)*1000/span,BxRestoration.cadenceMargin(direct,live));
    // Early warning from the fence trend: shown, never acted on.
    status.gpuTrend=budget.fenceTrend(player.bxEngine.gpuEstimate?.p50,live??player.bxReferenceFps??status.fps);
   }
   player.bxCadenceMark=now;
  }
 }
 function fail(player,error){status.mode='error';status.error=String(error.message||error);stopDirect(player,'Erro no tratamento');stopPacer(player);player.bxEngine.destroy();player.bxEngine=null;activeEngine=null;fallback(player);}
 // Direct capture (Fluidez only): the <video> element shows at most one frame per display refresh, so
 // frames arriving together are skipped before the treatment sees them. Reading the WebRTC track with
 // MediaStreamTrackProcessor delivers every decoded frame; each VideoFrame is processed into a paced
 // texture and closed at once, so the hardware decoder never waits for the pacer.
 function startDirect(player){
  const source=player.$video?.srcObject?.getVideoTracks?.()[0];
  if(!source||source.readyState!=='live'||!api.directSupported())return false;
  let track=null,reader;
  try{track=source.clone();reader=new MediaStreamTrackProcessor({track}).readable.getReader();}
  catch(error){track?.stop();status.capture={active:false,frames:0,reason:'Indisponível: '+(error.message||error)};return false;}
  const d=player.bxDirect={track,reader,frames:0,rendered:0,started:performance.now(),nextAt:null};
  status.capture={active:true,frames:0,reason:''};
  (async()=>{let reason='Fluxo de vídeo encerrado';
   try{for(;;){const {value,done}=await reader.read();if(done)break;
     try{if(player.bxDirect!==d)break;d.frames++;renderDirect(player,value);}finally{value.close();}}}
   catch(error){reason=String(error?.message||error);}
   finally{if(player.bxDirect===d)stopDirect(player,reason);}})();
  return true;
 }
 function stopDirect(player,reason){
  const d=player.bxDirect;if(!d)return;player.bxDirect=null;
  try{d.reader.cancel().catch(()=>{});}catch{}d.track.stop();
  status.capture={active:false,frames:d.rendered,reason};clearOrigin(player);
 }
 function renderDirect(player,frame){
  const d=player.bxDirect,t=player.bxTiming;
  if(!d||!player.bxEngine||player.isStopped||!player.gl||player.gl.isContextLost())return;
  const w=frame.displayWidth,h=frame.displayHeight;if(!w||!h)return;
  // Every decoded frame: capture time (VideoFrame timestamp) and arrival, before the FPS limit.
  // Arrival: the network receive time when the browser gives VideoFrame metadata, otherwise the delivery
  // to this script, which adds decoding and main-thread delays (status.origin.arrivalNetwork false).
  const at=performance.now(),ms=frame.timestamp/1000;let meta=null;try{meta=frame.metadata?.();}catch{}
  const network=Number.isFinite(meta?.receiveTime),arrival=network?meta.receiveTime:at;
  if(t){if(d.frames===1)clearOrigin(player);t.arrivalNetwork=network;keep(t.server,ms,at);keep(t.arrival,arrival,at);origin(player,t,ms,arrival);}
  // Nothing is shown while the page is hidden (no rAF): close frames without processing them.
  if(document.hidden||t?.pacer&&t.lastTick!=null&&performance.now()-t.lastTick>250)return;
  // Better xCloud's FPS limit, on capture time (frames may arrive bunched); same rule as shouldDraw.
  const fps=player.targetFps;
  if(fps<=0)return;
  if(fps<60){const interval=1000/fps;
   if(d.nextAt==null||ms-d.nextAt>interval)d.nextAt=ms+interval;else if(ms<d.nextAt-2)return;else d.nextAt+=interval;}
  try{
   const {renderSettings,shown,ow,oh}=frameSettings(player,w,h),timing=player.bxTiming||(startTiming(player),player.bxTiming);
   // VideoFrame timestamps follow the capture cadence on a monotonic clock (in Chromium, time since
   // boot): the pacer's 'frame' clock and the temporal time base.
   const pacer=ensurePacer(player,settings.fluidity),slot=freeSlot(timing),check=d.rendered<3;
   if(check)player.gl.getError();
   if(!player.bxEngine.render(frame,ow,oh,renderSettings,ms/1000,api.diagnostic,slot,true))return;
   // Some drivers may not take a decoder frame as a texture: check the first frames once and fall back.
   if(check&&player.gl.getError()!==player.gl.NO_ERROR){stopDirect(player,'A GPU não aceitou o quadro direto: usando o vídeo');player.bxDirectFailed=true;return;}
   d.rendered++;pacer.add({slot,arrival:performance.now(),rtp:ms,clock:'frame'});
   publish(player,{w,h,ow,oh,shown,newFrame:true,timing});
  }catch(error){fail(player,error);}
  finally{if(player.gl&&!player.gl.isContextLost())player.gl.useProgram(player.program);}
 }
 // Starts, keeps or stops direct capture for the current settings; true while it renders the frames.
 function directCapture(player){
  const want=settings.fluidity!=='off'&&settings.capture==='direct';
  if(player.bxCaptureEpoch!==captureEpoch){player.bxCaptureEpoch=captureEpoch;player.bxDirectFailed=false;}
  if(!want){if(player.bxDirect)stopDirect(player,'');return false;}
  if(!player.bxDirect&&!player.bxDirectFailed&&!startDirect(player)){player.bxDirectFailed=true;if(!status.capture.reason)status.capture={active:false,frames:0,reason:'Captura direta indisponível neste navegador'};}
  const d=player.bxDirect;if(!d)return false;
  // The video path keeps rendering until the first direct frame; with none within 2 s, it stays.
  if(d.frames===0&&performance.now()-d.started>2000){stopDirect(player,'Nenhum quadro da captura direta: usando o vídeo');player.bxDirectFailed=true;return false;}
  return d.frames>0;
 }
 proto.updateFrame=function(){
  if(!this.bxEngine){fallback(this);return;}
  if(this.isStopped)return;
  if(directCapture(this))return;
  const video=this.$video,w=video.videoWidth||video.width,h=video.videoHeight||video.height;
  if(!w||!h)return;
  const time=Number.isFinite(video.currentTime)?video.currentTime:performance.now()/1000;
  const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
  // WebRTC counts totalVideoFrames on arrival, so a frame that arrived before the previous
  // callback can be presented later with the same count. The presented-frame counter from
  // requestVideoFrameCallback marks every new frame on screen.
  const presented=this.bxTiming?.presented,id=Number.isFinite(presented)?presented+'/':'';
  const token=count>0?`${id}${count}:${w}:${h}`:`${id}${time}:${w}:${h}`;
  const newFrame=this.bxLastFrame!==token;
  const {renderSettings,shown,ow,oh}=frameSettings(this,w,h);
  const controls=JSON.stringify(renderSettings)+api.diagnostic+':'+this.bxEngine.budget.revision;
  if(this.bxLastFrame===token&&this.bxLastSettings===controls){this.bxEngine.poll();return;}
  try{
   const timing=this.bxTiming||(startTiming(this),this.bxTiming);
   if(settings.fluidity!=='off'){
    // Process now, show on the pacer's clock. A settings change on the same frame redraws it at once.
    // The last pass (sharpening or SGSR) runs at present(), straight to the canvas (Spec 3 item 8).
    const pacer=ensurePacer(this,settings.fluidity),slot=newFrame||!timing.shown?freeSlot(timing):timing.shown;
    if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic,slot,true))return;
    timing.lastSlot=slot;
    if(newFrame||!timing.shown){const rtp=timing.pendingRtp;timing.pendingRtp=null;pacer.add({slot,arrival:performance.now(),rtp});}
    else if(this.bxEngine.present(slot))this.gl.useProgram(this.program);
   }else{
    if(timing.pacer)stopPacer(this);
    if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic))return;
    if(newFrame)shownAt(timing,performance.now(),this.bxEngine);
   }
   this.bxLastFrame=token;this.bxLastSettings=controls;
   publish(this,{w,h,ow,oh,shown,newFrame,timing});
  }catch(error){fail(this,error);}
  finally{if(this.gl&&!this.gl.isContextLost())this.gl.useProgram(this.program);}
 };
 proto.destroy=function(){
  stopDirect(this,'');stopTiming(this);
  if(activePlayer===this)activePlayer=null;if(activeEngine===this.bxEngine)activeEngine=null;this.bxEngine?.destroy();this.bxEngine=null;
  if(this.bxListeners){const {reset,lost,restored}=this.bxListeners;for(const name of ['seeking','pause','emptied'])this.$video.removeEventListener(name,reset);this.$canvas.removeEventListener('webglcontextlost',lost);this.$canvas.removeEventListener('webglcontextrestored',restored);this.bxListeners=null;}
  status.mode='waiting';status.lastFrame=0;api.diagnostic=false;destroy.call(this);
 };
 api.mountControls=parent=>api.panel?.mount(parent);
})();

// "Tratamento de imagem" panel inside Better xCloud's video settings, and api.ui (helpers shared with
// the in-game HUD, hud.js). Both read and change state only through window.BxImageFilter
// (docs/api-imagefilter.md) and window.BxAndroid. Controls follow Better xCloud's navigation rules:
// every setting is an <input type=range> with integer steps (D-pad Left/Right change it, A cycles it),
// every action a <button>; nothing uses <select>, <svg> or the bx-focusable class.
(() => {
 const api = window.BxImageFilter, settings = api.settings, status = api.status, doc = document;
 const VERSION = 'v9.8.0';
 const num = v => typeof v === 'number' && Number.isFinite(v);

 /* =============================== api.ui =============================== */
 const styleParts = {};
 // One <style id="bxif-style"> for panel and HUD; each part is added once.
 function ensureStyle(part, css) {
  let el = doc.getElementById('bxif-style');
  if (styleParts[part] && el) return;
  styleParts[part] = css;
  if (!el) {
   el = doc.createElement('style'); el.id = 'bxif-style';
   el.textContent = Object.values(styleParts).join('\n');
   (doc.head || doc.documentElement).append(el);
  } else el.append(doc.createTextNode(css));
 }
 const fmt = (v, d = 1) => num(v) ? v.toFixed(d).replace('.', ',') : '—';
 const fmtMs = v => !num(v) ? '—' : Math.abs(v) < 9.95 ? fmt(v, 1) : String(Math.round(v));
 const fmtInt = v => num(v) ? String(Math.round(v)) : '—';
 const fmtThousands = v => num(v) ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—';
 // Target cadence: 60 or 30 FPS, from the server clock, then the screen, then the received FPS.
 function target() {
  const o = status.origin, p = status.pacing, n = status.net;
  let N = 60;
  if (num(o?.server?.meanMs)) N = o.server.meanMs < 25 ? 60 : 30;
  else if (num(p?.meanMs)) N = p.meanMs < 25 ? 60 : 30;
  else if (num(n?.fpsReceived)) N = n.fpsReceived >= 45 ? 60 : 30;
  return {N, T: 1000 / N};
 }
 // Thresholds per indicator → 'good' | 'ok' | 'bad' | 'none' (no value) | 'info'.
 function grade(kind, v, c = {}) {
  if (kind === 'decoder') return v === 'hardware' ? 'good' : v === 'software' ? 'bad' : 'none';
  if (kind === 'warn') return v === 'error' ? 'bad' : v === 'warn' ? 'ok' : v === 'info' ? 'info' : 'none';
  if (!num(v)) return 'none';
  const lo = (g, o) => v <= g ? 'good' : v <= o ? 'ok' : 'bad', hi = (g, o) => v >= g ? 'good' : v >= o ? 'ok' : 'bad';
  const T = c.T || 1000 / 60, N = c.N || 60;
  switch (kind) {
   case 'fps': return hi(.97 * N, .9 * N);
   case 'dev': return lo(.08 * T, .18 * T);
   case 'p95': return lo(1.25 * T, 1.6 * T);
   case 'count': return lo(0, 2);
   case 'drops': return lo(0, 5);
   case 'wait': return lo(.5 * T, T);
   case 'rtt': return lo(50, 100);
   case 'buffer': { const r = c.r || 0; return lo(Math.max(40, r + 15), Math.max(60, r + 40)); }
   case 'decode': return lo(9, 12);
   case 'gpu': { const L = c.L || 10; return lo(.66 * L, L); }
   // Fence estimate (no GPU timer): time until the GPU finished a frame. Frames overlap in the GPU queue,
   // so a frame can take longer than its interval without losing FPS; over two intervals it falls behind.
   case 'gpu-est': return lo(T, 2 * T);
   case 'total': return lo(70, 110);
   case 'bitrate': return c.height >= 1000 ? hi(12, 7) : hi(6, 3.5);
   // QP 28 is the neutral level of the compression adaptation: typical streams read good.
   case 'qp': return lo(30, 36);
   case 'loss': return v < .2 ? 'good' : v <= 2 ? 'ok' : 'bad';
   case 'height': return hi(1000, 700);
  }
  return 'none';
 }
 const RANK = {none: 0, good: 1, info: 1, ok: 2, bad: 3};
 function worst(...grades) { let w = 'none'; for (const g of grades) if (RANK[g] > RANK[w]) w = g; return w; }
 // Displayed grades: a worse grade shows after it was computed on 2 consecutive ticks (~1 s); a better
 // one, and to or from 'none', at once, so a recovered value is never painted bad (e.g. "0,0%" in red).
 // Call .tick() once per refresh; within a tick a key always returns the same grade.
 function createHysteresis() {
  const state = new Map(), memo = new Map();
  const g = (key, grade) => {
   if (memo.has(key)) return memo.get(key);
   let s = state.get(key), out;
   if (!s) { state.set(key, {shown: grade, pend: null}); out = grade; }
   else if (grade === s.shown) { s.pend = null; out = grade; }
   else if (grade === 'none' || s.shown === 'none' || s.pend === grade || RANK[grade] < RANK[s.shown]) { s.shown = grade; s.pend = null; out = grade; }
   else { s.pend = grade; out = s.shown; }
   memo.set(key, out);
   return out;
  };
  g.tick = () => memo.clear();
  g.reset = () => { state.clear(); memo.clear(); };
  return g;
 }
 // Approximate video latency: network round trip, jitter buffer, decode, treatment and Fluidez wait.
 function latency() {
  const n = status.net, on = api.active, v = k => n && num(n[k]) ? n[k] : null;
  const rtt = v('rttMs'), buffer = v('bufferMs'), decode = v('decodeMs');
  // Without a GPU timer, the fence estimate's median: the time until the GPU finished the frame.
  const gpu = !on ? 0 : status.measurement === 'gpu' ? (num(status.gpuP95) ? status.gpuP95 : 0) : num(status.gpuEstimate?.p50) ? status.gpuEstimate.p50 : 0;
  const wait = on && status.fluidity && num(status.fluidity.extraMs) ? status.fluidity.extraMs : 0;
  return {rtt, buffer, decode, gpu, wait, total: rtt === null ? null : rtt + (buffer || 0) + (decode || 0) + gpu + wait};
 }
 // Frames the Fluidez pacer dropped per minute (its counter is cumulative per pacer). The window
 // counts at least 10 s, so a single drop right after a start is not read as dozens per minute.
 function dropRate() {
  const s = [];
  return {
   push(d, now = Date.now()) {
    if (!num(d)) { s.length = 0; return null; }
    if (s.length && d < s[s.length - 1][1]) s.length = 0;
    s.push([now, d]);
    while (s.length > 2 && now - s[0][0] > 60000) s.shift();
    if (s.length < 2) return 0;
    return (d - s[0][1]) * 60000 / Math.max(now - s[0][0], 10000);
   },
  };
 }
 // Interval graph: newest at the right edge, 0..2.5T, target line at T, late frames as ticks above it,
 // early frames as ticks below it. sizeCanvas() sets the backing store; this redraws only when the data
 // signature changed.
 function drawSparkline(cv, list, o = {}) {
  const W = cv.width, H = cv.height;
  if (!W || !H || W < 4) return;
  const count = o.count || 240, T = o.T || 1000 / 60, n = Math.min(count, list ? list.length : 0);
  const sig = n + '|' + (n ? list[list.length - 1] + '|' + list[list.length - 2] : '') + '|' + (status.intervalsTotal ?? '') + '|' + T + '|' + !!o.dim + '|' + W + 'x' + H;
  if (cv._bxifSig === sig) return;
  cv._bxifSig = sig;
  const g = cv.getContext('2d');
  if (!g) return;
  const s = (cv._bxifScale || 1) * (o.scale || 1), max = 2.5 * T, pad = Math.max(1, Math.round(s));
  const y = v => pad + (H - 2 * pad) * (1 - Math.min(v, max) / max), line = Math.max(1, Math.round(s));
  g.clearRect(0, 0, W, H);
  g.globalAlpha = o.dim ? .45 : 1;
  const yT = Math.round(y(T));
  if (n < 2) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, yT - (line >> 1), W, line); g.globalAlpha = 1; return; }
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, yT - (line >> 1), W, line);
  const start = list.length - n, sorted = [];
  for (let i = start; i < list.length; i++) sorted.push(list[i]);
  sorted.sort((a, b) => a - b);
  const median = sorted[n >> 1], step = (W - line) / Math.max(1, count - 1), bad = o.bad || '#ff5f6d', ok = o.ok || '#ffcf5a';
  const xAt = i => W - line / 2 - (n - 1 - i) * step;
  g.lineWidth = 1.5 * s; g.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
   const v = list[start + i];
   if (!(v > 1.5 * median || v < .5 * median)) continue;
   const x = Math.round(xAt(i));
   g.strokeStyle = v > median ? bad : ok;
   g.beginPath(); g.moveTo(x, yT); g.lineTo(x, y(v)); g.stroke();
   if (v > max) { g.fillStyle = bad; g.fillRect(x - Math.ceil(1.5 * s), 0, Math.ceil(3 * s), 2); }
  }
  g.beginPath();
  for (let i = 0; i < n; i++) { const x = xAt(i), yy = y(list[start + i]); i ? g.lineTo(x, yy) : g.moveTo(x, yy); }
  g.lineWidth = 1.25 * s; g.lineJoin = 'round'; g.strokeStyle = o.line || 'rgba(230,234,240,.85)'; g.stroke();
  g.globalAlpha = 1;
 }
 // Backing store for a canvas of CSS size w×h, sharp at any devicePixelRatio.
 function sizeCanvas(cv, w, h) {
  const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv._bxifSig = null; }
  cv._bxifScale = dpr;
 }
 // Calls fn when devicePixelRatio changes (browser zoom, moving to another screen).
 function watchDpr(fn) {
  let mq = null;
  const arm = () => {
   try { mq?.removeEventListener('change', on); mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); mq.addEventListener('change', on); } catch {}
  };
  const on = () => { arm(); fn(); };
  arm();
  return () => { try { mq?.removeEventListener('change', on); } catch {} mq = null; };
 }
 const WORDS = {
  error: {word: 'ERRO', grade: 'bad', tag: ''}, waiting: {word: 'AGUARDANDO', grade: 'none', tag: ''}, idle: {word: 'SEM QUADROS', grade: 'none', tag: ''},
  diagnostic: {word: 'DIAGNÓSTICO', grade: 'info', tag: 'DIAG'}, filtered: {word: 'TRATANDO', grade: 'good', tag: ''},
  cas: {word: 'SÓ NITIDEZ', grade: 'ok', tag: 'NIT'}, original: {word: 'ORIGINAL', grade: 'ok', tag: 'ORIG'},
 };
 function stateWord() {
  if (status.mode === 'error') return WORDS.error;
  if (!api.active) return status.mode === 'waiting' ? WORDS.waiting : WORDS.idle;
  if (api.diagnostic) return WORDS.diagnostic;
  return WORDS[settings.mode] || WORDS.filtered;
 }
 const LEVEL = {error: 3, warn: 2, info: 1};
 // One reading of the status with raw grades; panel and HUD apply their own hysteresis.
 function snapshot() {
  const on = api.active, {N, T} = target(), n = status.net, cap = status.capture || {};
  const p = on ? status.pacing : null, o = on ? status.origin : null, fl = on ? status.fluidity : null, lat = latency();
  const s = {on, N, T, net: n, p, o, fl, lat, cap, direct: !!(on && cap.active), fps: on ? status.fps : null, fpsAny: on ? status.fps : n?.fpsReceived ?? null};
  s.gFps = grade('fps', s.fps, s); s.gFpsAny = grade('fps', s.fpsAny, s);
  s.gDev = grade('dev', p?.deviationMs, s); s.gP95 = grade('p95', p?.p95Ms, s); s.gHit = grade('count', p?.hitches);
  s.missed = o && num(o.missed) ? o.missed : null;
  s.gMiss = s.missed === null ? (s.direct ? 'good' : 'none') : grade('count', s.missed);
  s.gSrv = grade('dev', o?.server?.deviationMs, s); s.gArr = o && o.arrivalNetwork === false ? 'none' : grade('dev', o?.arrival?.deviationMs, s);
  s.gWait = fl ? grade('wait', fl.extraMs, s) : 'none';
  s.gRtt = grade('rtt', lat.rtt); s.gBuf = grade('buffer', lat.buffer, {r: settings.smoothing}); s.gDec = grade('decode', lat.decode);
  s.gDecoder = grade('decoder', n?.decoder); s.gTotal = grade('total', lat.total);
  s.gpu = on && status.measurement === 'gpu' && num(status.gpuP95) ? status.gpuP95 : null;
  s.L = settings.gpuBudget || 10; s.gGpu = grade('gpu', s.gpu, {L: s.L});
  s.gpuEst = on && status.measurement !== 'gpu' && num(status.gpuEstimate?.p95) ? status.gpuEstimate.p95 : null; s.gGpuEst = grade('gpu-est', s.gpuEst, {T});
  s.gpuShow = s.gpu !== null ? s.gpu : s.gpuEst; s.gGpuShow = s.gpu !== null ? s.gGpu : s.gGpuEst;
  s.gBitrate = grade('bitrate', n?.bitrateMbps, {height: n?.height});
  s.qp = num(status.adaptive?.qpMean) ? status.adaptive.qpMean : n && num(n.qp) ? n.qp : null; s.gQp = grade('qp', s.qp);
  // Bitrate estimate when the browser reports no QP (Android WebView): shown as "≈", never as a QP reading.
  s.qpEst = s.qp === null && status.adaptive?.source === 'bitrate' && num(status.adaptive.qpEstimate) ? status.adaptive.qpEstimate : null;
  s.gLoss = grade('loss', n?.lossPct); s.gHeight = grade('height', n?.height);
  s.gCapture = s.direct ? 'good' : settings.fluidity !== 'off' && settings.capture === 'direct' ? 'ok' : 'none';
  let lv = 0; for (const w of status.warnings || []) lv = Math.max(lv, LEVEL[w.level] || 0);
  s.warnLevel = ['', 'info', 'warn', 'error'][lv]; s.warnCount = (status.warnings || []).length; s.gWarn = grade('warn', s.warnLevel);
  s.overall = worst(s.gFps, s.gDev, s.gHit, s.gMiss, lv === 3 ? 'bad' : 'none');
  return s;
 }
 // Cached writes: touch the DOM only when the value changed.
 function setT(node, s) { if (node._bxifT !== s) { node._bxifT = s; node.textContent = s; } }
 function setA(node, k, v) {
  const c = node._bxifA || (node._bxifA = {});
  if (c[k] === v) return;
  c[k] = v;
  if (v === null || v === undefined || v === false) node.removeAttribute(k); else node.setAttribute(k, v === true ? '' : v);
 }
 function setS(node, prop, v) { const c = node._bxifS || (node._bxifS = {}); if (c[prop] !== v) { c[prop] = v; node.style.setProperty(prop, v); } }
 // Text made of parts [text, grade?]: one <span> per part, created only when the number of parts changes.
 function setParts(el, parts) {
  const kids = el.children;
  if (kids.length !== parts.length) { el.textContent = ''; for (let i = 0; i < parts.length; i++) el.append(doc.createElement('span')); }
  for (let i = 0; i < parts.length; i++) { setT(kids[i], parts[i][0]); setA(kids[i], 'data-g', parts[i][1] || null); }
 }
 api.ui = {ensureStyle, fmt, fmtMs, fmtInt, fmtThousands, target, grade, worst, createHysteresis, latency, dropRate, drawSparkline, sizeCanvas, watchDpr, stateWord, snapshot, setT, setA, setS, setParts, LEVEL};

 /* =============================== Panel style =============================== */
 const CSS = `
.bxif-panel{--bxif-bg0:#141518;--bxif-card:#222428;--bxif-line:#2f3237;--bxif-field:#2c2f35;--bxif-hover:#353941;--bxif-rowfocus:#2a2d33;
 --bxif-t1:#eef0f3;--bxif-tl:#d5d8de;--bxif-t2:#b4b9c2;--bxif-t3:#8a909a;
 --bxif-acc:var(--bx-primary-button-color,#008746);--bxif-acc-hi:var(--bx-primary-button-hover-color,#04b358);
 --bxif-danger:var(--bx-danger-button-color,#c10404);--bxif-danger-t:#ff8a8a;
 --bxif-good:#4fe0d2;--bxif-ok:#ffcf5a;--bxif-bad:#ff5f6d;--bxif-info:#7aa7ff;--bxif-none:#8b919c;
 --bxif-good-bg:rgba(79,224,210,.14);--bxif-ok-bg:rgba(255,207,90,.12);--bxif-bad-bg:rgba(255,95,109,.14);--bxif-info-bg:rgba(122,167,255,.12);--bxif-none-bg:rgba(139,145,156,.12);
 --bxif-ring:0 0 0 2px #1a1b1e,0 0 0 4px #fff;
 --bxif-fs-title:16px;--bxif-fs-ver:11px;--bxif-pill-h:22px;--bxif-fs-pill:11px;--bxif-fs-idx:12px;--bxif-fs-sec:13px;--bxif-fs-sum:13px;--bxif-sec-h:42px;
 --bxif-fs-label:14px;--bxif-fs-val:14px;--bxif-fs-seg:13.5px;--bxif-fs-hint:12.5px;--bxif-fs-read:13px;--bxif-fs-kpi:22px;--bxif-fs-cap:11px;--bxif-fs-sub:11.5px;--bxif-fs-tag:10.5px;
 --bxif-row-h:44px;--bxif-row-px:12px;--bxif-row-py:6px;--bxif-rail-h:34px;--bxif-hit:32px;--bxif-track:4px;--bxif-thumb:18px;--bxif-sw-w:44px;--bxif-sw-h:24px;--bxif-knob:18px;
 --bxif-fs-12:12.5px;--bxif-fs-11:11.5px;--bxif-fs-105:11px;--bxif-fs-10:11px;--bxif-fs-95:11px;--bxif-badge:14px;
 --bxif-chip-h:42px;--bxif-btn-h:38px;--bxif-gap:8px;--bxif-kpi-h:58px;--bxif-spark-h:36px;--bxif-head-h:36px;--bxif-live-px:14px;--bxif-live-py:12px;--bxif-scroll-b:44px}
@media (max-height:500px){.bxif-panel{--bxif-fs-title:15px;--bxif-pill-h:20px;--bxif-fs-pill:10.5px;--bxif-fs-idx:11px;--bxif-fs-sec:12px;--bxif-fs-sum:12px;--bxif-sec-h:38px;
 --bxif-fs-label:13px;--bxif-fs-val:13px;--bxif-fs-seg:12.5px;--bxif-fs-hint:12px;--bxif-fs-read:12.5px;--bxif-fs-kpi:20px;--bxif-fs-cap:11px;--bxif-fs-sub:11px;
 --bxif-fs-12:12px;--bxif-fs-11:11.5px;--bxif-fs-105:11px;--bxif-fs-10:11px;--bxif-fs-95:11px;--bxif-fs-tag:10.5px;
 --bxif-row-h:40px;--bxif-row-py:4px;--bxif-rail-h:32px;--bxif-hit:28px;--bxif-thumb:16px;--bxif-sw-w:40px;--bxif-sw-h:22px;--bxif-knob:16px;
 --bxif-chip-h:40px;--bxif-btn-h:36px;--bxif-kpi-h:52px;--bxif-spark-h:32px;--bxif-head-h:32px;--bxif-live-px:12px;--bxif-live-py:10px}}
/* Touch on the phone: every target at least 40 px tall, so near-miss taps stay in their own row. */
@media (max-height:500px) and (pointer:coarse){.bxif-panel{--bxif-rail-h:44px;--bxif-hit:42px;--bxif-thumb:22px;--bxif-row-h:50px;--bxif-sec-h:44px;--bxif-btn-h:42px;--bxif-chip-h:44px;--bxif-sw-w:46px;--bxif-sw-h:26px;--bxif-knob:20px}
 .bxif-panel .bxif-btn-sm{min-height:40px}}
@media (min-height:900px){.bxif-panel{--bxif-ring:0 0 0 2px #1a1b1e,0 0 0 5px #fff;
 --bxif-fs-title:21px;--bxif-fs-ver:14px;--bxif-pill-h:28px;--bxif-fs-pill:14px;--bxif-fs-idx:15px;--bxif-fs-sec:16px;--bxif-fs-sum:16px;--bxif-sec-h:52px;
 --bxif-fs-label:17px;--bxif-fs-val:17px;--bxif-fs-seg:16px;--bxif-fs-hint:15px;--bxif-fs-read:16px;--bxif-fs-kpi:28px;--bxif-fs-cap:14px;--bxif-fs-sub:14px;--bxif-fs-tag:13px;
 --bxif-row-h:56px;--bxif-row-px:16px;--bxif-row-py:8px;--bxif-rail-h:44px;--bxif-hit:40px;--bxif-track:6px;--bxif-thumb:24px;--bxif-sw-w:52px;--bxif-sw-h:28px;--bxif-knob:22px;
 --bxif-fs-12:16px;--bxif-fs-11:14px;--bxif-fs-105:14px;--bxif-fs-10:14px;--bxif-fs-95:14px;--bxif-badge:18px;
 --bxif-chip-h:52px;--bxif-btn-h:48px;--bxif-gap:12px;--bxif-kpi-h:72px;--bxif-spark-h:48px;--bxif-head-h:44px;--bxif-live-px:16px;--bxif-live-py:14px;--bxif-scroll-b:56px}}
.bxif-panel,.bxif-panel *,.bxif-panel *::before,.bxif-panel *::after{box-sizing:border-box}
.bxif-panel{display:flex;flex-direction:column;gap:var(--bxif-gap);margin:12px 0 16px;text-align:left;font-family:var(--bx-title-font,Bahnschrift,Arial,Roboto,sans-serif);font-size:13px;line-height:1.3;font-weight:400;
 color:var(--bxif-t1);user-select:none;-webkit-user-select:none;font-variant-numeric:tabular-nums lining-nums;-webkit-tap-highlight-color:transparent;letter-spacing:normal;text-transform:none;min-width:0;max-width:100%}
.bxif-panel b{font-weight:600}
:where(.bxif-panel) button{-webkit-appearance:none;appearance:none;margin:0;border:0;background:none;color:inherit;font:inherit;text-align:inherit;letter-spacing:inherit;text-transform:none;cursor:pointer;outline:none}
.bxif-panel input,.bxif-panel button{scroll-margin-top:calc(var(--bxif-sticky,72px) + 8px);scroll-margin-bottom:var(--bxif-scroll-b)}
.bxif-panel [data-hide]{display:none!important}
.bxif-panel [data-g=good]{color:var(--bxif-good)}.bxif-panel [data-g=ok]{color:var(--bxif-ok)}.bxif-panel [data-g=bad]{color:var(--bxif-bad)}
.bxif-panel [data-g=info]{color:var(--bxif-info)}.bxif-panel [data-g=none]{color:var(--bxif-t3)}.bxif-panel [data-g=lab]{color:var(--bxif-t2)}.bxif-panel [data-g=dim]{color:var(--bxif-t3)}
.bxif-meta [data-g=good],.bxif-lines [data-g=good],.bxif-legend [data-g=good],.bxif-total [data-g=good],.bxif-out [data-g=good],.bxif-pipe-v[data-g=good]{color:inherit}
.bxif-dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:currentColor}
[data-g=ok]>.bxif-dot{border-radius:1.5px;transform:rotate(45deg) scale(.82)}
[data-g=bad]>.bxif-dot{width:9px;border-radius:0;clip-path:polygon(50% 0,100% 100%,0 100%)}
[data-g=info]>.bxif-dot{background:none;box-shadow:inset 0 0 0 2px currentColor}
[data-g=none]>.bxif-dot{background:none;box-shadow:inset 0 0 0 1.5px currentColor}
/* header */
.bxif-head{display:flex;align-items:center;gap:10px;min-height:var(--bxif-head-h);padding:0 2px 0 2px}
.bxif-title{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;white-space:nowrap;overflow:hidden}
.bxif-name{font-size:var(--bxif-fs-title);font-weight:700;color:var(--bxif-t1);overflow:hidden;text-overflow:ellipsis}
.bxif-ver{font-size:var(--bxif-fs-ver);font-weight:600;color:var(--bxif-t3)}
.bxif-pill{flex:none;display:inline-flex;align-items:center;gap:7px;height:var(--bxif-pill-h);padding:0 11px 0 9px;border-radius:999px;background:var(--bxif-none-bg);color:var(--bxif-none);
 font-size:var(--bxif-fs-pill);font-weight:700;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
.bxif-pill[data-g=good]{background:var(--bxif-good-bg)}.bxif-pill[data-g=ok]{background:var(--bxif-ok-bg)}.bxif-pill[data-g=bad]{background:var(--bxif-bad-bg)}.bxif-pill[data-g=info]{background:var(--bxif-info-bg)}
.bxif-pill .bxif-dot{width:7px;height:7px}
/* warnings */
.bxif-warns{display:flex;flex-direction:column;gap:6px}
.bxif-warn{display:flex;align-items:center;gap:10px;min-height:28px;padding:7px 8px 7px 12px;border-radius:8px;background:var(--bxif-ok-bg);color:var(--bxif-ok);box-shadow:inset 3px 0 0 currentColor}
.bxif-warn[data-level=error]{background:var(--bxif-bad-bg);color:var(--bxif-bad)}.bxif-warn[data-level=info]{background:var(--bxif-info-bg);color:var(--bxif-info)}
.bxif-badge{flex:none;align-self:flex-start;margin-top:1px;width:var(--bxif-badge);height:var(--bxif-badge);border-radius:50%;background:currentColor;font-style:normal;font-size:calc(var(--bxif-badge) - 4px);font-weight:800;line-height:var(--bxif-badge);text-align:center}
.bxif-badge::before{content:attr(data-c);color:#141518}
.bxif-warn-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.bxif-warn-text{font-size:var(--bxif-fs-12);line-height:1.3;color:var(--bxif-t1)}
.bxif-warn-hint{font-size:var(--bxif-fs-11);line-height:1.3;color:#a3a9b3}
.bxif-panel .bxif-warn-more{align-self:flex-start;min-height:30px;padding:0 12px;border-radius:8px;font-size:var(--bxif-fs-11);font-weight:600;color:var(--bxif-t2)}
.bxif-panel[data-nav="1"] .bxif-warn-more:focus{box-shadow:var(--bxif-ring);background:var(--bxif-rowfocus)}
/* live card */
.bxif-live{background:var(--bxif-bg0);border:1px solid #2c2f36;border-radius:10px;padding:var(--bxif-live-py) var(--bxif-live-px) 2px}
.bxif-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));min-height:var(--bxif-kpi-h)}
.bxif-kpi{display:flex;flex-direction:column;justify-content:space-between;gap:3px;min-width:0;padding:0 0 0 12px}
.bxif-kpi:first-child{padding-left:0}.bxif-kpi+.bxif-kpi{border-left:1px solid #2c2f36}
.bxif-kpi-cap{display:flex;align-items:center;gap:5px;font-size:var(--bxif-fs-cap);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bxif-t3);white-space:nowrap;overflow:hidden}
.bxif-kpi-cap .bxif-dot{width:7px;height:7px}.bxif-kpi-cap [data-g=bad]>.bxif-dot{width:8px}
.bxif-kpi-val{font-size:var(--bxif-fs-kpi);font-weight:600;line-height:1;white-space:nowrap;color:var(--bxif-t1);letter-spacing:-.01em;overflow:hidden}
.bxif-unit{font-size:max(10px,.5em);font-weight:600;color:var(--bxif-t3);margin-left:2px;letter-spacing:0}
.bxif-kpi-sub{font-size:var(--bxif-fs-sub);color:var(--bxif-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bxif-spark{position:relative;height:var(--bxif-spark-h);margin-top:4px}
.bxif-spark canvas{display:block;width:100%;height:100%}
.bxif-spark-cap{display:flex;justify-content:space-between;margin-top:12px;font-size:var(--bxif-fs-95);line-height:1.1;font-weight:700;letter-spacing:.08em;color:var(--bxif-t3)}
.bxif-spark-t{font-weight:600;letter-spacing:0}
.bxif-meta{margin-top:10px;font-size:var(--bxif-fs-read);line-height:1.35;color:var(--bxif-t1);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.bxif-meta[data-idle]{-webkit-line-clamp:3;color:var(--bxif-t2)}
.bxif-meta>span:first-child[data-g=lab]{display:block;margin-bottom:2px}
.bxif-hr{height:1px;background:#2c2f36;margin:10px 0 2px}
.bxif-live .bxif-row{padding-left:0;padding-right:0}
.bxif-live .bxif-row+.bxif-row{border-top:0}
.bxif-panel[data-nav="1"] .bxif-live .bxif-row:focus-within{padding-left:10px;padding-right:10px;margin:0 -10px;border-radius:6px}
/* sections */
.bxif-sec{background:var(--bxif-card);border:1px solid var(--bxif-line);border-radius:10px}
.bxif-sec-head,.bxif-sub-head{display:flex;align-items:center;gap:10px;width:100%;min-height:var(--bxif-sec-h);padding:0 14px 0 13px;border-radius:9px;transition:background-color .1s}
.bxif-sec[data-open]>.bxif-sec-head{border-radius:9px 9px 0 0;box-shadow:inset 3px 0 0 var(--bxif-acc-hi),inset 0 -1px 0 var(--bxif-line)}
.bxif-sec-idx{flex:none;min-width:2ch;font-size:var(--bxif-fs-idx);font-weight:600;color:var(--bxif-t3)}
.bxif-sec-title{flex:none;font-size:var(--bxif-fs-sec);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bxif-t1);white-space:nowrap}
.bxif-sec-sum{flex:1;min-width:0;text-align:right;font-size:var(--bxif-fs-sum);font-weight:500;color:var(--bxif-t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bxif-chev{flex:none;width:8px;height:8px;margin:0 2px 0 4px;border-right:2px solid var(--bxif-t2);border-bottom:2px solid var(--bxif-t2);transform:translateY(-2px) rotate(45deg);transition:transform .15s}
[data-open]>.bxif-sec-head .bxif-chev,.bxif-sub-head[aria-expanded=true] .bxif-chev{transform:translateY(2px) rotate(225deg)}
.bxif-sec-body{display:none;padding:4px 0 8px}
.bxif-sec[data-open]>.bxif-sec-body{display:block}
.bxif-panel[data-nav="1"] .bxif-sec-head:focus,.bxif-panel[data-nav="1"] .bxif-sub-head:focus{box-shadow:var(--bxif-ring);background:var(--bxif-rowfocus)}
.bxif-panel[data-nav="1"] .bxif-sec[data-open]>.bxif-sec-head:focus{box-shadow:var(--bxif-ring),inset 3px 0 0 var(--bxif-acc-hi)}
.bxif-sec-body>.bxif-row+.bxif-row{border-top:1px solid rgba(255,255,255,.05)}
/* rows */
.bxif-row{position:relative;display:grid;grid-template-columns:minmax(104px,34%) minmax(0,1fr) auto;column-gap:12px;align-items:center;min-height:var(--bxif-row-h);padding:var(--bxif-row-py) var(--bxif-row-px);transition:background-color .1s}
.bxif-lab{grid-column:1;grid-row:1;min-width:0;font-size:var(--bxif-fs-label);font-weight:500;line-height:1.2;color:var(--bxif-tl);overflow-wrap:break-word}
.bxif-lab-sub{display:block;margin-top:2px;font-size:var(--bxif-fs-sub);font-weight:400;color:var(--bxif-t3)}
.bxif-ctl{grid-column:2/-1;grid-row:1;min-width:0}
.bxif-has-val>.bxif-ctl{grid-column:2}
.bxif-val{grid-column:3;grid-row:1;width:52px;text-align:right;font-size:var(--bxif-fs-val);font-weight:600;line-height:1.15;color:var(--bxif-t1);white-space:nowrap}
.bxif-v2{display:block;margin-top:1px;font-size:var(--bxif-fs-105);font-weight:500;color:var(--bxif-t2)}
.bxif-hint,.bxif-out,.bxif-x{grid-column:1/-1;min-width:0}
.bxif-hint{display:none;margin:6px 0 2px;font-size:var(--bxif-fs-hint);line-height:1.35;color:var(--bxif-t2)}
.bxif-row:focus-within>.bxif-hint,.bxif-row[data-disabled]>.bxif-hint{display:block}
.bxif-out{margin-top:6px;font-size:var(--bxif-fs-read);line-height:1.35;color:var(--bxif-t2)}
.bxif-row>.bxif-out:last-child{margin-bottom:2px}
.bxif-stack{grid-template-columns:minmax(0,1fr) auto}
.bxif-stack>.bxif-ctl{grid-column:1/-1;grid-row:2;margin-top:8px}
.bxif-stack>.bxif-val{grid-column:2;width:auto}
.bxif-panel[data-nav="1"] .bxif-row:focus-within{background:var(--bxif-rowfocus);box-shadow:inset 3px 0 0 var(--bxif-acc-hi)}
.bxif-row[data-disabled]>.bxif-ctl{opacity:.45}
.bxif-row[data-disabled] .bxif-seg-opt,.bxif-row[data-disabled] .bxif-slider{pointer-events:none}
@media (min-height:900px){.bxif-row{grid-template-columns:minmax(0,1fr) auto}
 .bxif-row>.bxif-ctl{grid-column:1/-1;grid-row:2;margin-top:8px}.bxif-row>.bxif-val{grid-column:2;width:auto;min-width:64px}
 .bxif-sec-head{gap:8px}.bxif-sec-title{letter-spacing:.05em}.bxif-kpi-cap,.bxif-cap,.bxif-pipe-k,.bxif-spark-cap{letter-spacing:.02em}.bxif-kpi{padding-left:10px}.bxif-kpi-cap{font-size:13px;gap:4px}}
.bxif-tag{display:inline-block;vertical-align:1px;margin-left:6px;padding:0 4px;border:1px solid #3a3f48;border-radius:4px;font-size:var(--bxif-fs-tag);font-weight:700;letter-spacing:.06em;line-height:1.5;color:var(--bxif-t2);text-transform:uppercase;white-space:nowrap}
.bxif-tag[data-g=ok]{border-color:rgba(255,207,90,.5)}
/* segmented choice */
.bxif-seg{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));height:var(--bxif-rail-h);padding:2px;border-radius:8px;background:var(--bxif-bg0);box-shadow:inset 0 0 0 1px #1d1f23}
.bxif-panel input.bxif-in{position:absolute;inset:0;margin:0;padding:0;opacity:0;pointer-events:none;width:100%;height:100%;min-width:0;-webkit-appearance:none;appearance:none;background:none;border:0;z-index:0}
.bxif-seg-thumb{position:absolute;top:2px;bottom:2px;left:2px;width:calc((100% - 4px)/var(--n));transform:translateX(calc(var(--i)*100%));border-radius:6px;background:var(--bxif-acc);box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .14s cubic-bezier(.2,.8,.2,1)}
.bxif-seg[data-none] .bxif-seg-thumb{display:none}
.bxif-seg-opt{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;min-width:0;padding:0 5px;border-radius:6px;font-size:var(--bxif-fs-seg);font-weight:600;line-height:1.1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--bxif-t2);cursor:pointer;transition:color .1s,background-color .1s}
.bxif-seg-opt>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.bxif-seg-opt[data-on]{color:#fff}
@media (hover:hover){.bxif-seg-opt:not([data-on]):hover,.bxif-step-arr:hover{background:var(--bxif-hover)}.bxif-btn:not(:disabled):hover{filter:brightness(1.12)}.bxif-sec-head:hover,.bxif-sub-head:hover{background:#272a2f}.bxif-chip:not([aria-pressed=true]):hover{background:var(--bxif-hover)}}
.bxif-panel[data-nav="1"] .bxif-seg:focus-within{box-shadow:var(--bxif-ring)}
.bxif-step{display:flex;align-items:center}
.bxif-step-arr{position:relative;z-index:1;flex:none;width:32px;height:100%;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:var(--bxif-t2);cursor:pointer}
.bxif-step-val{flex:1;min-width:0;text-align:center;font-size:var(--bxif-fs-seg);font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bxif-corner{position:relative;display:inline-block;vertical-align:middle;width:22px;height:14px;border:2px solid currentColor;border-radius:3px}
.bxif-corner::after{content:'';position:absolute;width:6px;height:4px;border-radius:1px;background:currentColor}
.bxif-corner[data-c=top-left]::after{top:1px;left:1px}.bxif-corner[data-c=top-right]::after{top:1px;right:1px}
.bxif-corner[data-c=bottom-left]::after{bottom:1px;left:1px}.bxif-corner[data-c=bottom-right]::after{bottom:1px;right:1px}
/* slider */
.bxif-slider{position:relative;height:var(--bxif-hit);display:flex;align-items:center;touch-action:pan-y;cursor:pointer;border-radius:999px;--bxif-fill:calc(var(--bxif-thumb)/2 + (100% - var(--bxif-thumb))*var(--p))}
.bxif-panel input.bxif-range{position:relative;z-index:1;display:block;width:100%;height:100%;margin:0;padding:0;opacity:1;pointer-events:none;background:none;border:0;-webkit-appearance:none;appearance:none}
.bxif-range::-webkit-slider-runnable-track{height:var(--bxif-track);border-radius:999px;background:linear-gradient(90deg,var(--bxif-acc-hi) var(--bxif-fill),#3a3e45 var(--bxif-fill))}
.bxif-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:var(--bxif-thumb);height:var(--bxif-thumb);margin-top:calc((var(--bxif-track) - var(--bxif-thumb))/2);border-radius:50%;background:#f2f4f7;border:2px solid var(--bxif-acc);box-shadow:0 1px 3px rgba(0,0,0,.55)}
.bxif-range::-moz-range-track{height:var(--bxif-track);border-radius:999px;background:#3a3e45}
.bxif-range::-moz-range-progress{height:var(--bxif-track);border-radius:999px;background:var(--bxif-acc-hi)}
.bxif-range::-moz-range-thumb{width:var(--bxif-thumb);height:var(--bxif-thumb);border-radius:50%;background:#f2f4f7;border:2px solid var(--bxif-acc);box-shadow:0 1px 3px rgba(0,0,0,.55)}
.bxif-panel[data-nav="1"] .bxif-slider:focus-within{box-shadow:var(--bxif-ring)}
.bxif-notch,.bxif-ghost{position:absolute;z-index:0;top:50%;width:2px;border-radius:1px;pointer-events:none;left:calc(var(--bxif-thumb)/2 + (100% - var(--bxif-thumb))*var(--nf) - 1px)}
.bxif-notch{height:12px;margin-top:-6px;background:#8a909a}
.bxif-ghost{height:16px;margin-top:-8px;background:var(--bxif-info)}
/* switch */
.bxif-sw{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:var(--bxif-hit);padding-right:4px;vertical-align:middle;cursor:pointer}
.bxif-sw-pill{position:relative;flex:none;width:var(--bxif-sw-w);height:var(--bxif-sw-h);border-radius:999px;background:#3a3e45;transition:background-color .1s}
.bxif-sw-knob{position:absolute;top:50%;left:calc((var(--bxif-sw-h) - var(--bxif-knob))/2);width:var(--bxif-knob);height:var(--bxif-knob);margin-top:calc(var(--bxif-knob)/-2);border-radius:50%;background:#c9cdd4;box-shadow:0 1px 2px rgba(0,0,0,.4);transition:transform .14s cubic-bezier(.2,.8,.2,1)}
.bxif-sw[data-on] .bxif-sw-pill{background:var(--bxif-acc)}
.bxif-sw[data-on] .bxif-sw-knob{background:#fff;transform:translateX(calc(var(--bxif-sw-w) - var(--bxif-sw-h)))}
.bxif-sw-tx{font-size:var(--bxif-fs-val);font-weight:600;color:var(--bxif-t2)}
.bxif-sw[data-on] .bxif-sw-tx{color:var(--bxif-t1)}
.bxif-panel[data-nav="1"] .bxif-sw:focus-within .bxif-sw-pill{box-shadow:var(--bxif-ring)}
/* buttons and chips */
.bxif-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:var(--bxif-btn-h);padding:0 14px;border-radius:8px;background:var(--bxif-field);color:var(--bxif-t1);
 font-size:var(--bxif-fs-seg);font-weight:600;line-height:1.2;text-align:center;overflow:hidden;transition:background-color .1s}
.bxif-panel .bxif-btn-primary{background:var(--bxif-acc);color:#fff}
.bxif-panel .bxif-btn-danger{background:transparent;box-shadow:inset 0 0 0 1px var(--bxif-danger);color:var(--bxif-danger-t)}
.bxif-panel .bxif-btn-danger[data-armed]{background:var(--bxif-danger);color:#fff}
.bxif-panel .bxif-btn-out{background:transparent;box-shadow:inset 0 0 0 1px var(--bxif-acc-hi);color:var(--bxif-t1)}
.bxif-panel .bxif-btn-sm{flex:none;min-height:30px;padding:0 10px;font-size:var(--bxif-fs-12);white-space:nowrap}
.bxif-btn:disabled{opacity:.45;cursor:default}
.bxif-panel[data-nav="1"] .bxif-btn:focus{box-shadow:var(--bxif-ring);background:#3a3e45}
.bxif-panel[data-nav="1"] .bxif-btn-primary:focus{background:var(--bxif-acc-hi)}
.bxif-panel[data-nav="1"] .bxif-btn-danger:focus{box-shadow:var(--bxif-ring),inset 0 0 0 1px var(--bxif-danger);background:rgba(193,4,4,.18)}
.bxif-panel[data-nav="1"] .bxif-btn-danger[data-armed]:focus{background:var(--bxif-danger)}
.bxif-count{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.75);transform-origin:left;transform:scaleX(0)}
.bxif-btn[data-armed] .bxif-count{transform:scaleX(1)}
.bxif-btn[data-armed] .bxif-count[data-run]{transform:scaleX(0);transition:transform 4s linear}
.bxif-chips{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.bxif-chip{display:flex;align-items:center;justify-content:center;min-width:0;min-height:var(--bxif-chip-h);padding:3px 4px;border-radius:8px;background:var(--bxif-field);box-shadow:inset 0 0 0 1px transparent;
 font-size:var(--bxif-fs-seg);font-weight:600;line-height:1.12;text-align:center;color:var(--bxif-t1);overflow-wrap:anywhere;transition:background-color .1s}
.bxif-panel .bxif-chip[aria-pressed=true]{background:var(--bxif-acc);box-shadow:inset 0 0 0 1px var(--bxif-acc-hi);color:#fff}
.bxif-panel[data-nav="1"] .bxif-chip:focus{box-shadow:var(--bxif-ring)}
.bxif-panel[data-nav="1"] .bxif-chip:not([aria-pressed=true]):focus{background:#3a3e45}
.bxif-desc{margin-top:8px;min-height:2.7em;font-size:var(--bxif-fs-12);line-height:1.35;color:var(--bxif-t2);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.bxif-pick{font-size:var(--bxif-fs-val);font-weight:600;color:var(--bxif-t1);text-align:right}
.bxif-panel .bxif-status{font-size:var(--bxif-fs-read);font-weight:500;color:var(--bxif-t2);white-space:normal}
/* verdict, pipeline, meters */
.bxif-verdict{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:10px;min-height:44px;margin:8px var(--bxif-row-px) 4px;padding:6px 8px 6px 12px;border-radius:8px;background:var(--bxif-none-bg);color:var(--bxif-none)}
.bxif-verdict[data-g=good]{background:var(--bxif-good-bg)}.bxif-verdict[data-g=ok]{background:var(--bxif-ok-bg)}.bxif-verdict[data-g=bad]{background:var(--bxif-bad-bg)}.bxif-verdict[data-g=info]{background:var(--bxif-info-bg)}
.bxif-verdict-tx{font-size:var(--bxif-fs-12);line-height:1.35;color:var(--bxif-t1);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.bxif-verdict .bxif-btn[data-off]{visibility:hidden}
.bxif-cap{margin:12px var(--bxif-row-px) 0;font-size:var(--bxif-fs-10);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bxif-t3)}
.bxif-pipe{display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr) 14px minmax(0,1fr);margin:6px var(--bxif-row-px) 0}
.bxif-pipe-cell{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;padding:7px 4px 6px;border-radius:8px;background:var(--bxif-bg0)}
.bxif-pipe-k{font-size:var(--bxif-fs-10);font-weight:700;letter-spacing:.08em;color:var(--bxif-t3)}
.bxif-pipe-v{font-size:calc(var(--bxif-fs-val) + 3px);font-weight:600;line-height:1.1;color:var(--bxif-t1)}
.bxif-pipe-s{font-size:var(--bxif-fs-sub);color:var(--bxif-t3);white-space:nowrap}
.bxif-pipe-arr{align-self:center;justify-self:center;width:7px;height:7px;margin-left:-3px;border-top:2px solid #4b5059;border-right:2px solid #4b5059;transform:rotate(45deg)}
.bxif-lines{margin:8px var(--bxif-row-px) 2px;display:flex;flex-direction:column;gap:3px;font-size:var(--bxif-fs-read);line-height:1.35;color:var(--bxif-t1)}
.bxif-meter{position:relative;height:6px;margin-top:8px;border-radius:999px;background:var(--bxif-bg0)}
.bxif-meter-fill{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:999px;background:currentColor;transform-origin:left;transform:scaleX(0)}
.bxif-meter-clip{position:absolute;top:-4px;bottom:-4px;left:-1px;right:-1px;overflow:hidden;pointer-events:none}
.bxif-meter-pos{position:absolute;top:4px;bottom:4px;left:1px;right:1px}
.bxif-meter-tick{position:absolute;left:-1px;top:-3px;width:2px;height:12px;border-radius:1px;background:#fff;box-shadow:0 0 0 1px rgba(20,21,24,.7)}
.bxif-qp-track{position:relative;height:6px;border-radius:999px;background:linear-gradient(90deg,rgba(79,224,210,.35),rgba(255,207,90,.35) 50%,rgba(255,95,109,.35)),var(--bxif-bg0)}
.bxif-qp-cap{display:flex;justify-content:space-between;margin-top:5px;font-size:var(--bxif-fs-10);color:var(--bxif-t3)}
.bxif-x{margin-top:8px}
.bxif-stackbar{display:flex;gap:1px;height:8px;margin-top:8px;border-radius:3px;overflow:hidden;background:var(--bxif-bg0)}
.bxif-stackbar>span{flex:0 1 0;min-width:0}
.bxif-stackbar>span:nth-child(1){background:#d7dbe2}.bxif-stackbar>span:nth-child(2){background:#a9afba}.bxif-stackbar>span:nth-child(3){background:#7c8391}.bxif-stackbar>span:nth-child(4){background:#565c68}
.bxif-stackbar>span:nth-child(5){background:repeating-linear-gradient(45deg,#a9afba 0 2px,transparent 2px 4px)}
.bxif-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;margin-top:8px;font-size:var(--bxif-fs-read)}
.bxif-legend>div{display:flex;align-items:center;gap:7px;min-width:0;white-space:nowrap}
.bxif-legend>div>span:nth-child(2){flex:1;min-width:0;color:var(--bxif-t2);overflow:hidden;text-overflow:ellipsis}
.bxif-sw-i{flex:none;width:9px;height:9px;border-radius:2px}
.bxif-legend>div:nth-child(1) .bxif-sw-i{background:#d7dbe2}.bxif-legend>div:nth-child(2) .bxif-sw-i{background:#a9afba}.bxif-legend>div:nth-child(3) .bxif-sw-i{background:#7c8391}
.bxif-legend>div:nth-child(4) .bxif-sw-i{background:#565c68}.bxif-legend>div:nth-child(5) .bxif-sw-i{background:repeating-linear-gradient(45deg,#a9afba 0 2px,transparent 2px 4px);box-shadow:inset 0 0 0 1px #a9afba}
.bxif-total{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:var(--bxif-fs-label);font-weight:500;color:var(--bxif-tl)}
.bxif-total b{font-size:calc(var(--bxif-fs-val) + 2px);font-weight:600;white-space:nowrap}
.bxif-foot{font-size:var(--bxif-fs-11);color:var(--bxif-t3);margin-top:8px}
.bxif-btns{display:flex;flex-direction:column;gap:8px}
.bxif-btns>.bxif-btn{width:100%}
.bxif-panel textarea.bxif-copy{display:block;width:100%;margin:0;padding:8px;border:0;border-radius:8px;background:var(--bxif-bg0);color:var(--bxif-t1);font:var(--bxif-fs-11)/1.35 var(--bx-monospaced-font,Consolas,monospace);resize:vertical;user-select:text;-webkit-user-select:text;outline:none}
.bxif-sub{margin:6px var(--bxif-row-px) 0;border-top:1px solid rgba(255,255,255,.05)}
.bxif-sub .bxif-sub-head{padding:0 2px;min-height:calc(var(--bxif-sec-h) - 2px);font-size:var(--bxif-fs-label);font-weight:500;color:var(--bxif-tl)}
.bxif-sub .bxif-sub-head>span{flex:1}
.bxif-about{display:flex;flex-direction:column;gap:8px;padding:2px 2px 6px}
.bxif-about p{margin:0;font-size:var(--bxif-fs-12);line-height:1.4;color:var(--bxif-t2)}
.bxif-foot-line{padding:0 2px;font-size:var(--bxif-fs-11);color:var(--bxif-t3)}
.bx-settings-row.bxif-native-muted>:not(.bx-settings-label){opacity:.45}
.bx-settings-row.bxif-native-muted .bx-settings-label{color:#9ea4ae}
.bx-settings-row.bxif-native-muted .bx-settings-label::after{content:"Substituída pela Nitidez do Tratamento de imagem";display:block;margin-top:2px;font-size:12px;font-weight:400;color:#b4b9c2}
@media (prefers-reduced-motion:reduce){.bxif-panel *{transition:none!important;animation:none!important}}
`;

 /* =============================== Panel model =============================== */
 // Heavy settings rebuild textures or restart the capture/pacer: leading edge plus one trailing update.
 const HEAVY = new Set(['fluidity', 'capture', 'output', 'gpuBudget', 'spatialMode']);
 const SYNC_KEYS = ['mode', 'sharpness', 'sharpening', 'scaler', 'output', 'adaptive', 'fluidity', 'capture', 'smoothing', 'gpuBudget', 'spatialMode', 'hud', 'hudPosition', 'cleanup', 'deband', 'chroma', 'detail', 'temporal', 'antialias', 'neural', 'desynchronized'];
 const TREAT = ['cleanup', 'deband', 'chroma', 'detail', 'temporal', 'antialias', 'neural'];
 const UI_KEY = 'BxImageFilter.ui.v1';
 const phoneTier = (() => { try { return matchMedia('(max-height:500px)').matches; } catch { return false; } })();
 const ui = {open: {fluidez: true, nitidez: !phoneTier, ajuste: false, desempenho: false, ferramentas: false}};
 try { const s = JSON.parse(localStorage.getItem(UI_KEY)); if (s && typeof s.open === 'object') for (const k in ui.open) if (typeof s.open?.[k] === 'boolean') ui.open[k] = s.open[k]; } catch {}
 const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} };

 function h(tag, props, ...kids) {
  const el = doc.createElement(tag);
  if (props) for (const k in props) {
   const v = props[k];
   if (v === null || v === undefined || v === false) continue;
   if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'style') el.style.cssText = v;
   else if (k === 'tabIndex') el.tabIndex = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
 }

 let root = null, lastSnap = null;
 const controls = [], sections = [], heads = [], deferred = new Map(), pending = new Map();
 const G = createHysteresis(), drops = dropRate(), els = {};
 let lastSig = '', nav = '0';
 const valueOf = k => pending.has(k) ? pending.get(k).value : settings[k];
 function setNav(v) { if (nav === v) return; nav = v; if (root) root.dataset.nav = v; }

 // Never disable or hide the element holding focus: Better xCloud would jump to the next group.
 function whenUnfocused(el, fn) {
  const a = doc.activeElement;
  if (a && a !== doc.body && el.contains(a)) deferred.set(el, fn); else { deferred.delete(el); fn(); }
 }
 function runDeferred(next) { for (const [el, fn] of deferred) if (!(next && el.contains(next))) { deferred.delete(el); fn(); } }
 const setDisabled = (c, flag) => whenUnfocused(c.row, () => { c.input.disabled = flag; setA(c.row, 'data-disabled', flag || null); });
 const setHidden = (el, flag) => whenUnfocused(el, () => setA(el, 'data-hide', flag || null));

 // Applies a setting. Better xCloud fires 'input' even at the clamp ends, and update() resets the GPU
 // adaptation, so an unchanged value is ignored.
 function commit(key, value, ev) {
  if (ev && ev.isTrusted === false) setNav('1');
  const p = pending.get(key);
  if (p) { p.value = value; afterCommit(key); return; }
  if (settings[key] === value) return;
  api.update({[key]: value});
  if (HEAVY.has(key)) pending.set(key, {value, timer: setTimeout(() => flush(key), 250)});
  afterCommit(key);
 }
 function flush(key) {
  const rec = pending.get(key);
  if (!rec) return;
  clearTimeout(rec.timer); pending.delete(key);
  if (settings[key] !== rec.value) api.update({[key]: rec.value});
  afterCommit(key);
 }
 // Presets, restore and suggestions replace values at once: a trailing commit must not undo them.
 function cancelPending() { for (const rec of pending.values()) clearTimeout(rec.timer); pending.clear(); }
 function afterCommit(key) {
  updateDependents();
  if (key === 'hud' || key === 'hudPosition' || key === 'reset') api.hud?.update();
  verdict.dirty = true;
  if (lastSnap) updateSummaries(lastSnap);
 }
 const sigOf = () => SYNC_KEYS.map(k => settings[k]).join('|') + '|' + api.diagnostic + '|' + status.desynchronized;
 function syncAll(periodic) {
  const a = doc.activeElement;
  let skipped = false;
  for (const c of controls) { if (periodic && root?.contains(a) && c.row.contains(a)) { skipped = true; continue; } c.sync(); }
  updateDependents();
  if (!skipped) lastSig = sigOf();
 }

 /* ------------------------------ control kit ------------------------------ */
 function labelCell(text, tag, sub) {
  const tx = h('span', {class: 'bxif-lab-tx', text}), tg = h('span', {class: 'bxif-tag', 'data-hide': tag ? null : ''}, tag || '');
  const el = h('div', {class: 'bxif-lab'}, tx, tg, sub ? h('span', {class: 'bxif-lab-sub', text: sub}) : null);
  return {el, tx, tag: tg, setTag(t, g) { setT(tg, t || ''); setA(tg, 'data-hide', t ? null : ''); setA(tg, 'data-g', g || null); }};
 }
 function makeRow(key, lab, ctl, extra = {}) {
  const hint = h('div', {class: 'bxif-hint'});
  const row = h('div', {class: 'bxif-row' + (extra.val ? ' bxif-has-val' : '') + (extra.stack ? ' bxif-stack' : ''), 'data-bxif-row': key}, lab.el, h('div', {class: 'bxif-ctl'}, ctl), extra.val || null, hint);
  return {row, hint};
 }
 const out = (name, cls = 'bxif-out') => h('div', {class: cls, 'data-bxif-out': name});
 const rangeInput = (key, kind, label, max, step, cls = 'bxif-in') => {
  const input = h('input', {class: cls, type: 'range', min: '0', max: String(max), step: String(step), 'aria-label': label, 'data-bxif-key': key, 'data-bxif-kind': kind});
  input.tabIndex = 0;
  return input;
 };

 // CHOICE: a segmented control over a hidden <input type=range min=0 max=n-1 step=1>. Gamepad and
 // keyboard Left/Right step it, A/Enter cycles it, a tap on a segment selects it.
 function choice(o) {
  const n = o.opts.length, values = o.opts.map(x => x[0]), stepper = n > 5;
  const input = rangeInput(o.key, 'choice', o.label, n - 1, 1);
  input.setAttribute('data-bxif-values', values.join(','));
  const thumb = stepper ? null : h('span', {class: 'bxif-seg-thumb', 'aria-hidden': 'true'});
  const optEls = stepper ? [] : o.opts.map((x, i) => h('span', {class: 'bxif-seg-opt', 'data-i': String(i), 'aria-hidden': 'true', tabIndex: -1}, o.icon ? o.icon(x[0]) : h('span', {text: x[1]})));
  const stepVal = stepper ? h('span', {class: 'bxif-step-val', 'aria-hidden': 'true'}) : null;
  const arrows = stepper ? [h('span', {class: 'bxif-step-arr', 'aria-hidden': 'true', tabIndex: -1, text: '‹'}), h('span', {class: 'bxif-step-arr', 'aria-hidden': 'true', tabIndex: -1, text: '›'})] : [];
  const seg = stepper ? h('div', {class: 'bxif-seg bxif-step', style: '--n:1;--i:0'}, input, arrows[0], stepVal, arrows[1]) : h('div', {class: 'bxif-seg', style: `--n:${n};--i:0`}, input, thumb, ...optEls);
  const lab = labelCell(o.label, o.tag, o.sub);
  const {row, hint} = makeRow(o.key, lab, seg, o);
  const get = o.get || (() => valueOf(o.key)), set = o.set || ((v, e) => commit(o.key, v, e));
  let idx = -1, reason = '';
  const c = {key: o.key, input, row, lab, hint, seg, values};
  function show(i) {
   idx = i;
   setS(seg, '--i', String(Math.max(i, 0))); setA(seg, 'data-none', i < 0 || null);
   for (let k = 0; k < optEls.length; k++) setA(optEls[k], 'data-on', k === i || null);
   const text = i >= 0 ? o.opts[i][1] : o.unknown ? o.unknown(get()) : '—';
   if (stepVal) setT(stepVal, text);
   setA(input, 'aria-valuetext', text);
   c.updateHint();
  }
  c.updateHint = () => setT(hint, reason || (o.hint ? o.hint(idx >= 0 ? values[idx] : get()) : ''));
  function apply(i, e) { i = Math.max(0, Math.min(n - 1, i)); input.value = String(i); show(i); set(values[i], e); }
  // Better xCloud's 'input' does not bubble: listen on the input itself.
  input.addEventListener('input', e => { if (e.isTrusted === false) setNav('1'); apply(+input.value, e); });
  input.addEventListener('click', e => { if (e.isTrusted || input.disabled) return; setNav('1'); apply((idx + 1) % n, e); });
  optEls.forEach((el, i) => {
   el.addEventListener('pointerdown', e => e.preventDefault());
   el.addEventListener('click', e => { if (input.disabled) return; apply(i, e); input.focus({preventScroll: true}); });
  });
  arrows.forEach((el, k) => {
   el.addEventListener('pointerdown', e => e.preventDefault());
   el.addEventListener('click', e => { if (input.disabled) return; apply(Math.max(idx, 0) + (k ? 1 : -1), e); input.focus({preventScroll: true}); });
  });
  c.sync = () => { const i = values.indexOf(get()); input.value = String(Math.max(i, 0)); show(i); };
  c.setReason = r => { if (reason !== r) { reason = r; c.updateHint(); } };
  c.sync();
  controls.push(c);
  return c;
 }

 // SLIDER: a visible range that ignores raw pointer input; the wrapper tells a horizontal drag or a tap
 // from a vertical scroll, so scrolling the dialog never changes a value by accident.
 function slider(o) {
  const scale = o.scale, max = o.max, step = o.step;
  const input = rangeInput(o.key, 'slider', o.label, max, step, 'bxif-in bxif-range');
  const notch = num(o.notch) && o.notch > 0 ? h('span', {class: 'bxif-notch', 'aria-hidden': 'true', style: `--nf:${Math.min(1, o.notch * scale / max)}`}) : null;
  const ghost = o.ghost ? h('span', {class: 'bxif-ghost', 'aria-hidden': 'true', 'data-hide': '', style: '--nf:0'}) : null;
  const wrap = h('div', {class: 'bxif-slider', style: '--p:0'}, notch, ghost, input);
  const v1 = h('span', {class: 'bxif-v1'}), v2 = h('span', {class: 'bxif-v2', 'data-hide': ''});
  const val = h('div', {class: 'bxif-val', 'aria-hidden': 'true'}, v1, v2);
  const lab = labelCell(o.label, o.tag);
  const {row, hint} = makeRow(o.key, lab, wrap, {val});
  const c = {key: o.key, input, row, lab, hint, v2, ghost, scale};
  const fill = () => setS(wrap, '--p', String(+input.value / max));
  function text(s) { const t = o.fmt(s); setT(v1, t); setA(input, 'aria-valuetext', t); }
  function fromInput(e) { fill(); const s = +input.value / scale; text(s); commit(o.key, s, e); }
  input.addEventListener('input', e => { if (e.isTrusted === false) setNav('1'); fromInput(e); });
  let g = null;
  const thumbPx = () => parseFloat(getComputedStyle(wrap).getPropertyValue('--bxif-thumb')) || 18;
  function setAt(x, e) {
   const f = Math.min(1, Math.max(0, (x - g.r.left - g.th / 2) / Math.max(1, g.r.width - g.th)));
   const v = Math.round(f * max / step) * step;
   if (+input.value !== v) { input.value = String(v); fromInput(e); }
  }
  function startDrag(e) { g.drag = true; try { wrap.setPointerCapture(e.pointerId); } catch {} input.focus({preventScroll: true}); setAt(e.clientX, e); }
  wrap.addEventListener('pointerdown', e => {
   if (input.disabled || e.button > 0) return;
   // One rect read per gesture.
   g = {id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, drag: false, dead: false, raf: 0, r: wrap.getBoundingClientRect(), th: thumbPx()};
   if (e.pointerType !== 'touch') { e.preventDefault(); startDrag(e); }
  });
  wrap.addEventListener('pointermove', e => {
   if (!g || e.pointerId !== g.id || g.dead) return;
   g.x = e.clientX;
   if (!g.drag) {
    const dx = Math.abs(e.clientX - g.x0), dy = Math.abs(e.clientY - g.y0);
    if (dy >= 6 && dy >= dx) { g.dead = true; return; }
    if (dx >= 6 && dx > dy) startDrag(e);
    return;
   }
   if (!g.raf) { const gg = g; gg.raf = requestAnimationFrame(() => { gg.raf = 0; if (g === gg) setAt(gg.x, null); }); }
  });
  wrap.addEventListener('pointerup', e => {
   if (!g || e.pointerId !== g.id) return;
   const gg = g; g = null;
   if (gg.raf) cancelAnimationFrame(gg.raf);
   if (gg.dead) return;
   const tap = Math.abs(e.clientX - gg.x0) < 6 && Math.abs(e.clientY - gg.y0) < 6;
   if (gg.drag || tap) { g = gg; setAt(e.clientX, e); g = null; if (!gg.drag) input.focus({preventScroll: true}); }
  });
  wrap.addEventListener('pointercancel', () => { if (g?.raf) cancelAnimationFrame(g.raf); g = null; });
  // A click listener makes Chromium's touch adjustment treat the track as a tap target of its own row.
  wrap.addEventListener('click', () => {});
  c.sync = () => { const s = settings[o.key]; input.value = String(Math.round(s * scale)); fill(); text(s); };
  c.sync();
  controls.push(c);
  return c;
 }

 // SWITCH: a range 0/1 laid over a pill; Right turns it on, Left off, A toggles.
 function toggle(o) {
  const input = rangeInput(o.key, 'switch', o.label, 1, 1);
  const pill = h('span', {class: 'bxif-sw-pill', 'aria-hidden': 'true'}, h('span', {class: 'bxif-sw-knob'}));
  const tx = h('span', {class: 'bxif-sw-tx', 'aria-hidden': 'true'});
  const sw = h('div', {class: 'bxif-sw'}, input, pill, tx);
  const lab = labelCell(o.label, o.tag || null, o.sub);
  const {row, hint} = makeRow(o.key, lab, sw);
  setT(hint, o.hint || '');
  const c = {key: o.key, input, row, lab, hint};
  function show(on) { input.value = on ? '1' : '0'; setA(sw, 'data-on', on || null); const t = on ? 'Ligado' : 'Desligado'; setT(tx, t); setA(input, 'aria-valuetext', t); }
  const set = (on, e) => { show(on); o.set(on, e); };
  input.addEventListener('input', e => { if (e.isTrusted === false) setNav('1'); set(input.value === '1', e); });
  input.addEventListener('click', e => { if (e.isTrusted) return; setNav('1'); set(input.value !== '1', e); });
  // A tap anywhere on the pill or its text toggles (Better xCloud's click targets the input itself).
  sw.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
  sw.addEventListener('click', e => { if (e.target === input) return; set(input.value !== '1', e); input.focus({preventScroll: true}); });
  c.sync = () => show(!!o.get());
  c.sync();
  controls.push(c);
  return c;
 }
 function button(text, variant, onClick) {
  const label = h('span', {text});
  const b = h('button', {type: 'button', class: 'bxif-btn' + (variant ? ' bxif-btn-' + variant.split(' ').join(' bxif-btn-') : '')}, label);
  b._label = label;
  b.addEventListener('click', e => { if (e.isTrusted === false) setNav('1'); onClick?.(e); });
  return b;
 }
 function section(id, idx, title) {
  const sum = h('span', {class: 'bxif-sec-sum'});
  const head = h('button', {type: 'button', class: 'bxif-sec-head', 'aria-expanded': 'false', 'aria-controls': 'bxif-body-' + id},
   h('span', {class: 'bxif-sec-idx', text: idx}), h('span', {class: 'bxif-sec-title', text: title}), sum, h('i', {class: 'bxif-chev', 'aria-hidden': 'true'}));
  const body = h('div', {class: 'bxif-sec-body', id: 'bxif-body-' + id});
  const s = {id, head, body, sum, open: false, update: null, el: h('section', {class: 'bxif-sec', 'data-sec': id}, head, body)};
  s.setOpen = v => {
   s.open = v; setA(head, 'aria-expanded', String(v)); setA(s.el, 'data-open', v || null);
   if (ui.open[id] !== v) { ui.open[id] = v; saveUi(); }
   if (v && lastSnap && s.update) s.update(lastSnap);
  };
  head.addEventListener('click', e => { if (e.isTrusted === false) setNav('1'); s.setOpen(!s.open); });
  sections.push(s); heads.push(s);
  return s;
 }
 function subSection(id, title, content) {
  const body = h('div', {class: 'bxif-about', id: 'bxif-body-' + id, 'data-hide': ''}, ...content);
  const head = h('button', {type: 'button', class: 'bxif-sub-head', 'aria-expanded': 'false', 'aria-controls': 'bxif-body-' + id}, h('span', {text: title}), h('i', {class: 'bxif-chev', 'aria-hidden': 'true'}));
  const s = {head, open: false, setOpen(v) { s.open = v; setA(head, 'aria-expanded', String(v)); setA(body, 'data-hide', v ? null : ''); }};
  head.addEventListener('click', e => { if (e.isTrusted === false) setNav('1'); s.setOpen(!s.open); });
  heads.push(s);
  return h('div', {class: 'bxif-sub'}, head, body);
 }
 // Left/Right on a section header close/open it; on other buttons they do nothing (instead of
 // jumping to Better xCloud's tab bar). Ranges never get here: Better xCloud changes their value.
 function onSideKey(dir) {
  const a = doc.activeElement, s = heads.find(x => x.head === a);
  setNav('1');
  if (s) s.setOpen(dir === 2);
 }

 /* =============================== Panel content =============================== */
 const FLU = {off: 'Desligada', balanced: 'Equilibrada', max: 'Máxima'};
 const CORNER = {'top-left': 'Superior esquerdo', 'top-right': 'Superior direito', 'bottom-left': 'Inferior esquerdo', 'bottom-right': 'Inferior direito'};
 const SMOOTH_STATE = {waiting: 'aguardando vídeo', unsupported: 'não suportado', requested: 'aceito', partial: 'parcial', error: 'falhou'};
 const WARN_HINT = {bitrate: 'Better xCloud › Stream: Bitrate máximo → Ilimitado.', resolution: 'Better xCloud › Stream: escolha 1080p.', loss: 'Prefira Wi-Fi 5 GHz ou cabo.'};
 const natural = api.presets?.natural?.values || {};

 function kpi(name, cap) {
  const dot = h('i', {class: 'bxif-dot'}), dotWrap = h('span', {style: 'display:inline-flex'}, dot);
  const numEl = h('span'), unit = h('span', {class: 'bxif-unit'}), val = h('span', {class: 'bxif-kpi-val'}, numEl, unit), sub = h('span', {class: 'bxif-kpi-sub'});
  return {el: h('div', {class: 'bxif-kpi', 'data-bxif-out': name}, h('span', {class: 'bxif-kpi-cap'}, dotWrap, cap), val, sub), dotWrap, num: numEl, unit, val, sub};
 }

 function build() {
  const r = h('div', {class: 'bxif-panel', 'data-bx-restoration': VERSION, role: 'group', 'aria-label': 'Tratamento de imagem', 'data-nav': '0', 'data-tier': tierNow()});
  r.nearby = {loop: dir => (dir === 2 || dir === 4) ? (onSideKey(dir), true) : false};
  // [A] header
  els.pillWord = h('span');
  els.pill = h('span', {class: 'bxif-pill', 'aria-live': 'polite', 'data-g': 'none'}, h('i', {class: 'bxif-dot'}), els.pillWord);
  r.append(h('div', {class: 'bxif-head'}, h('div', {class: 'bxif-title'}, h('span', {class: 'bxif-name', text: 'Tratamento de imagem'}), h('span', {class: 'bxif-ver', text: VERSION})), els.pill));
  // [B] warnings
  els.warns = h('div', {class: 'bxif-warns', 'data-bxif-out': 'warnings', 'data-hide': ''});
  els.warnText = new Map();
  els.warns.addEventListener('focusout', e => { if (!(e.relatedTarget && els.warns.contains(e.relatedTarget))) els.warnSig = null; });
  r.append(els.warns);
  // [C] live card
  els.k = {fps: kpi('kpi-fps', 'FPS'), pacing: kpi('kpi-pacing', 'Ritmo'), hitches: kpi('kpi-hitches', 'Travadas'), latency: kpi('kpi-latency', 'Latência')};
  els.spark = h('canvas', {'data-bxif-out': 'spark', 'aria-hidden': 'true'});
  els.sparkT = h('span', {class: 'bxif-spark-t'});
  els.meta = h('div', {class: 'bxif-meta', 'data-bxif-out': 'meta'});
  const hud = choice({key: 'hud', label: 'Indicadores no jogo', opts: [['off', 'Desligado'], ['compact', 'Compacto'], ['full', 'Completo']],
   hint: v => ({off: 'Nada sobre o jogo.', compact: 'FPS, ritmo, travadas e latência num canto pequeno.', full: 'Fluidez, latência, rede e imagem.'})[v] || ''});
  els.corner = choice({key: 'hudPosition', label: 'Canto', opts: Object.entries(CORNER), icon: v => h('span', {class: 'bxif-corner', 'data-c': v}),
   hint: v => (CORNER[v] ? CORNER[v] + '. ' : '') + 'No celular, o modo Compacto usa a faixa preta lateral quando houver espaço.'});
  r.append(h('div', {class: 'bxif-live'},
   h('div', {class: 'bxif-kpis'}, els.k.fps.el, els.k.pacing.el, els.k.hitches.el, els.k.latency.el),
   h('div', {class: 'bxif-spark-cap', 'aria-hidden': 'true'}, h('span', {text: 'RITMO NA TELA'}), els.sparkT),
   h('div', {class: 'bxif-spark'}, els.spark), els.meta));
  // [D] 01 Fluidez
  const s1 = section('fluidez', '01', 'Fluidez');
  els.verdictTx = h('span', {class: 'bxif-verdict-tx'});
  els.verdictBtn = button('', 'sm out', e => verdict.action?.(e));
  els.verdictBtn.tabIndex = -1; setA(els.verdictBtn, 'data-off', true);
  els.verdict = h('div', {class: 'bxif-verdict', 'data-bxif-out': 'verdict', 'data-g': 'none'}, h('i', {class: 'bxif-dot'}), els.verdictTx, els.verdictBtn);
  els.verdict.addEventListener('focusout', e => { if (!(e.relatedTarget && els.verdict.contains(e.relatedTarget))) verdict.dirty = true; });
  const flu = choice({key: 'fluidity', label: 'Fluidez', opts: [['off', 'Desligada'], ['balanced', 'Equilibrada'], ['max', 'Máxima']], hint: v => ({
   off: 'Exibe cada quadro assim que chega: menor latência; o ritmo segue a rede.',
   balanced: 'Exibe no ritmo do servidor e corrige a oscilação da rede e da decodificação. Acrescenta poucos ms de espera.',
   max: 'Ritmo fixo de 30/60 FPS; corrige também jogo/servidor irregular. Um pouco mais de espera.'})[v] || ''});
  els.capture = choice({key: 'capture', label: 'Captura de quadros', opts: [['video', 'Vídeo'], ['direct', 'Direta']], hint: v => v === 'direct'
   ? 'Recebe cada quadro direto do decodificador: evita quadros pulados.' : 'Lê os quadros do elemento de vídeo (mais compatível).'});
  els.captureOut = out('capture'); els.capture.row.append(els.captureOut);
  const smoothHint = 'Pede ao navegador um alvo de buffer. Mais buffer deixa o ritmo mais regular, com mais latência. Não garante um atraso máximo.';
  els.smooth = choice({key: 'smoothing', label: 'Suavidade', opts: [[0, 'Auto'], [17, '17 ms'], [33, '33 ms'], [50, '50 ms']], hint: v => (v === 0 ? 'O navegador decide. ' : '') + smoothHint});
  els.smoothOut = out('smoothing'); els.smooth.row.append(els.smoothOut);
  els.pipe = {};
  const cell = (k, label) => { const v = h('span', {class: 'bxif-pipe-v'}), sub = h('span', {class: 'bxif-pipe-s'}); els.pipe[k] = {v, sub}; return h('div', {class: 'bxif-pipe-cell'}, h('span', {class: 'bxif-pipe-k', text: label}), v, sub); };
  els.pacingLine = h('div', {'data-bxif-out': 'pacing'}); els.fluLine = h('div', {'data-bxif-out': 'fluidity'});
  s1.body.append(els.verdict, flu.row, els.capture.row, els.smooth.row,
   h('div', {class: 'bxif-cap'}, 'Onde nasce a oscilação ', h('span', {style: 'text-transform:none', text: '· 2 s'})),
   h('div', {class: 'bxif-pipe', 'data-bxif-out': 'pipeline'}, cell('srv', 'SERVIDOR'), h('i', {class: 'bxif-pipe-arr'}), cell('arr', 'CHEGADA'), h('i', {class: 'bxif-pipe-arr'}), cell('scr', 'TELA')),
   h('div', {class: 'bxif-lines'}, els.pacingLine, els.fluLine));
  s1.update = updateFluidez;
  // [E] 02 Nitidez e imagem
  const s2 = section('nitidez', '02', 'Nitidez e imagem');
  els.chips = Object.entries(api.presets || {}).map(([k, p]) => {
   const b = button(p.label, null, () => { cancelPending(); api.applyPreset(k); syncAll(); afterCommit('preset'); });
   b.className = 'bxif-chip'; b.dataset.preset = k; setA(b, 'aria-pressed', 'false'); setA(b, 'aria-label', 'Perfil ' + p.label);
   b.addEventListener('focus', () => updatePreset(k)); b.addEventListener('blur', () => updatePreset(null));
   return b;
  });
  els.chipBox = h('div', {class: 'bxif-chips'}, ...els.chips);
  els.chipBox.nearby = {orientation: 'horizontal', focus: () => { (els.chips.find(b => b.getAttribute('aria-pressed') === 'true') || els.chips[0]).focus(); return true; }, loop: d => d === 2 || d === 4};
  els.presetPick = h('div', {class: 'bxif-val bxif-pick'});
  els.presetDesc = h('div', {class: 'bxif-desc'});
  els.presetLab = labelCell('Perfil');
  const presetRow = h('div', {class: 'bxif-row bxif-stack bxif-has-val', 'data-bxif-row': 'preset'}, els.presetLab.el, h('div', {class: 'bxif-ctl'}, els.chipBox, els.presetDesc), els.presetPick);
  els.sharp = slider({key: 'sharpness', label: 'Nitidez', max: 20, step: 1, scale: 2, notch: 3, fmt: s => s === 0 ? 'Desl.' : fmt(s, 1)});
  els.method = choice({key: 'sharpening', label: 'Método', opts: [['usm', 'USM'], ['cas', 'CAS'], ['rcas', 'RCAS'], ['native', 'Nativo']], hint: v => (({
   usm: 'Recomendado: contorno limpo.', cas: 'AMD FidelityFX CAS.', rcas: 'AMD FidelityFX RCAS.', native: 'Segue o Processamento do menu do Better xCloud (CAS/USM).'})[v] || '') + ' Vale também para a referência Só nitidez.'});
  // Spec 3 item 5: SGSR 1 replaces EASU + sharpening with one pass when the output is larger than the stream.
  els.scaler = choice({key: 'scaler', label: 'Escalador/nitidez', opts: [['easu', 'EASU + nitidez'], ['sgsr', 'SGSR (menos GPU)']], hint: v => (({
   easu: 'Atual: FSR 1 EASU amplia e o Método aplica a nitidez.', sgsr: 'Snapdragon GSR 1 amplia e dá nitidez numa passada só: menos GPU, um pouco menos de detalhe. Substitui o Método só quando a saída é maior que o stream; em saída nativa fica a nitidez atual.'})[v] || '')});
  els.output = choice({key: 'output', label: 'Resolução de saída', opts: [['auto', 'Auto'], ['native', 'Nativa'], ['1440', '2K'], ['2160', '4K']], unknown: v => v + 'p', hint: v => ({
   auto: 'Renderiza na altura real do vídeo na tela (FSR + nitidez no tamanho final). Em HDMI 1080p fica nativa.', native: 'Mantém a resolução do stream.',
   1440: 'Só para telas 1440p ou maiores; acima da tela só custa GPU.', 2160: 'Só para telas 4K; custo alto de GPU.'})[v] || 'Valor salvo fora das opções; escolha uma para substituí-lo.'});
  els.outputOut = out('output'); els.output.row.append(els.outputOut);
  els.adaptive = toggle({key: 'adaptive', label: 'Adaptar à compressão', get: () => valueOf('adaptive'), set: (v, e) => commit('adaptive', v, e),
   hint: 'Ajusta limpeza, degradês e detalhe à compressão (QP) do stream, devagar, sem pulsar.'});
  els.qpPos = h('span', {class: 'bxif-meter-pos', 'data-hide': ''}, h('i', {class: 'bxif-meter-tick'}));
  els.qp = h('div', {class: 'bxif-x', 'data-bxif-out': 'qp'}, h('div', {class: 'bxif-qp-track'}, h('span', {class: 'bxif-meter-clip'}, els.qpPos)), h('div', {class: 'bxif-qp-cap'}, h('span', {text: '20 limpo'}), h('span', {text: '28'}), h('span', {text: '36 forte'})));
  els.adaptiveOut = out('adaptive');
  els.adaptive.row.append(els.qp, els.adaptiveOut);
  els.mode = choice({key: 'mode', label: 'Comparação', opts: [['original', 'Original'], ['cas', 'Só nitidez'], ['filtered', 'Tratada']], hint: v => (({
   original: 'Vídeo puro, sem tratamento.', cas: 'Referência: só a nitidez, sem limpeza.', filtered: 'Tratamento completo (use esta para jogar).'})[v] || '') + ' Com o jogo aberto, compare ao vivo à esquerda do menu.'});
  s2.body.append(presetRow, els.sharp.row, els.method.row, els.scaler.row, els.output.row, els.adaptive.row, els.mode.row);
  s2.update = updateNitidez;
  // [F] 03 Ajuste fino
  const s3 = section('ajuste', '03', 'Ajuste fino');
  const TREAT_UI = [['Compressão', 'cleanup', 'Remove blocos e ruído de compressão.'], ['Degradês', 'deband', 'Suaviza faixas em céus e sombras; alto demais apaga textura.'],
   ['Cor nas bordas', 'chroma', 'Corrige cor borrada nas bordas (vídeo 4:2:0).'], ['Detalhe', 'detail', 'Realça microtextura.'], ['Estabilidade em movimento', 'temporal', 'Reduz cintilação entre quadros. Custa GPU.'],
   ['Antialiasing', 'antialias', 'Suaviza serrilhado; também suaviza textura.'], ['Reconstrução neural', 'neural', 'Rede treinada em streams H.264 limpa blocos antes da nitidez. ~30% mais GPU; use Nitidez ~2,5.']];
  els.treat = {};
  for (const [label, key, hint] of TREAT_UI) {
   const c = els.treat[key] = slider({key, label, max: 100, step: 5, scale: 100, notch: natural[key], tag: key === 'neural' ? 'EXP' : null, ghost: ['cleanup', 'deband', 'detail'].includes(key), fmt: s => Math.round(s * 100) + '%'});
   setT(c.hint, hint);
   s3.body.append(c.row);
  }
  const spatial = choice({key: 'spatialMode', label: 'Limpeza espacial', opts: [['selective', 'Seletiva'], ['legacy', 'Clássica']], hint: () => 'Seletiva (v8) preserva textura; Clássica é a referência da v7.1.'});
  s3.body.append(spatial.row);
  s3.update = updateAjuste;
  // [G] 04 Desempenho e rede
  const s4 = section('desempenho', '04', 'Desempenho e rede');
  const budgetTail = ' Acima do limite (p95) desliga nesta ordem: estabilidade, saída, antialiasing, neural, degradês, limpeza, detalhe.';
  const budget = choice({key: 'gpuBudget', label: 'Aliviar GPU acima de', opts: [[3, '3 ms'], [6, '6 ms'], [10, '10 ms'], [0, 'Nunca']], hint: v => (({
   3: 'Corta etapas cedo; prioriza a fluidez.', 6: 'Equilíbrio padrão.', 10: 'Mantém mais etapas; risco de queda de quadros.', 0: 'Nunca reduz o tratamento automaticamente.'})[v] || '') + budgetTail});
  els.gpuText = h('b'); els.gpuFill = h('i', {class: 'bxif-meter-fill'}); els.gpuTick = h('span', {class: 'bxif-meter-pos'}, h('i', {class: 'bxif-meter-tick'}));
  els.gpuMeter = h('div', {class: 'bxif-meter bxif-x'}, els.gpuFill, h('span', {class: 'bxif-meter-clip'}, els.gpuTick));
  els.gpuNote = h('div', {class: 'bxif-out', 'data-hide': ''}); els.adaptation = h('div', {class: 'bxif-out', 'data-bxif-out': 'adaptation'});
  els.gpu = h('div', {class: 'bxif-row bxif-stack', 'data-bxif-out': 'gpu'},
   h('div', {class: 'bxif-total bxif-x', style: 'margin-top:0'}, h('span', {text: 'Tratamento (GPU p95)'}), els.gpuText), els.gpuMeter, els.gpuNote, els.adaptation);
  els.latTotal = h('b'); els.latBar = h('div', {class: 'bxif-stackbar'}, h('span'), h('span'), h('span'), h('span'), h('span'));
  const legend = key => { const v = h('span'); return {row: h('div', null, h('i', {class: 'bxif-sw-i'}), h('span', {text: key + ' '}), v), v}; };
  els.leg = [legend('Rede (RTT)'), legend('Buffer'), legend('Decodificação'), legend('Tratamento'), legend('Espera da Fluidez')];
  els.latency = h('div', {class: 'bxif-row bxif-stack', 'data-bxif-out': 'latency'},
   h('div', {class: 'bxif-total bxif-x', style: 'margin-top:0'}, h('span', {text: 'Latência estimada'}), els.latTotal), h('div', {class: 'bxif-x', style: 'margin-top:0'}, els.latBar),
   h('div', {class: 'bxif-legend bxif-x'}, ...els.leg.map(x => x.row)), h('div', {class: 'bxif-foot bxif-x', text: 'Soma aproximada; não inclui controle, jogo nem tela.'}));
  els.stream = h('div', {'data-bxif-out': 'stream'}); els.decoder = h('div', {'data-bxif-out': 'decoder'}); els.quality = h('div', {'data-bxif-out': 'quality'}); els.drops = h('div', {'data-bxif-out': 'drops'});
  // Spec 3 item 11 (docs/medicoes/spec3/*item11*): on the Vostro at 30 FPS, display p95 50 → 34 ms and
  // about −0.5 ms of GPU per frame; at 60 FPS the frames shown fell from 58-59 to 44 FPS. On the Poco F7
  // no gain. Tearing was not evaluated. The attribute is fixed when the canvas is created.
  els.desync = toggle({key: 'desynchronized', label: 'Baixa latência (desynchronized)', tag: 'EXP', get: () => valueOf('desynchronized'), set: (v, e) => commit('desynchronized', v, e),
   hint: 'Só para PC em jogos a 30 FPS: ritmo mais estável. A 60 FPS mostrou menos quadros (44 em vez de 58) e no celular não ganhou. Pode causar tearing (imagem rasgada). Vale na próxima sessão.'});
  els.desyncOut = out('desynchronized'); els.desync.row.append(els.desyncOut);
  s4.body.append(budget.row, els.desync.row, els.gpu,els.latency, h('div', {class: 'bxif-lines', style: 'margin-top:4px'}, els.stream, els.decoder, els.quality, els.drops));
  s4.update = updateDesempenho;
  // [H] 05 Ferramentas
  const s5 = section('ferramentas', '05', 'Indicadores e ferramentas');
  els.diag = toggle({key: 'diagnostic', label: 'Diagnóstico', sub: 'Colorir imagem', get: () => api.diagnostic, set: v => { api.diagnostic = v; if (lastSnap) { updateHeader(); updateSummaries(lastSnap); } },
   hint: 'Colore a imagem para confirmar que o tratamento está rodando. Não é salvo.'});
  els.measureStart = button('Iniciar medição', 'primary');
  els.measureExport = button('Encerrar e exportar medição');
  els.measureLine = h('div', {class: 'bxif-val bxif-status', 'data-bxif-out': 'measure'});
  els.measureMsg = 'Pronta'; els.measureAt = 0;
  // Awaitable handlers (the harness awaits .onclick()); disabled only while running and unfocused.
  const busy = async (b, fn) => {
   if (b._busy) return;
   b._busy = true; const lock = doc.activeElement !== b; if (lock) b.disabled = true;
   try { await fn(); } finally { b._busy = false; if (lock) b.disabled = false; updateMeasure(); if (lastSnap) updateSummaries(lastSnap); }
  };
  els.measureStart.onclick = () => busy(els.measureStart, async () => {
   if (await api.startMeasurement()) { els.measureAt = Date.now(); els.measureMsg = ''; } else els.measureMsg = 'Sem tratamento ativo para medir';
  });
  els.measureExport.onclick = () => busy(els.measureExport, async () => {
   const report = await api.exportMeasurement(); els.measureMsg = report ? 'Medição exportada' : 'Nenhuma medição em andamento'; els.measureAt = 0;
  });
  const measureRow = h('div', {class: 'bxif-row bxif-stack bxif-has-val', 'data-bxif-row': 'measure'}, labelCell('Medição').el, h('div', {class: 'bxif-ctl bxif-btns'}, els.measureStart, els.measureExport), els.measureLine,
   h('div', {class: 'bxif-hint', text: 'Grava tempos de GPU e ritmo; exporta um JSON. Não mede a latência do controle.'}));
  els.copyBox = h('textarea', {class: 'bxif-copy', readonly: '', rows: '6', tabIndex: -1, 'data-hide': '', 'aria-label': 'Configuração'});
  els.copy = button('Copiar configuração', null, async () => {
   const text = api.configText(); els.copyBox.value = text;
   if (await api.copyText(text)) flashLabel(els.copy, 'Configuração copiada', 'Copiar configuração');
   else { setT(els.copy._label, 'Copie o texto abaixo'); setA(els.copyBox, 'data-hide', null); els.copyBox.select(); }
  });
  els.reset = button('Restaurar tratamento', 'danger', onReset);
  els.reset.append(h('i', {class: 'bxif-count', 'aria-hidden': 'true'}));
  const toolRow = h('div', {class: 'bxif-row bxif-stack', 'data-bxif-row': 'tools'}, labelCell('Configuração').el, h('div', {class: 'bxif-ctl bxif-btns'}, els.copy, els.copyBox, els.reset),
   h('div', {class: 'bxif-hint', text: 'Volta o tratamento ao padrão medido. Os indicadores no jogo não mudam.'}));
  const about = subSection('como', 'Como funciona', [
   'Saída Auto: renderiza na altura real do vídeo na tela; em celulares usa FSR e aplica a nitidez no tamanho final; em HDMI 1080p fica nativa.',
   'Fluidez: processa cada quadro ao chegar e o exibe num relógio constante. Equilibrada segue o servidor; Máxima impõe 30/60 fixo.',
   'Captura direta: recebe os quadros do decodificador sem passar pelo elemento de vídeo, que mostra no máximo um quadro por atualização da tela.',
   'Suavidade: pede um alvo de buffer ao navegador, que pode ajustá-lo; mais regularidade com mais latência, sem atraso máximo garantido.',
   'Reconstrução neural (experimental): limpa blocos antes da nitidez; ~30% mais GPU. Degradês altos e Antialiasing suavizam textura.',
   'v9: padrões medidos em streams H.264 tipo xCloud. Tudo fica salvo para todos os jogos.'].map(t => h('p', {text: t})));
  s5.body.append(hud.row, els.corner.row, els.diag.row, measureRow, toolRow, about);
  s5.update = updateMeasure;
  for (const s of sections) { r.append(s.el); s.setOpen(!!ui.open[s.id]); }
  r.append(h('div', {class: 'bxif-foot-line', text: 'Salvo para todos os jogos · Tratamento de imagem ' + VERSION}));
  r.addEventListener('focusout', e => runDeferred(e.relatedTarget));
  // Held D-pad presses never set html[data-active-input]: any focus not caused by a pointer shows the ring.
  // Chromium's focus scroll ignores scroll-margin, so a control landing under the sticky selector is
  // scrolled again with block:'start', which honours it (after Better xCloud's focus(), same task).
  r.addEventListener('focusin', e => {
   if (performance.now() - lastPointer > 400) setNav('1');
   const t = e.target;
   queueMicrotask(() => {
    const sel = els.sticky;
    if (doc.activeElement !== t || !sel?.isConnected) return;
    const box = (t.closest('.bxif-seg,.bxif-slider,.bxif-sw,.bxif-chips') || t).getBoundingClientRect();
    if (box.top < sel.getBoundingClientRect().bottom + 8) t.scrollIntoView({block: 'start'});
   });
  });
  return r;
 }

 /* ------------------------------ transient labels ------------------------------ */
 const flashes = new Set();
 function flashLabel(b, text, back, ms = 2000) {
  setT(b._label, text);
  clearTimeout(b._flash); flashes.add(b);
  b._flash = setTimeout(() => { flashes.delete(b); b._flash = 0; setT(b._label, back); }, ms);
 }
 let resetTimer = 0;
 function disarm() { clearTimeout(resetTimer); resetTimer = 0; setA(els.reset, 'data-armed', null); setA(els.reset.lastChild, 'data-run', null); setT(els.reset._label, 'Restaurar tratamento'); }
 // Two presses within 4 s; focus stays on the button.
 function onReset() {
  if (!resetTimer) {
   if (els.reset._flash) { clearTimeout(els.reset._flash); flashes.delete(els.reset); els.reset._flash = 0; }
   setT(els.reset._label, 'Confirmar restauração'); setA(els.reset, 'data-armed', true);
   requestAnimationFrame(() => { if (resetTimer) setA(els.reset.lastChild, 'data-run', true); });
   resetTimer = setTimeout(disarm, 4000);
   return;
  }
  disarm();
  cancelPending();
  api.reset(); syncAll(); afterCommit('reset');
  flashLabel(els.reset, 'Tratamento restaurado', 'Restaurar tratamento');
 }

 /* =============================== Updates =============================== */
 function updateDependents() {
  const fl = valueOf('fluidity'), direct = api.directSupported();
  setDisabled(els.capture, fl === 'off' || !direct);
  els.capture.setReason(fl === 'off' ? 'Disponível com a Fluidez ligada.' : !direct ? 'Este navegador não permite a captura direta.' : '');
  setHidden(els.corner.row, valueOf('hud') === 'off');
  els.mode.lab.setTag(settings.mode !== 'filtered' ? 'Comparando' : '', 'ok');
  setT(els.sharp.hint, '0 desliga. 2–3 é o ponto medido; acima de 4 aumenta a cintilação em movimento.' + (settings.neural > 0 ? ' Com Reconstrução neural, use ~2,5.' : '') + (valueOf('scaler') === 'sgsr' ? ' Com SGSR, define a força dele (2 → 1,0).' : ''));
  const o = valueOf('output');
  setT(els.output.lab.tx, 'Resolução de saída' + (['auto', 'native', '1440', '2160'].includes(o) ? '' : ` (${o}p)`));
  setA(els.qp, 'data-hide', valueOf('adaptive') ? null : '');
  updateDesync();
  updatePreset();
 }
 // The canvas keeps the attribute it was created with: a change shows as pending until the next session.
 function updateDesync() {
  const want = !!valueOf('desynchronized'), now = status.desynchronized;
  if (now === null || now === undefined) setParts(els.desyncOut, want ? [['Aplicado ao abrir o próximo jogo.', 'lab']] : []);
  else if (now === want) setParts(els.desyncOut, want ? [['Ativo nesta sessão', 'good']] : []);
  else setParts(els.desyncOut, [[want ? 'Liga na próxima sessão (reabra o jogo ou recarregue).' : 'Desliga na próxima sessão (reabra o jogo ou recarregue).', 'lab']]);
 }
 function updatePreset(focused) {
  if (focused !== undefined) els.chipFocus = focused;
  const active = api.preset(), p = api.presets[active];
  for (const b of els.chips) setA(b, 'aria-pressed', String(b.dataset.preset === active));
  setT(els.presetPick, p ? p.label : '');
  els.presetLab.setTag(p ? '' : 'Personalizado');
  const f = els.chipFocus && api.presets[els.chipFocus];
  setT(els.presetDesc, f ? f.description : p ? p.description : 'Valores ajustados à mão. Escolha um perfil para voltar a um ponto medido.');
 }
 function updateHeader() { const w = stateWord(); setT(els.pillWord, w.word); setA(els.pill, 'data-g', w.grade); }
 // Errors first, then warnings with a fix one press away (they must never hide behind "+N"), then the
 // rest. The block is rebuilt only when the set of warnings changes; texts (e.g. the loss %) update in place.
 const ACTIONABLE = new Set(['output', 'renderer']);
 const warnRank = w => w.level === 'error' ? 4 : ACTIONABLE.has(w.key) ? 3 : w.level === 'warn' ? 2 : 1;
 function focusRenderer() {
  const row = root?.parentElement && [...root.parentElement.children].find(e => e.prefKey === 'video.player.type');
  if (!row) return;
  // Controller-friendly selects (Android app) hide the native <select>; Better xCloud points nearby.focus at its '>' button.
  const wrap = row.querySelector('.bx-select'), visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.x >= 0 || r.y >= 0); };
  const t = wrap?.nearby?.focus instanceof HTMLElement ? wrap.nearby.focus : [...row.querySelectorAll('*')].find(e => e.tabIndex >= 0 && !e.disabled && visible(e));
  t?.focus();
 }
 function updateWarnings(force) {
  const list = (status.warnings || []).slice().sort((a, b) => warnRank(b) - warnRank(a));
  const shown = els.warnsAll ? list : list.slice(0, 3);
  const sig = shown.map(w => w.key + ':' + w.level).join('|') + '|' + list.length + '|' + !!els.warnsAll;
  if (sig === els.warnSig) { for (const w of shown) { const t = els.warnText.get(w.key); if (t) setT(t, w.text); } return; }
  if (!force && els.warns.contains(doc.activeElement)) return;
  els.warnSig = sig; els.warnText = new Map();
  els.warns.textContent = ''; els.warnMore = null;
  setA(els.warns, 'data-hide', list.length ? null : '');
  for (const w of shown) {
   const text = h('span', {class: 'bxif-warn-text', text: w.text}); els.warnText.set(w.key, text);
   const tx = h('div', {class: 'bxif-warn-tx'}, text, WARN_HINT[w.key] ? h('span', {class: 'bxif-warn-hint', text: WARN_HINT[w.key]}) : null);
   let action = null;
   if (w.key === 'output') action = button('Usar Auto', 'sm', e => { commit('output', 'auto', e); syncAll(); });
   if (w.key === 'renderer') action = button('Ir para Renderizador', 'sm', focusRenderer);
   els.warns.append(h('div', {class: 'bxif-warn', 'data-level': w.level}, h('i', {class: 'bxif-badge', 'data-c': w.level === 'info' ? 'i' : '!', 'aria-hidden': 'true'}), tx, action));
  }
  if (list.length > 3) {
   const rest = list.length - 3;
   els.warnMore = button(els.warnsAll ? 'Mostrar menos' : rest === 1 ? 'Mostrar +1 aviso' : `Mostrar +${rest} avisos`, null, () => {
    els.warnsAll = !els.warnsAll; updateWarnings(true); els.warnMore?.focus({preventScroll: true});
   });
   els.warnMore.className = 'bxif-warn-more';
   els.warns.append(els.warnMore);
  }
 }
 function parseRes() { const m = /(\d+)\s*×\s*(\d+)\s*→\s*(\d+)\s*×\s*(\d+)/.exec(status.resolution || ''); return m ? {w: +m[1], h: +m[2], ow: +m[3], oh: +m[4]} : null; }
 const DEC_SHORT = {hardware: 'HW', software: 'CPU'};
 function netParts(s, parts) {
  const n = s.net;
  if (!n) return;
  const sep = () => { if (parts.length) parts.push([' · ', 'dim']); };
  if (n.codec) { sep(); parts.push([n.codec, null]); }
  if (DEC_SHORT[n.decoder]) { sep(); parts.push([DEC_SHORT[n.decoder], G('dec-kind', s.gDecoder)]); }
  if (num(n.bitrateMbps)) { sep(); parts.push([fmt(n.bitrateMbps, 1) + ' Mb/s', G('bitrate', s.gBitrate)]); }
  if (num(s.qp)) { sep(); parts.push(['QP ' + fmtInt(s.qp), G('qp', s.gQp)]); }
  if (num(n.lossPct)) { sep(); parts.push(['perda ' + fmt(n.lossPct, 1) + '%', G('loss', s.gLoss)]); }
 }
 function updateLive(s) {
  const k = els.k, on = s.on, p = s.p;
  const kp = (t, value, unit, g, subParts) => { setT(t.num, value); setT(t.unit, unit); setA(t.val, 'data-g', g); setA(t.dotWrap, 'data-g', g); setParts(t.sub, subParts); };
  kp(k.fps, on ? fmtInt(s.fps) : '—', '', on ? G('fps', s.gFps) : 'none', [['de ' + s.N, null]]);
  kp(k.pacing, on && p ? '±' + fmt(p.deviationMs, 1) : '—', on && p ? 'ms' : '', on && p ? G('dev', s.gDev) : 'none', [['p95 ', null], [on && p ? fmtMs(p.p95Ms) : '—', on && p ? G('p95', s.gP95) : 'none']]);
  kp(k.hitches, on && p ? String(p.hitches) : '—', '', on && p ? G('hit', s.gHit) : 'none',
   s.missed === null && s.direct ? [['captura direta', 'good']] : [['pulados ', null], [s.missed === null ? '—' : String(s.missed), G('miss', s.gMiss)]]);
  kp(k.latency, s.lat.total === null ? '—' : '≈' + fmtInt(s.lat.total), s.lat.total === null ? '' : 'ms', G('total', s.gTotal), [['rede ', null], [fmtMs(s.lat.rtt), G('rtt', s.gRtt)]]);
  drawSparkline(els.spark, status.intervals, {count: 240, T: s.T, dim: !on});
  setT(els.sparkT, fmt(s.T, 1) + ' ms');
  const parts = [];
  setA(els.meta, 'data-idle', !on && status.mode !== 'error' || null);
  if (status.mode === 'error') parts.push(['Erro: ' + (status.error || 'falha no tratamento'), 'bad']);
  else if (!on) { parts.push(['Sem quadros recentes do tratamento. Selecione WebGL2 durante o jogo para filtrar a imagem.', 'lab']); netParts(s, parts); if (parts[1]) parts.splice(1, 1); }
  else {
   const r = parseRes();
   if (r) parts.push([r.h + 'p', s.net?.height ? G('height', s.gHeight) : null], [' → ', 'dim'], [r.oh + 'p', null]);
   netParts(s, parts);
  }
  setParts(els.meta, parts);
 }
 const adaptiveApplying = () => settings.adaptive && settings.mode === 'filtered' && !!status.adaptive;
 function clock() { if (!els.measureAt) return ''; const t = Math.floor((Date.now() - els.measureAt) / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
 function updateSummaries(s) {
  const [s1, s2, s3, s4, s5] = sections;
  const fl = valueOf('fluidity'), p = s.p;
  const fParts = [[FLU[fl] || '', null]];
  if (s.on && p) { fParts.push([' · ±' + fmt(p.deviationMs, 1) + ' ms', null]); if (p.hitches > 0) fParts.push([` · ${p.hitches} trav.`, null]); }
  setParts(s1.sum, fParts); setA(s1.sum, 'data-g', s.on && p ? worst(G('dev', s.gDev), G('hit', s.gHit)) : null);
  const preset = api.presets[api.preset()];
  if (settings.mode !== 'filtered') { setParts(s2.sum, [['Comparando: ' + (settings.mode === 'cas' ? 'Só nitidez' : 'Original'), null]]); setA(s2.sum, 'data-g', 'ok'); }
  else { setParts(s2.sum, [[(preset ? preset.label : 'Personalizado') + ' · Nitidez ' + fmt(settings.sharpness, 1) + (settings.scaler === 'sgsr' ? ' · SGSR' : ''), null]]); setA(s2.sum, 'data-g', null); }
  const active = TREAT.filter(k => settings[k] > 0).length;
  setParts(s3.sum, [[`${active} de 7 ativos` + (adaptiveApplying() ? ' · adaptado' : ''), null]]);
  setParts(s4.sum, [['GPU ', null], [s.gpuShow === null ? '—' : (s.gpu === null ? '≈' : '') + fmtMs(s.gpuShow) + ' ms', G(s.gpu !== null ? 'gpu' : 'gpu-est', s.gGpuShow)], [' · Lat. ', null], [s.lat.total === null ? '—' : fmtInt(s.lat.total) + ' ms', G('total', s.gTotal)]]);
  if (api.measuring) { setParts(s5.sum, [['Medindo ' + (clock() || '…'), null]]); setA(s5.sum, 'data-g', 'ok'); }
  else if (api.diagnostic) { setParts(s5.sum, [['Diagnóstico ligado', null]]); setA(s5.sum, 'data-g', 'info'); }
  else { setParts(s5.sum, [['Indicadores: ' + ({off: 'desligados', compact: 'Compacto', full: 'Completo'}[settings.hud] || ''), null]]); setA(s5.sum, 'data-g', null); }
 }
 function updateFluidez(s) {
  const fl = valueOf('fluidity'), cap = s.cap, n = s.net;
  if (fl === 'off') setParts(els.captureOut, []);
  else if (cap.active) setParts(els.captureOut, [['Captura direta · ' + fmtThousands(cap.frames) + ' quadros', 'good']]);
  else if (valueOf('capture') === 'direct' && cap.reason) setParts(els.captureOut, [[cap.reason, /encerrado/i.test(cap.reason) ? 'lab' : 'ok']]);
  else if (valueOf('capture') === 'direct') setParts(els.captureOut, [['Captura direta: aguardando o vídeo', 'lab']]);
  else setParts(els.captureOut, [['Captura pelo vídeo', 'lab']]);
  setA(els.captureOut, 'data-hide', fl === 'off' || null);
  const sm = status.smoothing, req = sm ? sm.requestedMs : settings.smoothing;
  setParts(els.smoothOut, [['Buffer: ' + (req ? 'alvo ' + req + ' ms' + (sm && SMOOTH_STATE[sm.state] ? ' (' + SMOOTH_STATE[sm.state] + ')' : '') : 'automático') + ' · medido ', 'lab'],
   [n && num(n.bufferMs) ? fmtMs(n.bufferMs) + ' ms' : '—', G('buf', s.gBuf)]]);
  if (els.refresh) {
   const R = refreshNow(), parts = [[R > 0 ? `Fixada em ${R} Hz pelo app` : 'O sistema decide a taxa', 'lab']];
   if (R > 0 && R % s.N) parts.push([` · não é múltiplo de ${s.N} FPS`, 'ok']);
   setParts(els.refreshOut, parts);
   if (!els.refresh.row.contains(doc.activeElement)) els.refresh.sync();
  }
  const o = s.o, cellSet = (c, st, sub, key, g) => { setT(c.v, st ? '±' + fmt(st.deviationMs, 1) : '—'); setA(c.v, 'data-g', st ? G(key, g) : 'none'); setT(c.sub, sub); };
  cellSet(els.pipe.srv, o?.server, o?.server ? fmt(o.server.meanMs, 1) + ' ms' : '—', 'srv', s.gSrv);
  cellSet(els.pipe.arr, o?.arrival, o?.arrival ? fmt(o.arrival.meanMs, 1) + ' ms' : '—', 'arr', s.gArr);
  cellSet(els.pipe.scr, s.p, s.p ? 'p95 ' + fmtMs(s.p.p95Ms) : '—', 'dev', s.gDev);
  const p = s.p, pacing = [['Travadas ', 'lab'], [p ? String(p.hitches) : '—', p ? G('hit', s.gHit) : 'none']];
  if (s.missed === null && s.direct) pacing.push([' · Pulados ', 'lab'], ['0 (captura direta)', 'good']);
  else pacing.push([' · Pulados ', 'lab'], [s.missed === null ? '—' : String(s.missed), G('miss', s.gMiss)], [o && num(o.presented) ? ' de ' + o.presented : '', 'lab']);
  setParts(els.pacingLine, pacing);
  const f = s.fl;
  if (f) {
   const rate = s.dropRate;
   setParts(els.fluLine, [['Espera da Fluidez ', 'lab'], [num(f.extraMs) ? '+' + fmtMs(f.extraMs) + ' ms' : '—', G('wait', s.gWait)], [' · descartados ', 'lab'],
    [num(rate) ? fmtInt(rate) + '/min' : '—', G('drops', grade('drops', rate))]]);
  } else setParts(els.fluLine, []);
  setA(els.fluLine, 'data-hide', f ? null : '');
 }
 function updateNitidez(s) {
  setParts(els.outputOut, [[status.resolution || '—', null], [num(status.display) && status.display > 0 ? ' · vídeo na tela ' + status.display + 'p' : '', 'lab']]);
  setA(els.outputOut, 'data-hide', s.on && status.resolution ? null : '');
  const a = status.adaptive;
  if (!valueOf('adaptive')) { setParts(els.adaptiveOut, [['Desligado: usa os valores do Ajuste fino.', 'lab']]); setA(els.qpPos, 'data-hide', ''); return; }
  if (settings.mode !== 'filtered') setParts(els.adaptiveOut, [['Pausado durante a Comparação.', 'ok']]);
  else if (!a) setParts(els.adaptiveOut, [[status.net && num(status.net.bitrateMbps) && !num(status.net.qp) ? 'Este aparelho não informa o QP: estimando pela taxa de bits…' : 'Aguardando o QP do stream…', 'lab']]);
  else {
   const k = a.scales || {}, scales = [' → limpeza ×' + fmt(k.cleanup, 2) + ' · degradês ×' + fmt(k.deband, 2) + ' · detalhe ×' + fmt(k.detail, 2), 'lab'];
   if (a.source === 'bitrate') setParts(els.adaptiveOut, [['Estimado pela taxa de bits (sem QP neste aparelho): ', 'lab'], [fmt(a.bitsPerPixel, 2) + ' bit/pixel', null], [' ≈ QP ', 'lab'], [fmtInt(a.qpEstimate), G('qp', grade('qp', a.qpEstimate))], [' · nível ', 'lab'], [fmt(a.level, 1), null], scales]);
   else setParts(els.adaptiveOut, [['QP ', 'lab'], [fmtInt(a.qp), G('qp-now', grade('qp', a.qp))], [' · médio ', 'lab'], [fmt(a.qpMean, 1), G('qp', s.gQp)], [' · nível ', 'lab'], [fmt(a.level, 1), null], scales]);
  }
  const pos = a && num(a.qpMean) ? a.qpMean : a && num(a.qpEstimate) ? a.qpEstimate : null;
  if (pos !== null) { setA(els.qpPos, 'data-hide', null); setS(els.qpPos, 'transform', `translateX(${(Math.min(1, Math.max(0, (pos - 20) / 16)) * 100).toFixed(1)}%)`); }
  else setA(els.qpPos, 'data-hide', '');
 }
 function updateAjuste() {
  const applying = adaptiveApplying(), k = status.adaptive?.scales || {};
  for (const key of ['cleanup', 'deband', 'detail']) {
   const c = els.treat[key];
   if (applying && num(k[key])) {
    const eff = Math.min(1, settings[key] * k[key]);
    const same = Math.round(eff * 100) === Math.round(settings[key] * 100);
    setT(c.v2, '→ ' + Math.round(eff * 100) + '%'); setA(c.v2, 'data-hide', same ? '' : null);
    setS(c.ghost, '--nf', eff.toFixed(3)); setA(c.ghost, 'data-hide', same ? '' : null);
   } else { setA(c.v2, 'data-hide', ''); setA(c.ghost, 'data-hide', ''); }
  }
 }
 function updateDesempenho(s) {
  const L = settings.gpuBudget || 10, gpuG = G('gpu', s.gGpu);
  if (status.measurement === 'cadence' && s.on && s.gpuEst !== null) {
   // Fence estimate against the frame interval (33 ms at 30 FPS): an upper bound, it includes queued work.
   const T = 1000 / s.N, scaleMax = Math.max(2 * T, s.gpuEst), g = G('gpu-est', s.gGpuEst);
   setA(els.gpuMeter, 'data-hide', null);
   setT(els.gpuText, `≈${fmtMs(s.gpuEst)} ms de ${fmtInt(T)} ms por quadro`); setA(els.gpuText, 'data-g', g);
   setS(els.gpuFill, 'transform', `scaleX(${(s.gpuEst / scaleMax).toFixed(3)})`); setA(els.gpuFill, 'data-g', g);
   setS(els.gpuTick, 'transform', `translateX(${(T / scaleMax * 100).toFixed(1)}%)`);
   setT(els.gpuNote, 'Estimado (sem cronômetro de GPU neste navegador): até a GPU concluir o quadro, com a fila. A redução automática segue a cadência.'); setA(els.gpuNote, 'data-hide', null);
  } else if (status.measurement === 'cadence' && s.on) {
   setT(els.gpuText, '—'); setA(els.gpuText, 'data-g', 'none'); setS(els.gpuFill, 'transform', 'scaleX(0)'); setA(els.gpuMeter, 'data-hide', '');
   setT(els.gpuNote, 'Sem cronômetro de GPU neste navegador: adapta pela cadência.'); setA(els.gpuNote, 'data-hide', null);
  } else {
   const p95 = s.gpu, scaleMax = Math.max(2 * L, p95 || 0);
   setA(els.gpuMeter, 'data-hide', null);
   setT(els.gpuText, p95 === null ? '—' : `${fmtMs(p95)} ms de ${L} ms`); setA(els.gpuText, 'data-g', p95 === null ? 'none' : gpuG);
   setS(els.gpuFill, 'transform', `scaleX(${p95 === null ? 0 : (p95 / scaleMax).toFixed(3)})`); setA(els.gpuFill, 'data-g', gpuG);
   setS(els.gpuTick, 'transform', `translateX(${(L / scaleMax * 100).toFixed(1)}%)`);
   setA(els.gpuNote, 'data-hide', '');
  }
  setParts(els.adaptation, status.adaptation && s.on ? [['↓ ' + status.adaptation, 'ok']] : [['Nenhuma redução automática', 'dim']]);
  const lat = s.lat, flOn = valueOf('fluidity') !== 'off', segs = [lat.rtt, lat.buffer, lat.decode, lat.gpu, flOn ? lat.wait : 0];
  [...els.latBar.children].forEach((sp, i) => setS(sp, 'flex-grow', String(num(segs[i]) ? Math.max(0, +segs[i].toFixed(1)) : 0)));
  setT(els.latTotal, lat.total === null ? '—' : '≈' + fmtInt(lat.total) + ' ms'); setA(els.latTotal, 'data-g', G('total', s.gTotal));
  const legend = [[lat.rtt, 'rtt', s.gRtt], [lat.buffer, 'buf', s.gBuf], [lat.decode, 'dec', s.gDec], [s.gpu !== null ? s.gpu : s.gpuEst !== null ? lat.gpu : null, s.gpu !== null ? 'gpu' : 'gpu-est', s.gGpuShow], [s.fl ? s.fl.extraMs : null, 'wait', s.gWait]];
  legend.forEach(([v, key, g], i) => { setT(els.leg[i].v, num(v) ? fmtMs(v) + ' ms' : '—'); setA(els.leg[i].v, 'data-g', num(v) ? G(key, g) : 'none'); });
  setA(els.leg[4].row, 'data-hide', flOn ? null : '');
  const n = s.net;
  if (!n) { setParts(els.stream, [['Sem estatísticas do stream (abra um jogo).', 'lab']]); for (const el of [els.decoder, els.quality, els.drops]) setParts(el, []); return; }
  setParts(els.stream, [['Vídeo recebido ', 'lab'], [n.width && n.height ? n.width + '×' + n.height : '—', n.height ? G('height', s.gHeight) : 'none'], [' · ' + fmtInt(n.fpsReceived) + ' FPS · ' + (n.codec || '—'), null]]);
  setParts(els.decoder, [['Decodificação ', 'lab'], [{hardware: 'hardware', software: 'software (CPU)'}[n.decoder] || 'não informada', G('dec-kind', s.gDecoder)],
   [(n.implementation ? ' (' + n.implementation + ')' : '') + ' · ', null], [fmtMs(n.decodeMs) + ' ms', G('dec', s.gDec)]]);
  setParts(els.quality, [['Bitrate ', 'lab'], [num(n.bitrateMbps) ? fmt(n.bitrateMbps, 1) + ' Mb/s' : '—', G('bitrate', s.gBitrate)], [' · perda ', 'lab'], [num(n.lossPct) ? fmt(n.lossPct, 1) + '%' : '—', G('loss', s.gLoss)],
   ...(s.qpEst !== null ? [[' · QP ', 'lab'], ['≈' + fmtInt(s.qpEst) + ' (pela taxa de bits)', G('qp', grade('qp', s.qpEst))]] : [[' · QP ', 'lab'], [fmtInt(s.qp), G('qp', s.gQp)]])]);
  setParts(els.drops, [['Decodificador (1 s): ', 'lab'], [fmtInt(n.framesDropped) + ' descartados', n.framesDropped > 0 ? 'ok' : null], [' · ', 'lab'], [fmtInt(n.freezes) + ' congelamentos', n.freezes > 0 ? 'ok' : null]]);
 }
 function updateMeasure() {
  setT(els.measureStart._label, api.measuring ? 'Reiniciar medição' : 'Iniciar medição');
  setParts(els.measureLine, [[api.measuring ? 'Medindo · ' + (clock() || '…') : els.measureMsg || 'Pronta', api.measuring ? 'ok' : 'lab']]);
 }

 /* ------------------------------ Android refresh rate ------------------------------ */
 const refreshNow = () => { try { return Number(window.BxAndroid?.getRefreshRate?.()) || 0; } catch { return 0; } };
 const refreshRates = () => { try { return JSON.parse(window.BxAndroid.getRefreshRates()).map(Number).filter(v => v > 0); } catch { return []; } };
 // Added lazily after Suavidade on the first tick that sees the app bridge.
 function ensureRefreshRow() {
  if (els.refresh || !window.BxAndroid?.getRefreshRates) return;
  const values = [0, ...refreshRates()], cur = refreshNow();
  if (!values.includes(cur)) values.push(cur);
  let last = cur;
  els.refresh = choice({key: 'refreshRate', label: 'Taxa da tela', tag: 'APP', opts: values.map(v => [v, v ? v + ' Hz' : 'Sistema']), get: refreshNow,
   set: v => { if (v === last) return; last = v; try { window.BxAndroid.setRefreshRate(v); } catch {} verdict.dirty = true; },
   hint: () => '60 ou 120 Hz são múltiplos de 30/60 FPS e evitam tremulação; 90 Hz desalinha o ritmo.'});
  els.refreshOut = out('refresh'); els.refresh.row.append(els.refreshOut);
  els.smooth.row.after(els.refresh.row);
 }

 /* ------------------------------ verdict (section 01) ------------------------------ */
 const verdict = {shown: null, cand: null, action: null, dirty: true};
 function evaluate(s) {
  const fl = valueOf('fluidity'), act = (label, fn) => ({label, fn});
  const turnOn = act('Ligar Fluidez', e => commit('fluidity', 'balanced', e));
  if (!s.p) return {text: 'Sem dados de ritmo ainda.', g: 'none'};
  const D = s.gDev, S = s.gSrv, Ar = s.gArr, arBad = Ar === 'ok' || Ar === 'bad', dBad = D === 'ok' || D === 'bad', N = s.N;
  if (s.missed !== null && s.missed >= 3) {
   if (fl !== 'off' && valueOf('capture') === 'video' && api.directSupported()) return {text: 'Quadros pulados antes do tratamento: a captura direta evita isso.', g: 'bad', a: act('Usar captura direta', e => commit('capture', 'direct', e))};
   if (fl === 'off') return {text: 'Quadros pulados antes do tratamento: a Fluidez com captura direta evita isso.', g: 'bad', a: turnOn};
   return {text: 'Quadros pulados: a GPU está sem folga. Reduza a Resolução de saída ou o limite da GPU.', g: 'bad'};
  }
  // Frames dropped by the pacer are skipped content even when the interval on screen looks steady.
  if (fl !== 'off' && grade('drops', s.dropRate) === 'bad') {
   const a = valueOf('capture') === 'video' && api.directSupported() ? act('Usar captura direta', e => commit('capture', 'direct', e)) : fl === 'max' ? act('Usar Equilibrada', e => commit('fluidity', 'balanced', e)) : null;
   return {text: `A Fluidez está descartando quadros (${fmtInt(s.dropRate)}/min): eles chegam juntos demais.`, g: 'ok', a};
  }
  if (D === 'good' && s.p.hitches === 0) return {text: 'Ritmo estável.' + (arBad && fl !== 'off' ? ' A Fluidez está compensando a rede.' : ''), g: 'good'};
  const R = refreshNow();
  if (R > 0 && R % N) {
   const to = refreshRates().includes(120) ? 120 : 60;
   return {text: `Tela em ${R} Hz não é múltiplo de ${N} FPS: use 60 ou 120 Hz.`, g: 'ok', a: act(`Usar ${to} Hz`, () => { try { window.BxAndroid.setRefreshRate(to); } catch {} })};
  }
  if (S === 'bad') return {text: 'O jogo/servidor está irregular. A Fluidez Máxima uniformiza (com mais espera).', g: 'ok', a: fl !== 'max' ? act('Usar Máxima', e => commit('fluidity', 'max', e)) : null};
  if (arBad && dBad && fl === 'off') return {text: 'A rede está oscilando. A Fluidez Equilibrada corrige.', g: 'ok', a: turnOn};
  if (arBad && fl !== 'off' && settings.smoothing === 0 && s.p.hitches >= 1) return {text: 'Chegada irregular mesmo com a Fluidez: mais buffer ajuda.', g: 'ok', a: act('Suavidade 33 ms', e => commit('smoothing', 33, e))};
  if (fl !== 'off' && s.fl && num(s.fl.extraMs) && s.fl.extraMs > s.T)
   return {text: `Espera alta (+${fmtMs(s.fl.extraMs)} ms).` + (fl === 'max' ? ' A Equilibrada espera menos.' : ''), g: 'ok', a: fl === 'max' ? act('Usar Equilibrada', e => commit('fluidity', 'balanced', e)) : null};
  if (dBad && Ar === 'good') {
   if (fl === 'off') return {text: 'Oscilação no aparelho/tela. Ative a Fluidez.', g: 'ok', a: turnOn};
   return {text: 'Oscilação no aparelho/tela.' + (window.BxAndroid ? ' Fixe a tela em 60/120 Hz.' : ' Confira se a TV está em 60 Hz.'), g: 'ok'};
  }
  return {text: 'Ritmo oscilando.', g: 'ok'};
 }
 // New verdicts commit after 2 identical evaluations 2 s apart; settings changes re-evaluate at once.
 function updateVerdict(s, force) {
  const r = evaluate(s), key = r.text + '|' + (r.a ? r.a.label : '');
  if (!force && verdict.shown !== null && key !== verdict.shown && verdict.cand !== key) { verdict.cand = key; return; }
  verdict.cand = null;
  if (verdict.shown === key) return;
  const b = els.verdictBtn;
  // Keep a focused suggestion until focus leaves it (focusout marks the verdict dirty).
  if (doc.activeElement === b && !r.a) return;
  verdict.shown = key;
  setT(els.verdictTx, r.text); setA(els.verdict, 'data-g', r.g);
  verdict.action = r.a ? e => { cancelPending(); r.a.fn(e); syncAll(); verdict.dirty = true; } : null;
  if (r.a) { setT(b._label, r.a.label); b.tabIndex = 0; setA(b, 'data-off', null); }
  else whenUnfocused(b, () => { b.tabIndex = -1; setA(b, 'data-off', true); });
 }

 /* ------------------------------ native row, sticky, canvas, tier ------------------------------ */
 function muteNative() {
  try {
   const row = root?.parentElement && [...root.parentElement.children].find(e => e.prefKey === 'video.processing.sharpness');
   row?.classList.toggle('bxif-native-muted', api.nativePref('video.player.type') === 'webgl2');
  } catch {}
 }
 function readSticky() {
  try {
   // The sticky game selector, plus its tips line when Better xCloud shows it (per-game profile).
   const sel = els.sticky = (root.closest('.bx-settings-tab-contents') || doc).querySelector('.bx-stream-settings-selection:not(.bx-gone)');
   const tips = sel?.querySelector(':scope > p:not(.bx-gone)');
   root.style.setProperty('--bxif-sticky', (sel ? sel.offsetHeight + (tips ? tips.offsetHeight : 0) + 8 : 0) + 'px');
  } catch {}
 }
 const MQ = {phone: '(max-height:500px)', couch: '(min-height:900px)'};
 let mqs = null;
 function tierNow() { try { return matchMedia(MQ.phone).matches ? 'phone' : matchMedia(MQ.couch).matches ? 'couch' : 'regular'; } catch { return 'regular'; } }
 function watchTier() {
  if (mqs) return;
  const on = () => { if (root) root.dataset.tier = tierNow(); resizeSpark(); };
  try { mqs = [matchMedia(MQ.phone), matchMedia(MQ.couch)]; for (const m of mqs) m.addEventListener('change', on); } catch { mqs = []; }
  watchDpr(resizeSpark);
 }
 let sparkSize = null, ro = null;
 function resizeSpark() {
  if (!sparkSize || !els.spark) return;
  sizeCanvas(els.spark, sparkSize.w, sparkSize.h);
  if (lastSnap) drawSparkline(els.spark, status.intervals, {count: 240, T: lastSnap.T, dim: !lastSnap.on});
 }
 function watchSpark() {
  if (ro || typeof ResizeObserver !== 'function') return;
  ro = new ResizeObserver(entries => {
   const r = entries[entries.length - 1].contentRect;
   if (!r.width || !r.height) return;
   sparkSize = {w: r.width, h: r.height}; resizeSpark();
  });
  ro.observe(els.spark);
 }

 /* ------------------------------ lifecycle ------------------------------ */
 let timer = 0, visible = false, tickN = 0, io = null;
 function refresh() {
  tickN++;
  G.tick();
  runDeferred(doc.activeElement);
  const s = lastSnap = snapshot();
  s.dropRate = drops.push(s.fl ? s.fl.dropped : null);
  if (tickN % 4 === 0 && sigOf() !== lastSig) syncAll(true);
  ensureRefreshRow(); muteNative();
  updateHeader(); updateWarnings(); updateLive(s); updateSummaries(s);
  if (tickN % 4 === 1 || verdict.dirty) { updateVerdict(s, verdict.dirty || verdict.shown === null); verdict.dirty = false; }
  for (const sec of sections) if (sec.open && sec.update) sec.update(s);
 }
 // 2 Hz while the panel is on screen; nothing runs while it is scrolled away, hidden or removed.
 function loop() {
  timer = 0;
  if (!visible) return;
  if (!root.isConnected) { stop(); return; }
  timer = setTimeout(loop, 500);
  try { refresh(); } catch (error) { console.warn('[BxImageFilter panel]', error); }
 }
 function start() {
  if (visible) return;
  visible = true; api.panelOpen = true;
  readSticky(); watchSpark();
  loop();
 }
 function stop() {
  visible = false; api.panelOpen = false;
  clearTimeout(timer); timer = 0;
  for (const k of [...pending.keys()]) flush(k);
  for (const b of flashes) { clearTimeout(b._flash); b._flash = 0; }
  flashes.clear();
  if (els.copy) setT(els.copy._label, 'Copiar configuração');
  if (resetTimer) disarm(); else if (els.reset) setT(els.reset._label, 'Restaurar tratamento');
  ro?.disconnect(); ro = null;
 }
 function observe() {
  io?.disconnect();
  if (typeof IntersectionObserver !== 'function') { start(); return; }
  io = new IntersectionObserver(entries => {
   const e = entries[entries.length - 1];
   if (e.isIntersecting && root.isConnected) start(); else stop();
  });
  io.observe(root);
 }
 // Input method: the focus ring only for keyboard/gamepad (Better xCloud sets html[data-active-input]).
 let watching = false, lastPointer = -1e9;
 function watchInput() {
  if (watching) return;
  watching = true;
  window.addEventListener('pointerdown', () => { lastPointer = performance.now(); setNav('0'); }, {capture: true, passive: true});
  window.addEventListener('keydown', () => setNav('1'), true);
  try { new MutationObserver(() => setNav('1')).observe(doc.documentElement, {attributes: true, attributeFilter: ['data-active-input']}); } catch {}
  window.addEventListener('pagehide', () => { stop(); io?.disconnect(); io = null; });
  window.addEventListener('pageshow', e => { if (e.persisted && root?.isConnected) observe(); });
 }
 // Called by Better xCloud each time it renders the Display tab (also after it rebuilds the menu).
 function mount(parent) {
  ensureStyle('panel', CSS);
  if (!root) { root = build(); syncAll(); }
  const anchor = [...parent.children].find(e => e.prefKey === 'video.player.type');
  const h2 = anchor ? null : [...parent.querySelectorAll(':scope > h2')].pop();
  if (anchor) anchor.after(root); else if (h2) h2.after(root); else parent.append(root);
  nav = doc.documentElement.hasAttribute('data-active-input') ? '1' : '0'; root.dataset.nav = nav;
  root.dataset.tier = tierNow();
  watchInput(); watchTier();
  stop(); syncAll();
  observe();
  requestAnimationFrame(muteNative);
 }
 // timers(): timers this panel holds right now (the harness checks it drops to 0 after removal).
 api.panel = {mount, timers: () => (timer ? 1 : 0) + pending.size + flashes.size + (resetTimer ? 1 : 0)};
})();

// In-game HUD: small translucent indicators over the game while playing. Reads window.BxImageFilter
// through api.ui (panel.js); never focusable, never takes pointer events, updates at 2 Hz, and with
// settings.hud 'off' nothing exists and no timer runs.
(() => {
 const api = window.BxImageFilter, settings = api.settings, status = api.status, doc = document, ui = api.ui;
 if (!ui) { api.hud = {update() {}, timers: () => 0}; return; }
 const {fmt, fmtMs, fmtInt, grade, createHysteresis, dropRate, drawSparkline, sizeCanvas, stateWord, snapshot, ensureStyle, LEVEL} = ui;
 const CSS = `
.bxif-hud{--s:1;--bxif-ixl:max(16px,2.5vw);--bxif-ixr:max(16px,2.5vw);--bxif-iyt:max(16px,2.5vh);--bxif-iyb:max(16px,2.5vh);
 --hg-good:#4fe0d2;--hg-ok:#ffd666;--hg-bad:#ff7b86;--hg-info:#8fb6ff;--hg-none:#9aa0aa;--hl:#b3b9c3;
 position:fixed;z-index:1900;display:none;box-sizing:border-box;margin:0;pointer-events:none;user-select:none;-webkit-user-select:none;
 contain:layout paint style;will-change:transform;
 padding:calc(4px*var(--s)) calc(7px*var(--s));border-radius:calc(6px*var(--s));
 background:rgba(10,11,13,.8);border:1px solid rgba(255,255,255,.08);color:#f3f5f8;text-shadow:0 1px 1px rgba(0,0,0,.7);
 font:400 calc(11.5px*var(--s))/1 Bahnschrift,"Roboto Condensed","sans-serif-condensed","Arial Narrow",sans-serif;font-stretch:87.5%;
 font-variant-numeric:tabular-nums lining-nums;letter-spacing:normal;text-align:left;text-transform:none;white-space:nowrap}
.bxif-hud *{box-sizing:border-box}
@media (min-height:640px){.bxif-hud{--s:1.35}}
@media (min-height:1000px){.bxif-hud{--s:1.6}}
@media (max-height:500px){.bxif-hud{--bxif-ixl:max(8px,env(safe-area-inset-left));--bxif-ixr:max(8px,env(safe-area-inset-right));--bxif-iyt:max(8px,env(safe-area-inset-top));--bxif-iyb:max(8px,env(safe-area-inset-bottom))}}
.bxif-hud[data-show]{display:block;animation:bxif-hud-in .15s ease-out}
/* Overall state on the frame, apart from the FPS mark. */
.bxif-hud[data-overall=ok]{border-color:rgba(255,214,102,.55)}.bxif-hud[data-overall=bad]{border-color:rgba(255,123,134,.7)}
.bxif-hud[data-calm]{opacity:.6;transition:opacity .3s}
.bxif-hud[data-hiding]{opacity:0;transition:opacity .15s}
@keyframes bxif-hud-in{from{opacity:0}}
.bxif-hud[data-pos$=left]{left:calc(var(--bxif-ixl) + var(--bxif-gx,0px))}
.bxif-hud[data-pos$=right]{right:calc(var(--bxif-ixr) + var(--bxif-gx,0px))}
.bxif-hud[data-pos^=top]{top:max(var(--bxif-iyt),var(--bxif-top,0px))}
.bxif-hud[data-pos^=bottom]{bottom:var(--bxif-iyb)}
.bxif-hud [data-off]{display:none!important}
.bxif-hud [data-g=ok]{color:var(--hg-ok)}.bxif-hud [data-g=bad]{color:var(--hg-bad)}.bxif-hud [data-g=info]{color:var(--hg-info)}.bxif-hud [data-g=none]{color:var(--hg-none)}
.bxif-h-dot{flex:none;display:inline-block;width:calc(7px*var(--s));height:calc(7px*var(--s));border-radius:50%;background:var(--hg-none)}
.bxif-h-dot[data-g=good]{background:var(--hg-good)}.bxif-h-dot[data-g=ok]{background:var(--hg-ok);border-radius:1px;transform:rotate(45deg) scale(.82)}
.bxif-h-dot[data-g=bad]{background:var(--hg-bad);width:calc(8px*var(--s));border-radius:0;clip-path:polygon(50% 0,100% 100%,0 100%)}
.bxif-h-dot[data-g=info]{background:none;box-shadow:inset 0 0 0 calc(1.75px*var(--s)) var(--hg-info)}
.bxif-h-dot[data-g=none]{background:none;box-shadow:inset 0 0 0 calc(1.25px*var(--s)) var(--hg-none)}
.bxif-h-k{font-size:calc(9.5px*var(--s));font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--hl)}
.bxif-h-v{font-weight:600}
.bxif-h-s{font-size:calc(10.5px*var(--s));font-weight:500;color:var(--hl)}
.bxif-h-fps{font-size:calc(15px*var(--s));font-weight:700;min-width:3ch;text-align:right;letter-spacing:-.01em}
.bxif-h-tag{font-size:calc(9.5px*var(--s));font-weight:700;letter-spacing:.06em;line-height:1;padding:calc(1.5px*var(--s)) calc(3px*var(--s)) calc(1px*var(--s));border:1px solid currentColor;border-radius:calc(3px*var(--s))}
.bxif-h-badge{flex:none;display:inline-block;min-width:calc(14px*var(--s));height:calc(14px*var(--s));padding:0 calc(3px*var(--s));border-radius:calc(4px*var(--s));
 font-size:calc(10px*var(--s));font-weight:800;line-height:calc(14px*var(--s));text-align:center;text-shadow:none;color:#101114!important;background:var(--hg-ok)}
.bxif-h-badge[data-g=bad]{background:var(--hg-bad)}.bxif-h-badge[data-g=info]{background:var(--hg-info)}
.bxif-h-spark{display:block;flex:none}
.bxif-h-chip{display:inline-block;font-size:calc(10px*var(--s));font-weight:700;letter-spacing:.04em;line-height:1;padding:calc(2px*var(--s)) calc(4px*var(--s));border-radius:calc(3px*var(--s));background:rgba(255,123,134,.16);color:var(--hg-bad)}
/* card (compact) */
.bxif-h-l1,.bxif-h-l2,.bxif-h-l3{display:flex;align-items:center;gap:calc(5px*var(--s))}
.bxif-h-l1{height:calc(18px*var(--s))}
.bxif-h-l1>.bxif-h-k{margin-left:calc(-2px*var(--s))}
.bxif-h-l1>.bxif-h-spark{width:calc(56px*var(--s));height:calc(12px*var(--s));margin:0 0 0 auto;padding-left:calc(3px*var(--s))}
.bxif-h-l2{height:calc(14px*var(--s));gap:calc(3px*var(--s))}
.bxif-h-l2>.bxif-h-v{text-align:right;margin-right:calc(4px*var(--s))}.bxif-h-l2>.bxif-h-v:last-child{margin-right:0}
.bxif-h-l3{height:calc(17px*var(--s));padding-top:calc(3px*var(--s));gap:calc(4px*var(--s))}
/* lateral (compact inside the letterbox bar) */
.bxif-hud[data-layout=lateral]{width:var(--bxif-w,68px);padding:calc(6px*var(--s)) calc(4px*var(--s));background:rgba(10,11,13,.55);text-align:center}
.bxif-h-col .bxif-h-s{font-size:calc(9.5px*var(--s))}
.bxif-hud[data-layout=lateral][data-pos$=left]{left:var(--bxif-lx,4px)}
.bxif-hud[data-layout=lateral][data-pos$=right]{right:var(--bxif-lx,4px)}
.bxif-hud[data-layout=lateral][data-pos^=top]{top:max(8px,env(safe-area-inset-top),var(--bxif-top,0px))}
.bxif-hud[data-layout=lateral][data-pos^=bottom]{bottom:max(8px,env(safe-area-inset-bottom),var(--bxif-gy,0px))}
.bxif-h-col{display:flex;flex-direction:column;align-items:center;gap:calc(2px*var(--s))}
.bxif-h-col>div{display:flex;align-items:center;justify-content:center;gap:calc(4px*var(--s))}
.bxif-h-col .bxif-h-fps{min-width:0}
.bxif-h-col>.bxif-h-spark{height:calc(12px*var(--s));margin:calc(3px*var(--s)) 0}
.bxif-h-col>.bxif-h-cap{margin-top:calc(3px*var(--s))}
/* full */
.bxif-hud[data-layout=full]{width:calc(236px*var(--s));padding:calc(6px*var(--s)) calc(8px*var(--s)) calc(4px*var(--s))}
.bxif-h-head{display:flex;align-items:center;gap:calc(5px*var(--s));height:calc(18px*var(--s))}
.bxif-h-word{flex:1;min-width:0;overflow:hidden;font-size:calc(9.5px*var(--s));font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--hg-good)}
.bxif-h-big{font-size:calc(16px*var(--s));font-weight:700;min-width:3ch;text-align:right}
.bxif-hud[data-layout=full] .bxif-h-spark{width:calc(220px*var(--s));height:calc(24px*var(--s));margin:calc(3px*var(--s)) 0 calc(4px*var(--s))}
.bxif-h-grp{border-top:1px solid rgba(255,255,255,.10);padding:calc(2px*var(--s)) 0}
.bxif-h-row{display:flex;align-items:center;height:calc(14px*var(--s));min-width:0}
.bxif-h-row>.bxif-h-k{flex:none;width:calc(62px*var(--s))}
.bxif-h-val{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.bxif-h-bar{flex:none;display:flex;gap:1px;width:calc(72px*var(--s));height:calc(5px*var(--s));margin-left:auto;border-radius:1px;overflow:hidden;background:rgba(255,255,255,.08)}
.bxif-h-bar>i{flex:0 1 0;min-width:0}
.bxif-h-bar>i:nth-child(1){background:#d7dbe2}.bxif-h-bar>i:nth-child(2){background:#a9afba}.bxif-h-bar>i:nth-child(3){background:#7c8391}.bxif-h-bar>i:nth-child(4){background:#565c68}
.bxif-h-bar>i:nth-child(5){background:repeating-linear-gradient(45deg,#a9afba 0 2px,transparent 2px 4px)}
.bxif-h-leg{display:block;height:calc(13px*var(--s));line-height:calc(13px*var(--s));padding-left:calc(62px*var(--s));font-size:calc(10px*var(--s));overflow:hidden}
.bxif-h-warn{display:flex;align-items:center;gap:calc(5px*var(--s));height:calc(17px*var(--s));min-width:0}
.bxif-h-warn>.bxif-h-val{font-weight:500;font-size:calc(10.5px*var(--s))}
@media (prefers-reduced-motion:reduce){.bxif-hud,.bxif-hud *{transition:none!important;animation:none!important}}
`;
 const STEP = 500, WATCH = 1000, CHIPS = 2;
 const RANK = v => v === 'bad' ? 3 : v === 'ok' ? 2 : v === 'good' || v === 'info' ? 1 : 0;
 const num = v => typeof v === 'number' && Number.isFinite(v);
 // HUD scale (--s) from the same media queries as the CSS.
 const scaleNow = () => { try { return matchMedia('(min-height:1000px)').matches ? 1.6 : matchMedia('(min-height:640px)').matches ? 1.35 : 1; } catch { return 1; } };

 let el = null, f = null, built = '', showing = false, n = 0, calm = 0, s = 1, safe = null, lastNet = null, lastNetAt = 0;
 let watchTimer = 0, loopTimer = 0, fadeTimer = 0, mqs = [], dprOff = null, layoutDirty = true;
 const G = createHysteresis(), drops = dropRate();

 // A field is a span holding one Text node; writes happen only when its text or grade changed.
 // In the HUD good values stay white: only ok/bad/info/none get a color.
 const E = (tag, cls, ...kids) => { const e = doc.createElement(tag); if (cls) e.className = cls; for (const k of kids) e.append(k); return e; };
 function field(cls = 'bxif-h-v', initial = '—') { const t = doc.createTextNode(initial); return {e: E('span', cls, t), t, g: undefined}; }
 const lab = text => E('span', 'bxif-h-k', text), sub = text => E('span', 'bxif-h-s', text);
 function put(x, text, g) {
  if (x.t.data !== text) x.t.data = text;
  const v = g && g !== 'good' ? g : null;
  if (x.g !== v) { x.g = v; if (v) x.e.setAttribute('data-g', v); else x.e.removeAttribute('data-g'); }
 }
 function attr(e, k, v) { const c = e._bxifH || (e._bxifH = {}); if (c[k] === v) return; c[k] = v; if (v === null || v === false || v === undefined) e.removeAttribute(k); else e.setAttribute(k, v === true ? '' : v); }
 function prop(e, k, v) { const c = e._bxifP || (e._bxifP = {}); if (c[k] !== v) { c[k] = v; e.style.setProperty(k, v); } }
 const off = (e, flag) => attr(e, 'data-off', !!flag);
 function dot() { const e = E('i', 'bxif-h-dot'); return {e, set(g) { attr(e, 'data-g', g || 'none'); }}; }
 const minCh = (x, ch) => { x.e.style.display = 'inline-block'; x.e.style.minWidth = ch + 'ch'; return x; };

 function buildCard() {
  const d = dot(), fps = field('bxif-h-fps'), tag = field('bxif-h-tag', ''), badge = field('bxif-h-badge', ''), cv = E('canvas', 'bxif-h-spark');
  off(tag.e, true); off(badge.e, true);
  const rit = minCh(field(), 4), trav = minCh(field(), 2), lat = minCh(field(), 3);
  const chips = [field('bxif-h-chip', ''), field('bxif-h-chip', '')], l3 = E('div', 'bxif-h-l3', chips[0].e, chips[1].e);
  off(l3, true);
  el.append(E('div', 'bxif-h-l1', d.e, fps.e, lab('FPS'), tag.e, cv, badge.e), E('div', 'bxif-h-l2', lab('RIT'), rit.e, lab('TRAV'), trav.e, lab('LAT'), lat.e), l3);
  return {kind: 'card', dot: d, fps, tag, badge, cv, rit, trav, lat, chips, chipEls: chips.map(c => c.e), l3, spark: {count: 60, w: 56, h: 12}};
 }
 function buildLateral(w, full) {
  const d = dot(), fps = field('bxif-h-fps'), tag = field('bxif-h-tag', ''), badge = field('bxif-h-badge', ''), cv = E('canvas', 'bxif-h-spark');
  const rit = field(), trav = field(), lat = field(), chips = [field('bxif-h-chip', ''), field('bxif-h-chip', '')];
  const line = (...kids) => E('div', null, ...kids), cap = text => { const e = line(lab(text)); e.className = 'bxif-h-cap'; return e; };
  const chipRows = chips.map(c => line(c.e)), badgeRow = line(badge.e), tagRow = line(tag.e);
  for (const e of [...chipRows, badgeRow, tagRow]) off(e, true);
  const sw = Math.max(20, w - 12);
  cv.style.width = sw + 'px';
  // Completo on the phone: the same column with every indicator, still inside the black bar.
  let extra = null;
  const rows = [cap('RIT'), line(rit.e)];
  if (full) {
   extra = {p95: field(), desc: field(), wait: field(), br: field(), qp: field(), loss: field()};
   extra.descRows = [cap('DESC/MIN'), line(extra.desc.e)]; extra.waitRows = [cap('ESPERA'), line(extra.wait.e)];
   rows.push(line(sub('p95 '), extra.p95.e), cap('TRAV'), line(trav.e), ...extra.descRows, ...extra.waitRows, cap('LAT'), line(lat.e),
    cap('MB/S'), line(extra.br.e), cap('QP'), line(extra.qp.e), cap('PERDA'), line(extra.loss.e));
  } else rows.push(cap('TRAV'), line(trav.e), cap('LAT'), line(lat.e));
  el.append(E('div', 'bxif-h-col', line(d.e, fps.e), line(lab('FPS')), cv, ...rows, ...chipRows, badgeRow, tagRow));
  return {kind: 'lateral', dot: d, fps, tag, badge, cv, rit, trav, lat, chips, chipEls: chipRows, badgeEl: badgeRow, tagEl: tagRow, extra, spark: {count: 60, w: sw / s, h: full ? 16 : 12}};
 }
 function buildFull() {
  const d = dot(), word = field('bxif-h-word', ''), fps = field('bxif-h-big'), cv = E('canvas', 'bxif-h-spark');
  const dev = field(), devUnit = sub(' ms · p95 '), p95 = field(), hit = field(), missParts = [sub(' · pul '), null], miss = field(), descParts = [sub(' · desc '), null, sub('/min')], desc = field();
  missParts[1] = miss.e; descParts[1] = desc.e;
  const wait = field(), capSep = sub(' · '), cap = field();
  const total = field(), bar = E('span', 'bxif-h-bar', E('i'), E('i'), E('i'), E('i'), E('i'));
  const leg = ['R', 'B', 'D', 'T', 'E'].map((k, i) => ({k: sub((i ? ' · ' : '') + k + ' '), v: field()}));
  const vin = field(), vout = field(), codec = field('bxif-h-s', ''), dec = field();
  const br = field(), qp = field(), loss = field();
  const wbadge = field('bxif-h-badge', ''), wtext = field('bxif-h-val', '');
  const row = (k, ...kids) => E('div', 'bxif-h-row', lab(k), E('span', 'bxif-h-val', ...kids));
  const warn = E('div', 'bxif-h-grp', E('div', 'bxif-h-warn', wbadge.e, wtext.e));
  off(warn, true);
  const legEl = E('div', 'bxif-h-leg'), videoRow = row('Vídeo', vin.e, sub('→'), vout.e, sub(' · '), codec.e, sub(' · '), dec.e);
  // Without a black bar on the phone the card stays short: no latency legend or video row.
  if (s === 1) { off(legEl, true); off(videoRow, true); }
  for (const x of leg) legEl.append(x.k, x.v.e);
  el.append(E('div', 'bxif-h-head', d.e, word.e, fps.e, lab('FPS')), cv,
   E('div', 'bxif-h-grp', row('Ritmo', dev.e, devUnit, p95.e), row('Quadros', sub('trav '), hit.e, ...missParts, ...descParts), row('Fluidez', wait.e, capSep, cap.e)),
   E('div', 'bxif-h-grp', E('div', 'bxif-h-row', lab('Latência'), total.e, bar), legEl),
   E('div', 'bxif-h-grp', videoRow, row('Rede', br.e, sub(' Mb/s · QP '), qp.e, sub(' · perda '), loss.e)),
   warn);
  return {kind: 'full', dot: d, word, fps, cv, dev, p95, hit, miss, missParts, desc, descParts, wait, capSep, cap, total, bar, leg, vin, vout, codec, dec, br, qp, loss, warn, wbadge, wtext,
   spark: {count: 240, w: 220, h: 24}};
 }

 /* ------------------------------ layout and placement ------------------------------ */
 // Safe-area insets (notch/cutout) from a probe, read once and after a resize.
 function readSafe() {
  const p = E('div');
  p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
  doc.documentElement.append(p);
  const cs = getComputedStyle(p);
  safe = {left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0};
  p.remove();
 }
 // Compact on the phone moves into the black bar beside a letterboxed video (16:9 or the chosen ratio).
 function lateral() {
  if (settings.hud === 'off' || s !== 1) return null;
  const pref = api.nativePref('video.ratio');
  if (pref === 'fill') return null;
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(pref || ''), ratio = m ? m[1] / m[2] : 16 / 9;
  if (!safe) readSafe();
  const bar = (window.innerWidth - window.innerHeight * ratio) / 2, inset = String(settings.hudPosition).endsWith('left') ? safe.left : safe.right, usable = bar - inset;
  if (!(usable >= 60)) return null;
  const w = Math.round(Math.min(76, Math.max(56, usable - 8)));
  return {w, x: Math.round(inset + (usable - w) / 2)};
 }
 function sizeSpark() { if (f) sizeCanvas(f.cv, f.spark.w * s, f.spark.h * s); }
 // Rebuilds the inner DOM only when the mode or layout changed.
 function relayout() {
  layoutDirty = false;
  s = scaleNow();
  const lat = lateral(), want = lat ? 'lateral:' + lat.w + ':' + settings.hud : settings.hud === 'full' ? 'full' : 'card';
  attr(el, 'data-mode', settings.hud); attr(el, 'data-pos', settings.hudPosition);
  if (lat) { prop(el, '--bxif-w', lat.w + 'px'); prop(el, '--bxif-lx', lat.x + 'px'); }
  if (want === built) { sizeSpark(); return; }
  built = want; el.textContent = ''; G.reset();
  f = lat ? buildLateral(lat.w, settings.hud === 'full') : want === 'full' ? buildFull() : buildCard();
  attr(el, 'data-layout', f.kind);
  sizeSpark();
 }
 // Every 2 s at the start of a tick, before any write: below Better xCloud's stats bar when they
 // would overlap, and clear of its game bar in a bottom corner.
 function place() {
  const pos = settings.hudPosition, bar = pos.startsWith('top') ? doc.querySelector('.bx-stats-bar:not(.bx-gone)') : null, gb = doc.getElementById('bx-game-bar');
  let top = 0;
  if (bar) { const b = bar.getBoundingClientRect(), me = el.getBoundingClientRect(); if (b.width && b.height && b.left < me.right && b.right > me.left) top = Math.ceil(b.bottom + 4); }
  // The game bar (40×90 at the screen edge) sits in the letterbox bar too: the lateral column goes above it.
  const clash = gb && gb.getAttribute('data-position') === pos, lat = f?.kind === 'lateral';
  prop(el, '--bxif-top', top + 'px'); prop(el, '--bxif-gx', (clash && !lat ? 48 : 0) + 'px'); prop(el, '--bxif-gy', (clash && lat ? 98 : 0) + 'px');
 }

 /* ------------------------------ render ------------------------------ */
 const DEC = {hardware: 'HW', software: 'CPU'};
 function render() {
  n++;
  if (n % 4 === 1) place();
  if (layoutDirty) relayout();
  G.tick();
  const x = snapshot(), on = x.on, p = x.p, w = stateWord(), net = x.net;
  const overall = G('overall', x.overall), fpsG = G('fps', x.gFpsAny), devG = on && p ? G('dev', x.gDev) : 'none', hitG = on && p ? G('hit', x.gHit) : 'none';
  const totalG = G('total', x.gTotal), missG = G('miss', x.gMiss), warnG = x.warnCount ? G('warn', x.gWarn) : 'none';
  f.dot.set(f.kind === 'full' ? w.grade : fpsG);
  attr(el, 'data-overall', RANK(overall) > 1 ? overall : null);
  put(f.fps, fmtInt(x.fpsAny), fpsG);
  drawSparkline(f.cv, status.intervals, {count: f.spark.count, T: x.T, dim: !on, scale: s, ok: '#ffd666', bad: '#ff7b86'});
  const rate = drops.push(x.fl ? x.fl.dropped : null);
  let look = RANK(overall) > 1 || x.warnCount > 0 || [devG, hitG, totalG, fpsG, missG].some(v => RANK(v) > 1);
  if (f.kind !== 'full') {
   put(f.rit, on && p ? '±' + fmt(p.deviationMs, 1) : '—', devG);
   put(f.trav, on && p ? String(p.hitches) : '—', hitG);
   put(f.lat, x.lat.total === null ? '—' : fmtInt(x.lat.total), totalG);
   put(f.tag, w.tag, w.grade); off(f.tagEl || f.tag.e, !w.tag);
   put(f.badge, x.warnCount ? '!' + x.warnCount : '', warnG); off(f.badgeEl || f.badge.e, !x.warnCount);
   // Line 3: at most two alerts, bad ones only, in priority order. An alert needs the bad grade on two
   // ticks to appear and leaves as soon as the value is back to good (never "PERDA 0,0%" in red).
   const alerts = [], add = (key, raw, text) => { if (!f.extra && G(key, raw) === 'bad' && raw !== 'good' && raw !== 'none' && alerts.length < CHIPS) alerts.push(text); };
   if (f.extra) {
    const e = f.extra, flOn = settings.fluidity !== 'off';
    put(e.p95, on && p ? fmtMs(p.p95Ms) : '—', on && p ? G('p95', x.gP95) : 'none');
    for (const r of [...e.descRows, ...e.waitRows]) off(r, !flOn);
    if (flOn) { put(e.desc, num(rate) ? fmtInt(rate) : '—', G('drops', grade('drops', rate))); put(e.wait, x.fl && num(x.fl.extraMs) ? '+' + fmtMs(x.fl.extraMs) : '—', G('wait', x.gWait)); }
    put(e.br, num(net?.bitrateMbps) ? fmt(net.bitrateMbps, 1) : '—', G('bitrate', x.gBitrate));
    put(e.qp, fmtInt(x.qp), G('qp', x.gQp));
    put(e.loss, num(net?.lossPct) ? fmt(net.lossPct, 1) + '%' : '—', G('loss', x.gLoss));
   }
   add('miss', x.gMiss, 'PUL ' + x.missed);
   add('loss', x.gLoss, 'PERDA ' + fmt(net?.lossPct, 1) + '%');
   add('qp', x.gQp, 'QP ' + fmtInt(x.qp));
   add('bitrate', x.gBitrate, fmt(net?.bitrateMbps, 1) + ' Mb/s');
   add('decoder', x.gDecoder, 'DECOD CPU');
   add('height', x.gHeight, net?.height + 'p');
   add('wait', x.gWait, 'ESP +' + fmtInt(x.fl?.extraMs));
   add('gpu', x.gGpuShow, (x.gpu !== null ? 'GPU ' : 'GPU ≈') + fmt(x.gpuShow, 1));
   for (let i = 0; i < CHIPS; i++) { put(f.chips[i], alerts[i] || '', null); off(f.chipEls[i], !alerts[i]); }
   if (f.l3) off(f.l3, !alerts.length);
   look = look || alerts.length > 0;
  } else {
   put(f.word, w.word, w.grade === 'good' ? null : w.grade);
   put(f.dev, on && p ? '±' + fmt(p.deviationMs, 1) : '—', devG);
   put(f.p95, on && p ? fmtMs(p.p95Ms) : '—', on && p ? G('p95', x.gP95) : 'none');
   put(f.hit, on && p ? String(p.hitches) : '—', hitG);
   // With direct capture nothing is skipped before the treatment (FLUIDEZ shows "Direta").
   for (const e of f.missParts) off(e, x.direct);
   put(f.miss, x.missed === null ? '—' : String(x.missed), missG);
   const flOn = settings.fluidity !== 'off';
   for (const e of f.descParts) off(e, !flOn);
   if (flOn) put(f.desc, num(rate) ? fmtInt(rate) : '—', G('drops', grade('drops', rate)));
   if (flOn) put(f.wait, x.fl && num(x.fl.extraMs) ? '+' + fmtMs(x.fl.extraMs) + ' ms' : '—', G('wait', x.gWait));
   else put(f.wait, 'desligada', 'none');
   off(f.capSep, !flOn); off(f.cap.e, !flOn);
   if (flOn) put(f.cap, x.direct ? 'Direta' : settings.capture === 'direct' ? 'Direta→vídeo' : 'Vídeo', x.gCapture === 'ok' ? 'ok' : null);
   put(f.total, x.lat.total === null ? '—' : '≈' + fmtInt(x.lat.total) + ' ms', totalG);
   const l = x.lat, segs = [l.rtt, l.buffer, l.decode, l.gpu, flOn ? l.wait : 0];
   for (let i = 0; i < 5; i++) prop(f.bar.children[i], 'flex-grow', String(num(segs[i]) ? Math.max(0, +segs[i].toFixed(1)) : 0));
   const legend = [[l.rtt, x.gRtt, 'rtt'], [l.buffer, x.gBuf, 'buf'], [l.decode, x.gDec, 'dec'], [x.gpu !== null ? x.gpu : x.gpuEst !== null ? l.gpu : null, x.gGpuShow, x.gpu !== null ? 'gpu' : 'gpu-est'], [x.fl ? x.fl.extraMs : null, x.gWait, 'wait']];
   legend.forEach(([v, gr, k], i) => put(f.leg[i].v, num(v) ? fmtMs(v) : '—', num(v) ? G(k, gr) : 'none'));
   off(f.leg[4].k, !flOn); off(f.leg[4].v.e, !flOn);
   const r = on ? /(\d+)\s*×\s*(\d+)\s*→\s*(\d+)\s*×\s*(\d+)/.exec(status.resolution || '') : null, inH = r ? +r[2] : net?.height || null;
   put(f.vin, inH ? inH + 'p' : '—', net?.height ? G('height', x.gHeight) : 'none');
   put(f.vout, r ? r[4] + 'p' : '—', r ? null : 'none');
   put(f.codec, net?.codec ? net.codec.split(' ')[0] : '—', null);
   put(f.dec, net ? DEC[net.decoder] || '—' : '—', G('decoder', x.gDecoder));
   put(f.br, num(net?.bitrateMbps) ? fmt(net.bitrateMbps, 1) : '—', G('bitrate', x.gBitrate));
   put(f.qp, fmtInt(x.qp), G('qp', x.gQp));
   put(f.loss, num(net?.lossPct) ? fmt(net.lossPct, 1) + '%' : '—', G('loss', x.gLoss));
   const first = (status.warnings || []).slice().sort((a, b) => (LEVEL[b.level] || 0) - (LEVEL[a.level] || 0))[0];
   off(f.warn, !first);
   if (first) { put(f.wbadge, x.warnCount > 1 ? '!' + x.warnCount : first.level === 'info' ? 'i' : '!', warnG); put(f.wtext, first.text, warnG); }
  }
  // Calm: after 10 s with everything good and no warning the HUD fades to 60%; anything to look at restores it.
  calm = look || overall !== 'good' ? 0 : calm + 1;
  attr(el, 'data-calm', calm >= 20);
 }

 /* ------------------------------ lifecycle ------------------------------ */
 function loop() {
  loopTimer = 0;
  if (!showing || !el) return;
  loopTimer = setTimeout(loop, STEP);
  try { render(); } catch (error) { console.warn('[BxImageFilter HUD]', error); }
 }
 // Telemetry counts as live while status.net keeps being replaced (once per second).
 function netLive() {
  const net = status.net, now = Date.now();
  if (!net) return false;
  if (net !== lastNet) { lastNet = net; lastNetAt = now; }
  return now - lastNetAt < 4000;
 }
 function show() {
  showing = true;
  clearTimeout(fadeTimer); fadeTimer = 0;
  attr(el, 'data-hiding', null); attr(el, 'data-show', true);
  n = 0; calm = 0;
  clearTimeout(loopTimer); loop();
 }
 function hide() {
  showing = false;
  clearTimeout(loopTimer); loopTimer = 0;
  attr(el, 'data-calm', null); attr(el, 'data-hiding', true);
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => { fadeTimer = 0; if (!showing && el) { attr(el, 'data-show', null); attr(el, 'data-hiding', null); } }, 160);
 }
 // 1 Hz while the HUD is enabled: shows it while frames are treated or the stream telemetry is live.
 function watch() {
  watchTimer = 0;
  if (!el) return;
  watchTimer = setTimeout(watch, WATCH);
  const want = !doc.hidden && (api.active || netLive());
  if (want && !showing) show(); else if (!want && showing) hide();
 }
 const onVisibility = () => { if (!el) return; if (doc.hidden) { if (showing) hide(); } else { clearTimeout(watchTimer); watch(); } };
 const onResize = () => { safe = null; layoutDirty = true; };
 const onScale = () => { layoutDirty = true; if (showing) { relayout(); if (f) f.cv._bxifSig = null; } };
 function create() {
  el = doc.createElement('div');
  el.className = 'bxif-hud';
  el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); el.inert = true;
  doc.documentElement.append(el);
  built = ''; layoutDirty = true;
  doc.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  try { mqs = [matchMedia('(min-height:640px)'), matchMedia('(min-height:1000px)')]; for (const m of mqs) m.addEventListener('change', onScale); } catch { mqs = []; }
  dprOff = ui.watchDpr?.(() => { if (f) { f.cv._bxifSig = null; sizeSpark(); } }) || null;
 }
 function teardown() {
  clearTimeout(watchTimer); clearTimeout(loopTimer); clearTimeout(fadeTimer); watchTimer = loopTimer = fadeTimer = 0;
  showing = false;
  if (!el) return;
  doc.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('resize', onResize);
  for (const m of mqs) { try { m.removeEventListener('change', onScale); } catch {} }
  mqs = []; dprOff?.(); dprOff = null;
  el.remove(); el = null; f = null; built = '';
 }
 // Re-reads settings.hud / hudPosition: builds, rebuilds or removes the HUD and renders at once.
 function update() {
  if (settings.hud !== 'compact' && settings.hud !== 'full') { teardown(); return; }
  ensureStyle('hud', CSS);
  if (!el) create();
  layoutDirty = true;
  if (showing) { n = 0; render(); }
  clearTimeout(watchTimer); watch();
 }
 window.addEventListener('pagehide', teardown);
 window.addEventListener('pageshow', e => { if (e.persisted) update(); });
 api.hud = {update, timers: () => (watchTimer ? 1 : 0) + (loopTimer ? 1 : 0) + (fadeTimer ? 1 : 0), get element() { return el; }};
 update();
})();

// play.xbox.com host, part 2: binds the treatment straight to the stream's <video>.
// The new site (React Router, WebRtcStreamV1) creates one <video> inside div[data-testid=media-container]
// and sets srcObject to the WebRTC MediaStream on ontrack (docs/play-xbox-com.md). Nothing in the
// site's code is changed: a WebGL2 canvas is placed over that video and the video is made transparent,
// so focus, pointer and keyboard input still reach the site's own element.
(() => {
 if (window.top !== window) return;
 const api = window.BxImageFilter;
 const CSS = `
video.bxif-play-source{opacity:0 !important}
canvas.bxif-play-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;background:#000;z-index:0}
.bxif-play-launch{position:fixed;top:12px;left:12px;z-index:2147483646;width:40px;height:40px;border:0;border-radius:20px;
 background:rgba(0,0,0,.55);color:#fff;font:600 13px/40px Bahnschrift,Arial,Roboto,sans-serif;text-align:center;cursor:pointer;
 transition:opacity .25s;opacity:.85;padding:0}
.bxif-play-launch[data-idle]{opacity:0;pointer-events:none}
.bxif-play-launch:focus-visible{outline:2px solid #04b358;outline-offset:2px}
.bxif-play-dialog{position:fixed;top:0;right:0;bottom:0;z-index:2147483647;width:min(440px,100vw);box-sizing:border-box;
 overflow:auto;padding:12px 16px;background:rgba(18,20,24,.96);color:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.5)}
.bxif-play-dialog[hidden]{display:none}
.bxif-play-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 15px Bahnschrift,Arial,Roboto,sans-serif}
.bxif-play-head button{border:0;border-radius:6px;background:#2a2e36;color:#fff;font:600 13px Bahnschrift,Arial,Roboto,sans-serif;padding:8px 12px;cursor:pointer}`;
 // Only a live WebRTC video track: trailers and hero videos on the new site use src, not srcObject.
 function isStream(video) {
  const stream = video.srcObject;
  if (!(typeof MediaStream === 'function' && stream instanceof MediaStream)) return false;
  return stream.getVideoTracks().some(t => t.readyState === 'live') && video.isConnected;
 }
 function findStream() {
  const inContainer = document.querySelectorAll('[data-testid="media-container"] video');
  for (const v of inContainer) if (isStream(v)) return v;
  // Fallback if the container's test id changes: any video playing a WebRTC track.
  for (const v of document.getElementsByTagName('video')) if (isStream(v)) return v;
  return null;
 }
 let player = null, starting = null, style = null;
 function ensureStyle() {
  if (style?.isConnected) return;
  style = document.createElement('style');style.id = 'bxif-play-style';style.textContent = CSS;
  (document.head || document.documentElement).append(style);
 }
 async function attach(video) {
  ensureStyle();
  const parent = video.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  const p = new WebGL2Player(video);
  p.$canvas.classList.add('bxif-play-canvas');
  p.$canvas.setAttribute('aria-hidden', 'true');
  starting = p;
  try { await p.init(); } catch (error) { console.warn('[BxImageFilter] play.xbox.com', error); }
  if (starting !== p) return;
  starting = null;
  // Without a context the original video stays visible.
  if (!p.gl) { p.destroy(); return; }
  player = p;
  video.classList.add('bxif-play-source');
  showLauncher(true);
 }
 function detach() {
  const p = player || starting;
  player = starting = null;
  if (!p) return;
  p.$video?.classList.remove('bxif-play-source');
  try { p.destroy(); } catch (error) { console.warn('[BxImageFilter] play.xbox.com', error); }
  showLauncher(false);
 }
 // srcObject changes fire no DOM mutation: a light check once a second (and on DOM changes) follows the
 // video from creation to teardown, including a reconnect that replaces it.
 function scan() {
  const current = player || starting;
  if (current) {
   const v = current.$video;
   if (!isStream(v) || findStream() !== v) detach(); else return;
  }
  const video = findStream();
  if (video && video.videoWidth > 0) attach(video);
  else if (video && !video.bxifWaiting) {
   video.bxifWaiting = true;
   video.addEventListener('loadeddata', () => { video.bxifWaiting = false; scan(); }, {once: true});
  }
 }
 let scanQueued = false;
 // While a player runs, the site's UI mutates often: the 1 s check alone notices the teardown.
 function queueScan() { if (scanQueued || player) return; scanQueued = true; requestAnimationFrame(() => { scanQueued = false; scan(); }); }
 // Panel: a small button over the stream (hidden after a few seconds without the pointer) and Alt+Shift+F.
 let launcher = null, dialog = null, body = null, idleTimer = 0;
 function build() {
  if (launcher) return;
  ensureStyle();
  launcher = document.createElement('button');
  launcher.type = 'button';launcher.className = 'bxif-play-launch';launcher.textContent = 'IF';
  launcher.title = 'Tratamento de imagem (Alt+Shift+F)';launcher.setAttribute('aria-label', 'Tratamento de imagem');
  launcher.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  dialog = document.createElement('div');
  dialog.className = 'bxif-play-dialog';dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');dialog.setAttribute('aria-label', 'Tratamento de imagem');
  const head = document.createElement('div'), title = document.createElement('span'), close = document.createElement('button');
  head.className = 'bxif-play-head';title.textContent = 'Tratamento de imagem';
  close.type = 'button';close.textContent = 'Fechar';close.addEventListener('click', () => toggle(false));
  head.append(title, close);
  body = document.createElement('div');
  dialog.append(head, body);
  // Keys typed in the panel are not game input.
  for (const name of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(name, e => { if (e.key === 'Escape' && name === 'keydown') toggle(false); e.stopPropagation(); });
  document.body.append(launcher, dialog);
 }
 function toggle(open = dialog?.hidden ?? true) {
  build();
  // The panel sets api.panelOpen itself while it is on screen (IntersectionObserver).
  dialog.hidden = !open;
  if (open) { api.mountControls(body); dialog.querySelector('button')?.focus(); }
  else (player?.$video || launcher).focus?.({preventScroll: true});
 }
 function showLauncher(on) {
  if (!document.body) return;
  build();
  launcher.hidden = !on;
  if (!on) toggle(false); else wake();
 }
 function wake() {
  if (!launcher || launcher.hidden) return;
  launcher.removeAttribute('data-idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (dialog.hidden) launcher.setAttribute('data-idle', ''); }, 4000);
 }
 window.addEventListener('pointermove', wake, {passive: true, capture: true});
 window.addEventListener('pointerdown', wake, {passive: true, capture: true});
 window.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && (e.code === 'KeyF' || e.key === 'F' || e.key === 'f') && (player || dialog && !dialog.hidden)) { e.preventDefault(); e.stopPropagation(); toggle(); }
 }, true);
 let observer = null, timer = 0;
 function start() {
  if (!document.documentElement) return;
  observer ??= new MutationObserver(queueScan);
  observer.observe(document.documentElement, {childList: true, subtree: true});
  clearInterval(timer);timer = setInterval(scan, 1000);
  scan();
 }
 window.addEventListener('pagehide', () => { clearInterval(timer);timer = 0;observer?.disconnect();detach(); });
 window.addEventListener('pageshow', e => { if (e.persisted) start(); });
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
 // Test hook: the current player (null when none).
 api.playHost = {player: () => player, scan};
})();
