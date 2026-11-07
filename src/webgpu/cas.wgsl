// WGSL port of the sharpening pass, in the GL frame (common.wgsl): Better xCloud's CAS/USM shader as
// tools/build.py patches it ('cas': texel size from the source, guarded reciprocals, finishColor) and,
// with LIMIT, 'casFiltered' (halo bound from the selected strength, noise floor, luma-only sharpening).
// filterId and qualityMode stay uniforms, as in GLSL.
struct Params {iResolution:vec2f, sharpenFactor:f32, brightness:f32, contrast:f32, saturation:f32, shadows:f32, deband:f32,
 haloMargin:f32, noiseFloor:f32, filterId:f32, qualityMode:f32, lumaSharpen:f32, diag:f32, pad0:f32, pad1:f32};
@group(0) @binding(0) var<uniform> u:Params;
override LIMIT:bool=true;
const CAS_CONTRAST_PEAK=0.8*-3.0+8.0;
const LUMINOSITY_FACTOR=vec3f(0.299,0.587,0.114);
fn limitSharpen(center:vec3f,sharpened:vec3f,lo:vec3f,hi:vec3f)->vec3f{
 let range=max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b);
 let detail=smoothstep(u.noiseFloor,u.noiseFloor+4.0/255.0,range);
 var result=clamp(mix(center,sharpened,detail),lo-vec3f(u.haloMargin),hi+vec3f(u.haloMargin));
 if(u.lumaSharpen>.5){result=clamp(center+vec3f(dot(result-center,vec3f(0.2126,0.7152,0.0722))),vec3f(0),vec3f(1));}
 return result;}
fn limited(e:vec3f,sharpened:vec3f,b:vec3f,d:vec3f,f:vec3f,h:vec3f)->vec3f{
 if(!LIMIT){return sharpened;}
 return limitSharpen(e,sharpened,min(min(min(d,e),min(f,b)),h),max(max(max(d,e),max(f,b)),h));}
fn clarityBoost(coord:vec2f,e:vec3f)->vec3f{
 let texelSize=1.0/vec2f(sourceSize());
 let b=sampleGL(coord+texelSize*vec2f(0,1)).rgb;let d=sampleGL(coord+texelSize*vec2f(-1,0)).rgb;
 let f=sampleGL(coord+texelSize*vec2f(1,0)).rgb;let h=sampleGL(coord+texelSize*vec2f(0,-1)).rgb;
 var a=vec3f(0);var c=vec3f(0);var g=vec3f(0);var i=vec3f(0);
 let usm=u.filterId<1.5;let quality=u.qualityMode>.5;
 if(usm||quality){
  a=sampleGL(coord+texelSize*vec2f(-1,1)).rgb;c=sampleGL(coord+texelSize*vec2f(1,1)).rgb;
  g=sampleGL(coord+texelSize*vec2f(-1,-1)).rgb;i=sampleGL(coord+texelSize*vec2f(1,-1)).rgb;}
 if(usm){
  var gaussianBlur=(a+c+g+i)*1.0+(b+d+f+h)*2.0+e*4.0;
  gaussianBlur/=16.0;
  return limited(e,e+(e-gaussianBlur)*u.sharpenFactor/3.0,b,d,f,h);}
 var minRgb=min(min(min(d,e),min(f,b)),h);
 var maxRgb=max(max(max(d,e),max(f,b)),h);
 if(quality){minRgb+=min(min(a,c),min(g,i));maxRgb+=max(max(a,c),max(g,i));}
 let reciprocalMaxRgb=1.0/max(maxRgb,vec3f(1e-6));
 var amplifyRgb=clamp(min(minRgb,2.0-maxRgb)*reciprocalMaxRgb,vec3f(0),vec3f(1));
 amplifyRgb=inverseSqrt(max(amplifyRgb,vec3f(1e-6)));
 let weightRgb=-(1.0/(amplifyRgb*CAS_CONTRAST_PEAK));
 let reciprocalWeightRgb=1.0/(4.0*weightRgb+1.0);
 let window=b+d+f+h;
 let outColor=clamp((window*weightRgb+e)*reciprocalWeightRgb,vec3f(0),vec3f(1));
 return limited(e,mix(e,outColor,u.sharpenFactor/2.0),b,d,f,h);}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
 let fc=fragGL(position,u.iResolution.y);let uv=fc/u.iResolution;
 var color=sampleGL(uv).rgb;
 if(u.sharpenFactor>0.0){color=clarityBoost(uv,color);}
 color=mix(vec3f(dot(color,LUMINOSITY_FACTOR)),color,u.saturation);
 color=u.contrast*(color-0.5)+0.5;
 color=u.brightness*color;
 return vec4f(finishColor(color,fc,u.shadows,u.deband,u.diag>.5),1.0);}
