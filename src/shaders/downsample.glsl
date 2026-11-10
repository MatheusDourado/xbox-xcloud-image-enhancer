#version 300 es
precision highp float;
precision highp sampler2D;
// Quarter-size copy for the motion search (audit C07): each output pixel averages the 4x4 source area
// around the point copy.glsl would sample, with four bilinear taps one source pixel off that point (each
// one between four source pixels). One bilinear tap per pixel (copy.glsl) reads only 2x2 of the 16 pixels
// and lets fine periodic detail alias. Same uv mapping as copy.glsl, so odd sizes stay aligned.
uniform sampler2D source;
uniform vec2 outputSize;
out vec4 fragColor;
void main(){
 vec2 size=vec2(textureSize(source,0)),center=gl_FragCoord.xy/outputSize*size;
 vec3 sum=vec3(0);
 for(int i=0;i<4;i++){vec2 o=vec2(i==0||i==2?-1.:1.,i<2?-1.:1.);sum+=texture(source,(center+o)/size).rgb;}
 fragColor=vec4(sum*.25,1);
}
