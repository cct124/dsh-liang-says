/** Original shader: band displacement, small channel separation and per-band color gain.
 * All colors are premultiplied. The displaced silhouette and portrait share the same sample.
 * References: pixijs/filters GlitchFilter and gl-transitions GlitchMemories (see notices).
 */
export const artworkFragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform vec4 uInputSize;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec4 uFromRect;
uniform vec4 uToRect;
uniform vec2 uViewport;
uniform float uTime;
uniform float uBreath;
uniform float uOldAlpha;
uniform float uNewAlpha;
uniform float uGlitch;
uniform float uSeed;
uniform float uLight;
const float PI = 3.14159265359;
vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); }
float hash(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
vec4 samplePortrait(sampler2D tex, vec2 uv) {
  if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0);
  return texture(tex, uv);
}
vec4 portrait(sampler2D tex, vec4 rect, vec2 point) {
  vec2 uv = (point - rect.xy) / rect.zw;
  // Slowly changing band edges; state is held for 80 ms to suggest a stalled video signal.
  float tick = floor(uTime / 80.0);
  float band = floor(uv.y * 11.0 + sin(uv.y * 19.0 + uSeed) * .38);
  float active = step(.66, hash(band + tick * 17.0));
  float strength = uGlitch * active;
  uv.x += (hash(band * 3.7 + tick) - .5) * 20.0 * strength / rect.z;
  vec4 c = samplePortrait(tex, uv);
  float spread = (0.6 + hash(band + 27.0)) * strength / rect.z;
  vec4 red = samplePortrait(tex, uv + vec2(spread, 0.0));
  vec4 blue = samplePortrait(tex, uv - vec2(spread, 0.0));
  // Keep coverage intact and never reveal hidden RGB in fully transparent PNG pixels.
  c.r = mix(c.r, red.r / max(red.a, .0001) * c.a, strength * .65);
  c.b = mix(c.b, blue.b / max(blue.a, .0001) * c.a, strength * .65);
  float tint = (hash(band + tick * 2.0) - .5) * .08 * strength;
  c.rgb *= vec3(1.0 + tint, 1.0 - tint * .3, 1.0 - tint);
  c *= 1.0 - strength * .16;
  c.rgb = clamp(c.rgb, vec3(0.0), vec3(c.a));
  return c;
}
vec4 ray(vec2 p, float period, float phase, float strength, vec3 color) {
  float angle = atan(p.x, -p.y) * 180.0 / PI + phase;
  float a = mod(angle + 7200.0, period);
  float wedge = max(0.0, 1.0 - a / (period == 16.0 ? 8.0 : 6.0));
  float radius = length(p) / (max(uViewport.x, uViewport.y) * .9);
  float mask = smoothstep(0.0, .08, radius) * (1.0 - smoothstep(.08, .65, radius));
  float alpha = wedge * mask * strength;
  return vec4(color * alpha, alpha);
}
void main() {
  vec2 point = vTextureCoord * uInputSize.xy;
  vec2 pivot = vec2(uViewport.x * .5, uViewport.y * .68);
  point = pivot + (point - pivot) / uBreath;
  vec4 oldPortrait = portrait(uFrom, uFromRect, point) * uOldAlpha;
  vec4 newPortrait = portrait(uTo, uToRect, point) * uNewAlpha;
  vec4 person = over(newPortrait, oldPortrait);
  vec2 lightPoint = point - uViewport * vec2(.5, .28);
  vec2 radial = lightPoint / (uViewport * vec2(.65, .75));
  float aura = (1.0 - smoothstep(0.0, 1.0, length(radial))) * .23;
  vec4 light = vec4(vec3(.90, .70, .36) * aura, aura);
  float individual = mix(1.0, .5, uLight);
  light *= individual;
  light = over(ray(lightPoint, 16.0, -uTime * .0045, .533 * individual, vec3(1.0, .875, .55)), light);
  light = over(ray(lightPoint, 23.0, uTime * .00288 - 8.0, .302 * individual, vec3(1.0, .89, .627)), light);
  float halo = exp(-pow(length(lightPoint) / (uViewport.y * .085), 2.0) * 1.7) * .9 * individual;
  light = over(vec4(vec3(1.0, .94, .70) * halo, halo), light);
  light *= mix(.5, 1.0, uLight);
  // The exact same post-glitch alpha masks the rays before portrait opacity is applied.
  light *= 1.0 - person.a;
  finalColor = over(person * .85, light);
}
`;

/** A single shadow for the whole text/particle layer, present throughout the transition. */
export const textShadowFragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uLight;
float coverage(vec2 uv) {
  if (uv.x < uInputClamp.x || uv.y < uInputClamp.y || uv.x > uInputClamp.z || uv.y > uInputClamp.w) return 0.0;
  return texture(uTexture, uv).a;
}
void main() {
  vec4 ink = texture(uTexture, vTextureCoord);
  vec2 pixel = uInputSize.zw;
  float shadow = 0.0;
  float radius = mix(2.0, .8, uLight);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    shadow += coverage(vTextureCoord - vec2(float(x) * radius, 1.0 + float(y) * radius) * pixel);
  }
  shadow = min(1.0, shadow / 9.0 * mix(1.3, 2.0, uLight));
  finalColor = ink + vec4(0.0, 0.0, 0.0, shadow * (1.0 - ink.a));
}
`;
