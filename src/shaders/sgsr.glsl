#version 300 es
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
// Changes here (docs/spec2-estudo.md, Spec 3 item 5): WebGL2 has no textureGather, so the 12 luma
// samples are texelFetch reads of Rec.709 luma (upstream gathers the green channel); edge threshold
// and sharpness are uniforms (measured 20/255 and 1.0 for compressed video: the original 8/255 and 2.0
// enhance codec artifacts); a zero-sum guard; and the output finishing of the sharpening pass it
// replaces (saturation, contrast, shadows, dither, diagnostic tint), appended by tools/build.py.
// SGSR_PRECISION is mediump on half-precision GPUs (set by the engine), highp elsewhere.
#ifndef SGSR_PRECISION
#define SGSR_PRECISION highp
#endif
precision SGSR_PRECISION float;
precision highp int;
precision SGSR_PRECISION sampler2D;
uniform sampler2D source;uniform highp vec2 outputSize;uniform float sharp,threshold;
uniform float brightness,contrast,saturation,shadows,deband;uniform bool diagnostic;
out vec4 fragColor;
/* FINISH_COLOR */
float L(ivec2 p,ivec2 m){return dot(texelFetch(source,clamp(p,ivec2(0),m),0).rgb,vec3(.2126,.7152,.0722));}
float fastLanczos2(float x){float wA=x-4.;float wB=x*wA-wA;wA*=wA;return wB*wA;}
vec2 weightY(float dx,float dy,float c,float std){float x=(dx*dx+dy*dy)*.55+clamp(abs(c)*std,0.,1.);float w=fastLanczos2(x);return vec2(w,w*c);}
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
  vec4 a=abs(left)+abs(right)+abs(ud);float std=2.181818/max(a.x+a.y+a.z+a.w,1e-4);
  vec2 s=weightY(pl.x,pl.y+1.,ud.x,std)+weightY(pl.x-1.,pl.y+1.,ud.y,std)+weightY(pl.x-1.,pl.y-2.,ud.z,std)+weightY(pl.x,pl.y-2.,ud.w,std);
  s+=weightY(pl.x+1.,pl.y-1.,left.x,std)+weightY(pl.x,pl.y-1.,left.y,std)+weightY(pl.x,pl.y,left.z,std)+weightY(pl.x+1.,pl.y,left.w,std);
  s+=weightY(pl.x-1.,pl.y-1.,right.x,std)+weightY(pl.x-2.,pl.y-1.,right.y,std)+weightY(pl.x-2.,pl.y,right.z,std)+weightY(pl.x-1.,pl.y,right.w,std);
  float fy=s.y/(abs(s.x)>1e-5?s.x:1e-5),mx=max(max(left.y,left.z),max(right.x,right.w)),mn=min(min(left.y,left.z),min(right.x,right.w));
  fy=clamp(sharp*fy,mn,mx);float dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,0.,1.);
 }
 // Same order as the sharpening pass it replaces (casFiltered): saturation, contrast, brightness, finish.
 color=mix(vec3(dot(color,vec3(.299,.587,.114))),color,saturation);color=contrast*(color-.5)+.5;color=brightness*color;
 fragColor=vec4(finishColor(color),1);
}
