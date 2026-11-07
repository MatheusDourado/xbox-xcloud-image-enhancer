// Same-size copy: the decoded frame (texture_external, converted to RGB once) into the RGBA8 input
// texture, top row first, or a stored frame to the canvas. No GL frame needed: both sides are top-first.
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f{return vec4f(LOAD(vec2i(position.xy)).rgb,1);}
