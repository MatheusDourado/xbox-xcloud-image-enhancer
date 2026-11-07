// Prelude of every WGSL pass (Spec 4, docs/spec4-webgpu.md), prepended by the WebGPU renderer.
//
// GL frame: the WebGL2 engine uploads the frame with UNPACK_FLIP_Y, so texture row 0 and gl_FragCoord.y = 0
// are the bottom of the image. WebGPU textures, the canvas and @builtin(position) start at the top. Every
// pass works in the GL frame (fragGL, fetchGL, sampleGL) and flips only to read or write a texel, so the
// asymmetric offsets (deband taps, SGSR's +0.5 row) and the dither pattern give the GLSL bytes. Each stored
// texture is then the GL one upside down, and the canvas, whose row 0 is the top, shows the same image.
//
// The renderer replaces SRC_TYPE, LOAD( and SAMPLE( before compiling: texture_2d<f32> for a texture,
// texture_external for a video frame imported without a copy.
@group(0) @binding(1) var source:SRC_TYPE;
@group(0) @binding(2) var linearSampler:sampler;

@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
 let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(xy[i],0,1);}

fn sourceSize()->vec2i{return vec2i(textureDimensions(source));}
// gl_FragCoord.xy of a pass whose output has outH rows.
fn fragGL(position:vec4f,outH:f32)->vec2f{return vec2f(position.x,outH-position.y);}
// texelFetch in the GL frame: clamp to the edge, then flip the row.
fn fetchGL(p:vec2i)->vec4f{let s=sourceSize();let q=clamp(p,vec2i(0),s-1);return LOAD(vec2i(q.x,s.y-1-q.y));}
// texture() in the GL frame (v from the bottom): bilinear, clamped to the edge.
fn sampleGL(uv:vec2f)->vec4f{return SAMPLE(vec2f(uv.x,1.-uv.y));}

// finishColor of src/shaders/finish.glsl, fused into the last pass: shadows, a half-LSB dither on
// gl_FragCoord (fc) and the diagnostic tint.
fn finishColor(c0:vec3f,fc:vec2f,shadows:f32,deband:f32,diag:bool)->vec3f{
 var c=c0;let l=dot(c,vec3f(.2126,.7152,.0722));
 c+=shadows*pow(max(0.,1.-l),3.)*.15;
 let noise=fract(52.9829189*fract(dot(fc,vec2f(.06711056,.00583715))))-.5;
 if(deband>0.){c+=noise/255.;}
 if(diag){c=mix(c,vec3f(1,0,.75),.65);}
 return clamp(c,vec3f(0),vec3f(1));}
