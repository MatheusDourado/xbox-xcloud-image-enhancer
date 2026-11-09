#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D source;
uniform float amount;
out vec4 fragColor;
float luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
 vec2 stepSize=1./vec2(textureSize(source,0)),uv=gl_FragCoord.xy*stepSize;
 vec3 center=texture(source,uv).rgb;
 float nw=luminance(texture(source,uv+vec2(-1,1)*stepSize).rgb);
 float ne=luminance(texture(source,uv+vec2(1,1)*stepSize).rgb);
 float sw=luminance(texture(source,uv+vec2(-1,-1)*stepSize).rgb);
 float se=luminance(texture(source,uv+vec2(1,-1)*stepSize).rgb);
 float mid=luminance(center),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));
 float contrast=hi-lo;
 // Directional post-process AA: only high-contrast slanted edges are blended.
 // Flat regions and axis-aligned edges retain their original samples.
 // Edge tangent: the diagonal gradient (ne+se-nw-sw, nw+ne-sw-se) turned 90 degrees, so the two
 // samples lie along the edge, not across it (v10.1: the y sign was mirrored, blurring across).
 vec2 direction=vec2(-(nw+ne-sw-se),ne+se-nw-sw);
 float major=max(abs(direction.x),abs(direction.y));
 float diagonal=min(abs(direction.x),abs(direction.y))/max(major,.00001);
 float weight=amount*smoothstep(.04,.15,contrast)*smoothstep(.05,.35,diagonal);
 if(weight<=0.){fragColor=vec4(center,1);return;}
 direction=direction/max(major,.00001)*stepSize;
 vec3 smoothColor=(texture(source,uv-direction*.5).rgb+texture(source,uv+direction*.5).rgb)*.5;
 // Clamp to the observed neighborhood to prevent new ringing.
 float smoothLum=luminance(smoothColor);
 if(smoothLum<lo||smoothLum>hi)smoothColor=center;
 fragColor=vec4(mix(center,smoothColor,weight),1);
}
