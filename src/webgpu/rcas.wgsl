// WGSL port of src/shaders/rcas.glsl (FSR 1 RCAS, denoise on, with the local halo limiter), GL frame.
//
// FidelityFX Super Resolution Sample
//
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions :
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
struct Params {outputSize:vec2f, rcasStrength:f32, haloMargin:f32, noiseFloor:f32, contrast:f32, saturation:f32, shadows:f32,
 deband:f32, diag:f32, lumaSharpen:f32, pad:f32};
@group(0) @binding(0) var<uniform> u:Params;
fn luma2(c:vec3f)->f32{return c.b*.5+c.r*.5+c.g;}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
 let fc=fragGL(position,u.outputSize.y);let uv=fc/u.outputSize;let stepSize=1./vec2f(sourceSize());
 let e=sampleGL(uv).rgb;var c=e;
 if(u.rcasStrength>0.){
  let b=sampleGL(uv+vec2f(0,-1)*stepSize).rgb;let d=sampleGL(uv+vec2f(-1,0)*stepSize).rgb;
  let f=sampleGL(uv+vec2f(1,0)*stepSize).rgb;let h=sampleGL(uv+vec2f(0,1)*stepSize).rgb;
  let bl=luma2(b);let dl=luma2(d);let el=luma2(e);let fl=luma2(f);let hl=luma2(h);
  let range=max(max(max(bl,dl),max(fl,hl)),el)-min(min(min(bl,dl),min(fl,hl)),el);
  let noise=1.-.5*clamp(abs(.25*(bl+dl+fl+hl)-el)/max(range,1e-6),0.,1.);
  let mn=min(min(b,d),min(f,h));let mx=max(max(b,d),max(f,h));
  let hitMin=min(mn,e)/max(4.*mx,vec3f(1e-6));
  let hitMax=(1.-max(mx,e))/min(4.*mn-4.,vec3f(-1e-6));
  let lobes=max(-hitMin,hitMax);
  let lobe=max(-.1875,min(max(max(lobes.r,lobes.g),lobes.b),0.))*u.rcasStrength*noise;
  c=(lobe*(b+d+f+h)+e)/(4.*lobe+1.);
  let lo=min(mn,e);let hi=max(mx,e);
  let detail=smoothstep(u.noiseFloor,u.noiseFloor+4./255.,max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b));
  c=clamp(mix(e,c,detail),lo-u.haloMargin,hi+u.haloMargin);
  if(u.lumaSharpen>.5){c=clamp(e+vec3f(dot(c-e,vec3f(.2126,.7152,.0722))),vec3f(0),vec3f(1));}
 }
 let l=dot(c,vec3f(.299,.587,.114));c=mix(vec3f(l),c,u.saturation);c=u.contrast*(c-.5)+.5;
 return vec4f(finishColor(c,fc,u.shadows,u.deband,u.diag>.5),1);}
