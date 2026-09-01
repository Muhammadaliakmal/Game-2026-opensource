import test from "node:test";
import assert from "node:assert/strict";
import { ShaderChunk, ShaderLib } from "three";
import { createFinishMaterial, EMISSIVE_FINISH, FINISH_PARAMS } from "./shapes";

/**
 * Guards the emissive shader patch.
 *
 * GLSL is compiled by the driver at runtime, so nothing in the toolchain —
 * not tsc, not eslint, not `next build` — can tell you the patch is wrong.
 * It shipped once as `totalEmissiveRadiance *= vColor`, which is a vec3
 * multiplied by a vec4, and the only symptom was a console error at runtime:
 *
 *   THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
 *   Fragment shader is not compiled.
 *
 * These tests read what three ACTUALLY declares and hold the patch to it, so
 * a three upgrade that changes vColor's type or its guard fails here rather
 * than on someone's screen.
 */

/** Run the material's patch over three's real standard fragment shader. */
function patchedFragmentShader(): string {
  const material = createFinishMaterial(EMISSIVE_FINISH);
  assert.ok(
    typeof material.onBeforeCompile === "function",
    "the emissive finish must patch its shader"
  );

  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  // The renderer argument is unused by this patch.
  (material.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
  return shader.fragmentShader;
}

test("the emissive patch actually applies to the standard shader", () => {
  const before = ShaderLib.standard.fragmentShader;
  const after = patchedFragmentShader();
  assert.notEqual(after, before, "the replace target must still exist in three");
  assert.match(after, /totalEmissiveRadiance \*=/);
});

test("the patch multiplies by a vec3, matching totalEmissiveRadiance", () => {
  // three declares vColor as a vec4 in current versions. `vec3 *= vec4` does
  // not compile, so the swizzle is mandatory — and `.rgb` is valid on a vec3
  // too, so this stays correct if three ever narrows the type back.
  const declaration = ShaderChunk.color_pars_fragment;
  assert.match(
    declaration,
    /varying\s+vec[34]\s+vColor/,
    "three should still declare vColor as a varying"
  );

  const after = patchedFragmentShader();
  assert.doesNotMatch(
    after,
    /totalEmissiveRadiance \*= vColor;/,
    "multiplying a vec3 by an unswizzled vColor fails to compile"
  );
  assert.match(after, /totalEmissiveRadiance \*= vColor\.rgb;/);
});

test("the patch is guarded by exactly the defines three declares vColor under", () => {
  // color_pars_fragment is the authority on when `vColor` exists in the
  // fragment stage. Referencing it under any other condition compiles to an
  // undeclared identifier.
  const declaration = ShaderChunk.color_pars_fragment;
  const declaredUnder = new Set(declaration.match(/USE_[A-Z_]+/g) ?? []);
  assert.ok(declaredUnder.size > 0, "expected a #if guard on the declaration");

  const after = patchedFragmentShader();
  const patchBlock = after.slice(
    after.indexOf("#include <emissivemap_fragment>"),
    after.indexOf("totalEmissiveRadiance *= vColor.rgb;")
  );
  const guardedBy = new Set(patchBlock.match(/USE_[A-Z_]+/g) ?? []);

  for (const define of guardedBy) {
    assert.ok(
      declaredUnder.has(define),
      `patch guards on ${define}, which does not gate the vColor declaration`
    );
  }
  for (const define of declaredUnder) {
    assert.ok(
      guardedBy.has(define),
      `vColor is declared under ${define}, so the patch must allow for it`
    );
  }
});

test("only the emissive finish patches its shader", () => {
  // Every other finish should compile as a stock MeshStandardMaterial; a
  // stray patch is a stray chance to break the program.
  for (let finish = 0; finish < FINISH_PARAMS.length; finish++) {
    const material = createFinishMaterial(finish);
    if (finish === EMISSIVE_FINISH) continue;
    assert.equal(
      typeof material.onBeforeCompile === "function" &&
        material.onBeforeCompile.length > 0 &&
        material.onBeforeCompile !== Object.getPrototypeOf(material).onBeforeCompile,
      false,
      `finish ${finish} should not patch its shader`
    );
  }
});
