// Snapdragon Game Super Resolution 1 (SGSR 1), adapted from
// https://github.com/SnapdragonStudios/snapdragon-gsr sgsr/v1/include/glsl/sgsr1_shader_mobile.frag
//
// Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.
// (LICENSE file of the repository: Copyright (c) 2023, Qualcomm Innovation Center, Inc. All rights reserved.)
// SPDX-License-Identifier: BSD-3-Clause
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
//
// Changes: as in src/shaders/sgsr.glsl (Rec.709 luma by texel loads, threshold and sharpness as uniforms,
// zero-sum guard, finishing of the sharpening pass), ported to WGSL in the GL frame (common.wgsl).
struct Params {outputSize:vec2f, sharp:f32, threshold:f32, brightness:f32, contrast:f32, saturation:f32, shadows:f32,
 deband:f32, diag:f32, pad0:f32, pad1:f32};
@group(0) @binding(0) var<uniform> u:Params;
fn L(p:vec2i)->f32{return dot(fetchGL(p).rgb,vec3f(.2126,.7152,.0722));}
fn fastLanczos2(x:f32)->f32{var wA=x-4.;let wB=x*wA-wA;wA*=wA;return wB*wA;}
fn weightY(dx:f32,dy:f32,c:f32,dev:f32)->vec2f{let x=(dx*dx+dy*dy)*.55+clamp(abs(c)*dev,0.,1.);let w=fastLanczos2(x);return vec2f(w,w*c);}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
 let fc=fragGL(position,u.outputSize.y);let size=vec2f(sourceSize());let uv=fc/u.outputSize;
 var color=sampleGL(uv).rgb;let cy=dot(color,vec3f(.2126,.7152,.0722));
 let img=uv*size+vec2f(-.5,.5);let ip=floor(img);let pl=img-ip;let P=vec2i(ip);
 var left=vec4f(0);left.y=L(P);left.z=L(P+vec2i(0,-1));
 let vote=abs(left.z-left.y)+abs(cy-left.y)+abs(cy-left.z);
 if(vote>u.threshold){
  left.x=L(P+vec2i(-1,0));left.w=L(P+vec2i(-1,-1));
  var right=vec4f(L(P+vec2i(1,0)),L(P+vec2i(2,0)),L(P+vec2i(2,-1)),L(P+vec2i(1,-1)));
  var ud=vec4f(L(P+vec2i(0,-2)),L(P+vec2i(1,-2)),L(P+vec2i(1,1)),L(P+vec2i(0,1)));
  let mean=(left.y+left.z+right.x+right.w)*.25;left-=vec4f(mean);right-=vec4f(mean);ud-=vec4f(mean);let cw=cy-mean;
  let a=abs(left)+abs(right)+abs(ud);let dev=2.181818/max(a.x+a.y+a.z+a.w,1e-4);
  var s=weightY(pl.x,pl.y+1.,ud.x,dev)+weightY(pl.x-1.,pl.y+1.,ud.y,dev)+weightY(pl.x-1.,pl.y-2.,ud.z,dev)+weightY(pl.x,pl.y-2.,ud.w,dev);
  s+=weightY(pl.x+1.,pl.y-1.,left.x,dev)+weightY(pl.x,pl.y-1.,left.y,dev)+weightY(pl.x,pl.y,left.z,dev)+weightY(pl.x+1.,pl.y,left.w,dev);
  s+=weightY(pl.x-1.,pl.y-1.,right.x,dev)+weightY(pl.x-2.,pl.y-1.,right.y,dev)+weightY(pl.x-2.,pl.y,right.z,dev)+weightY(pl.x-1.,pl.y,right.w,dev);
  var fy=s.y/s.x;let mx=max(max(left.y,left.z),max(right.x,right.w));let mn=min(min(left.y,left.z),min(right.x,right.w));
  fy=clamp(u.sharp*fy,mn,mx);let dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,vec3f(0),vec3f(1));
 }
 // Same order as the sharpening pass it replaces (casFiltered): saturation, contrast, brightness, finish.
 color=mix(vec3f(dot(color,vec3f(.299,.587,.114))),color,u.saturation);color=u.contrast*(color-.5)+.5;color=u.brightness*color;
 return vec4f(finishColor(color,fc,u.shadows,u.deband,u.diag>.5),1);}
