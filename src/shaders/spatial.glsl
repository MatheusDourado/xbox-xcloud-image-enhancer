#version 300 es
// Compiled variants (restoration-engine.js, spatialSource) define SPATIAL_FIXED, the SPATIAL_* switches
// below and SPATIAL_PRECISION after the #version line: disabled filters are compiled out and the loop
// and flags become constants. Without them this is the generic shader driven by uniforms only.
#ifndef SPATIAL_PRECISION
#define SPATIAL_PRECISION highp
#endif
#ifndef SPATIAL_CLEANUP
#define SPATIAL_CLEANUP 1
#endif
#ifndef SPATIAL_DEBAND
#define SPATIAL_DEBAND 1
#endif
#ifndef SPATIAL_CHROMA
#define SPATIAL_CHROMA 1
#endif
#ifndef SPATIAL_DETAIL
#define SPATIAL_DETAIL 1
#endif
#ifndef SPATIAL_ANTIALIAS
#define SPATIAL_ANTIALIAS 1
#endif
// Color math may run in mediump (half floats on Adreno/Mali); pixel coordinates stay highp.
precision SPATIAL_PRECISION float;
precision highp sampler2D;
uniform sampler2D source;
uniform float cleanup, deband, chroma, detail, antialias;
#ifdef SPATIAL_FIXED
const float debandTaps=SPATIAL_TAPS;
const bool quantize=SPATIAL_QUANTIZE,selective=SPATIAL_SELECTIVE;
#else
uniform float debandTaps;
uniform bool quantize,selective;
#endif
out vec4 fragColor;
float peak(vec3 c){return max(max(abs(c.r),abs(c.g)),abs(c.b));}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 at(highp vec2 p){return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;}
void main(){
 highp vec2 p=gl_FragCoord.xy-.5;vec3 c=at(p), result=c;
 vec3 west=at(p-vec2(1,0)),east=at(p+vec2(1,0));
 vec3 south=at(p-vec2(0,1)),north=at(p+vec2(0,1));
 // Gradient sign reversals identify fine texture/extrema, even at low contrast.
 // Reuse these neighbors for cleanup; no extra classification render target.
 float reversal=sqrt(max(0.,max(-lum(c-west)*lum(east-c),-lum(c-south)*lum(north-c))));
 float textureMask=smoothstep(.003,.015,reversal);
 // Color extrema matter even on nearly isoluminant colored text and fine lines.
 if(selective){
  vec3 rx=max(-(c-west)*(east-c),-(c-south)*(north-c));
  textureMask=max(textureMask,smoothstep(.003,.015,sqrt(max(0.,max(max(rx.r,rx.g),rx.b)))));
 }
 // Detect a small step between smooth regions; do not assume a codec block grid.
 #if SPATIAL_CLEANUP
 if(cleanup>0.)for(int axis=0;axis<2;axis++){
  vec2 d=axis==0?vec2(1,0):vec2(0,1);
  vec3 l=axis==0?west:south,ll=at(p-2.*d),r=axis==0?east:north,rr=at(p+2.*d);
  float left=selective?peak(c-l):abs(lum(c-l)),right=selective?peak(r-c):abs(lum(r-c));
  float outerL=selective?peak(l-ll):abs(lum(l-ll)),outerR=selective?peak(rr-r):abs(lum(rr-r));
  float jump=max(left,right),side=min(left,right);
  float smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));
  float smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));
  // Reject a continuous ramp: it is not evidence of a compression boundary.
  float confidence=selective?1.-smoothstep(.2,.7,max(max(outerL,outerR),side)/max(jump,1e-5)):1.;
  vec3 across=left>right?l:r;
  result=mix(result,(c+across)*.5,cleanup*confidence*smoothSides*smallStep*.8*(1.-textureMask));
 }
 #endif
 #if SPATIAL_DEBAND
 if(deband>0.){
  vec3 avg=vec3(0);float diff=0.,weightSum=0.;
  float radius=mix(2.,8.,deband);
  for(int i=0;i<4;i++){
   if(float(i)>=debandTaps)break;
   vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);
   vec3 n=at(p+floor(d*radius));
   // Outlying samples across an edge cannot pull a smooth region toward it.
   float weight=selective?1.-smoothstep(.006,.012+deband*.04,peak(n-c)):1.;
   avg+=n*weight;weightSum+=weight;
   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));
  }
  avg=weightSum>0.?avg/weightSum:c;
  float flatRegion=1.-smoothstep(.006,.012+deband*.04,diff);
  result=mix(result,avg,deband*flatRegion*.8*(1.-textureMask));
 }
 #endif
 #if SPATIAL_CHROMA
 if(chroma>0.){
  // Chroma from luma. 4:2:0 color is upsampled with a ~2 px blur while luma
  // stays sharp. Across a luma edge, samples 2 px away on each side carry
  // clean color; the center luma says which side (or blend) it belongs to.
  vec2 g=vec2(lum(east)-lum(west),lum(north)-lum(south));
  float gl=length(g);
  if(gl>4./255.){
   highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size,d=g/gl*2./size;
   vec3 A=texture(source,uv-d).rgb,B=texture(source,uv+d).rgb;
   float yA=lum(A),yB=lum(B),Y=lum(result),span=yB-yA;
   float s=clamp((Y-yA)/(abs(span)>1e-4?span:1e-4),0.,1.);
   vec2 cA=vec2(A.b,A.r)-yA,cB=vec2(B.b,B.r)-yB,cur=vec2(result.b,result.r)-Y,pred=mix(cA,cB,s);
   // Only a blend of both sides is treated as upsampling blur; color outside
   // that range is real detail (thin colored lines, text) and is kept.
   vec2 inside=step(min(cA,cB)-2./255.,cur)*step(cur,max(cA,cB)+2./255.);
   vec2 weight=chroma*smoothstep(4./255.,12./255.,abs(span))*inside;
   vec2 cb_cr=mix(cur,pred,weight);
   float Bc=cb_cr.x+Y,Rc=cb_cr.y+Y;
   result=vec3(Rc,(Y-.2126*Rc-.0722*Bc)/.7152,Bc);
  }
 }
 #endif
 #if SPATIAL_DETAIL
 if(detail>0.){
  // Reuse center/cross samples; fetch only diagonals and distance-2 cross.
  vec3 w[8]=vec3[8](at(p+vec2(-1,-1)),at(p+vec2(1,-1)),at(p+vec2(-1,1)),at(p+vec2(1,1)),at(p+vec2(2,0)),at(p-vec2(2,0)),at(p+vec2(0,2)),at(p-vec2(0,2)));
  float lo=min(min(lum(c),min(lum(west),lum(east))),min(lum(south),lum(north))),hi=max(max(lum(c),max(lum(west),lum(east))),max(lum(south),lum(north)));
  for(int i=0;i<4;i++){float l=lum(w[i]);lo=min(lo,l);hi=max(hi,l);}
  // Cleanup/deband already smoothed this pixel: do not restore what they removed.
  float untouched=1.-smoothstep(.5/255.,2./255.,peak(result-c));
  // Luma-only detail: no colored fringes. Coring grows near strong edges so
  // encoder ringing/mosquito noise is not amplified with real texture. The
  // wide range (5x5 cross + ring) finds strong edges up to ~3 px away.
  float L=lum(result),range=hi-lo,wLo=lo,wHi=hi;
  for(int i=4;i<8;i++){float l=lum(w[i]);wLo=min(wLo,l);wHi=max(wHi,l);}
  float fine=lum(c)-.25*(lum(west)+lum(east)+lum(south)+lum(north));
  highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size;float ring=0.;
  for(int i=0;i<8;i++){
   vec2 d=i==0?vec2(3.5,.5):i==1?vec2(-3.5,-.5):i==2?vec2(.5,-3.5):i==3?vec2(-.5,3.5):i==4?vec2(2.5):i==5?vec2(-2.5):i==6?vec2(2.5,-2.5):vec2(-2.5,2.5);
   float l=lum(texture(source,uv+d/size).rgb);ring+=l;wLo=min(wLo,l);wHi=max(wHi,l);
  }
  float clarity=lum(c)-ring/8.;
  float t=1.5/255.+.06*range+.04*(wHi-wLo);
  fine=sign(fine)*max(abs(fine)-t,0.);clarity=sign(clarity)*max(abs(clarity)-t,0.);
  float dL=detail*untouched*(1.2*fine+.8*clarity*(1.-smoothstep(.15,.4,wHi-wLo)));
  float margin=detail*2./255.;
  // Bound new overshoot only; never pull an existing value back.
  result+=clamp(L+dL,min(L,lo-margin),max(L,hi+margin))-L;
 }
 #endif
 #if SPATIAL_ANTIALIAS
 if(antialias>0.){
  // Same directional AA as antialias.glsl, fused here when temporal is off:
  // saves a full-frame pass and render target (memory bandwidth on iGPUs).
  // Direction and blend come from the source; the blend is applied as a delta.
  float nw=lum(at(p+vec2(-1,1))),ne=lum(at(p+vec2(1,1))),sw=lum(at(p+vec2(-1,-1))),se=lum(at(p+vec2(1,-1)));
  float mid=lum(c),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));
  // Edge tangent: the diagonal gradient (ne+se-nw-sw, nw+ne-sw-se) turned 90 degrees, so the two
  // samples lie along the edge, not across it (v10.1: the y sign was mirrored, blurring across).
  vec2 dir=vec2(-(nw+ne-sw-se),ne+se-nw-sw);
  float major=max(abs(dir.x),abs(dir.y));
  float weight=antialias*smoothstep(.04,.15,hi-lo)*smoothstep(.05,.35,min(abs(dir.x),abs(dir.y))/max(major,1e-5));
  if(weight>0.){
   highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size,d=dir/max(major,1e-5)/size*.5;
   vec3 smoothColor=(texture(source,uv-d).rgb+texture(source,uv+d).rgb)*.5;
   float sl=lum(smoothColor);
   if(sl>=lo&&sl<=hi)result+=(smoothColor-c)*weight;
  }
 }
 #endif
 // On devices without float color targets, dither before this first quantization.
 #if SPATIAL_DEBAND
 if(quantize&&deband>0.)result+=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5)/255.;
 #endif
 fragColor=vec4(clamp(result,0.,1.),1.);
}
