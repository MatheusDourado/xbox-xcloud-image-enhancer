// WGSL port of src/shaders/easu.glsl (FSR 1 EASU), same math in the GL frame (common.wgsl).
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
struct Params {outputSize:vec2f, pad:vec2f};
@group(0) @binding(0) var<uniform> u:Params;
fn safeRcp(x:f32)->f32{return 1./max(x,1e-8);}
fn safeRsq(x:f32)->f32{return inverseSqrt(max(x,1e-8));}
fn min3(a:vec3f,b:vec3f,c:vec3f)->vec3f{return min(a,min(b,c));}
fn max3(a:vec3f,b:vec3f,c:vec3f)->vec3f{return max(a,max(b,c));}
// No textureGather on the GL side: each texel once (RGB), split per channel in gather order.
struct Gather {r:vec4f, g:vec4f, b:vec4f};
fn gatherRGB(uv:vec2f)->Gather{let p=vec2i(floor(uv*vec2f(sourceSize())-.5));
 let t0=fetchGL(p+vec2i(0,1)).rgb;let t1=fetchGL(p+vec2i(1,1)).rgb;let t2=fetchGL(p+vec2i(1,0)).rgb;let t3=fetchGL(p).rgb;
 return Gather(vec4f(t0.r,t1.r,t2.r,t3.r),vec4f(t0.g,t1.g,t2.g,t3.g),vec4f(t0.b,t1.b,t2.b,t3.b));}
// FsrEasuTapF: color (xyz) and weight (w) accumulated together.
fn tapF(acc:ptr<function,vec4f>,off:vec2f,dir:vec2f,len:vec2f,lob:f32,clp:f32,c:vec3f){
 var v=vec2f(off.x*dir.x+off.y*dir.y,off.x*(-dir.y)+off.y*dir.x);
 v*=len;
 let d2=min(v.x*v.x+v.y*v.y,clp);
 var wB=(2./5.)*d2-1.;var wA=lob*d2-1.;
 wB*=wB;wA*=wA;
 wB=(25./16.)*wB-(25./16.-1.);
 let w=wB*wA;
 *acc+=vec4f(c*w,w);}
// FsrEasuSetF: bilinear-weighted direction and length.
fn setF(dir:ptr<function,vec2f>,len:ptr<function,f32>,pp:vec2f,biS:bool,biT:bool,biU:bool,biV:bool,lA:f32,lB:f32,lC:f32,lD:f32,lE:f32){
 var w=0.;
 if(biS){w=(1.-pp.x)*(1.-pp.y);}
 if(biT){w=pp.x*(1.-pp.y);}
 if(biU){w=(1.-pp.x)*pp.y;}
 if(biV){w=pp.x*pp.y;}
 let dc=lD-lC;let cb=lC-lB;
 var lenX=safeRcp(max(abs(dc),abs(cb)));
 let dirX=lD-lB;
 lenX=saturate(abs(dirX)*lenX);lenX*=lenX;
 let ec=lE-lC;let ca=lC-lA;
 var lenY=safeRcp(max(abs(ec),abs(ca)));
 let dirY=lE-lA;
 lenY=saturate(abs(dirY)*lenY);lenY*=lenY;
 *dir+=vec2f(dirX*w,dirY*w);
 *len+=lenX*w;*len+=lenY*w;}
fn easu(ip:vec2f,con0:vec4f,con1:vec4f,con2:vec4f,con3:vec4f)->vec3f{
 var pp=ip*con0.xy+con0.zw;
 let fp=floor(pp);
 pp-=fp;
 // 12-tap kernel: b c / e f g h / i j k l / n o.
 let p0=fp*con1.xy+con1.zw;
 let p1=p0+con2.xy;let p2=p0+con2.zw;let p3=p0+con3.xy;
 let bczz=gatherRGB(p0);let ijfe=gatherRGB(p1);let klhg=gatherRGB(p2);let zzon=gatherRGB(p3);
 let bczzL=bczz.b*.5+(bczz.r*.5+bczz.g);
 let ijfeL=ijfe.b*.5+(ijfe.r*.5+ijfe.g);
 let klhgL=klhg.b*.5+(klhg.r*.5+klhg.g);
 let zzonL=zzon.b*.5+(zzon.r*.5+zzon.g);
 let bL=bczzL.x;let cL=bczzL.y;
 let iL=ijfeL.x;let jL=ijfeL.y;let fL=ijfeL.z;let eL=ijfeL.w;
 let kL=klhgL.x;let lL=klhgL.y;let hL=klhgL.z;let gL=klhgL.w;
 let oL=zzonL.z;let nL=zzonL.w;
 var dir=vec2f(0);var len=0.;
 setF(&dir,&len,pp,true,false,false,false,bL,eL,fL,gL,jL);
 setF(&dir,&len,pp,false,true,false,false,cL,fL,gL,hL,kL);
 setF(&dir,&len,pp,false,false,true,false,fL,iL,jL,kL,nL);
 setF(&dir,&len,pp,false,false,false,true,gL,jL,kL,lL,oL);
 // Normalize with approximation, and cleanup close to zero.
 let dir2=dir*dir;
 var dirR=dir2.x+dir2.y;
 let zro=dirR<1./32768.;
 dirR=safeRsq(dirR);
 dirR=select(dirR,1.,zro);
 dir.x=select(dir.x,1.,zro);
 dir*=vec2f(dirR);
 len=len*.5;len*=len;
 let stretch=(dir.x*dir.x+dir.y*dir.y)*safeRcp(max(abs(dir.x),abs(dir.y)));
 let len2=vec2f(1.+(stretch-1.)*len,1.+(-.5)*len);
 let lob=.5+((1./4.-.04)-.5)*len;
 let clp=safeRcp(lob);
 let min4=min(min3(vec3f(ijfe.r.z,ijfe.g.z,ijfe.b.z),vec3f(klhg.r.w,klhg.g.w,klhg.b.w),vec3f(ijfe.r.y,ijfe.g.y,ijfe.b.y)),vec3f(klhg.r.x,klhg.g.x,klhg.b.x));
 let max4=max(max3(vec3f(ijfe.r.z,ijfe.g.z,ijfe.b.z),vec3f(klhg.r.w,klhg.g.w,klhg.b.w),vec3f(ijfe.r.y,ijfe.g.y,ijfe.b.y)),vec3f(klhg.r.x,klhg.g.x,klhg.b.x));
 var acc=vec4f(0);
 tapF(&acc,vec2f(0,-1)-pp,dir,len2,lob,clp,vec3f(bczz.r.x,bczz.g.x,bczz.b.x));
 tapF(&acc,vec2f(1,-1)-pp,dir,len2,lob,clp,vec3f(bczz.r.y,bczz.g.y,bczz.b.y));
 tapF(&acc,vec2f(-1,1)-pp,dir,len2,lob,clp,vec3f(ijfe.r.x,ijfe.g.x,ijfe.b.x));
 tapF(&acc,vec2f(0,1)-pp,dir,len2,lob,clp,vec3f(ijfe.r.y,ijfe.g.y,ijfe.b.y));
 tapF(&acc,vec2f(0,0)-pp,dir,len2,lob,clp,vec3f(ijfe.r.z,ijfe.g.z,ijfe.b.z));
 tapF(&acc,vec2f(-1,0)-pp,dir,len2,lob,clp,vec3f(ijfe.r.w,ijfe.g.w,ijfe.b.w));
 tapF(&acc,vec2f(1,1)-pp,dir,len2,lob,clp,vec3f(klhg.r.x,klhg.g.x,klhg.b.x));
 tapF(&acc,vec2f(2,1)-pp,dir,len2,lob,clp,vec3f(klhg.r.y,klhg.g.y,klhg.b.y));
 tapF(&acc,vec2f(2,0)-pp,dir,len2,lob,clp,vec3f(klhg.r.z,klhg.g.z,klhg.b.z));
 tapF(&acc,vec2f(1,0)-pp,dir,len2,lob,clp,vec3f(klhg.r.w,klhg.g.w,klhg.b.w));
 tapF(&acc,vec2f(1,2)-pp,dir,len2,lob,clp,vec3f(zzon.r.z,zzon.g.z,zzon.b.z));
 tapF(&acc,vec2f(0,2)-pp,dir,len2,lob,clp,vec3f(zzon.r.w,zzon.g.w,zzon.b.w));
 // Normalize and dering.
 return min(max4,max(min4,acc.xyz*vec3f(safeRcp(acc.w))));}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
 let size=vec2f(sourceSize());let scale=size/u.outputSize;
 let con0=vec4f(scale,.5*scale-.5);let con1=vec4f(1./size,vec2f(1,-1)/size);let con2=vec4f(vec2f(-1,2)/size,vec2f(1,2)/size);let con3=vec4f(vec2f(0,4)/size,0,0);
 return vec4f(easu(fragGL(position,u.outputSize.y)-.5,con0,con1,con2,con3),1);}
