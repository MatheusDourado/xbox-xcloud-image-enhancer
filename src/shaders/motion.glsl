#version 300 es
precision highp float;
precision highp sampler2D;
// source/previous: quarter-size raw frames; fullSource/fullPrevious: the raw frame and the previous raw frame
// (audit C06: the same signal in both searches; the processed history is only blended by temporal.glsl).
uniform sampler2D source, previous, cut, fullSource, fullPrevious;
uniform vec2 outputSize;
uniform bool validHistory;
out vec4 fragColor;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float lowLuma[5],fullLuma[5];
float matchingError(vec2 uv,vec2 candidate,vec2 stepSize){
 float error=0.;for(int i=0;i<5;i++){
  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);
  error+=abs(lowLuma[i]-lum(texture(previous,uv+(d+candidate)*stepSize).rgb))*.2;
 }return error+length(candidate)*.00001;
}
float fineError(vec2 uv,vec2 offset){
 vec2 size=vec2(textureSize(fullSource,0));
 float error=0.;
 for(int i=0;i<5;i++){
  vec2 d=i==0?vec2(0):i==1?vec2(3,0):i==2?vec2(-3,0):i==3?vec2(0,3):vec2(0,-3);
  error+=abs(fullLuma[i]-lum(texture(fullPrevious,uv+(d+offset)/size).rgb))*.2;
 }
 return error;
}
void main(){
 if(!validHistory||texture(cut,vec2(.5)).r>.12){fragColor=vec4(vec2(128./255.),0,1);return;}
 vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(source,0));
 // Current-frame samples do not depend on the candidate vector. Fetch once.
 for(int i=0;i<5;i++){
  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);
  lowLuma[i]=lum(texture(source,uv+d*stepSize).rgb);
  fullLuma[i]=lum(texture(fullSource,uv+d*3./vec2(textureSize(fullSource,0))).rgb);
 }
 float best=10.,second=10.;vec2 offset=vec2(0);
 // Keep the fine local search, then search coarse offsets up to 32 source pixels.
 for(int pass=0;pass<2;pass++)for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  if(pass==1&&x==0&&y==0)continue;
  vec2 candidate=vec2(x,y)*(pass==0?1.:4.);float error=matchingError(uv,candidate,stepSize);
  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);
 }
 vec2 coarse=offset;
 // Refine only a winning coarse vector. Maximum supported displacement is 40px.
 if(any(greaterThan(abs(coarse),vec2(2))))for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  vec2 candidate=coarse+vec2(x,y);
  if(all(lessThanEqual(abs(candidate),vec2(2)))||all(lessThan(abs(mod(candidate,4.)),vec2(.001))))continue;
  float error=matchingError(uv,candidate,stepSize);
  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);
 }
 float coarseConfidence=smoothstep(.0002,.004,second-best);
 // Refine only at the small motion-field resolution. No extra full-frame pass.
 // Use the actual size ratio: odd source dimensions are not exactly 4:1.
 vec2 fullSize=vec2(textureSize(fullSource,0));
 vec2 center=offset*fullSize/vec2(textureSize(source,0)),fine=center;
 float fineBest=10.,fineSecond=10.;
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  vec2 candidate=center+vec2(x,y);float error=fineError(uv,candidate);
  if(error<fineBest){fineSecond=fineBest;fineBest=error;fine=candidate;}else fineSecond=min(fineSecond,error);
 }
 float confidence=(1.-smoothstep(.008,.045,fineBest))*max(coarseConfidence,smoothstep(.0002,.004,fineSecond-fineBest));
 center=fine;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  if(x==0&&y==0)continue;
  vec2 candidate=center+vec2(x,y)*.5;float error=fineError(uv,candidate);
  if(error<fineBest){fineBest=error;fine=candidate;}
 }
 // Exact half-pixel encoding in RGBA8, including zero (128), without float targets.
 fragColor=vec4((clamp(round(fine*2.),vec2(-128),vec2(127))+128.)/255.,confidence,1.);
}
