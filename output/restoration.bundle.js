globalThis.BxBuild={"version": "6.7.12-imagefilter.9.7.1", "sourceSha256": "dfe1e3e945fe3038a7d3065fc936c1a0f6ff60e529d24d4289ea94ff96aeef33"};
globalThis.BxShaders={"antialias": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform float amount;\nout vec4 fragColor;\nfloat luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}\nvoid main(){\n vec2 stepSize=1./vec2(textureSize(source,0)),uv=gl_FragCoord.xy*stepSize;\n vec3 center=texture(source,uv).rgb;\n float nw=luminance(texture(source,uv+vec2(-1,1)*stepSize).rgb);\n float ne=luminance(texture(source,uv+vec2(1,1)*stepSize).rgb);\n float sw=luminance(texture(source,uv+vec2(-1,-1)*stepSize).rgb);\n float se=luminance(texture(source,uv+vec2(1,-1)*stepSize).rgb);\n float mid=luminance(center),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));\n float contrast=hi-lo;\n // Directional post-process AA: only high-contrast slanted edges are blended.\n // Flat regions and axis-aligned edges retain their original samples.\n vec2 direction=vec2(-(nw+ne-sw-se),nw+sw-ne-se);\n float major=max(abs(direction.x),abs(direction.y));\n float diagonal=min(abs(direction.x),abs(direction.y))/max(major,.00001);\n float weight=amount*smoothstep(.04,.15,contrast)*smoothstep(.05,.35,diagonal);\n if(weight<=0.){fragColor=vec4(center,1);return;}\n direction=direction/max(major,.00001)*stepSize;\n vec3 smoothColor=(texture(source,uv-direction*.5).rgb+texture(source,uv+direction*.5).rgb)*.5;\n // Clamp to the observed neighborhood to prevent new ringing.\n float smoothLum=luminance(smoothColor);\n if(smoothLum<lo||smoothLum>hi)smoothColor=center;\n fragColor=vec4(mix(center,smoothColor,weight),1);\n}\n", "copy": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform vec2 outputSize;\nout vec4 fragColor;\nvoid main(){fragColor=vec4(texture(source,gl_FragCoord.xy/outputSize).rgb,1);}\n", "cut": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source, previous;\nout vec4 fragColor;\nvoid main(){float difference=0.;for(int y=0;y<16;y++)for(int x=0;x<16;x++){\n vec2 uv=(vec2(x,y)+.5)/16.;vec3 d=abs(texture(source,uv).rgb-texture(previous,uv).rgb);\n difference+=dot(d,vec3(.2126,.7152,.0722))/256.;\n}fragColor=vec4(difference,0,0,1);}\n", "easu": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;uniform vec2 outputSize;out vec4 fragColor;\nfloat safeRcp(float x){return 1./max(x,1e-8);}float safeRsq(float x){return inversesqrt(max(x,1e-8));}\nfloat saturate(float x){return clamp(x,0.,1.);}vec3 min3(vec3 a,vec3 b,vec3 c){return min(a,min(b,c));}vec3 max3(vec3 a,vec3 b,vec3 c){return max(a,max(b,c));}\n// WebGL2 has no textureGather. Fetch each texel once (RGB) and split channels in gather order.\nvoid gatherRGB(vec2 uv,out vec4 r,out vec4 g,out vec4 b){ivec2 size=textureSize(source,0);ivec2 p=ivec2(floor(uv*vec2(size)-.5));\n vec3 t0=texelFetch(source,clamp(p+ivec2(0,1),ivec2(0),size-1),0).rgb,t1=texelFetch(source,clamp(p+ivec2(1,1),ivec2(0),size-1),0).rgb;\n vec3 t2=texelFetch(source,clamp(p+ivec2(1,0),ivec2(0),size-1),0).rgb,t3=texelFetch(source,clamp(p,ivec2(0),size-1),0).rgb;\n r=vec4(t0.r,t1.r,t2.r,t3.r);g=vec4(t0.g,t1.g,t2.g,t3.g);b=vec4(t0.b,t1.b,t2.b,t3.b);}\n\n// FidelityFX Super Resolution Sample\n//\n// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software and associated documentation files(the \"Software\"), to deal\n// in the Software without restriction, including without limitation the rights\n// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell\n// copies of the Software, and to permit persons to whom the Software is\n// furnished to do so, subject to the following conditions :\n// The above copyright notice and this permission notice shall be included in\n// all copies or substantial portions of the Software.\n// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE\n// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n// THE SOFTWARE.\n void FsrEasuTapF(\n inout vec3 aC, // Accumulated color, with negative lobe.\n inout float aW, // Accumulated weight.\n vec2 off, // Pixel offset from resolve position to tap.\n vec2 dir, // Gradient direction.\n vec2 len, // Length.\n float lob, // Negative lobe strength.\n float clp, // Clipping point.\n vec3 c){ // Tap color.\n  // Rotate offset by direction.\n  vec2 v;\n  v.x=(off.x*( dir.x))+(off.y*dir.y);\n  v.y=(off.x*(-dir.y))+(off.y*dir.x);\n  // Anisotropy.\n  v*=len;\n  // Compute distance^2.\n  float d2=v.x*v.x+v.y*v.y;\n  // Limit to the window as at corner, 2 taps can easily be outside.\n  d2=min(d2,clp);\n  // Approximation of lancos2 without sin() or rcp(), or sqrt() to get x.\n  //  (25/16 * (2/5 * x^2 - 1)^2 - (25/16 - 1)) * (1/4 * x^2 - 1)^2\n  //  |_______________________________________|   |_______________|\n  //                   base                             window\n  // The general form of the 'base' is,\n  //  (a*(b*x^2-1)^2-(a-1))\n  // Where 'a=1/(2*b-b^2)' and 'b' moves around the negative lobe.\n  float wB=float(2.0/5.0)*d2+float(-1.0);\n  float wA=lob*d2+float(-1.0);\n  wB*=wB;\n  wA*=wA;\n  wB=float(25.0/16.0)*wB+float(-(25.0/16.0-1.0));\n  float w=wB*wA;\n  // Do weighted average.\n  aC+=c*w;aW+=w;}\n//------------------------------------------------------------------------------------------------------------------------------\n // Accumulate direction and length.\n void FsrEasuSetF(\n inout vec2 dir,\n inout float len,\n vec2 pp,\n bool biS,bool biT,bool biU,bool biV,\n float lA,float lB,float lC,float lD,float lE){\n  // Compute bilinear weight, branches factor out as predicates are compiler time immediates.\n  //  s t\n  //  u v\n  float w = float(0.0);\n  if(biS)w=(float(1.0)-pp.x)*(float(1.0)-pp.y);\n  if(biT)w=           pp.x *(float(1.0)-pp.y);\n  if(biU)w=(float(1.0)-pp.x)*           pp.y ;\n  if(biV)w=           pp.x *           pp.y ;\n  // Direction is the '+' diff.\n  //    a\n  //  b c d\n  //    e\n  // Then takes magnitude from abs average of both sides of 'c'.\n  // Length converts gradient reversal to 0, smoothly to non-reversal at 1, shaped, then adding horz and vert terms.\n  float dc=lD-lC;\n  float cb=lC-lB;\n  float lenX=max(abs(dc),abs(cb));\n  lenX=safeRcp(lenX);\n  float dirX=lD-lB;\n  dir.x+=dirX*w;\n  lenX=saturate(abs(dirX)*lenX);\n  lenX*=lenX;\n  len+=lenX*w;\n  // Repeat for the y axis.\n  float ec=lE-lC;\n  float ca=lC-lA;\n  float lenY=max(abs(ec),abs(ca));\n  lenY=safeRcp(lenY);\n  float dirY=lE-lA;\n  dir.y+=dirY*w;\n  lenY=saturate(abs(dirY)*lenY);\n  lenY*=lenY;\n  len+=lenY*w;}\n//------------------------------------------------------------------------------------------------------------------------------\n void FsrEasuF(\n out vec3 pix,\n vec2 ip, // Integer pixel position in output.\n vec4 con0, // Constants generated by FsrEasuCon().\n vec4 con1,\n vec4 con2,\n vec4 con3){\n//------------------------------------------------------------------------------------------------------------------------------\n  // Get position of 'f'.\n  vec2 pp=vec2(ip)*vec2(con0.xy)+vec2(con0.zw);\n  vec2 fp=floor(pp);\n  pp-=fp;\n//------------------------------------------------------------------------------------------------------------------------------\n  // 12-tap kernel.\n  //    b c\n  //  e f g h\n  //  i j k l\n  //    n o\n  // Gather 4 ordering.\n  //  a b\n  //  r g\n  // For packed FP16, need either {rg} or {ab} so using the following setup for gather in all versions,\n  //    a b    <- unused (z)\n  //    r g\n  //  a b a b\n  //  r g r g\n  //    a b\n  //    r g    <- unused (z)\n  // Allowing dead-code removal to remove the 'z's.\n  vec2 p0=fp*vec2(con1.xy)+vec2(con1.zw);\n  // These are from p0 to avoid pulling two constants on pre-Navi hardware.\n  vec2 p1=p0+vec2(con2.xy);\n  vec2 p2=p0+vec2(con2.zw);\n  vec2 p3=p0+vec2(con3.xy);\n  vec4 bczzR,bczzG,bczzB,ijfeR,ijfeG,ijfeB,klhgR,klhgG,klhgB,zzonR,zzonG,zzonB;\n  gatherRGB(p0,bczzR,bczzG,bczzB);\n  gatherRGB(p1,ijfeR,ijfeG,ijfeB);\n  gatherRGB(p2,klhgR,klhgG,klhgB);\n  gatherRGB(p3,zzonR,zzonG,zzonB);\n//------------------------------------------------------------------------------------------------------------------------------\n  // Simplest multi-channel approximate luma possible (luma times 2, in 2 FMA/MAD).\n  vec4 bczzL=bczzB*vec4(0.5)+(bczzR*vec4(0.5)+bczzG);\n  vec4 ijfeL=ijfeB*vec4(0.5)+(ijfeR*vec4(0.5)+ijfeG);\n  vec4 klhgL=klhgB*vec4(0.5)+(klhgR*vec4(0.5)+klhgG);\n  vec4 zzonL=zzonB*vec4(0.5)+(zzonR*vec4(0.5)+zzonG);\n  // Rename.\n  float bL=bczzL.x;\n  float cL=bczzL.y;\n  float iL=ijfeL.x;\n  float jL=ijfeL.y;\n  float fL=ijfeL.z;\n  float eL=ijfeL.w;\n  float kL=klhgL.x;\n  float lL=klhgL.y;\n  float hL=klhgL.z;\n  float gL=klhgL.w;\n  float oL=zzonL.z;\n  float nL=zzonL.w;\n  // Accumulate for bilinear interpolation.\n  vec2 dir=vec2(0.0);\n  float len=float(0.0);\n  FsrEasuSetF(dir,len,pp,true, false,false,false,bL,eL,fL,gL,jL);\n  FsrEasuSetF(dir,len,pp,false,true ,false,false,cL,fL,gL,hL,kL);\n  FsrEasuSetF(dir,len,pp,false,false,true ,false,fL,iL,jL,kL,nL);\n  FsrEasuSetF(dir,len,pp,false,false,false,true ,gL,jL,kL,lL,oL);\n//------------------------------------------------------------------------------------------------------------------------------\n  // Normalize with approximation, and cleanup close to zero.\n  vec2 dir2=dir*dir;\n  float dirR=dir2.x+dir2.y;\n  bool zro=dirR<float(1.0/32768.0);\n  dirR=safeRsq(dirR);\n  dirR=zro?float(1.0):dirR;\n  dir.x=zro?float(1.0):dir.x;\n  dir*=vec2(dirR);\n  // Transform from {0 to 2} to {0 to 1} range, and shape with square.\n  len=len*float(0.5);\n  len*=len;\n  // Stretch kernel {1.0 vert|horz, to sqrt(2.0) on diagonal}.\n  float stretch=(dir.x*dir.x+dir.y*dir.y)*safeRcp(max(abs(dir.x),abs(dir.y)));\n  // Anisotropic length after rotation,\n  //  x := 1.0 lerp to 'stretch' on edges\n  //  y := 1.0 lerp to 2x on edges\n  vec2 len2=vec2(float(1.0)+(stretch-float(1.0))*len,float(1.0)+float(-0.5)*len);\n  // Based on the amount of 'edge',\n  // the window shifts from +/-{sqrt(2.0) to slightly beyond 2.0}.\n  float lob=float(0.5)+float((1.0/4.0-0.04)-0.5)*len;\n  // Set distance^2 clipping point to the end of the adjustable window.\n  float clp=safeRcp(lob);\n//------------------------------------------------------------------------------------------------------------------------------\n  // Accumulation mixed with min/max of 4 nearest.\n  //    b c\n  //  e f g h\n  //  i j k l\n  //    n o\n  vec3 min4=min(min3(vec3(ijfeR.z,ijfeG.z,ijfeB.z),vec3(klhgR.w,klhgG.w,klhgB.w),vec3(ijfeR.y,ijfeG.y,ijfeB.y)),\n               vec3(klhgR.x,klhgG.x,klhgB.x));\n  vec3 max4=max(max3(vec3(ijfeR.z,ijfeG.z,ijfeB.z),vec3(klhgR.w,klhgG.w,klhgB.w),vec3(ijfeR.y,ijfeG.y,ijfeB.y)),\n               vec3(klhgR.x,klhgG.x,klhgB.x));\n  // Accumulation.\n  vec3 aC=vec3(0.0);\n  float aW=float(0.0);\n  FsrEasuTapF(aC,aW,vec2( 0.0,-1.0)-pp,dir,len2,lob,clp,vec3(bczzR.x,bczzG.x,bczzB.x)); // b\n  FsrEasuTapF(aC,aW,vec2( 1.0,-1.0)-pp,dir,len2,lob,clp,vec3(bczzR.y,bczzG.y,bczzB.y)); // c\n  FsrEasuTapF(aC,aW,vec2(-1.0, 1.0)-pp,dir,len2,lob,clp,vec3(ijfeR.x,ijfeG.x,ijfeB.x)); // i\n  FsrEasuTapF(aC,aW,vec2( 0.0, 1.0)-pp,dir,len2,lob,clp,vec3(ijfeR.y,ijfeG.y,ijfeB.y)); // j\n  FsrEasuTapF(aC,aW,vec2( 0.0, 0.0)-pp,dir,len2,lob,clp,vec3(ijfeR.z,ijfeG.z,ijfeB.z)); // f\n  FsrEasuTapF(aC,aW,vec2(-1.0, 0.0)-pp,dir,len2,lob,clp,vec3(ijfeR.w,ijfeG.w,ijfeB.w)); // e\n  FsrEasuTapF(aC,aW,vec2( 1.0, 1.0)-pp,dir,len2,lob,clp,vec3(klhgR.x,klhgG.x,klhgB.x)); // k\n  FsrEasuTapF(aC,aW,vec2( 2.0, 1.0)-pp,dir,len2,lob,clp,vec3(klhgR.y,klhgG.y,klhgB.y)); // l\n  FsrEasuTapF(aC,aW,vec2( 2.0, 0.0)-pp,dir,len2,lob,clp,vec3(klhgR.z,klhgG.z,klhgB.z)); // h\n  FsrEasuTapF(aC,aW,vec2( 1.0, 0.0)-pp,dir,len2,lob,clp,vec3(klhgR.w,klhgG.w,klhgB.w)); // g\n  FsrEasuTapF(aC,aW,vec2( 1.0, 2.0)-pp,dir,len2,lob,clp,vec3(zzonR.z,zzonG.z,zzonB.z)); // o\n  FsrEasuTapF(aC,aW,vec2( 0.0, 2.0)-pp,dir,len2,lob,clp,vec3(zzonR.w,zzonG.w,zzonB.w)); // n\n//------------------------------------------------------------------------------------------------------------------------------\n  // Normalize and dering.\n  pix=min(max4,max(min4,aC*vec3(safeRcp(aW))));}\nvoid main(){vec2 size=vec2(textureSize(source,0)),scale=size/outputSize;\n vec4 con0=vec4(scale,.5*scale-.5),con1=vec4(1./size,vec2(1,-1)/size),con2=vec4(vec2(-1,2)/size,vec2(1,2)/size),con3=vec4(vec2(0,4)/size,0,0);\n vec3 c;FsrEasuF(c,gl_FragCoord.xy-.5,con0,con1,con2,con3);fragColor=vec4(c,1);}\n", "finish": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform vec2 outputSize;\nuniform float contrast,saturation,shadows,deband;\nuniform bool diagnostic;\nout vec4 fragColor;\n// Also embedded in the sharpening shader: round only at final presentation.\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\nvoid main(){vec3 c=texture(source,gl_FragCoord.xy/outputSize).rgb;\n float l=dot(c,vec3(.2126,.7152,.0722));\n c=mix(vec3(l),c,saturation);c=(c-.5)*contrast+.5;\n fragColor=vec4(finishColor(c),1.);}\n", "motion": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source, previous, cut, fullSource, fullPrevious;\nuniform vec2 outputSize;\nuniform bool validHistory;\nout vec4 fragColor;\nfloat lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}\nfloat lowLuma[5],fullLuma[5];\nfloat matchingError(vec2 uv,vec2 candidate,vec2 stepSize){\n float error=0.;for(int i=0;i<5;i++){\n  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);\n  error+=abs(lowLuma[i]-lum(texture(previous,uv+(d+candidate)*stepSize).rgb))*.2;\n }return error+length(candidate)*.00001;\n}\nfloat fineError(vec2 uv,vec2 offset){\n vec2 size=vec2(textureSize(fullSource,0));\n float error=0.;\n for(int i=0;i<5;i++){\n  vec2 d=i==0?vec2(0):i==1?vec2(3,0):i==2?vec2(-3,0):i==3?vec2(0,3):vec2(0,-3);\n  error+=abs(fullLuma[i]-lum(texture(fullPrevious,uv+(d+offset)/size).rgb))*.2;\n }\n return error;\n}\nvoid main(){\n if(!validHistory||texture(cut,vec2(.5)).r>.12){fragColor=vec4(vec2(128./255.),0,1);return;}\n vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(source,0));\n // Current-frame samples do not depend on the candidate vector. Fetch once.\n for(int i=0;i<5;i++){\n  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);\n  lowLuma[i]=lum(texture(source,uv+d*stepSize).rgb);\n  fullLuma[i]=lum(texture(fullSource,uv+d*3./vec2(textureSize(fullSource,0))).rgb);\n }\n float best=10.,second=10.;vec2 offset=vec2(0);\n // Keep the fine local search, then search coarse offsets up to 32 source pixels.\n for(int pass=0;pass<2;pass++)for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){\n  if(pass==1&&x==0&&y==0)continue;\n  vec2 candidate=vec2(x,y)*(pass==0?1.:4.);float error=matchingError(uv,candidate,stepSize);\n  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);\n }\n vec2 coarse=offset;\n // Refine only a winning coarse vector. Maximum supported displacement is 40px.\n if(any(greaterThan(abs(coarse),vec2(2))))for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){\n  vec2 candidate=coarse+vec2(x,y);\n  if(all(lessThanEqual(abs(candidate),vec2(2)))||all(lessThan(abs(mod(candidate,4.)),vec2(.001))))continue;\n  float error=matchingError(uv,candidate,stepSize);\n  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);\n }\n float coarseConfidence=smoothstep(.0002,.004,second-best);\n // Refine only at the small motion-field resolution. No extra full-frame pass.\n // Use the actual size ratio: odd source dimensions are not exactly 4:1.\n vec2 fullSize=vec2(textureSize(fullSource,0));\n vec2 center=offset*fullSize/vec2(textureSize(source,0)),fine=center;\n float fineBest=10.,fineSecond=10.;\n for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){\n  vec2 candidate=center+vec2(x,y);float error=fineError(uv,candidate);\n  if(error<fineBest){fineSecond=fineBest;fineBest=error;fine=candidate;}else fineSecond=min(fineSecond,error);\n }\n float confidence=(1.-smoothstep(.008,.045,fineBest))*max(coarseConfidence,smoothstep(.0002,.004,fineSecond-fineBest));\n center=fine;\n for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){\n  if(x==0&&y==0)continue;\n  vec2 candidate=center+vec2(x,y)*.5;float error=fineError(uv,candidate);\n  if(error<fineBest){fineBest=error;fine=candidate;}\n }\n // Exact half-pixel encoding in RGBA8, including zero (128), without float targets.\n fragColor=vec4((clamp(round(fine*2.),vec2(-128),vec2(127))+128.)/255.,confidence,1.);\n}\n", "rcas": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n// FidelityFX Super Resolution Sample\n//\n// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software and associated documentation files(the \"Software\"), to deal\n// in the Software without restriction, including without limitation the rights\n// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell\n// copies of the Software, and to permit persons to whom the Software is\n// furnished to do so, subject to the following conditions :\n// The above copyright notice and this permission notice shall be included in\n// all copies or substantial portions of the Software.\n// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE\n// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n// THE SOFTWARE.\n\n// RCAS port of vendor/ffx_fsr1.h FsrRcasF, denoise enabled.\n// Exact guarded reciprocals replace AMD approximations. Local halo limiter is ours.\nuniform sampler2D data;\nuniform vec2 outputSize;\nuniform float rcasStrength,haloMargin,noiseFloor,contrast,saturation,shadows,deband;\nuniform bool diagnostic,lumaSharpen;\nout vec4 fragColor;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nfloat luma2(vec3 c){return c.b*.5+c.r*.5+c.g;}\nvoid main(){\n vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(data,0));\n vec3 e=texture(data,uv).rgb,c=e;\n if(rcasStrength>0.){\n  vec3 b=texture(data,uv+vec2(0,-1)*stepSize).rgb,d=texture(data,uv+vec2(-1,0)*stepSize).rgb;\n  vec3 f=texture(data,uv+vec2(1,0)*stepSize).rgb,h=texture(data,uv+vec2(0,1)*stepSize).rgb;\n  float bl=luma2(b),dl=luma2(d),el=luma2(e),fl=luma2(f),hl=luma2(h);\n  float range=max(max(max(bl,dl),max(fl,hl)),el)-min(min(min(bl,dl),min(fl,hl)),el);\n  float noise=1.-.5*clamp(abs(.25*(bl+dl+fl+hl)-el)/max(range,1e-6),0.,1.);\n  vec3 mn=min(min(b,d),min(f,h)),mx=max(max(b,d),max(f,h));\n  vec3 hitMin=min(mn,e)/max(4.*mx,vec3(1e-6));\n  vec3 hitMax=(1.-max(mx,e))/min(4.*mn-4.,vec3(-1e-6));\n  vec3 lobes=max(-hitMin,hitMax);\n  float lobe=max(-.1875,min(max(max(lobes.r,lobes.g),lobes.b),0.))*rcasStrength*noise;\n  c=(lobe*(b+d+f+h)+e)/(4.*lobe+1.);\n  vec3 lo=min(mn,e),hi=max(mx,e);\n  float detail=smoothstep(noiseFloor,noiseFloor+4./255.,max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b));\n  c=clamp(mix(e,c,detail),lo-haloMargin,hi+haloMargin);\n  if(lumaSharpen)c=clamp(e+vec3(dot(c-e,vec3(.2126,.7152,.0722))),0.,1.);\n }\n float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,saturation);c=contrast*(c-.5)+.5;\n fragColor=vec4(finishColor(c),1);\n}\n", "sgsr": "#version 300 es\n// Snapdragon Game Super Resolution 1 (SGSR 1), adapted from\n// https://github.com/SnapdragonStudios/snapdragon-gsr sgsr/v1/include/glsl/sgsr1_shader_mobile.frag\n//\n// Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.\n// (LICENSE file of the repository: Copyright (c) 2023, Qualcomm Innovation Center, Inc. All rights reserved.)\n// SPDX-License-Identifier: BSD-3-Clause\n//\n// Redistribution and use in source and binary forms, with or without\n// modification, are permitted provided that the following conditions are met:\n//\n// 1. Redistributions of source code must retain the above copyright notice,\n//    this list of conditions and the following disclaimer.\n//\n// 2. Redistributions in binary form must reproduce the above copyright notice,\n//    this list of conditions and the following disclaimer in the documentation\n//    and/or other materials provided with the distribution.\n//\n// 3. Neither the name of the copyright holder nor the names of its contributors\n//    may be used to endorse or promote products derived from this software\n//    without specific prior written permission.\n//\n// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\"\n// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE\n// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE\n// POSSIBILITY OF SUCH DAMAGE.\n//\n// Changes here (docs/spec2-estudo.md, Spec 3 item 5): WebGL2 has no textureGather, so the 12 luma\n// samples are texelFetch reads of Rec.709 luma (upstream gathers the green channel); edge threshold\n// and sharpness are uniforms (measured 20/255 and 1.0 for compressed video: the original 8/255 and 2.0\n// enhance codec artifacts); a zero-sum guard; and the output finishing of the sharpening pass it\n// replaces (saturation, contrast, shadows, dither, diagnostic tint), appended by tools/build.py.\n// SGSR_PRECISION is mediump on half-precision GPUs (set by the engine), highp elsewhere.\n#ifndef SGSR_PRECISION\n#define SGSR_PRECISION highp\n#endif\nprecision SGSR_PRECISION float;\nprecision highp int;\nprecision SGSR_PRECISION sampler2D;\nuniform sampler2D source;uniform highp vec2 outputSize;uniform float sharp,threshold;\nuniform float brightness,contrast,saturation,shadows,deband;uniform bool diagnostic;\nout vec4 fragColor;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nfloat L(ivec2 p,ivec2 m){return dot(texelFetch(source,clamp(p,ivec2(0),m),0).rgb,vec3(.2126,.7152,.0722));}\nfloat fastLanczos2(float x){float wA=x-4.;float wB=x*wA-wA;wA*=wA;return wB*wA;}\nvec2 weightY(float dx,float dy,float c,float std){float x=(dx*dx+dy*dy)*.55+clamp(abs(c)*std,0.,1.);float w=fastLanczos2(x);return vec2(w,w*c);}\nvoid main(){\n highp vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/outputSize;ivec2 m=ivec2(size)-1;\n vec3 color=textureLod(source,uv,0.).rgb;float cy=dot(color,vec3(.2126,.7152,.0722));\n highp vec2 img=uv*size+vec2(-.5,.5),ip=floor(img);vec2 pl=vec2(img-ip);ivec2 P=ivec2(ip);\n vec4 left;left.y=L(P,m);left.z=L(P+ivec2(0,-1),m);\n float vote=abs(left.z-left.y)+abs(cy-left.y)+abs(cy-left.z);\n if(vote>threshold){\n  left.x=L(P+ivec2(-1,0),m);left.w=L(P+ivec2(-1,-1),m);\n  vec4 right=vec4(L(P+ivec2(1,0),m),L(P+ivec2(2,0),m),L(P+ivec2(2,-1),m),L(P+ivec2(1,-1),m));\n  vec4 ud=vec4(L(P+ivec2(0,-2),m),L(P+ivec2(1,-2),m),L(P+ivec2(1,1),m),L(P+ivec2(0,1),m));\n  float mean=(left.y+left.z+right.x+right.w)*.25;left-=mean;right-=mean;ud-=mean;float cw=cy-mean;\n  vec4 a=abs(left)+abs(right)+abs(ud);float std=2.181818/max(a.x+a.y+a.z+a.w,1e-4);\n  vec2 s=weightY(pl.x,pl.y+1.,ud.x,std)+weightY(pl.x-1.,pl.y+1.,ud.y,std)+weightY(pl.x-1.,pl.y-2.,ud.z,std)+weightY(pl.x,pl.y-2.,ud.w,std);\n  s+=weightY(pl.x+1.,pl.y-1.,left.x,std)+weightY(pl.x,pl.y-1.,left.y,std)+weightY(pl.x,pl.y,left.z,std)+weightY(pl.x+1.,pl.y,left.w,std);\n  s+=weightY(pl.x-1.,pl.y-1.,right.x,std)+weightY(pl.x-2.,pl.y-1.,right.y,std)+weightY(pl.x-2.,pl.y,right.z,std)+weightY(pl.x-1.,pl.y,right.w,std);\n  float fy=s.y/s.x,mx=max(max(left.y,left.z),max(right.x,right.w)),mn=min(min(left.y,left.z),min(right.x,right.w));\n  fy=clamp(sharp*fy,mn,mx);float dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,0.,1.);\n }\n // Same order as the sharpening pass it replaces (casFiltered): saturation, contrast, brightness, finish.\n color=mix(vec3(dot(color,vec3(.299,.587,.114))),color,saturation);color=contrast*(color-.5)+.5;color=brightness*color;\n fragColor=vec4(finishColor(color),1);\n}\n", "spatial": "#version 300 es\n// Compiled variants (restoration-engine.js, spatialSource) define SPATIAL_FIXED, the SPATIAL_* switches\n// below and SPATIAL_PRECISION after the #version line: disabled filters are compiled out and the loop\n// and flags become constants. Without them this is the generic shader driven by uniforms only.\n#ifndef SPATIAL_PRECISION\n#define SPATIAL_PRECISION highp\n#endif\n#ifndef SPATIAL_CLEANUP\n#define SPATIAL_CLEANUP 1\n#endif\n#ifndef SPATIAL_DEBAND\n#define SPATIAL_DEBAND 1\n#endif\n#ifndef SPATIAL_CHROMA\n#define SPATIAL_CHROMA 1\n#endif\n#ifndef SPATIAL_DETAIL\n#define SPATIAL_DETAIL 1\n#endif\n#ifndef SPATIAL_ANTIALIAS\n#define SPATIAL_ANTIALIAS 1\n#endif\n// Color math may run in mediump (half floats on Adreno/Mali); pixel coordinates stay highp.\nprecision SPATIAL_PRECISION float;\nprecision highp sampler2D;\nuniform sampler2D source;\nuniform float cleanup, deband, chroma, detail, antialias;\n#ifdef SPATIAL_FIXED\nconst float debandTaps=SPATIAL_TAPS;\nconst bool quantize=SPATIAL_QUANTIZE,selective=SPATIAL_SELECTIVE;\n#else\nuniform float debandTaps;\nuniform bool quantize,selective;\n#endif\nout vec4 fragColor;\nfloat peak(vec3 c){return max(max(abs(c.r),abs(c.g)),abs(c.b));}\nfloat lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}\nvec3 at(highp vec2 p){return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;}\nvoid main(){\n highp vec2 p=gl_FragCoord.xy-.5;vec3 c=at(p), result=c;\n vec3 west=at(p-vec2(1,0)),east=at(p+vec2(1,0));\n vec3 south=at(p-vec2(0,1)),north=at(p+vec2(0,1));\n // Gradient sign reversals identify fine texture/extrema, even at low contrast.\n // Reuse these neighbors for cleanup; no extra classification render target.\n float reversal=sqrt(max(0.,max(-lum(c-west)*lum(east-c),-lum(c-south)*lum(north-c))));\n float textureMask=smoothstep(.003,.015,reversal);\n // Color extrema matter even on nearly isoluminant colored text and fine lines.\n if(selective){\n  vec3 rx=max(-(c-west)*(east-c),-(c-south)*(north-c));\n  textureMask=max(textureMask,smoothstep(.003,.015,sqrt(max(0.,max(max(rx.r,rx.g),rx.b)))));\n }\n // Detect a small step between smooth regions; do not assume a codec block grid.\n #if SPATIAL_CLEANUP\n if(cleanup>0.)for(int axis=0;axis<2;axis++){\n  vec2 d=axis==0?vec2(1,0):vec2(0,1);\n  vec3 l=axis==0?west:south,ll=at(p-2.*d),r=axis==0?east:north,rr=at(p+2.*d);\n  float left=selective?peak(c-l):abs(lum(c-l)),right=selective?peak(r-c):abs(lum(r-c));\n  float outerL=selective?peak(l-ll):abs(lum(l-ll)),outerR=selective?peak(rr-r):abs(lum(rr-r));\n  float jump=max(left,right),side=min(left,right);\n  float smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));\n  float smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));\n  // Reject a continuous ramp: it is not evidence of a compression boundary.\n  float confidence=selective?1.-smoothstep(.2,.7,max(max(outerL,outerR),side)/max(jump,1e-5)):1.;\n  vec3 across=left>right?l:r;\n  result=mix(result,(c+across)*.5,cleanup*confidence*smoothSides*smallStep*.8*(1.-textureMask));\n }\n #endif\n #if SPATIAL_DEBAND\n if(deband>0.){\n  vec3 avg=vec3(0);float diff=0.,weightSum=0.;\n  float radius=mix(2.,8.,deband);\n  for(int i=0;i<4;i++){\n   if(float(i)>=debandTaps)break;\n   vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);\n   vec3 n=at(p+floor(d*radius));\n   // Outlying samples across an edge cannot pull a smooth region toward it.\n   float weight=selective?1.-smoothstep(.006,.012+deband*.04,peak(n-c)):1.;\n   avg+=n*weight;weightSum+=weight;\n   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));\n  }\n  avg=weightSum>0.?avg/weightSum:c;\n  float flatRegion=1.-smoothstep(.006,.012+deband*.04,diff);\n  result=mix(result,avg,deband*flatRegion*.8*(1.-textureMask));\n }\n #endif\n #if SPATIAL_CHROMA\n if(chroma>0.){\n  // Chroma from luma. 4:2:0 color is upsampled with a ~2 px blur while luma\n  // stays sharp. Across a luma edge, samples 2 px away on each side carry\n  // clean color; the center luma says which side (or blend) it belongs to.\n  vec2 g=vec2(lum(east)-lum(west),lum(north)-lum(south));\n  float gl=length(g);\n  if(gl>4./255.){\n   highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size,d=g/gl*2./size;\n   vec3 A=texture(source,uv-d).rgb,B=texture(source,uv+d).rgb;\n   float yA=lum(A),yB=lum(B),Y=lum(result),span=yB-yA;\n   float s=clamp((Y-yA)/(abs(span)>1e-4?span:1e-4),0.,1.);\n   vec2 cA=vec2(A.b,A.r)-yA,cB=vec2(B.b,B.r)-yB,cur=vec2(result.b,result.r)-Y,pred=mix(cA,cB,s);\n   // Only a blend of both sides is treated as upsampling blur; color outside\n   // that range is real detail (thin colored lines, text) and is kept.\n   vec2 inside=step(min(cA,cB)-2./255.,cur)*step(cur,max(cA,cB)+2./255.);\n   vec2 weight=chroma*smoothstep(4./255.,12./255.,abs(span))*inside;\n   vec2 cb_cr=mix(cur,pred,weight);\n   float Bc=cb_cr.x+Y,Rc=cb_cr.y+Y;\n   result=vec3(Rc,(Y-.2126*Rc-.0722*Bc)/.7152,Bc);\n  }\n }\n #endif\n #if SPATIAL_DETAIL\n if(detail>0.){\n  // Reuse center/cross samples; fetch only diagonals and distance-2 cross.\n  vec3 w[8]=vec3[8](at(p+vec2(-1,-1)),at(p+vec2(1,-1)),at(p+vec2(-1,1)),at(p+vec2(1,1)),at(p+vec2(2,0)),at(p-vec2(2,0)),at(p+vec2(0,2)),at(p-vec2(0,2)));\n  float lo=min(min(lum(c),min(lum(west),lum(east))),min(lum(south),lum(north))),hi=max(max(lum(c),max(lum(west),lum(east))),max(lum(south),lum(north)));\n  for(int i=0;i<4;i++){float l=lum(w[i]);lo=min(lo,l);hi=max(hi,l);}\n  // Cleanup/deband already smoothed this pixel: do not restore what they removed.\n  float untouched=1.-smoothstep(.5/255.,2./255.,peak(result-c));\n  // Luma-only detail: no colored fringes. Coring grows near strong edges so\n  // encoder ringing/mosquito noise is not amplified with real texture. The\n  // wide range (5x5 cross + ring) finds strong edges up to ~3 px away.\n  float L=lum(result),range=hi-lo,wLo=lo,wHi=hi;\n  for(int i=4;i<8;i++){float l=lum(w[i]);wLo=min(wLo,l);wHi=max(wHi,l);}\n  float fine=lum(c)-.25*(lum(west)+lum(east)+lum(south)+lum(north));\n  highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size;float ring=0.;\n  for(int i=0;i<8;i++){\n   vec2 d=i==0?vec2(3.5,.5):i==1?vec2(-3.5,-.5):i==2?vec2(.5,-3.5):i==3?vec2(-.5,3.5):i==4?vec2(2.5):i==5?vec2(-2.5):i==6?vec2(2.5,-2.5):vec2(-2.5,2.5);\n   float l=lum(texture(source,uv+d/size).rgb);ring+=l;wLo=min(wLo,l);wHi=max(wHi,l);\n  }\n  float clarity=lum(c)-ring/8.;\n  float t=1.5/255.+.06*range+.04*(wHi-wLo);\n  fine=sign(fine)*max(abs(fine)-t,0.);clarity=sign(clarity)*max(abs(clarity)-t,0.);\n  float dL=detail*untouched*(1.2*fine+.8*clarity*(1.-smoothstep(.15,.4,wHi-wLo)));\n  float margin=detail*2./255.;\n  // Bound new overshoot only; never pull an existing value back.\n  result+=clamp(L+dL,min(L,lo-margin),max(L,hi+margin))-L;\n }\n #endif\n #if SPATIAL_ANTIALIAS\n if(antialias>0.){\n  // Same directional AA as antialias.glsl, fused here when temporal is off:\n  // saves a full-frame pass and render target (memory bandwidth on iGPUs).\n  // Direction and blend come from the source; the blend is applied as a delta.\n  float nw=lum(at(p+vec2(-1,1))),ne=lum(at(p+vec2(1,1))),sw=lum(at(p+vec2(-1,-1))),se=lum(at(p+vec2(1,-1)));\n  float mid=lum(c),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));\n  vec2 dir=vec2(-(nw+ne-sw-se),nw+sw-ne-se);\n  float major=max(abs(dir.x),abs(dir.y));\n  float weight=antialias*smoothstep(.04,.15,hi-lo)*smoothstep(.05,.35,min(abs(dir.x),abs(dir.y))/max(major,1e-5));\n  if(weight>0.){\n   highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size,d=dir/max(major,1e-5)/size*.5;\n   vec3 smoothColor=(texture(source,uv-d).rgb+texture(source,uv+d).rgb)*.5;\n   float sl=lum(smoothColor);\n   if(sl>=lo&&sl<=hi)result+=(smoothColor-c)*weight;\n  }\n }\n #endif\n // On devices without float color targets, dither before this first quantization.\n #if SPATIAL_DEBAND\n if(quantize&&deband>0.)result+=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5)/255.;\n #endif\n fragColor=vec4(clamp(result,0.,1.),1.);\n}\n", "temporal": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source, history, motion;\nuniform float temporal;\nout vec4 fragColor;\nvoid main(){\n vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/size;\n vec3 c=texture(source,uv).rgb,lo=c,hi=c;\n for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){\n  vec3 n=texture(source,uv+vec2(x,y)/size).rgb;lo=min(lo,n);hi=max(hi,n);\n }\n vec3 field=texture(motion,uv).rgb;\n vec2 offset=(round(field.xy*255.)-128.)*.5;\n vec2 prevUV=uv+offset/size;\n vec3 old=texture(history,prevUV).rgb;\n float disagreement=max(max(abs(old.r-c.r),abs(old.g-c.g)),abs(old.b-c.b));\n float confidence=field.z*(1.-smoothstep(.02,.08,disagreement));\n if(any(lessThan(prevUV,vec2(0)))||any(greaterThan(prevUV,vec2(1))))confidence=0.;\n // Neighborhood clamp prevents old edges becoming trails or invented textures.\n old=clamp(old,lo-vec3(.004),hi+vec3(.004));\n fragColor=vec4(mix(c,old,temporal*confidence*.35),1.);\n}\n", "nnFeatures": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source;\nlayout(location=0) out vec4 featA;\nlayout(location=1) out vec4 featB;\nfloat Y(ivec2 p){return dot(texelFetch(source,clamp(p,ivec2(0),textureSize(source,0)-1),0).rgb,vec3(.2126,.7152,.0722));}\nvoid main(){ivec2 p=ivec2(gl_FragCoord.xy);\n vec4 hA=vec4(-0.226349,0.014705,0.006476,0.059624),hB=vec4(0.196681,-0.118776,0.014316,0.082932);float y;\n y=Y(p+ivec2(-1,-1));hA+=y*vec4(-0.157775,0.206327,0.434315,-0.279666);hB+=y*vec4(0.221413,-0.694872,0.093376,-0.538916);\n y=Y(p+ivec2(0,-1));hA+=y*vec4(-0.438596,0.246507,-0.337733,0.369609);hB+=y*vec4(-0.39346,-0.088393,0.514404,0.554256);\n y=Y(p+ivec2(1,-1));hA+=y*vec4(0.522971,0.3702,0.639016,-0.536868);hB+=y*vec4(0.07824,0.185036,-0.657592,0.70837);\n y=Y(p+ivec2(-1,0));hA+=y*vec4(-0.730832,-0.233706,0.42366,0.846775);hB+=y*vec4(-0.222371,-0.043975,-0.332283,-0.743265);\n y=Y(p+ivec2(0,0));hA+=y*vec4(-0.150888,0.408999,-0.659478,-0.365631);hB+=y*vec4(-1.388277,-0.823962,-0.268284,-0.802107);\n y=Y(p+ivec2(1,0));hA+=y*vec4(-1.056894,-0.842843,-0.174905,-0.26866);hB+=y*vec4(-0.053229,-0.506229,0.888183,0.175313);\n y=Y(p+ivec2(-1,1));hA+=y*vec4(-1.16294,-1.021929,0.190978,-0.160122);hB+=y*vec4(0.237714,-0.595438,-0.590489,0.173089);\n y=Y(p+ivec2(0,1));hA+=y*vec4(-0.953225,0.951,-0.07258,0.695426);hB+=y*vec4(0.172909,-0.472019,-0.1812,0.241279);\n y=Y(p+ivec2(1,1));hA+=y*vec4(-0.587355,-0.075366,-0.419964,-0.358507);hB+=y*vec4(0.174139,-0.177389,0.529243,0.159632);\n hA=max(hA,0.);hB=max(hB,0.);\n featA=max(vec4(0.025083,-0.005039,-0.060359,0.064819)+mat4(-0.621943,-0.463344,-0.115933,0.376332,-0.393935,-0.144085,-0.640372,-0.800653,-1.427048,0.260171,0.45471,-0.32547,0.45035,-0.165235,0.234294,-0.336041)*hA+mat4(-0.465179,-0.608917,-0.235469,0.379221,0.641487,-0.850979,-0.013973,-0.49559,0.025351,0.824426,0.423167,-0.268448,-0.549956,0.701361,0.319914,-0.337372)*hB,0.);\n featB=max(vec4(0.020966,-0.007923,0.005142,0.038897)+mat4(-0.037735,-0.190399,0.240126,-0.067749,0.437672,0.034552,-0.091689,0.037419,0.17063,-0.014929,0.061535,-0.013824,-0.149559,0.529273,0.026754,-0.18008)*hA+mat4(-1.681177,0.105725,-0.030044,0.226267,0.306316,-0.170306,0.534302,-0.007676,-0.225442,0.261837,-0.797967,-1.462143,0.689266,0.88499,0.075893,-0.010657)*hB,0.);\n}\n", "nnApply": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D source,featA,featB;\nuniform float strength;\nout vec4 fragColor;\nvoid main(){ivec2 p=ivec2(gl_FragCoord.xy),m=textureSize(source,0)-1;float d=-0.001243;\n {ivec2 q=clamp(p+ivec2(-1,-1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.037956,0.00161,5e-06,-0.025074))+dot(texelFetch(featB,q,0),vec4(-0.02408,0.018034,-0.106278,0.06329));}\n {ivec2 q=clamp(p+ivec2(0,-1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.035505,0.034456,0.003953,0.118791))+dot(texelFetch(featB,q,0),vec4(0.010837,-0.026097,-0.028258,-0.03518));}\n {ivec2 q=clamp(p+ivec2(1,-1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.03049,-0.018461,0.041689,-0.108793))+dot(texelFetch(featB,q,0),vec4(0.010782,-0.002217,-0.072839,-0.080931));}\n {ivec2 q=clamp(p+ivec2(-1,0),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.049853,-0.006694,0.05851,-0.119233))+dot(texelFetch(featB,q,0),vec4(0.006983,-0.019536,-0.198451,0.127994));}\n {ivec2 q=clamp(p+ivec2(0,0),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.049783,-0.037383,-0.04415,-0.044615))+dot(texelFetch(featB,q,0),vec4(-0.023085,0.035699,-0.07822,0.01058));}\n {ivec2 q=clamp(p+ivec2(1,0),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(0.019708,-0.029916,0.051002,-0.002716))+dot(texelFetch(featB,q,0),vec4(0.003588,-0.010781,-0.050707,-0.038427));}\n {ivec2 q=clamp(p+ivec2(-1,1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.001052,-0.01583,0.031577,0.070275))+dot(texelFetch(featB,q,0),vec4(0.03957,-0.005504,-0.093555,-0.078156));}\n {ivec2 q=clamp(p+ivec2(0,1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.020044,-0.022556,0.023078,0.110389))+dot(texelFetch(featB,q,0),vec4(0.025218,0.022058,-0.119821,0.046273));}\n {ivec2 q=clamp(p+ivec2(1,1),ivec2(0),m);d+=dot(texelFetch(featA,q,0),vec4(-0.032938,0.012272,-0.004361,-0.02909))+dot(texelFetch(featB,q,0),vec4(0.00613,0.00159,-0.068138,0.020778));}\n vec3 c=texelFetch(source,p,0).rgb;\n // Luma correction applied to all channels: chroma is left to the chroma stage.\n fragColor=vec4(clamp(c+vec3(strength*d),0.,1.),1);\n}\n", "cas": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;uniform sampler2D data;uniform vec2 iResolution;const int FILTER_UNSHARP_MASKING = 1;const int FILTER_CAS = 2;const float CAS_CONTRAST_PEAK = 0.8 * -3.0 + 8.0;const vec3 LUMINOSITY_FACTOR = vec3(0.299, 0.587, 0.114);uniform int filterId;uniform bool qualityMode;uniform float sharpenFactor;uniform float brightness;uniform float contrast;uniform float saturation;out vec4 fragColor;uniform float shadows,deband;uniform bool diagnostic;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nvec3 clarityBoost(sampler2D tex, vec2 coord, vec3 e) {vec2 texelSize = 1.0 / vec2(textureSize(tex, 0));vec3 b = texture(tex, coord + texelSize * vec2(0, 1)).rgb;vec3 d = texture(tex, coord + texelSize * vec2(-1, 0)).rgb;vec3 f = texture(tex, coord + texelSize * vec2(1, 0)).rgb;vec3 h = texture(tex, coord + texelSize * vec2(0, -1)).rgb;vec3 a;vec3 c;vec3 g;vec3 i;if (filterId == FILTER_UNSHARP_MASKING || qualityMode) {a = texture(tex, coord + texelSize * vec2(-1, 1)).rgb;c = texture(tex, coord + texelSize * vec2(1, 1)).rgb;g = texture(tex, coord + texelSize * vec2(-1, -1)).rgb;i = texture(tex, coord + texelSize * vec2(1, -1)).rgb;}if (filterId == FILTER_UNSHARP_MASKING) {vec3 gaussianBlur = (a + c + g + i) * 1.0 + (b + d + f + h) * 2.0 + e * 4.0;gaussianBlur /= 16.0;return e + (e - gaussianBlur) * sharpenFactor / 3.0;}vec3 minRgb = min(min(min(d, e), min(f, b)), h);vec3 maxRgb = max(max(max(d, e), max(f, b)), h);if (qualityMode) {minRgb += min(min(a, c), min(g, i));maxRgb += max(max(a, c), max(g, i));}vec3 reciprocalMaxRgb = 1.0 / max(maxRgb, vec3(1e-6));vec3 amplifyRgb = clamp(min(minRgb, 2.0 - maxRgb) * reciprocalMaxRgb, 0.0, 1.0);amplifyRgb = inversesqrt(max(amplifyRgb, vec3(1e-6)));vec3 weightRgb = -(1.0 / (amplifyRgb * CAS_CONTRAST_PEAK));vec3 reciprocalWeightRgb = 1.0 / (4.0 * weightRgb + 1.0);vec3 window = b + d + f + h;vec3 outColor = clamp((window * weightRgb + e) * reciprocalWeightRgb, 0.0, 1.0);return mix(e, outColor, sharpenFactor / 2.0);}void main() {vec2 uv = gl_FragCoord.xy / iResolution.xy;vec3 color = texture(data, uv).rgb;if (sharpenFactor > 0.0) {color = clarityBoost(data, uv, color);}color = mix(vec3(dot(color, LUMINOSITY_FACTOR)), color, saturation);color = contrast * (color - 0.5) + 0.5;color = brightness * color;fragColor = vec4(finishColor(color), 1.0);}", "casFiltered": "#version 300 es\nprecision highp float;\nprecision highp sampler2D;uniform sampler2D data;uniform vec2 iResolution;const int FILTER_UNSHARP_MASKING = 1;const int FILTER_CAS = 2;const float CAS_CONTRAST_PEAK = 0.8 * -3.0 + 8.0;const vec3 LUMINOSITY_FACTOR = vec3(0.299, 0.587, 0.114);uniform int filterId;uniform bool qualityMode;uniform float sharpenFactor;uniform float brightness;uniform float contrast;uniform float saturation;out vec4 fragColor;uniform float shadows,deband;uniform bool diagnostic;\nvec3 finishColor(vec3 c){\n float l=dot(c,vec3(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;\n // Full half-LSB dither preserves fractional levels; scaling it by filter strength\n // would bias rounding. Integer black/white remain unchanged after quantization.\n if(deband>0.)c+=noise/255.;\n if(diagnostic)c=mix(c,vec3(1,0,.75),.65);\n return clamp(c,0.,1.);\n}\n\nuniform float haloMargin,noiseFloor;uniform bool lumaSharpen;\nvec3 limitSharpen(vec3 center,vec3 sharpened,vec3 lo,vec3 hi){\n float range=max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b);\n float detail=smoothstep(noiseFloor,noiseFloor+4.0/255.0,range);\n vec3 result=clamp(mix(center,sharpened,detail),lo-vec3(haloMargin),hi+vec3(haloMargin));\n if(lumaSharpen)result=clamp(center+vec3(dot(result-center,vec3(0.2126,0.7152,0.0722))),0.0,1.0);\n return result;\n}\nvec3 clarityBoost(sampler2D tex, vec2 coord, vec3 e) {vec2 texelSize = 1.0 / vec2(textureSize(tex, 0));vec3 b = texture(tex, coord + texelSize * vec2(0, 1)).rgb;vec3 d = texture(tex, coord + texelSize * vec2(-1, 0)).rgb;vec3 f = texture(tex, coord + texelSize * vec2(1, 0)).rgb;vec3 h = texture(tex, coord + texelSize * vec2(0, -1)).rgb;vec3 a;vec3 c;vec3 g;vec3 i;if (filterId == FILTER_UNSHARP_MASKING || qualityMode) {a = texture(tex, coord + texelSize * vec2(-1, 1)).rgb;c = texture(tex, coord + texelSize * vec2(1, 1)).rgb;g = texture(tex, coord + texelSize * vec2(-1, -1)).rgb;i = texture(tex, coord + texelSize * vec2(1, -1)).rgb;}if (filterId == FILTER_UNSHARP_MASKING) {vec3 gaussianBlur = (a + c + g + i) * 1.0 + (b + d + f + h) * 2.0 + e * 4.0;gaussianBlur /= 16.0;return limitSharpen(e,e + (e - gaussianBlur) * sharpenFactor / 3.0,min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h));}vec3 minRgb = min(min(min(d, e), min(f, b)), h);vec3 maxRgb = max(max(max(d, e), max(f, b)), h);if (qualityMode) {minRgb += min(min(a, c), min(g, i));maxRgb += max(max(a, c), max(g, i));}vec3 reciprocalMaxRgb = 1.0 / max(maxRgb, vec3(1e-6));vec3 amplifyRgb = clamp(min(minRgb, 2.0 - maxRgb) * reciprocalMaxRgb, 0.0, 1.0);amplifyRgb = inversesqrt(max(amplifyRgb, vec3(1e-6)));vec3 weightRgb = -(1.0 / (amplifyRgb * CAS_CONTRAST_PEAK));vec3 reciprocalWeightRgb = 1.0 / (4.0 * weightRgb + 1.0);vec3 window = b + d + f + h;vec3 outColor = clamp((window * weightRgb + e) * reciprocalWeightRgb, 0.0, 1.0);return limitSharpen(e,mix(e, outColor, sharpenFactor / 2.0),min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h));}void main() {vec2 uv = gl_FragCoord.xy / iResolution.xy;vec3 color = texture(data, uv).rgb;if (sharpenFactor > 0.0) {color = clarityBoost(data, uv, color);}color = mix(vec3(dot(color, LUMINOSITY_FACTOR)), color, saturation);color = contrast * (color - 0.5) + 0.5;color = brightness * color;fragColor = vec4(finishColor(color), 1.0);}"};
globalThis.BxWgsl={"cas": "// WGSL port of the sharpening pass, in the GL frame (common.wgsl): Better xCloud's CAS/USM shader as\n// tools/build.py patches it ('cas': texel size from the source, guarded reciprocals, finishColor) and,\n// with LIMIT, 'casFiltered' (halo bound from the selected strength, noise floor, luma-only sharpening).\n// filterId and qualityMode stay uniforms, as in GLSL.\nstruct Params {iResolution:vec2f, sharpenFactor:f32, brightness:f32, contrast:f32, saturation:f32, shadows:f32, deband:f32,\n haloMargin:f32, noiseFloor:f32, filterId:f32, qualityMode:f32, lumaSharpen:f32, diag:f32, pad0:f32, pad1:f32};\n@group(0) @binding(0) var<uniform> u:Params;\noverride LIMIT:bool=true;\nconst CAS_CONTRAST_PEAK=0.8*-3.0+8.0;\nconst LUMINOSITY_FACTOR=vec3f(0.299,0.587,0.114);\nfn limitSharpen(center:vec3f,sharpened:vec3f,lo:vec3f,hi:vec3f)->vec3f{\n let range=max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b);\n let detail=smoothstep(u.noiseFloor,u.noiseFloor+4.0/255.0,range);\n var result=clamp(mix(center,sharpened,detail),lo-vec3f(u.haloMargin),hi+vec3f(u.haloMargin));\n if(u.lumaSharpen>.5){result=clamp(center+vec3f(dot(result-center,vec3f(0.2126,0.7152,0.0722))),vec3f(0),vec3f(1));}\n return result;}\nfn limited(e:vec3f,sharpened:vec3f,b:vec3f,d:vec3f,f:vec3f,h:vec3f)->vec3f{\n if(!LIMIT){return sharpened;}\n return limitSharpen(e,sharpened,min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h));}\nfn clarityBoost(coord:vec2f,e:vec3f)->vec3f{\n let texelSize=1.0/vec2f(sourceSize());\n let b=sampleGL(coord+texelSize*vec2f(0,1)).rgb;let d=sampleGL(coord+texelSize*vec2f(-1,0)).rgb;\n let f=sampleGL(coord+texelSize*vec2f(1,0)).rgb;let h=sampleGL(coord+texelSize*vec2f(0,-1)).rgb;\n var a=vec3f(0);var c=vec3f(0);var g=vec3f(0);var i=vec3f(0);\n let usm=u.filterId<1.5;let quality=u.qualityMode>.5;\n if(usm||quality){\n  a=sampleGL(coord+texelSize*vec2f(-1,1)).rgb;c=sampleGL(coord+texelSize*vec2f(1,1)).rgb;\n  g=sampleGL(coord+texelSize*vec2f(-1,-1)).rgb;i=sampleGL(coord+texelSize*vec2f(1,-1)).rgb;}\n if(usm){\n  var gaussianBlur=(a+c+g+i)*1.0+(b+d+f+h)*2.0+e*4.0;\n  gaussianBlur/=16.0;\n  return limited(e,e+(e-gaussianBlur)*u.sharpenFactor/3.0,b,d,f,h);}\n var minRgb=min(min(min(d,e),min(f,b)),h);\n var maxRgb=max(max(max(d,e),max(f,b)),h);\n if(quality){minRgb+=min(min(a,c),min(g,i));maxRgb+=max(max(a,c),max(g,i));}\n let reciprocalMaxRgb=1.0/max(maxRgb,vec3f(1e-6));\n var amplifyRgb=clamp(min(minRgb,2.0-maxRgb)*reciprocalMaxRgb,vec3f(0),vec3f(1));\n amplifyRgb=inverseSqrt(max(amplifyRgb,vec3f(1e-6)));\n let weightRgb=-(1.0/(amplifyRgb*CAS_CONTRAST_PEAK));\n let reciprocalWeightRgb=1.0/(4.0*weightRgb+1.0);\n let window=b+d+f+h;\n let outColor=clamp((window*weightRgb+e)*reciprocalWeightRgb,vec3f(0),vec3f(1));\n return limited(e,mix(e,outColor,u.sharpenFactor/2.0),b,d,f,h);}\n@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{\n let fc=fragGL(position,u.iResolution.y);let uv=fc/u.iResolution;\n var color=sampleGL(uv).rgb;\n if(u.sharpenFactor>0.0){color=clarityBoost(uv,color);}\n color=mix(vec3f(dot(color,LUMINOSITY_FACTOR)),color,u.saturation);\n color=u.contrast*(color-0.5)+0.5;\n color=u.brightness*color;\n return vec4f(finishColor(color,fc,u.shadows,u.deband,u.diag>.5),1.0);}\n", "common": "// Prelude of every WGSL pass (Spec 4, docs/spec4-webgpu.md), prepended by the WebGPU renderer.\n//\n// GL frame: the WebGL2 engine uploads the frame with UNPACK_FLIP_Y, so texture row 0 and gl_FragCoord.y = 0\n// are the bottom of the image. WebGPU textures, the canvas and @builtin(position) start at the top. Every\n// pass works in the GL frame (fragGL, fetchGL, sampleGL) and flips only to read or write a texel, so the\n// asymmetric offsets (deband taps, SGSR's +0.5 row) and the dither pattern give the GLSL bytes. Each stored\n// texture is then the GL one upside down, and the canvas, whose row 0 is the top, shows the same image.\n//\n// The renderer replaces SRC_TYPE, LOAD( and SAMPLE( before compiling: texture_2d<f32> for a texture,\n// texture_external for a video frame imported without a copy.\n@group(0) @binding(1) var source:SRC_TYPE;\n@group(0) @binding(2) var linearSampler:sampler;\n\n@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{\n let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(xy[i],0,1);}\n\nfn sourceSize()->vec2i{return vec2i(textureDimensions(source));}\n// gl_FragCoord.xy of a pass whose output has outH rows.\nfn fragGL(position:vec4f,outH:f32)->vec2f{return vec2f(position.x,outH-position.y);}\n// texelFetch in the GL frame: clamp to the edge, then flip the row.\nfn fetchGL(p:vec2i)->vec4f{let s=sourceSize();let q=clamp(p,vec2i(0),s-1);return LOAD(vec2i(q.x,s.y-1-q.y));}\n// texture() in the GL frame (v from the bottom): bilinear, clamped to the edge.\nfn sampleGL(uv:vec2f)->vec4f{return SAMPLE(vec2f(uv.x,1.-uv.y));}\n\n// finishColor of src/shaders/finish.glsl, fused into the last pass: shadows, a half-LSB dither on\n// gl_FragCoord (fc) and the diagnostic tint.\nfn finishColor(c0:vec3f,fc:vec2f,shadows:f32,deband:f32,diag:bool)->vec3f{\n var c=c0;let l=dot(c,vec3f(.2126,.7152,.0722));\n c+=shadows*pow(max(0.,1.-l),3.)*.15;\n let noise=fract(52.9829189*fract(dot(fc,vec2f(.06711056,.00583715))))-.5;\n if(deband>0.){c+=noise/255.;}\n if(diag){c=mix(c,vec3f(1,0,.75),.65);}\n return clamp(c,vec3f(0),vec3f(1));}\n", "copy": "// Same-size copy: the decoded frame (texture_external, converted to RGB once) into the RGBA8 input\n// texture, top row first, or a stored frame to the canvas. No GL frame needed: both sides are top-first.\n@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{return vec4f(LOAD(vec2i(position.xy)).rgb,1);}\n", "easu": "// WGSL port of src/shaders/easu.glsl (FSR 1 EASU), same math in the GL frame (common.wgsl).\n//\n// FidelityFX Super Resolution Sample\n//\n// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software and associated documentation files(the \"Software\"), to deal\n// in the Software without restriction, including without limitation the rights\n// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell\n// copies of the Software, and to permit persons to whom the Software is\n// furnished to do so, subject to the following conditions :\n// The above copyright notice and this permission notice shall be included in\n// all copies or substantial portions of the Software.\n// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE\n// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n// THE SOFTWARE.\nstruct Params {outputSize:vec2f, pad:vec2f};\n@group(0) @binding(0) var<uniform> u:Params;\nfn safeRcp(x:f32)->f32{return 1./max(x,1e-8);}\nfn safeRsq(x:f32)->f32{return inverseSqrt(max(x,1e-8));}\nfn min3(a:vec3f,b:vec3f,c:vec3f)->vec3f{return min(a,min(b,c));}\nfn max3(a:vec3f,b:vec3f,c:vec3f)->vec3f{return max(a,max(b,c));}\n// No textureGather on the GL side: each texel once (RGB), split per channel in gather order.\nstruct Gather {r:vec4f, g:vec4f, b:vec4f};\nfn gatherRGB(uv:vec2f)->Gather{let p=vec2i(floor(uv*vec2f(sourceSize())-.5));\n let t0=fetchGL(p+vec2i(0,1)).rgb;let t1=fetchGL(p+vec2i(1,1)).rgb;let t2=fetchGL(p+vec2i(1,0)).rgb;let t3=fetchGL(p).rgb;\n return Gather(vec4f(t0.r,t1.r,t2.r,t3.r),vec4f(t0.g,t1.g,t2.g,t3.g),vec4f(t0.b,t1.b,t2.b,t3.b));}\n// FsrEasuTapF: color (xyz) and weight (w) accumulated together.\nfn tapF(acc:ptr<function,vec4f>,off:vec2f,dir:vec2f,len:vec2f,lob:f32,clp:f32,c:vec3f){\n var v=vec2f(off.x*dir.x+off.y*dir.y,off.x*(-dir.y)+off.y*dir.x);\n v*=len;\n let d2=min(v.x*v.x+v.y*v.y,clp);\n var wB=(2./5.)*d2-1.;var wA=lob*d2-1.;\n wB*=wB;wA*=wA;\n wB=(25./16.)*wB-(25./16.-1.);\n let w=wB*wA;\n *acc+=vec4f(c*w,w);}\n// FsrEasuSetF: bilinear-weighted direction and length.\nfn setF(dir:ptr<function,vec2f>,len:ptr<function,f32>,pp:vec2f,biS:bool,biT:bool,biU:bool,biV:bool,lA:f32,lB:f32,lC:f32,lD:f32,lE:f32){\n var w=0.;\n if(biS){w=(1.-pp.x)*(1.-pp.y);}\n if(biT){w=pp.x*(1.-pp.y);}\n if(biU){w=(1.-pp.x)*pp.y;}\n if(biV){w=pp.x*pp.y;}\n let dc=lD-lC;let cb=lC-lB;\n var lenX=safeRcp(max(abs(dc),abs(cb)));\n let dirX=lD-lB;\n lenX=saturate(abs(dirX)*lenX);lenX*=lenX;\n let ec=lE-lC;let ca=lC-lA;\n var lenY=safeRcp(max(abs(ec),abs(ca)));\n let dirY=lE-lA;\n lenY=saturate(abs(dirY)*lenY);lenY*=lenY;\n *dir+=vec2f(dirX*w,dirY*w);\n *len+=lenX*w;*len+=lenY*w;}\nfn easu(ip:vec2f,con0:vec4f,con1:vec4f,con2:vec4f,con3:vec4f)->vec3f{\n var pp=ip*con0.xy+con0.zw;\n let fp=floor(pp);\n pp-=fp;\n // 12-tap kernel: b c / e f g h / i j k l / n o.\n let p0=fp*con1.xy+con1.zw;\n let p1=p0+con2.xy;let p2=p0+con2.zw;let p3=p0+con3.xy;\n let bczz=gatherRGB(p0);let ijfe=gatherRGB(p1);let klhg=gatherRGB(p2);let zzon=gatherRGB(p3);\n let bczzL=bczz.b*.5+(bczz.r*.5+bczz.g);\n let ijfeL=ijfe.b*.5+(ijfe.r*.5+ijfe.g);\n let klhgL=klhg.b*.5+(klhg.r*.5+klhg.g);\n let zzonL=zzon.b*.5+(zzon.r*.5+zzon.g);\n let bL=bczzL.x;let cL=bczzL.y;\n let iL=ijfeL.x;let jL=ijfeL.y;let fL=ijfeL.z;let eL=ijfeL.w;\n let kL=klhgL.x;let lL=klhgL.y;let hL=klhgL.z;let gL=klhgL.w;\n let oL=zzonL.z;let nL=zzonL.w;\n var dir=vec2f(0);var len=0.;\n setF(&dir,&len,pp,true,false,false,false,bL,eL,fL,gL,jL);\n setF(&dir,&len,pp,false,true,false,false,cL,fL,gL,hL,kL);\n setF(&dir,&len,pp,false,false,true,false,fL,iL,jL,kL,nL);\n setF(&dir,&len,pp,false,false,false,true,gL,jL,kL,lL,oL);\n // Normalize with approximation, and cleanup close to zero.\n let dir2=dir*dir;\n var dirR=dir2.x+dir2.y;\n let zro=dirR<1./32768.;\n dirR=safeRsq(dirR);\n dirR=select(dirR,1.,zro);\n dir.x=select(dir.x,1.,zro);\n dir*=vec2f(dirR);\n len=len*.5;len*=len;\n let stretch=(dir.x*dir.x+dir.y*dir.y)*safeRcp(max(abs(dir.x),abs(dir.y)));\n let len2=vec2f(1.+(stretch-1.)*len,1.+(-.5)*len);\n let lob=.5+((1./4.-.04)-.5)*len;\n let clp=safeRcp(lob);\n let min4=min(min3(vec3f(ijfe.r.z,ijfe.g.z,ijfe.b.z),vec3f(klhg.r.w,klhg.g.w,klhg.b.w),vec3f(ijfe.r.y,ijfe.g.y,ijfe.b.y)),vec3f(klhg.r.x,klhg.g.x,klhg.b.x));\n let max4=max(max3(vec3f(ijfe.r.z,ijfe.g.z,ijfe.b.z),vec3f(klhg.r.w,klhg.g.w,klhg.b.w),vec3f(ijfe.r.y,ijfe.g.y,ijfe.b.y)),vec3f(klhg.r.x,klhg.g.x,klhg.b.x));\n var acc=vec4f(0);\n tapF(&acc,vec2f(0,-1)-pp,dir,len2,lob,clp,vec3f(bczz.r.x,bczz.g.x,bczz.b.x));\n tapF(&acc,vec2f(1,-1)-pp,dir,len2,lob,clp,vec3f(bczz.r.y,bczz.g.y,bczz.b.y));\n tapF(&acc,vec2f(-1,1)-pp,dir,len2,lob,clp,vec3f(ijfe.r.x,ijfe.g.x,ijfe.b.x));\n tapF(&acc,vec2f(0,1)-pp,dir,len2,lob,clp,vec3f(ijfe.r.y,ijfe.g.y,ijfe.b.y));\n tapF(&acc,vec2f(0,0)-pp,dir,len2,lob,clp,vec3f(ijfe.r.z,ijfe.g.z,ijfe.b.z));\n tapF(&acc,vec2f(-1,0)-pp,dir,len2,lob,clp,vec3f(ijfe.r.w,ijfe.g.w,ijfe.b.w));\n tapF(&acc,vec2f(1,1)-pp,dir,len2,lob,clp,vec3f(klhg.r.x,klhg.g.x,klhg.b.x));\n tapF(&acc,vec2f(2,1)-pp,dir,len2,lob,clp,vec3f(klhg.r.y,klhg.g.y,klhg.b.y));\n tapF(&acc,vec2f(2,0)-pp,dir,len2,lob,clp,vec3f(klhg.r.z,klhg.g.z,klhg.b.z));\n tapF(&acc,vec2f(1,0)-pp,dir,len2,lob,clp,vec3f(klhg.r.w,klhg.g.w,klhg.b.w));\n tapF(&acc,vec2f(1,2)-pp,dir,len2,lob,clp,vec3f(zzon.r.z,zzon.g.z,zzon.b.z));\n tapF(&acc,vec2f(0,2)-pp,dir,len2,lob,clp,vec3f(zzon.r.w,zzon.g.w,zzon.b.w));\n // Normalize and dering.\n return min(max4,max(min4,acc.xyz*vec3f(safeRcp(acc.w))));}\n@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{\n let size=vec2f(sourceSize());let scale=size/u.outputSize;\n let con0=vec4f(scale,.5*scale-.5);let con1=vec4f(1./size,vec2f(1,-1)/size);let con2=vec4f(vec2f(-1,2)/size,vec2f(1,2)/size);let con3=vec4f(vec2f(0,4)/size,0,0);\n return vec4f(easu(fragGL(position,u.outputSize.y)-.5,con0,con1,con2,con3),1);}\n", "rcas": "// WGSL port of src/shaders/rcas.glsl (FSR 1 RCAS, denoise on, with the local halo limiter), GL frame.\n//\n// FidelityFX Super Resolution Sample\n//\n// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software and associated documentation files(the \"Software\"), to deal\n// in the Software without restriction, including without limitation the rights\n// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell\n// copies of the Software, and to permit persons to whom the Software is\n// furnished to do so, subject to the following conditions :\n// The above copyright notice and this permission notice shall be included in\n// all copies or substantial portions of the Software.\n// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE\n// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n// THE SOFTWARE.\nstruct Params {outputSize:vec2f, rcasStrength:f32, haloMargin:f32, noiseFloor:f32, contrast:f32, saturation:f32, shadows:f32,\n deband:f32, diag:f32, lumaSharpen:f32, pad:f32};\n@group(0) @binding(0) var<uniform> u:Params;\nfn luma2(c:vec3f)->f32{return c.b*.5+c.r*.5+c.g;}\n@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{\n let fc=fragGL(position,u.outputSize.y);let uv=fc/u.outputSize;let stepSize=1./vec2f(sourceSize());\n let e=sampleGL(uv).rgb;var c=e;\n if(u.rcasStrength>0.){\n  let b=sampleGL(uv+vec2f(0,-1)*stepSize).rgb;let d=sampleGL(uv+vec2f(-1,0)*stepSize).rgb;\n  let f=sampleGL(uv+vec2f(1,0)*stepSize).rgb;let h=sampleGL(uv+vec2f(0,1)*stepSize).rgb;\n  let bl=luma2(b);let dl=luma2(d);let el=luma2(e);let fl=luma2(f);let hl=luma2(h);\n  let range=max(max(max(bl,dl),max(fl,hl)),el)-min(min(min(bl,dl),min(fl,hl)),el);\n  let noise=1.-.5*clamp(abs(.25*(bl+dl+fl+hl)-el)/max(range,1e-6),0.,1.);\n  let mn=min(min(b,d),min(f,h));let mx=max(max(b,d),max(f,h));\n  let hitMin=min(mn,e)/max(4.*mx,vec3f(1e-6));\n  let hitMax=(1.-max(mx,e))/min(4.*mn-4.,vec3f(-1e-6));\n  let lobes=max(-hitMin,hitMax);\n  let lobe=max(-.1875,min(max(max(lobes.r,lobes.g),lobes.b),0.))*u.rcasStrength*noise;\n  c=(lobe*(b+d+f+h)+e)/(4.*lobe+1.);\n  let lo=min(mn,e);let hi=max(mx,e);\n  let detail=smoothstep(u.noiseFloor,u.noiseFloor+4./255.,max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b));\n  c=clamp(mix(e,c,detail),lo-u.haloMargin,hi+u.haloMargin);\n  if(u.lumaSharpen>.5){c=clamp(e+vec3f(dot(c-e,vec3f(.2126,.7152,.0722))),vec3f(0),vec3f(1));}\n }\n let l=dot(c,vec3f(.299,.587,.114));c=mix(vec3f(l),c,u.saturation);c=u.contrast*(c-.5)+.5;\n return vec4f(finishColor(c,fc,u.shadows,u.deband,u.diag>.5),1);}\n", "sgsr": "// Snapdragon Game Super Resolution 1 (SGSR 1), adapted from\n// https://github.com/SnapdragonStudios/snapdragon-gsr sgsr/v1/include/glsl/sgsr1_shader_mobile.frag\n//\n// Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.\n// (LICENSE file of the repository: Copyright (c) 2023, Qualcomm Innovation Center, Inc. All rights reserved.)\n// SPDX-License-Identifier: BSD-3-Clause\n//\n// Redistribution and use in source and binary forms, with or without\n// modification, are permitted provided that the following conditions are met:\n//\n// 1. Redistributions of source code must retain the above copyright notice,\n//    this list of conditions and the following disclaimer.\n//\n// 2. Redistributions in binary form must reproduce the above copyright notice,\n//    this list of conditions and the following disclaimer in the documentation\n//    and/or other materials provided with the distribution.\n//\n// 3. Neither the name of the copyright holder nor the names of its contributors\n//    may be used to endorse or promote products derived from this software\n//    without specific prior written permission.\n//\n// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\"\n// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE\n// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE\n// POSSIBILITY OF SUCH DAMAGE.\n//\n// Changes: as in src/shaders/sgsr.glsl (Rec.709 luma by texel loads, threshold and sharpness as uniforms,\n// zero-sum guard, finishing of the sharpening pass), ported to WGSL in the GL frame (common.wgsl).\nstruct Params {outputSize:vec2f, sharp:f32, threshold:f32, brightness:f32, contrast:f32, saturation:f32, shadows:f32,\n deband:f32, diag:f32, pad0:f32, pad1:f32};\n@group(0) @binding(0) var<uniform> u:Params;\nfn L(p:vec2i)->f32{return dot(fetchGL(p).rgb,vec3f(.2126,.7152,.0722));}\nfn fastLanczos2(x:f32)->f32{var wA=x-4.;let wB=x*wA-wA;wA*=wA;return wB*wA;}\nfn weightY(dx:f32,dy:f32,c:f32,dev:f32)->vec2f{let x=(dx*dx+dy*dy)*.55+clamp(abs(c)*dev,0.,1.);let w=fastLanczos2(x);return vec2f(w,w*c);}\n@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{\n let fc=fragGL(position,u.outputSize.y);let size=vec2f(sourceSize());let uv=fc/u.outputSize;\n var color=sampleGL(uv).rgb;let cy=dot(color,vec3f(.2126,.7152,.0722));\n let img=uv*size+vec2f(-.5,.5);let ip=floor(img);let pl=img-ip;let P=vec2i(ip);\n var left=vec4f(0);left.y=L(P);left.z=L(P+vec2i(0,-1));\n let vote=abs(left.z-left.y)+abs(cy-left.y)+abs(cy-left.z);\n if(vote>u.threshold){\n  left.x=L(P+vec2i(-1,0));left.w=L(P+vec2i(-1,-1));\n  var right=vec4f(L(P+vec2i(1,0)),L(P+vec2i(2,0)),L(P+vec2i(2,-1)),L(P+vec2i(1,-1)));\n  var ud=vec4f(L(P+vec2i(0,-2)),L(P+vec2i(1,-2)),L(P+vec2i(1,1)),L(P+vec2i(0,1)));\n  let mean=(left.y+left.z+right.x+right.w)*.25;left-=vec4f(mean);right-=vec4f(mean);ud-=vec4f(mean);let cw=cy-mean;\n  let a=abs(left)+abs(right)+abs(ud);let dev=2.181818/max(a.x+a.y+a.z+a.w,1e-4);\n  var s=weightY(pl.x,pl.y+1.,ud.x,dev)+weightY(pl.x-1.,pl.y+1.,ud.y,dev)+weightY(pl.x-1.,pl.y-2.,ud.z,dev)+weightY(pl.x,pl.y-2.,ud.w,dev);\n  s+=weightY(pl.x+1.,pl.y-1.,left.x,dev)+weightY(pl.x,pl.y-1.,left.y,dev)+weightY(pl.x,pl.y,left.z,dev)+weightY(pl.x+1.,pl.y,left.w,dev);\n  s+=weightY(pl.x-1.,pl.y-1.,right.x,dev)+weightY(pl.x-2.,pl.y-1.,right.y,dev)+weightY(pl.x-2.,pl.y,right.z,dev)+weightY(pl.x-1.,pl.y,right.w,dev);\n  var fy=s.y/s.x;let mx=max(max(left.y,left.z),max(right.x,right.w));let mn=min(min(left.y,left.z),min(right.x,right.w));\n  fy=clamp(u.sharp*fy,mn,mx);let dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,vec3f(0),vec3f(1));\n }\n // Same order as the sharpening pass it replaces (casFiltered): saturation, contrast, brightness, finish.\n color=mix(vec3f(dot(color,vec3f(.299,.587,.114))),color,u.saturation);color=u.contrast*(color-.5)+.5;color=u.brightness*color;\n return vec4f(finishColor(color,fc,u.shadows,u.deband,u.diag>.5),1);}\n", "spatial-cs": "// Compute entry of the spatial pass (spatial.wgsl), Spec 4 task 5. The decoded frame, imported without a\n// copy as a texture_external, is read once per 32x32 block plus an 8-texel margin (the farthest deband tap)\n// into workgroup memory, packed as RGBA8 (the bytes the copy pass would store), and every filter tap reads\n// from there. The YUV to RGB conversion is fused into the spatial pass: no input texture is written and\n// read back. Each of the 16x16 invocations loads 9 texels and filters 4 pixels.\n// The renderer replaces OUT_FORMAT with the target format (rgba8unorm, or rgba16float in Qualidade).\n@group(0) @binding(3) var outTex:texture_storage_2d<OUT_FORMAT,write>;\nconst BLOCK=32;\nconst MARGIN=8;\nconst SIDE=48;\nvar<workgroup> tile:array<u32,2304>;\nvar<private> origin:vec2i;// GL-frame texel of tile[0]\nfn cell(q:vec2i)->vec3f{let t=clamp(q-origin,vec2i(0),vec2i(SIDE-1));return unpack4x8unorm(tile[t.y*SIDE+t.x]).rgb;}\n// texelFetch in the GL frame: the tile cells were loaded clamped to the frame edge.\nfn at(p:vec2f)->vec3f{return cell(vec2i(p));}\n// Bilinear texture() in the GL frame, clamped to the edge like the sampler.\nfn tex(uv:vec2f)->vec3f{\n let mx=sourceSize()-1;let x=uv*vec2f(sourceSize())-.5;let i=floor(x);let f=x-i;\n let q0=clamp(vec2i(i),vec2i(0),mx);let q1=clamp(vec2i(i)+1,vec2i(0),mx);\n return mix(mix(cell(q0),cell(vec2i(q1.x,q0.y)),f.x),mix(cell(vec2i(q0.x,q1.y)),cell(q1),f.x),f.y);}\n@compute @workgroup_size(16,16) fn cs(@builtin(workgroup_id) wg:vec3u,@builtin(local_invocation_index) li:u32,@builtin(local_invocation_id) lid:vec3u){\n let s=sourceSize();origin=vec2i(wg.xy)*BLOCK-MARGIN;\n for(var k=li;k<u32(SIDE*SIDE);k+=256u){\n  let q=clamp(origin+vec2i(i32(k)%SIDE,i32(k)/SIDE),vec2i(0),s-1);\n  tile[k]=pack4x8unorm(vec4f(LOAD(vec2i(q.x,s.y-1-q.y)).rgb,1));}\n workgroupBarrier();\n let size=vec2f(s);\n for(var j=0;j<2;j++){for(var i=0;i<2;i++){\n  let g=vec2i(wg.xy)*BLOCK+vec2i(lid.xy)+vec2i(i,j)*16;\n  if(all(g<s)){textureStore(outTex,vec2i(g.x,s.y-1-g.y),spatial(vec2f(g)+.5,size));}}}\n}\n", "spatial-fs": "// Fragment entry of the spatial pass (spatial.wgsl): reads the source texture in the GL frame.\nfn at(p:vec2f)->vec3f{return fetchGL(vec2i(p)).rgb;}\nfn tex(uv:vec2f)->vec3f{return sampleGL(uv).rgb;}\n@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{\n let size=vec2f(sourceSize());return spatial(fragGL(position,size.y),size);}\n", "spatial": "// WGSL port of src/shaders/spatial.glsl (Spec 4, docs/spec4-webgpu.md). Same math, line for line.\n//\n// Coordinates in the GL frame and source bindings: see common.wgsl, prepended by the renderer.\n// The SPATIAL_* switches of the GLSL variants are pipeline-overridable constants, filled from\n// BxRestoration.spatialProfile, the same function that builds the WebGL2 variants. FIXED=false is the\n// generic pipeline (taps, quantize and selective from the uniforms), drawn while a variant compiles.\nstruct Strengths {cleanup:f32, deband:f32, chroma:f32, detail:f32, antialias:f32, taps:f32, quantize:f32, selective:f32};\n@group(0) @binding(0) var<uniform> u:Strengths;\noverride FIXED:bool=false;\noverride CLEANUP:bool=true;\noverride DEBAND:bool=true;\noverride CHROMA:bool=true;\noverride DETAIL:bool=true;\noverride ANTIALIAS:bool=true;\noverride TAPS:f32=4.0;\noverride QUANTIZE:bool=true;\noverride SELECTIVE:bool=true;\n\nfn peak(c:vec3f)->f32{return max(max(abs(c.r),abs(c.g)),abs(c.b));}\nfn lum(c:vec3f)->f32{return dot(c,vec3f(.2126,.7152,.0722));}\n\n// The filters for the pixel at gl_FragCoord fc of a size-texel frame. at(p) (texelFetch) and tex(uv)\n// (bilinear texture()) come from the entry point appended after this file: spatial-fs.wgsl reads the\n// source texture, spatial-cs.wgsl a workgroup tile of the imported frame.\nfn spatial(fc:vec2f,size:vec2f)->vec4f{\n let taps=select(u.taps,TAPS,FIXED);let quantize=select(u.quantize>.5,QUANTIZE,FIXED);let selective=select(u.selective>.5,SELECTIVE,FIXED);\n let p=fc-.5;let c=at(p);var result=c;\n let west=at(p-vec2f(1,0));let east=at(p+vec2f(1,0));\n let south=at(p-vec2f(0,1));let north=at(p+vec2f(0,1));\n let reversal=sqrt(max(0.,max(-lum(c-west)*lum(east-c),-lum(c-south)*lum(north-c))));\n var textureMask=smoothstep(.003,.015,reversal);\n if(selective){\n  let rx=max(-(c-west)*(east-c),-(c-south)*(north-c));\n  textureMask=max(textureMask,smoothstep(.003,.015,sqrt(max(0.,max(max(rx.r,rx.g),rx.b)))));\n }\n if(CLEANUP&&u.cleanup>0.){for(var axis=0;axis<2;axis++){\n  let d=select(vec2f(0,1),vec2f(1,0),axis==0);\n  let l=select(south,west,axis==0);let ll=at(p-2.*d);let r=select(north,east,axis==0);let rr=at(p+2.*d);\n  let left=select(abs(lum(c-l)),peak(c-l),selective);let right=select(abs(lum(r-c)),peak(r-c),selective);\n  let outerL=select(abs(lum(l-ll)),peak(l-ll),selective);let outerR=select(abs(lum(rr-r)),peak(rr-r),selective);\n  let jump=max(left,right);let side=min(left,right);\n  let smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));\n  let smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));\n  let confidence=select(1.,1.-smoothstep(.2,.7,max(max(outerL,outerR),side)/max(jump,1e-5)),selective);\n  let across=select(r,l,left>right);\n  result=mix(result,(c+across)*.5,u.cleanup*confidence*smoothSides*smallStep*.8*(1.-textureMask));\n }}\n if(DEBAND&&u.deband>0.){\n  var avg=vec3f(0);var diff=0.;var weightSum=0.;\n  let radius=mix(2.,8.,u.deband);\n  for(var i=0;i<4;i++){\n   if(f32(i)>=taps){break;}\n   var d=vec2f(-.5,1);if(i==0){d=vec2f(1,.5);}else if(i==1){d=vec2f(-1,-.5);}else if(i==2){d=vec2f(.5,-1);}\n   let n=at(p+floor(d*radius));\n   let weight=select(1.,1.-smoothstep(.006,.012+u.deband*.04,peak(n-c)),selective);\n   avg+=n*weight;weightSum+=weight;\n   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));\n  }\n  avg=select(c,avg/weightSum,weightSum>0.);\n  let flatRegion=1.-smoothstep(.006,.012+u.deband*.04,diff);\n  result=mix(result,avg,u.deband*flatRegion*.8*(1.-textureMask));\n }\n if(CHROMA&&u.chroma>0.){\n  let g=vec2f(lum(east)-lum(west),lum(north)-lum(south));\n  let gLen=length(g);\n  if(gLen>4./255.){\n   let uv=(p+.5)/size;let d=g/gLen*2./size;\n   let A=tex(uv-d);let B=tex(uv+d);\n   let yA=lum(A);let yB=lum(B);let Y=lum(result);let span=yB-yA;\n   let s=clamp((Y-yA)/select(1e-4,span,abs(span)>1e-4),0.,1.);\n   let cA=vec2f(A.b,A.r)-yA;let cB=vec2f(B.b,B.r)-yB;let cur=vec2f(result.b,result.r)-Y;let pred=mix(cA,cB,s);\n   let inside=step(min(cA,cB)-2./255.,cur)*step(cur,max(cA,cB)+2./255.);\n   let weight=u.chroma*smoothstep(4./255.,12./255.,abs(span))*inside;\n   let cb_cr=mix(cur,pred,weight);\n   let Bc=cb_cr.x+Y;let Rc=cb_cr.y+Y;\n   result=vec3f(Rc,(Y-.2126*Rc-.0722*Bc)/.7152,Bc);\n  }\n }\n if(DETAIL&&u.detail>0.){\n  let w=array<vec3f,8>(at(p+vec2f(-1,-1)),at(p+vec2f(1,-1)),at(p+vec2f(-1,1)),at(p+vec2f(1,1)),at(p+vec2f(2,0)),at(p-vec2f(2,0)),at(p+vec2f(0,2)),at(p-vec2f(0,2)));\n  var lo=min(min(lum(c),min(lum(west),lum(east))),min(lum(south),lum(north)));var hi=max(max(lum(c),max(lum(west),lum(east))),max(lum(south),lum(north)));\n  for(var i=0;i<4;i++){let l=lum(w[i]);lo=min(lo,l);hi=max(hi,l);}\n  let untouched=1.-smoothstep(.5/255.,2./255.,peak(result-c));\n  let L=lum(result);let range=hi-lo;var wLo=lo;var wHi=hi;\n  for(var i=4;i<8;i++){let l=lum(w[i]);wLo=min(wLo,l);wHi=max(wHi,l);}\n  var fine=lum(c)-.25*(lum(west)+lum(east)+lum(south)+lum(north));\n  let uv=(p+.5)/size;var ring=0.;\n  for(var i=0;i<8;i++){\n   var d=vec2f(-2.5,2.5);\n   if(i==0){d=vec2f(3.5,.5);}else if(i==1){d=vec2f(-3.5,-.5);}else if(i==2){d=vec2f(.5,-3.5);}else if(i==3){d=vec2f(-.5,3.5);}\n   else if(i==4){d=vec2f(2.5);}else if(i==5){d=vec2f(-2.5);}else if(i==6){d=vec2f(2.5,-2.5);}\n   let l=lum(tex(uv+d/size));ring+=l;wLo=min(wLo,l);wHi=max(wHi,l);\n  }\n  var clarity=lum(c)-ring/8.;\n  let t=1.5/255.+.06*range+.04*(wHi-wLo);\n  fine=sign(fine)*max(abs(fine)-t,0.);clarity=sign(clarity)*max(abs(clarity)-t,0.);\n  let dL=u.detail*untouched*(1.2*fine+.8*clarity*(1.-smoothstep(.15,.4,wHi-wLo)));\n  let margin=u.detail*2./255.;\n  result+=clamp(L+dL,min(L,lo-margin),max(L,hi+margin))-L;\n }\n if(ANTIALIAS&&u.antialias>0.){\n  let nw=lum(at(p+vec2f(-1,1)));let ne=lum(at(p+vec2f(1,1)));let sw=lum(at(p+vec2f(-1,-1)));let se=lum(at(p+vec2f(1,-1)));\n  let mid=lum(c);let lo=min(mid,min(min(nw,ne),min(sw,se)));let hi=max(mid,max(max(nw,ne),max(sw,se)));\n  let dir=vec2f(-(nw+ne-sw-se),nw+sw-ne-se);\n  let major=max(abs(dir.x),abs(dir.y));\n  let weight=u.antialias*smoothstep(.04,.15,hi-lo)*smoothstep(.05,.35,min(abs(dir.x),abs(dir.y))/max(major,1e-5));\n  if(weight>0.){\n   let uv=(p+.5)/size;let d=dir/max(major,1e-5)/size*.5;\n   let smoothColor=(tex(uv-d)+tex(uv+d))*.5;\n   let sl=lum(smoothColor);\n   if(sl>=lo&&sl<=hi){result+=(smoothColor-c)*weight;}\n  }\n }\n if(quantize&&DEBAND&&u.deband>0.){result+=(fract(52.9829189*fract(dot(fc,vec2f(.06711056,.00583715))))-.5)/255.;}\n return vec4f(clamp(result,vec3f(0),vec3f(1)),1.);\n}\n"};
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
      report(){return {schema:2,version:'9.7.1',build:globalThis.BxBuild??null,started,ended,stopReason,recording,metadata,disjoints,
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
  function downloadReport(report){const name='bx-v9.7.1-diagnostics-'+Date.now()+'.json';
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
  // What one frame runs, shared by the WebGL2 and WebGPU renderers (Spec 4): the filters left on by the
  // budget and their strengths, the scaler and the last pass with its uniforms. Each renderer only turns
  // this into draws. Neural restoration, temporal and the separate AA pass after it are WebGL2-only
  // (gl: true); the WebGPU renderer hands such a frame back to WebGL2 (rendererSupports).
  // floatTargets: whether Qualidade gets 16-bit float targets (then the spatial pass does not dither).
  function framePlan(s,budget,w,h,outW,outH,floatTargets,diagnostic=false){
    const filtered=s.mode==='filtered',quality=s.processingMode==='quality',plan={filtered,quality,neural:0,spatial:null,temporal:0,antialias:0,scaler:null,final:null,gl:false};
    if(filtered){
      if(s.neural>0&&floatTargets&&budget.neuralAllowed)plan.neural=s.neural;
      const cleanup=budget.cleanupAllowed?s.cleanup:0,deband=s.deband*budget.debandScale;
      const chroma=budget.enhanceAllowed?s.chroma:0,detail=budget.enhanceAllowed?s.detail:0;
      const temporalEnabled=s.temporal>0&&budget.temporalAllowed;
      // Without temporal, AA runs inside the spatial pass (no extra full-frame pass).
      const antialias=s.antialias>0&&budget.antialiasAllowed?s.antialias:0,fusedAntialias=temporalEnabled?0:antialias;
      if(cleanup>0||deband>0||chroma>0||detail>0||fusedAntialias>0)
        plan.spatial={cleanup,deband,chroma,detail,antialias:fusedAntialias,debandTaps:budget.debandTaps,quantize:!(quality&&floatTargets),selective:s.spatialMode==='selective'};
      if(temporalEnabled){plan.temporal=s.temporal;plan.antialias=antialias;}
      // Upscale: EASU then the sharpening pass, or SGSR alone as the last pass (item 5). At native
      // output SGSR is never used: the sharpening pass stays (SGSR was measured only when scaling).
      if(s.upscale&&outW>w&&outH>h)plan.scaler=s.scaler==='sgsr'?'sgsr':'easu';
    }
    // One last pass to the output: SGSR (scaling and sharpening, with the finishing of the sharpening
    // pass), or one sharpening stage. 'native' follows the Better xCloud menu (CAS/USM). The
    // reference applies the same method and strength with the unmodified upstream shader.
    if(plan.scaler==='sgsr')plan.final={name:'sgsr',key:'source',uniforms:{...sgsrParams(s.sharpness),brightness:1,contrast:s.contrast,saturation:s.saturation,shadows:s.shadows,deband:s.deband*budget.debandScale,diagnostic}};
    else{const method=s.sharpening==='native'?s.processing:s.sharpening;
      const name=s.mode!=='original'&&method==='rcas'?'rcas':filtered?'casFiltered':'cas';
      plan.final={name,key:'data',filterId:method==='usm'?1:2,uniforms:{iResolution:[outW,outH],qualityMode:filtered&&quality,rcasStrength:s.sharpness/10,haloMargin:(2+s.sharpness)/255,noiseFloor:s.noiseFloor/255,lumaSharpen:s.lumaSharpen,sharpenFactor:s.mode==='original'?0:s.mode==='cas'?s.sharpness/1.2:s.sharpness/(quality?1:1.2),brightness:1,contrast:filtered?s.contrast:1,saturation:filtered?s.saturation:1,shadows:filtered?s.shadows:0,deband:filtered?s.deband*budget.debandScale:0,diagnostic}};}
    plan.gl=plan.neural>0||plan.temporal>0;
    return plan;
  }
  // Whether the WebGPU renderer draws this plan; otherwise the frame goes to WebGL2 (same image).
  function rendererSupports(plan){return !plan.gl;}
  // Configuration of one frame in the measurement (diagnostics segment), shared by both renderers.
  function segmentConfig(s,budget,w,h,outW,outH,revision,diagnostic,floatTargets,renderer){
    const filtered=s.mode==='filtered',{hud:_hud,hudPosition:_position,...measured}=s;
    const config={settings:measured,diagnostic,source:[w,h],output:[outW,outH],revision,effective:{neural:filtered&&floatTargets&&budget.neuralAllowed?s.neural:0,temporal:filtered&&s.temporal>0&&budget.temporalAllowed,cleanup:filtered&&budget.cleanupAllowed?s.cleanup:0,chroma:filtered&&budget.enhanceAllowed?s.chroma:0,detail:filtered&&budget.enhanceAllowed?s.detail:0,deband:filtered?s.deband*budget.debandScale:0,debandTaps:filtered&&s.deband>0?budget.debandTaps:0,antialias:filtered&&budget.antialiasAllowed?s.antialias:0,scaler:filtered&&s.upscale&&outW>w&&outH>h?s.scaler:null}};
    if(renderer)config.renderer=renderer;return config;
  }
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
      const segment=this.diagnostics.active?this.diagnostics.frame(segmentConfig(s,this.budget,w,h,outW,outH,revision,diagnostic,this.floatTargets),performance.now()):null;
      this.usedTargets=new Set();
      if(this.ext&&this.queries.length<4){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
      try{
        gl.activeTexture(gl.TEXTURE0);this.configure(this.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        let source=this.input;
        const plan=framePlan(s,this.budget,w,h,outW,outH,this.floatTargets,diagnostic);
        if(plan.filtered){
          // Neural restoration first: trained on decoded stream luma (tools/nn), needs float targets.
          if(plan.neural>0){
            const features=this.targetPair('nnFeatures',w,h),restored=this.target('neural',w,h,plan.quality);
            this.draw('nnFeatures',features,w,h,{source});
            this.draw('nnApply',restored,w,h,{source,featA:features.texture,featB:features.second},{strength:plan.neural});source=restored.texture;
          }
          if(plan.spatial){
            const spatial=this.target('spatial',w,h,plan.quality),u=plan.spatial;
            this.draw(this.spatialVariant(u),spatial,w,h,{source},u);source=spatial.texture;
          }
          const temporalEnabled=plan.temporal>0;
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
            this.draw('temporal',temporal,w,h,{source,history:history.texture,motion:motion.texture},{temporal:valid?plan.temporal:0});source=temporal.texture;
            this.historyIndex=index; // Ping-pong retains both histories without two extra copies.
          }
          this.previous=temporalEnabled?{time,w,h}:null;
          if(plan.antialias>0){const aa=this.target('aa',w,h,plan.quality);this.draw('antialias',aa,w,h,{source},{amount:plan.antialias});source=aa.texture;}
          if(plan.scaler==='easu'){const scaled=this.target('scaled',outW,outH,plan.quality);this.draw('easu',scaled,outW,outH,{source});source=scaled.texture;}
        }else this.previous=null;
        const final={...plan.final,textures:{[plan.final.key]:source}};
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
  globalThis.BxRestoration={framePlan,rendererSupports,segmentConfig,sgsrParams,sgsrSource,spatialPrecision,spatialProfile,spatialKey,spatialSource,liveCadence,cadenceMargin,streamSummary,qpFromBitsPerPixel,compressionLevel,compressionScales,presets,presetOf,createPacer,createRtpClock,frameStats,applySmoothing,h264Profile,decoderSummary,createDiagnostics,captureVideoStats,downloadReport,Engine,defaults,normalize,historyValid,createBudget,outputSize,resolveOutput};
})();

/* WebGPU renderer (Spec 4, docs/spec4-webgpu.md): the frames of Engine (WebGL2) drawn with the WGSL ports in
   src/webgpu, embedded by tools/build.py as BxWgsl. Shared with WebGL2: BxRestoration.framePlan (what each
   frame runs and with which uniforms), the spatial profiles, the budget and the diagnostics. Only resources,
   frame import and draws live here. Neural restoration and temporal stay in WebGL2 (rendererSupports). */
(() => {
  const R=globalThis.BxRestoration;
  // Field order of each WGSL uniform struct (all f32; padded to 16 bytes).
  const PACK={
    spatial:u=>[u.cleanup,u.deband,u.chroma,u.detail,u.antialias,u.debandTaps,u.quantize?1:0,u.selective?1:0],
    easu:(u,w,h)=>[w,h,0,0],
    cas:u=>[u.iResolution[0],u.iResolution[1],u.sharpenFactor,u.brightness,u.contrast,u.saturation,u.shadows,u.deband,u.haloMargin,u.noiseFloor,u.filterId,u.qualityMode?1:0,u.lumaSharpen?1:0,u.diagnostic?1:0,0,0],
    rcas:(u,w,h)=>[w,h,u.rcasStrength,u.haloMargin,u.noiseFloor,u.contrast,u.saturation,u.shadows,u.deband,u.diagnostic?1:0,u.lumaSharpen?1:0,0],
    sgsr:(u,w,h)=>[w,h,u.sharp,u.threshold,u.brightness,u.contrast,u.saturation,u.shadows,u.deband,u.diagnostic?1:0,0,0],
    copy:()=>[0,0,0,0],
  };
  // Shader file and pipeline constants of each pass name used by framePlan.
  const SHADER={spatial:'spatial',easu:'easu',cas:'cas',casFiltered:'cas',rcas:'rcas',sgsr:'sgsr',copy:'copy'};
  const CONSTANTS={cas:{LIMIT:0},casFiltered:{LIMIT:1}};
  // Spatial variant: the same profile as the WebGL2 variants, as pipeline-overridable constants.
  function spatialConstants(p){const b=v=>v?1:0;return {FIXED:1,CLEANUP:b(p.cleanup),DEBAND:b(p.deband),CHROMA:b(p.chroma),DETAIL:b(p.detail),ANTIALIAS:b(p.antialias),TAPS:p.taps,QUANTIZE:b(p.quantize),SELECTIVE:b(p.selective)};}
  // WGSL files of each module after common.wgsl: the spatial filters are one function (spatial.wgsl) with a
  // fragment entry (texture source) and a compute entry (workgroup tile of the imported frame).
  const PARTS={spatial:['spatial','spatial-fs'],spatialCompute:['spatial','spatial-cs']};
  function wgsl(name,kind,format){let code=[globalThis.BxWgsl.common,...(PARTS[name]||[name]).map(p=>globalThis.BxWgsl[p])].join('\n');const ext=kind==='ext';
    if(format)code=code.replaceAll('OUT_FORMAT',format);
    return code.replaceAll('SRC_TYPE',ext?'texture_external':'texture_2d<f32>').replaceAll('LOAD(','loadSource(').replaceAll('SAMPLE(','sampleSource(')+
      (ext?'\nfn loadSource(c:vec2i)->vec4f{return textureLoad(source,c);}\nfn sampleSource(uv:vec2f)->vec4f{return textureSampleBaseClampToEdge(source,linearSampler,uv);}\n'
        :'\nfn loadSource(c:vec2i)->vec4f{return textureLoad(source,c,0);}\nfn sampleSource(uv:vec2f)->vec4f{return textureSampleLevel(source,linearSampler,uv,0.0);}\n');}
  const isFrame=s=>typeof VideoFrame!=='undefined'&&s instanceof VideoFrame||typeof HTMLVideoElement!=='undefined'&&s instanceof HTMLVideoElement;
  const SLOTS=16,PENDING=4;
  class GpuEngine {
    // Use create(): the device and the pipelines of the default frame are ready before the first frame.
    constructor(device,context,format,options){
      this.device=device;this.context=context;this.format=format;this.options=options;this.budget=R.createBudget();this.diagnostics=R.createDiagnostics();
      this.frames=0;this.previous=null;this.floatTargets=true;this.fenceTiming=false;this.gpuEstimate=null;this.targets={};this.pipelines=new Map();this.jobs=new Map();this.failedVariants=new Set();
      this.modules={};this.uniforms=new Map();this.failed=null;this.onfail=null;this.renderer='webgpu';
      // Fused compute spatial pass for decoded frames (task 5); false keeps the copy + fragment path.
      this.computeSpatial=options.compute!==false;
      this.timestamps=device.features.has('timestamp-query');this.ext=this.timestamps?{}:null;this.pending=[];this.free=[];this.nextQuery=0;
      if(this.timestamps){this.querySet=device.createQuerySet({type:'timestamp',count:SLOTS*4});this.resolve=device.createBuffer({size:SLOTS*256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});}
      const entry=(binding,resource)=>({binding,visibility:GPUShaderStage.FRAGMENT|GPUShaderStage.COMPUTE,...resource});
      this.layouts={tex:device.createBindGroupLayout({entries:[entry(0,{buffer:{type:'uniform'}}),entry(1,{texture:{sampleType:'float'}}),entry(2,{sampler:{type:'filtering'}})]}),
        ext:device.createBindGroupLayout({entries:[entry(0,{buffer:{type:'uniform'}}),entry(1,{externalTexture:{}}),entry(2,{sampler:{type:'filtering'}})]})};
      this.pipelineLayouts={tex:device.createPipelineLayout({bindGroupLayouts:[this.layouts.tex]}),ext:device.createPipelineLayout({bindGroupLayouts:[this.layouts.ext]})};
      this.sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
      this.dummy=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM});
      device.lost.then(info=>this.fail('Dispositivo WebGPU perdido: '+(info.message||info.reason)));
      device.addEventListener('uncapturederror',e=>this.fail('Erro WebGPU: '+String(e.error?.message||e.error).slice(0,300)));
    }
    // A failure (device lost, validation error) stops this renderer for good; the owner falls back to WebGL2.
    fail(reason){if(this.failed)return;this.failed=reason;try{this.onfail?.(reason);}catch{}}
    module(name,kind,format){const key=name+'|'+kind+'|'+(format||'');return this.modules[key]??=this.device.createShaderModule({code:wgsl(name,kind,format)});}
    // Compute layout of the fused spatial pass: the imported frame in, a storage texture of this format out.
    computeLayout(format){const key='extc:'+format;if(!this.pipelineLayouts[key]){const v=GPUShaderStage.COMPUTE;
      this.layouts[key]=this.device.createBindGroupLayout({entries:[{binding:0,visibility:v,buffer:{type:'uniform'}},{binding:1,visibility:v,externalTexture:{}},{binding:2,visibility:v,sampler:{type:'filtering'}},{binding:3,visibility:v,storageTexture:{access:'write-only',format}}]});
      this.pipelineLayouts[key]=this.device.createPipelineLayout({bindGroupLayouts:[this.layouts[key]]});}return key;}
    buildCompute(format,constants){const key=this.pipelineKey('spatialCompute','ext',format,constants);
      if(this.pipelines.has(key))return Promise.resolve(this.pipelines.get(key));let job=this.jobs.get(key);if(job)return job;
      const layout=this.pipelineLayouts[this.computeLayout(format)],module=this.module('spatialCompute','ext',format);
      job=this.device.createComputePipelineAsync({layout,compute:{module,entryPoint:'cs',constants}})
        .then(p=>{this.pipelines.set(key,p);this.jobs.delete(key);return p;},e=>{this.jobs.delete(key);this.failedVariants.add(key);throw e;});
      this.jobs.set(key,job);return job;}
    readyCompute(format,constants){const key=this.pipelineKey('spatialCompute','ext',format,constants);const p=this.pipelines.get(key);if(p)return p;
      if(!this.failedVariants.has(key))this.buildCompute(format,constants).catch(e=>console.warn('[BxWebGPU] compute pipeline failed',key,e));return null;}
    computePipeline(u,format){const c=spatialConstants(R.spatialProfile(u,'highp'));return this.readyCompute(format,c)||this.readyCompute(format,{FIXED:0});}
    // Pipeline for a pass, created asynchronously. ready() returns it or null while it compiles.
    pipelineKey(name,kind,format,constants){return [name,kind,format,JSON.stringify(constants||{})].join('|');}
    build(name,kind,format,constants={}){const key=this.pipelineKey(name,kind,format,constants);
      if(this.pipelines.has(key))return Promise.resolve(this.pipelines.get(key));
      let job=this.jobs.get(key);if(job)return job;
      const module=this.module(SHADER[name]||name,kind);
      job=this.device.createRenderPipelineAsync({layout:this.pipelineLayouts[kind],vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}],constants},primitive:{topology:'triangle-list'}})
        .then(p=>{this.pipelines.set(key,p);this.jobs.delete(key);return p;},e=>{this.jobs.delete(key);this.failedVariants.add(key);throw e;});
      this.jobs.set(key,job);return job;}
    ready(name,kind,format,constants={}){const key=this.pipelineKey(name,kind,format,constants);const p=this.pipelines.get(key);if(p)return p;
      if(!this.failedVariants.has(key))this.build(name,kind,format,constants).catch(e=>console.warn('[BxWebGPU] pipeline failed',key,e));return null;}
    // Spatial pipeline for these uniforms: the compiled variant once ready, the generic one meanwhile.
    spatialPipeline(u,format){const c=spatialConstants(R.spatialProfile(u,'highp'));return {pipeline:this.ready('spatial','tex',format,c)||this.ready('spatial','tex',format,{FIXED:0}),variant:c};}
    async warm(){const f=['rgba8unorm','rgba16float'],out=this.format,d=R.defaults,jobs=[];
      jobs.push(this.build('copy','ext','rgba8unorm'),this.build('copy','tex','rgba8unorm'),this.build('copy','tex',out));
      for(const t of f){jobs.push(this.build('spatial','tex',t,{FIXED:0}),this.build('easu','tex',t));}
      // The default frame: Spec 3 spatial variant, EASU, then casFiltered or SGSR on the canvas or a slot.
      const profile=spatialConstants(R.spatialProfile({cleanup:d.cleanup,deband:d.deband,chroma:d.chroma,detail:d.detail,antialias:d.antialias,debandTaps:4,quantize:true,selective:d.spatialMode==='selective'},'highp'));
      jobs.push(this.build('spatial','tex','rgba8unorm',profile));
      if(this.computeSpatial)for(const t of f)jobs.push(this.buildCompute(t,{FIXED:0}),...(t==='rgba8unorm'?[this.buildCompute(t,profile)]:[]));
      for(const t of new Set([out,'rgba8unorm']))for(const n of ['casFiltered','cas','sgsr','rcas'])jobs.push(this.build(n,'tex',t,CONSTANTS[n]));
      await Promise.all(jobs);}
    texture(w,h,fp){return this.device.createTexture({size:[w,h],format:fp?'rgba16float':'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});}
    target(name,w,h,fp=false){this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h&&t.fp===fp)return t;
      t?.texture.destroy();t={w,h,fp,format:fp?'rgba16float':'rgba8unorm'};t.texture=this.texture(w,h,fp);t.view=t.texture.createView();this.targets[name]=t;return t;}
    uniform(key,values){let b=this.uniforms.get(key);const size=Math.ceil(values.length/4)*16;
      if(!b||b.size<size){b?.destroy();b=this.device.createBuffer({size,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.uniforms.set(key,b);}
      const data=new Float32Array(size/4);data.set(values);this.device.queue.writeBuffer(b,0,data);return b;}
    bind(kind,buffer,resource){return this.device.createBindGroup({layout:this.layouts[kind],entries:[{binding:0,resource:{buffer:buffer||this.dummy}},{binding:1,resource},{binding:2,resource:this.sampler}]});}
    // Records one full-screen pass. ts: {begin,end} query indices of the frame's first or last pass.
    pass(encoder,pipeline,group,view,ts){const d={colorAttachments:[{view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]};
      if(ts&&(ts.begin!=null||ts.end!=null)){d.timestampWrites={querySet:this.querySet};if(ts.begin!=null)d.timestampWrites.beginningOfPassWriteIndex=ts.begin;if(ts.end!=null)d.timestampWrites.endOfPassWriteIndex=ts.end;}
      const p=encoder.beginRenderPass(d);p.setPipeline(pipeline);p.setBindGroup(0,group);p.draw(3);p.end();}
    // Encodes a list of passes; the first one writes the begin timestamp and the last one the end.
    encode(encoder,passes,q){passes.forEach((p,i)=>{const ts=q!=null&&{begin:i===0?q:null,end:i===passes.length-1?q+1:null};
      if(!p.dispatch){this.pass(encoder,p.pipeline,p.group,p.view,ts);return;}
      const d={};if(ts&&(ts.begin!=null||ts.end!=null)){d.timestampWrites={querySet:this.querySet};if(ts.begin!=null)d.timestampWrites.beginningOfPassWriteIndex=ts.begin;if(ts.end!=null)d.timestampWrites.endOfPassWriteIndex=ts.end;}
      const c=encoder.beginComputePass(d);c.setPipeline(p.pipeline);c.setBindGroup(0,p.group);c.dispatchWorkgroups(...p.dispatch);c.end();});}
    // Frame import. A decoded frame (VideoFrame, <video>) is imported without a copy (importExternalTexture)
    // and converted to RGB once, by the copy pass into the RGBA8 input: reading the external texture in every
    // tap of the spatial pass converts YUV again each time and costs more (docs/spec4-webgpu.md). Other
    // sources (canvas, ImageBitmap: tests) are copied by the queue.
    importFrame(source,w,h,passes){const input=this.target('input',w,h);
      if(isFrame(source)){const ext=this.device.importExternalTexture({source});const p=this.ready('copy','ext','rgba8unorm');if(!p)return null;
        passes.push({pipeline:p,group:this.bind('ext',null,ext),view:input.view});}
      else this.device.queue.copyExternalImageToTexture({source},{texture:input.texture},[w,h]);
      return input;}
    // The last pass of a frame: its pipeline for a target format and its uniform values.
    finalPass(f,format){const name=f.name,p=this.ready(name,'tex',format,CONSTANTS[name]);return p;}
    finalValues(f,w,h){return PACK[SHADER[f.name]]({...f.uniforms,filterId:f.filterId},w,h);}
    outputSize(w,h,settings){
      if(this.budget.limitMs!==settings.gpuBudget){this.resetBudget();this.budget.limitMs=settings.gpuBudget;}
      this.budget.configure(settings,h);this.poll();
      return R.outputSize(w,h,this.budget.outputFor(settings));
    }
    // Whether this renderer draws a frame with these settings (neural restoration and temporal: WebGL2 only).
    supports(rawSettings,w,h,outW,outH){const s=R.normalize(rawSettings);return R.rendererSupports(R.framePlan(s,this.budget,w,h,outW,outH,true));}
    nextQueries(){if(!this.timestamps||this.pending.length>=PENDING)return null;const q=(this.nextQuery%SLOTS)*4;this.nextQuery++;return q;}
    // Copies the frame's timestamps (begin/end of render, and of present when deferred) to a mappable buffer.
    collect(encoder,item){if(!item)return;const n=item.parts*2,read=this.free.pop()||this.device.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      // Resolve offsets must be multiples of 256: one 256-byte block per frame slot.
      const at=item.q/4*256;encoder.resolveQuerySet(this.querySet,item.q,n,this.resolve,at);encoder.copyBufferToBuffer(this.resolve,at,read,0,n*8);item.read=read;this.pending.push(item);}
    mapPending(item){item.read.mapAsync(GPUMapMode.READ).then(()=>{const v=new BigUint64Array(item.read.getMappedRange());let ns=0;for(let i=0;i<item.parts;i++)ns+=Number(v[i*2+1]-v[i*2]);item.read.unmap();
        item.ms=ns/1e6;item.done=true;this.free.push(item.read);},()=>{item.done=true;item.ms=null;});}
    poll(){while(this.pending.length&&this.pending[0].done){const item=this.pending.shift();
      if(item.ms!=null&&item.ms>=0&&item.revision===this.budget.revision){this.budget.sample(item.ms,item.mode);this.diagnostics.sample(item.segment,item.ms);}}}
    render(source,outW,outH,rawSettings,time,diagnostic=false,outputTarget=null,deferFinal=false){
      if(this.failed)return false;
      const s=R.normalize(rawSettings),w=source.videoWidth||source.displayWidth||source.width,h=source.videoHeight||source.displayHeight||source.height;
      if(!w||!h)return false;
      if(this.budget.limitMs!==s.gpuBudget){this.resetBudget();this.budget.limitMs=s.gpuBudget;}
      this.budget.configure(s,h);this.poll();
      const plan=R.framePlan(s,this.budget,w,h,outW,outH,this.floatTargets,diagnostic);
      if(!R.rendererSupports(plan))return false;
      const revision=this.budget.revision,segment=this.diagnostics.active?this.diagnostics.frame(R.segmentConfig(s,this.budget,w,h,outW,outH,revision,diagnostic,this.floatTargets,'webgpu'),performance.now()):null;
      this.usedTargets=new Set();const passes=[];
      try{
        // A decoded frame with spatial filters: the fused compute pass reads it directly (no input copy).
        let input=null,src=null;
        if(plan.spatial&&this.computeSpatial&&isFrame(source)){const t=this.target('spatial',w,h,plan.quality),p=this.computePipeline(plan.spatial,t.format);
          if(p){const ext=this.device.importExternalTexture({source}),layout=this.layouts[this.computeLayout(t.format)];
            const group=this.device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:this.uniform('spatial',PACK.spatial(plan.spatial))}},{binding:1,resource:ext},{binding:2,resource:this.sampler},{binding:3,resource:t.view}]});
            passes.push({pipeline:p,group,dispatch:[Math.ceil(w/32),Math.ceil(h/32)]});src=t;}}
        if(!src){input=this.importFrame(source,w,h,passes);if(!input)return false;src=input;}
        if(plan.spatial&&src===input){const t=this.target('spatial',w,h,plan.quality),{pipeline}=this.spatialPipeline(plan.spatial,t.format);if(!pipeline)return false;
          passes.push({pipeline,group:this.bind('tex',this.uniform('spatial',PACK.spatial(plan.spatial)),src.view),view:t.view});src=t;}
        if(plan.scaler==='easu'){const t=this.target('scaled',outW,outH,plan.quality),p=this.ready('easu','tex',t.format);if(!p)return false;
          passes.push({pipeline:p,group:this.bind('tex',this.uniform('easu',PACK.easu(null,outW,outH)),src.view),view:t.view});src=t;}
        const final=plan.final,q=this.nextQueries();
        const item=q==null?null:{q,parts:1,mode:s.mode,revision,segment};
        const encoder=this.device.createCommandEncoder();
        if(outputTarget&&deferFinal){
          const old=this.targets[outputTarget];if(old)this.flushSlot(old);
          const owner=src===input?null:Object.keys(this.targets).find(k=>this.targets[k]===src&&!k.startsWith('paced'));
          let slot;
          if(owner){slot=src;this.targets[outputTarget]=slot;if(old)this.targets[owner]=old;else delete this.targets[owner];this.usedTargets.add(outputTarget);}
          else{slot=this.target(outputTarget,w,h,false);const p=this.ready('copy','tex','rgba8unorm');if(!p)return false;passes.push({pipeline:p,group:this.bind('tex',null,src.view),view:slot.view});}
          slot.final={...final,w:outW,h:outH};slot.pendingQuery=item;
          if(passes.length)this.encode(encoder,passes,item?.q);else if(item)item.empty=true;
        }else{
          const t=outputTarget?this.target(outputTarget,outW,outH):null,format=t?t.format:this.format,p=this.finalPass(final,format);if(!p)return false;
          passes.push({pipeline:p,group:this.bind('tex',this.uniform('final:'+(outputTarget||''),this.finalValues(final,outW,outH)),src.view),view:t?t.view:this.canvasView()});
          this.encode(encoder,passes,item?.q);this.collect(encoder,item);
        }
        this.device.queue.submit([encoder.finish()]);if(item?.read)this.mapPending(item);
        this.frames++;return true;
      }finally{
        for(const [name,t] of Object.entries(this.targets))if(!this.usedTargets.has(name)&&!name.startsWith('paced')){t.texture.destroy();delete this.targets[name];}
        this.usedTargets=null;
      }
    }
    canvasView(){this.canvasTexture=this.context.getCurrentTexture();return this.canvasTexture.createView();}
    // A slot leaving the pacer without being presented: its render() time still counts.
    flushSlot(t){const item=t.pendingQuery;t.pendingQuery=null;t.final=null;
      if(item&&!item.empty){const e=this.device.createCommandEncoder();this.collect(e,item);this.device.queue.submit([e.finish()]);this.mapPending(item);}}
    // Shows a frame stored by render(...,outputTarget): the deferred last pass, or a copy, on the canvas.
    present(name){const t=this.targets[name];if(!t||this.failed)return false;
      const encoder=this.device.createCommandEncoder(),view=this.canvasView();
      if(t.final){let item=t.pendingQuery;t.pendingQuery=null;const p=this.finalPass(t.final,this.format);if(!p)return false;
        const group=this.bind('tex',this.uniform('present',this.finalValues(t.final,t.final.w,t.final.h)),t.view);
        // The render() passes wrote queries q, q+1; this pass writes q+2, q+3 (or q, q+1 when render() drew nothing).
        let q=null;if(item){if(item.empty){item.empty=false;q=item.q;}else{q=item.q+2;item.parts=2;}}
        this.pass(encoder,p,group,view,q!=null&&{begin:q,end:q+1});this.collect(encoder,item);
        this.device.queue.submit([encoder.finish()]);if(item?.read)this.mapPending(item);}
      else{const p=this.ready('copy','tex',this.format);if(!p)return false;this.pass(encoder,p,this.bind('tex',null,t.view),view);this.device.queue.submit([encoder.finish()]);}
      return true;}
    // Pixels of a target or of the canvas texture of this task, as WebGL2's readPixels would return them
    // (RGBA, bottom row first): for regression tests and benches.
    async read(name){const t=name==='canvas'?{texture:this.canvasTexture,w:this.canvasTexture.width,h:this.canvasTexture.height,format:this.format}:this.targets[name];
      const w=t.w,h=t.h,fp=t.format==='rgba16float',bpp=fp?8:4,row=Math.ceil(w*bpp/256)*256,buf=this.device.createBuffer({size:row*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const e=this.device.createCommandEncoder();e.copyTextureToBuffer({texture:t.texture},{buffer:buf,bytesPerRow:row},[w,h]);this.device.queue.submit([e.finish()]);
      await buf.mapAsync(GPUMapMode.READ);const src=new Uint8Array(buf.getMappedRange()),out=new Uint8Array(w*h*4),bgra=t.format==='bgra8unorm';
      if(fp){const half=new Uint16Array(buf.getMappedRange());const f16=x=>{const s=x&0x8000?-1:1,e=(x>>10)&31,m=x&1023;return s*(e?Math.pow(2,e-15)*(1+m/1024):Math.pow(2,-14)*m/1024);};
        for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++)out[((h-1-y)*w+x)*4+c]=Math.round(Math.min(1,Math.max(0,f16(half[(y*row/2)+x*4+c])))*255);}
      else for(let y=0;y<h;y++){const a=src.subarray(y*row,y*row+w*4),o=(h-1-y)*w*4;out.set(a,o);if(bgra)for(let x=0;x<w;x++){const i=o+x*4,r=out[i];out[i]=out[i+2];out[i+2]=r;}}
      buf.unmap();buf.destroy();return out;}
    releasePaced(){for(const [name,t] of Object.entries(this.targets))if(name.startsWith('paced')){t.pendingQuery=null;t.texture.destroy();delete this.targets[name];}}
    resetHistory(){this.previous=null;}
    resetBudget(){for(const t of Object.values(this.targets))t.pendingQuery=null;this.pending=[];this.budget=R.createBudget();this.resetHistory();}
    destroy(){for(const t of Object.values(this.targets))t.texture.destroy();this.targets={};for(const b of this.uniforms.values())b.destroy();this.uniforms.clear();
      this.querySet?.destroy();this.resolve?.destroy();this.dummy?.destroy();this.onfail=null;try{this.context.unconfigure();}catch{}this.device.destroy();}
  }
  // Adapter, device (with timestamp-query when offered) and the pipelines of the default frame, before any
  // frame is drawn: creating a pipeline can take close to a second on the Adreno 825.
  async function create(canvas,options={}){
    // unavailable: no WebGPU here (no API, adapter or device), as opposed to a failure of this renderer.
    const unavailable=m=>Object.assign(new Error(m),{unavailable:true});
    if(!navigator.gpu)throw unavailable('WebGPU indisponível');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:options.powerPreference||'high-performance'});if(!adapter)throw unavailable('Sem adaptador WebGPU');
    const requiredFeatures=['timestamp-query'].filter(f=>adapter.features.has(f)&&options.timestamps!==false);
    let device;try{device=await adapter.requestDevice({requiredFeatures});}catch(e){throw unavailable('Sem dispositivo WebGPU: '+(e.message||e));}
    const context=canvas.getContext('webgpu');if(!context){device.destroy();throw new Error('Canvas sem contexto WebGPU');}
    const format=options.format||navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|(options.readable?GPUTextureUsage.COPY_SRC:0)});
    const engine=new GpuEngine(device,context,format,options);engine.adapter=adapter.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description}:{};
    const t=performance.now();try{await engine.warm();}catch(e){engine.destroy();throw e;}engine.warmMs=performance.now()-t;
    if(engine.failed){const r=engine.failed;engine.destroy();throw new Error(r);}
    return engine;
  }
  globalThis.BxWebGPU={create,GpuEngine,spatialConstants,supported:()=>!!globalThis.navigator?.gpu};
})();
