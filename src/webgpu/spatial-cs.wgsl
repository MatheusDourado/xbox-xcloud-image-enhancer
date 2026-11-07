// Compute entry of the spatial pass (spatial.wgsl), Spec 4 task 5. The decoded frame, imported without a
// copy as a texture_external, is read once per 32x32 block plus an 8-texel margin (the farthest deband tap)
// into workgroup memory, packed as RGBA8 (the bytes the copy pass would store), and every filter tap reads
// from there. The YUV to RGB conversion is fused into the spatial pass: no input texture is written and
// read back. Each of the 16x16 invocations loads 9 texels and filters 4 pixels.
// The renderer replaces OUT_FORMAT with the target format (rgba8unorm, or rgba16float in Qualidade).
@group(0) @binding(3) var outTex:texture_storage_2d<OUT_FORMAT,write>;
const BLOCK=32;
const MARGIN=8;
const SIDE=48;
var<workgroup> tile:array<u32,2304>;
var<private> origin:vec2i;// GL-frame texel of tile[0]
fn cell(q:vec2i)->vec3f{let t=clamp(q-origin,vec2i(0),vec2i(SIDE-1));return unpack4x8unorm(tile[t.y*SIDE+t.x]).rgb;}
// texelFetch in the GL frame: the tile cells were loaded clamped to the frame edge.
fn at(p:vec2f)->vec3f{return cell(vec2i(p));}
// Bilinear texture() in the GL frame, clamped to the edge like the sampler.
fn tex(uv:vec2f)->vec3f{
 let mx=sourceSize()-1;let x=uv*vec2f(sourceSize())-.5;let i=floor(x);let f=x-i;
 let q0=clamp(vec2i(i),vec2i(0),mx);let q1=clamp(vec2i(i)+1,vec2i(0),mx);
 return mix(mix(cell(q0),cell(vec2i(q1.x,q0.y)),f.x),mix(cell(vec2i(q0.x,q1.y)),cell(q1),f.x),f.y);}
@compute @workgroup_size(16,16) fn cs(@builtin(workgroup_id) wg:vec3u,@builtin(local_invocation_index) li:u32,@builtin(local_invocation_id) lid:vec3u){
 let s=sourceSize();origin=vec2i(wg.xy)*BLOCK-MARGIN;
 for(var k=li;k<u32(SIDE*SIDE);k+=256u){
  let q=clamp(origin+vec2i(i32(k)%SIDE,i32(k)/SIDE),vec2i(0),s-1);
  tile[k]=pack4x8unorm(vec4f(LOAD(vec2i(q.x,s.y-1-q.y)).rgb,1));}
 workgroupBarrier();
 let size=vec2f(s);
 for(var j=0;j<2;j++){for(var i=0;i<2;i++){
  let g=vec2i(wg.xy)*BLOCK+vec2i(lid.xy)+vec2i(i,j)*16;
  if(all(g<s)){textureStore(outTex,vec2i(g.x,s.y-1-g.y),spatial(vec2f(g)+.5,size));}}}
}
