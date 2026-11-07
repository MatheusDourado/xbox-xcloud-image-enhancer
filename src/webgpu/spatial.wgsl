// WGSL port of src/shaders/spatial.glsl (Spec 4, docs/spec4-webgpu.md). Same math, line for line.
// Not part of the userscript bundle yet: only tools/device/spec4 loads it.
//
// GL convention: the WebGL2 engine uploads the frame with UNPACK_FLIP_Y, so texture row 0 and
// gl_FragCoord.y = 0 are the bottom of the image. WebGPU textures and @builtin(position) start at the
// top. To keep the GLSL offsets, the asymmetric deband taps and the dither pattern identical, every
// coordinate here is converted to the GL frame (p, fc) and flipped back only to read a texel.
//
// The engine replaces SRC_TYPE, LOAD(c) and SAMPLE(uv) before compiling: texture_external for a video
// frame imported without a copy (importExternalTexture), texture_2d<f32> for a plain texture.
// The SPATIAL_* switches of the GLSL variants are pipeline-overridable constants, filled from
// BxRestoration.spatialProfile, the same function that builds the WebGL2 variants.
struct Strengths {cleanup:f32, deband:f32, chroma:f32, detail:f32, antialias:f32, pad0:f32, pad1:f32, pad2:f32};
@group(0) @binding(0) var<uniform> u:Strengths;
@group(0) @binding(1) var source:SRC_TYPE;
@group(0) @binding(2) var linearSampler:sampler;
override CLEANUP:bool=true;
override DEBAND:bool=true;
override CHROMA:bool=true;
override DETAIL:bool=true;
override ANTIALIAS:bool=true;
override TAPS:f32=4.0;
override QUANTIZE:bool=true;
override SELECTIVE:bool=true;

@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
 let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(xy[i],0,1);}

fn sourceSize()->vec2i{return vec2i(textureDimensions(source));}
fn peak(c:vec3f)->f32{return max(max(abs(c.r),abs(c.g)),abs(c.b));}
fn lum(c:vec3f)->f32{return dot(c,vec3f(.2126,.7152,.0722));}
// texelFetch in the GL frame: clamp, then flip the row.
fn at(p:vec2f)->vec3f{let s=sourceSize();let q=clamp(vec2i(p),vec2i(0),s-1);return LOAD(vec2i(q.x,s.y-1-q.y)).rgb;}
// texture() in the GL frame (v from the bottom).
fn tex(uv:vec2f)->vec3f{return SAMPLE(vec2f(uv.x,1.0-uv.y)).rgb;}

@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
 let size=vec2f(sourceSize());
 let fc=vec2f(position.x,size.y-position.y);// gl_FragCoord.xy
 let p=fc-.5;let c=at(p);var result=c;
 let west=at(p-vec2f(1,0));let east=at(p+vec2f(1,0));
 let south=at(p-vec2f(0,1));let north=at(p+vec2f(0,1));
 let reversal=sqrt(max(0.,max(-lum(c-west)*lum(east-c),-lum(c-south)*lum(north-c))));
 var textureMask=smoothstep(.003,.015,reversal);
 if(SELECTIVE){
  let rx=max(-(c-west)*(east-c),-(c-south)*(north-c));
  textureMask=max(textureMask,smoothstep(.003,.015,sqrt(max(0.,max(max(rx.r,rx.g),rx.b)))));
 }
 if(CLEANUP&&u.cleanup>0.){for(var axis=0;axis<2;axis++){
  let d=select(vec2f(0,1),vec2f(1,0),axis==0);
  let l=select(south,west,axis==0);let ll=at(p-2.*d);let r=select(north,east,axis==0);let rr=at(p+2.*d);
  let left=select(abs(lum(c-l)),peak(c-l),SELECTIVE);let right=select(abs(lum(r-c)),peak(r-c),SELECTIVE);
  let outerL=select(abs(lum(l-ll)),peak(l-ll),SELECTIVE);let outerR=select(abs(lum(rr-r)),peak(rr-r),SELECTIVE);
  let jump=max(left,right);let side=min(left,right);
  let smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));
  let smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));
  let confidence=select(1.,1.-smoothstep(.2,.7,max(max(outerL,outerR),side)/max(jump,1e-5)),SELECTIVE);
  let across=select(r,l,left>right);
  result=mix(result,(c+across)*.5,u.cleanup*confidence*smoothSides*smallStep*.8*(1.-textureMask));
 }}
 if(DEBAND&&u.deband>0.){
  var avg=vec3f(0);var diff=0.;var weightSum=0.;
  let radius=mix(2.,8.,u.deband);
  for(var i=0;i<4;i++){
   if(f32(i)>=TAPS){break;}
   var d=vec2f(-.5,1);if(i==0){d=vec2f(1,.5);}else if(i==1){d=vec2f(-1,-.5);}else if(i==2){d=vec2f(.5,-1);}
   let n=at(p+floor(d*radius));
   let weight=select(1.,1.-smoothstep(.006,.012+u.deband*.04,peak(n-c)),SELECTIVE);
   avg+=n*weight;weightSum+=weight;
   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));
  }
  avg=select(c,avg/weightSum,weightSum>0.);
  let flatRegion=1.-smoothstep(.006,.012+u.deband*.04,diff);
  result=mix(result,avg,u.deband*flatRegion*.8*(1.-textureMask));
 }
 if(CHROMA&&u.chroma>0.){
  let g=vec2f(lum(east)-lum(west),lum(north)-lum(south));
  let gLen=length(g);
  if(gLen>4./255.){
   let uv=(p+.5)/size;let d=g/gLen*2./size;
   let A=tex(uv-d);let B=tex(uv+d);
   let yA=lum(A);let yB=lum(B);let Y=lum(result);let span=yB-yA;
   let s=clamp((Y-yA)/select(1e-4,span,abs(span)>1e-4),0.,1.);
   let cA=vec2f(A.b,A.r)-yA;let cB=vec2f(B.b,B.r)-yB;let cur=vec2f(result.b,result.r)-Y;let pred=mix(cA,cB,s);
   let inside=step(min(cA,cB)-2./255.,cur)*step(cur,max(cA,cB)+2./255.);
   let weight=u.chroma*smoothstep(4./255.,12./255.,abs(span))*inside;
   let cb_cr=mix(cur,pred,weight);
   let Bc=cb_cr.x+Y;let Rc=cb_cr.y+Y;
   result=vec3f(Rc,(Y-.2126*Rc-.0722*Bc)/.7152,Bc);
  }
 }
 if(DETAIL&&u.detail>0.){
  let w=array<vec3f,8>(at(p+vec2f(-1,-1)),at(p+vec2f(1,-1)),at(p+vec2f(-1,1)),at(p+vec2f(1,1)),at(p+vec2f(2,0)),at(p-vec2f(2,0)),at(p+vec2f(0,2)),at(p-vec2f(0,2)));
  var lo=min(min(lum(c),min(lum(west),lum(east))),min(lum(south),lum(north)));var hi=max(max(lum(c),max(lum(west),lum(east))),max(lum(south),lum(north)));
  for(var i=0;i<4;i++){let l=lum(w[i]);lo=min(lo,l);hi=max(hi,l);}
  let untouched=1.-smoothstep(.5/255.,2./255.,peak(result-c));
  let L=lum(result);let range=hi-lo;var wLo=lo;var wHi=hi;
  for(var i=4;i<8;i++){let l=lum(w[i]);wLo=min(wLo,l);wHi=max(wHi,l);}
  var fine=lum(c)-.25*(lum(west)+lum(east)+lum(south)+lum(north));
  let uv=(p+.5)/size;var ring=0.;
  for(var i=0;i<8;i++){
   var d=vec2f(-2.5,2.5);
   if(i==0){d=vec2f(3.5,.5);}else if(i==1){d=vec2f(-3.5,-.5);}else if(i==2){d=vec2f(.5,-3.5);}else if(i==3){d=vec2f(-.5,3.5);}
   else if(i==4){d=vec2f(2.5);}else if(i==5){d=vec2f(-2.5);}else if(i==6){d=vec2f(2.5,-2.5);}
   let l=lum(tex(uv+d/size));ring+=l;wLo=min(wLo,l);wHi=max(wHi,l);
  }
  var clarity=lum(c)-ring/8.;
  let t=1.5/255.+.06*range+.04*(wHi-wLo);
  fine=sign(fine)*max(abs(fine)-t,0.);clarity=sign(clarity)*max(abs(clarity)-t,0.);
  let dL=u.detail*untouched*(1.2*fine+.8*clarity*(1.-smoothstep(.15,.4,wHi-wLo)));
  let margin=u.detail*2./255.;
  result+=clamp(L+dL,min(L,lo-margin),max(L,hi+margin))-L;
 }
 if(ANTIALIAS&&u.antialias>0.){
  let nw=lum(at(p+vec2f(-1,1)));let ne=lum(at(p+vec2f(1,1)));let sw=lum(at(p+vec2f(-1,-1)));let se=lum(at(p+vec2f(1,-1)));
  let mid=lum(c);let lo=min(mid,min(min(nw,ne),min(sw,se)));let hi=max(mid,max(max(nw,ne),max(sw,se)));
  let dir=vec2f(-(nw+ne-sw-se),nw+sw-ne-se);
  let major=max(abs(dir.x),abs(dir.y));
  let weight=u.antialias*smoothstep(.04,.15,hi-lo)*smoothstep(.05,.35,min(abs(dir.x),abs(dir.y))/max(major,1e-5));
  if(weight>0.){
   let uv=(p+.5)/size;let d=dir/max(major,1e-5)/size*.5;
   let smoothColor=(tex(uv-d)+tex(uv+d))*.5;
   let sl=lum(smoothColor);
   if(sl>=lo&&sl<=hi){result+=(smoothColor-c)*weight;}
  }
 }
 if(QUANTIZE&&DEBAND&&u.deband>0.){result+=(fract(52.9829189*fract(dot(fc,vec2f(.06711056,.00583715))))-.5)/255.;}
 return vec4f(clamp(result,vec3f(0),vec3f(1)),1.);
}
