// Fragment entry of the spatial pass (spatial.wgsl): reads the source texture in the GL frame.
fn at(p:vec2f)->vec3f{return fetchGL(vec2i(p)).rgb;}
fn tex(uv:vec2f)->vec3f{return sampleGL(uv).rgb;}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{
 let size=vec2f(sourceSize());return spatial(fragGL(position,size.y),size);}
