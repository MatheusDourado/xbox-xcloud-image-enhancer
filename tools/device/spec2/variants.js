// Shader variants of sections 10.1 and 10.2 and the SGSR prototype, shared by the cost bench and the gain bench.
// Prototypes live here only: nothing in src/ changes in Spec 2.
globalThis.BxVariants=S=>{
const rep=(s,pairs)=>{for(const [a,b] of pairs){if(!s.includes(a)&&!(a instanceof RegExp&&a.test(s)))throw new Error('variant anchor missing: '+a);s=s.split(a).join(b);}return s;};
const hp=[['precision highp float;','precision mediump float;']],sp=[['precision highp sampler2D;','precision mediump sampler2D;']];
const spatialCoords=[['vec3 at(vec2 p)','vec3 at(highp vec2 p)'],['vec2 p=gl_FragCoord.xy-.5;','highp vec2 p=gl_FragCoord.xy-.5;'],['vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size','highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size']];
const def={cleanup:.5,deband:.3,debandTaps:4,chroma:.75,detail:.2,antialias:0};
const constants=s=>rep(s,[['uniform float cleanup, deband, debandTaps, chroma, detail, antialias;\nuniform bool quantize,selective;',`const float cleanup=${def.cleanup},deband=${def.deband},debandTaps=4.,chroma=${def.chroma},detail=${def.detail},antialias=0.;\nconst bool quantize=true,selective=true;`]]);
const FETCH_TEXTURE=[['return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;','return texture(source,(p+.5)/vec2(textureSize(source,0))).rgb;']];
// Detail only where the 5x5 neighbourhood has contrast: reads of the ring are skipped in flat areas.
const gate=s=>rep(s,[[' if(detail>0.){\n  // Reuse center/cross',' float gateRange=max(max(peak(c-west),peak(c-east)),max(peak(c-north),peak(c-south)));\n if(detail>0.&&gateRange>1.5/255.){\n  // Reuse center/cross']]);
// USM on the luma of the source, in the same pass: the native path loses a full-frame pass.
const fusedUsm=s=>rep(s,[[' // On devices without float color targets',' {float Lc=lum(result),blur=.25*(lum(west)+lum(east)+lum(south)+lum(north)),lo5=min(min(lum(west),lum(east)),min(lum(south),lum(north))),hi5=max(max(lum(west),lum(east)),max(lum(south),lum(north)));\n  float amt=(lum(c)-blur)*usmAmount;float lim=clamp(Lc+amt,min(Lc,lo5-5./255.),max(Lc,hi5+5./255.));result+=lim-Lc;}\n // On devices without float color targets'],['out vec4 fragColor;','uniform float usmAmount;out vec4 fragColor;']]);
// Deband with the per-sample test of FFmpeg vf_deband (MIT notice) and a per-pixel rotated pattern.
const debandV2=s=>rep(s,[['vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);','float ang=6.2831853*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));vec2 rr=vec2(cos(ang),sin(ang));vec2 d=i==0?rr:i==1?-rr:i==2?vec2(-rr.y,rr.x):vec2(rr.y,-rr.x);']]);
const SGSR=`#version 300 es
precision mediump float;
precision highp int;
precision mediump sampler2D;
// Prototype of Snapdragon GSR 1 without textureGather (BSD-3-Clause, Qualcomm Innovation Center): 12 texelFetch.
uniform sampler2D source;uniform highp vec2 outputSize;uniform float sharp,threshold;out vec4 fragColor;
float L(ivec2 p,ivec2 m){return dot(texelFetch(source,clamp(p,ivec2(0),m),0).rgb,vec3(.2126,.7152,.0722));}
float lanczos(float x){float a=x-4.;float b=x*a-a;a*=a;return b*a;}
vec2 wy(float dx,float dy,float c,float s){float x=(dx*dx+dy*dy)*.55+clamp(abs(c)*s,0.,1.);float w=lanczos(x);return vec2(w,w*c);}
void main(){
 highp vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/outputSize;ivec2 m=ivec2(size)-1;
 vec3 color=textureLod(source,uv,0.).rgb;float cy=dot(color,vec3(.2126,.7152,.0722));
 highp vec2 img=uv*size+vec2(-.5,.5),ip=floor(img);vec2 pl=vec2(img-ip);ivec2 P=ivec2(ip);
 vec4 left;left.y=L(P,m);left.z=L(P+ivec2(0,-1),m);
 float vote=abs(left.z-left.y)+abs(cy-left.y)+abs(cy-left.z);
 if(vote>threshold){
  left.x=L(P+ivec2(-1,0),m);left.w=L(P+ivec2(-1,-1),m);
  vec4 right=vec4(L(P+ivec2(1,0),m),L(P+ivec2(2,0),m),L(P+ivec2(2,-1),m),L(P+ivec2(1,-1),m));
  vec4 ud=vec4(L(P+ivec2(0,-2),m),L(P+ivec2(1,-2),m),L(P+ivec2(1,1),m),L(P+ivec2(0,1),m));
  float mean=(left.y+left.z+right.x+right.w)*.25;left-=mean;right-=mean;ud-=mean;float cw=cy-mean;
  vec4 a=abs(left)+abs(right)+abs(ud);float std=2.181818/(a.x+a.y+a.z+a.w);
  vec2 s=wy(pl.x,pl.y+1.,ud.x,std)+wy(pl.x-1.,pl.y+1.,ud.y,std)+wy(pl.x-1.,pl.y-2.,ud.z,std)+wy(pl.x,pl.y-2.,ud.w,std);
  s+=wy(pl.x+1.,pl.y-1.,left.x,std)+wy(pl.x,pl.y-1.,left.y,std)+wy(pl.x,pl.y,left.z,std)+wy(pl.x+1.,pl.y,left.w,std);
  s+=wy(pl.x-1.,pl.y-1.,right.x,std)+wy(pl.x-2.,pl.y-1.,right.y,std)+wy(pl.x-2.,pl.y,right.z,std)+wy(pl.x-1.,pl.y,right.w,std);
  float fy=s.y/s.x,mx=max(max(left.y,left.z),max(right.x,right.w)),mn=min(min(left.y,left.z),min(right.x,right.w));
  fy=clamp(sharp*fy,mn,mx);float dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,0.,1.);
 }
 fragColor=vec4(color,1);
}`;
const variants={
 spatialMp:rep(S.spatial,[...hp,...spatialCoords]),spatialMpS:rep(S.spatial,[...hp,...sp,...spatialCoords]),
 spatialConst:constants(S.spatial),spatialTex:rep(S.spatial,FETCH_TEXTURE),spatialGate:gate(S.spatial),spatialUsm:fusedUsm(S.spatial),spatialDb2:debandV2(S.spatial),
 spatialMpConst:constants(rep(S.spatial,[...hp,...spatialCoords])),
 casMp:rep(S.casFiltered,[...hp,['vec2 texelSize =','highp vec2 texelSize ='],['vec3 clarityBoost(sampler2D tex, vec2 coord,','vec3 clarityBoost(sampler2D tex, highp vec2 coord,']]),
 sgsr:SGSR,sgsrHp:SGSR.replace('precision mediump float;','precision highp float;').replace('precision mediump sampler2D;','precision highp sampler2D;'),
};
const fixed=(t,k)=>SGSR.replace('uniform float sharp,threshold;',`const float sharp=${k.toFixed(1)},threshold=${t}./255.;`);
Object.assign(variants,{sgsr8s2:fixed(8,2),sgsr8s15:fixed(8,1.5),sgsr20s2:fixed(20,2),sgsr20s15:fixed(20,1.5),sgsr20s12:fixed(20,1.2),sgsr20s1:fixed(20,1),sgsr30s15:fixed(30,1.5),sgsr30s12:fixed(30,1.2)});
return variants;};
