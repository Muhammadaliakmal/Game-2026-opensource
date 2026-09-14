import * as THREE from "three";
import type { BlockArrays } from "./block-arrays";
import { DETAIL, NORMAL_STRENGTH, TEXTURE_SCALE, TRIPLANAR_SHARPNESS } from "./tuning";

/**
 * What a block material samples, by quality tier. See lib/quality.ts.
 *
 *  - `flat`     nothing: the material is the plain MeshStandardMaterial it
 *               always was. Also what every bucket renders until the arrays
 *               arrive, and forever if they fail to.
 *  - `surface`  tint + roughness from the surface array. One array, three
 *               fetches. Low tier.
 *  - `full`     surface + the normal array + the detail pass.
 */
export type TextureMode = "flat" | "surface" | "full";

/** The per-instance attribute name both instanced renderers write. */
export const TEXTURE_ATTRIBUTE = "aTexture";

/**
 * Patch a MeshStandardMaterial to sample the block arrays.
 *
 * ── Why `onBeforeCompile` rather than a ShaderMaterial ───────────────────
 *
 * Everything that makes a block look lit — the environment probe, the
 * directional shadow, the hemisphere fill, fog, ACES — is inside
 * MeshStandardMaterial's program. A raw ShaderMaterial would have to
 * reimplement all of it. Replacing four `#include`s keeps every line of it
 * and swaps only where the diffuse, roughness and normal come from.
 *
 * ── Why world-space triplanar and not UVs ────────────────────────────────
 *
 * The four block geometries do not share a UV layout — RoundedBoxGeometry has
 * per-face UVs, ExtrudeGeometry's are in object units, and the wedge has no
 * UV attribute at all. Projecting by world position needs none of them:
 * every axis-aligned face of a unit cube gets exactly one tile, the ramp's
 * slope blends its two adjoining projections, and a floor of one surface tiles
 * continuously across cells rather than restarting at every block edge.
 *
 * ── The tint contract ────────────────────────────────────────────────────
 *
 * `map_fragment` runs before `color_fragment`, where three multiplies the
 * instance colour in. So the order is (diffuse × texel×2) × palette colour:
 * the texture shapes the light, the palette owns the hue, and the flat
 * identity layer leaves a plain block bit-for-bit as it was.
 *
 * Every replacement below leaves the original `#include` in place where it is
 * harmless (they compile to nothing without USE_MAP / USE_ROUGHNESSMAP /
 * USE_NORMALMAP) and appends after it, so a future three that adds to those
 * chunks still gets its own code.
 */
export function applyBlockTextures(
  material: THREE.MeshStandardMaterial,
  arrays: BlockArrays,
  mode: Exclude<TextureMode, "flat">
): void {
  const full = mode === "full";
  const previous = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    // Compose with whatever was there — the emissive finish has its own patch.
    previous?.(shader, renderer);

    shader.uniforms.uSurfaceArray = { value: arrays.surface };
    shader.uniforms.uTexScale = { value: TEXTURE_SCALE };
    shader.uniforms.uTriSharp = { value: TRIPLANAR_SHARPNESS };
    if (full) {
      shader.uniforms.uNormalArray = { value: arrays.normal };
      shader.uniforms.uNormalStrength = { value: NORMAL_STRENGTH };
      shader.uniforms.uDetail = { value: arrays.detail };
      shader.uniforms.uDetailScale = { value: DETAIL.scale };
      shader.uniforms.uDetailStrength = { value: DETAIL.strength };
      shader.uniforms.uDetailFade = { value: new THREE.Vector2(DETAIL.fadeStart, DETAIL.fadeEnd) };
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        attribute float ${TEXTURE_ATTRIBUTE};
        varying float vTexLayer;
        varying vec3 vTexWorldPos;
        `
      )
      .replace(
        "#include <project_vertex>",
        /* glsl */ `
        #include <project_vertex>
        vTexLayer = ${TEXTURE_ATTRIBUTE};
        {
          // World position through the instance matrix. three only computes
          // its own \`worldPosition\` under USE_ENVMAP / USE_SHADOWMAP, which
          // happen to be on today and may not be tomorrow.
          vec4 texPos = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            texPos = instanceMatrix * texPos;
          #endif
          vTexWorldPos = ( modelMatrix * texPos ).xyz;
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform sampler2DArray uSurfaceArray;
        uniform float uTexScale;
        uniform float uTriSharp;
        ${
          full
            ? /* glsl */ `
        uniform sampler2DArray uNormalArray;
        uniform float uNormalStrength;
        uniform sampler2D uDetail;
        uniform float uDetailScale;
        uniform float uDetailStrength;
        uniform vec2 uDetailFade;
        `
            : ""
        }
        varying float vTexLayer;
        varying vec3 vTexWorldPos;

        // Blend weights from the geometric world normal, sharpened so an
        // axis-aligned face is exactly one projection and only a chamfer mixes.
        vec3 triWeights( vec3 wn ) {
          vec3 w = pow( abs( wn ), vec3( uTriSharp ) );
          return w / ( w.x + w.y + w.z );
        }

        // The three projections. Walls take -y as v so the image's top is up.
        vec2 triUvX( vec3 p ) { return vec2( p.z, -p.y ); }
        vec2 triUvY( vec3 p ) { return vec2( p.x,  p.z ); }
        vec2 triUvZ( vec3 p ) { return vec2( p.x, -p.y ); }

        vec4 triSample( sampler2DArray arr, vec3 p, vec3 w, float layer ) {
          return texture( arr, vec3( triUvX( p ), layer ) ) * w.x
               + texture( arr, vec3( triUvY( p ), layer ) ) * w.y
               + texture( arr, vec3( triUvZ( p ), layer ) ) * w.z;
        }
        `
      )
      // The surface fetch has to happen before roughness and after the
      // geometric normal exists — but \`normal\` is only defined at
      // normal_fragment_begin, after both. So the world normal is rebuilt
      // here from the varying three already carries, and the sample is
      // stored for the two chunks that follow.
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        #include <map_fragment>
        vec3 texGeoNormal = transformNormalByInverseViewMatrix( normalize( vNormal ), viewMatrix );
        vec3 texW = triWeights( texGeoNormal );
        vec3 texP = vTexWorldPos * uTexScale;
        vec4 texSurface = triSample( uSurfaceArray, texP, texW, vTexLayer );
        // R is luminance normalised to a mean of 0.5: ×2 makes the identity 1.
        diffuseColor.rgb *= texSurface.r * 2.0;
        ${
          full
            ? /* glsl */ `
        {
          // Part 8: fine grain at arm's length, gone by twenty metres.
          vec3 dp = vTexWorldPos * uDetailScale;
          float detail = texture2D( uDetail, triUvX( dp ) ).r * texW.x
                       + texture2D( uDetail, triUvY( dp ) ).r * texW.y
                       + texture2D( uDetail, triUvZ( dp ) ).r * texW.z;
          float fade = 1.0 - smoothstep( uDetailFade.x, uDetailFade.y, length( vViewPosition ) );
          diffuseColor.rgb *= mix( 1.0, detail * 2.0, uDetailStrength * fade );
        }
        `
            : ""
        }
        `
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
        #include <roughnessmap_fragment>
        // G is roughness normalised the same way, so the finish's own value
        // is the mean and the texture only varies around it.
        roughnessFactor = clamp( roughnessFactor * texSurface.g * 2.0, 0.0, 1.0 );
        `
      );

    if (full) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          // Triplanar normal, UDN-blended: each projection's tangent-space
          // slope is swizzled onto the world axes its uv runs along, weighted,
          // and added to the geometric normal. The tangent z is dropped, which
          // is what makes this blend cheap and seam-free.
          vec3 nX = texture( uNormalArray, vec3( triUvX( texP ), vTexLayer ) ).xyz * 2.0 - 1.0;
          vec3 nY = texture( uNormalArray, vec3( triUvY( texP ), vTexLayer ) ).xyz * 2.0 - 1.0;
          vec3 nZ = texture( uNormalArray, vec3( triUvZ( texP ), vTexLayer ) ).xyz * 2.0 - 1.0;
          vec3 delta = vec3( 0.0, -nX.y, nX.x ) * texW.x
                     + vec3( nY.x, 0.0, nY.y ) * texW.y
                     + vec3( nZ.x, -nZ.y, 0.0 ) * texW.z;
          vec3 worldN = normalize( texGeoNormal + delta * uNormalStrength );
          normal = normalize( ( viewMatrix * vec4( worldN, 0.0 ) ).xyz );
        }
        `
      );
    }
  };
}

/** The part of a program cache key that says how a block material samples. */
export function textureCacheKey(mode: TextureMode): string {
  return `tex-${mode}`;
}
