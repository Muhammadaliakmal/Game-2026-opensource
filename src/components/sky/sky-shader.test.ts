import { test } from "node:test";
import assert from "node:assert/strict";
import { skyFragmentShader, skyVertexShader } from "./sky-shader";

/**
 * GLSL's pow(x, y) is undefined for x < 0, and most GPUs answer NaN. One NaN
 * pixel under Bloom's mipmap blur becomes a black frame, because the blur
 * averages it into its smallest level and the upsample spreads it over
 * everything — which is how Sky Yard rendered black on phones (3 Oct 2026):
 * a dot product rounding to -1.0000001 under an unclamped pow.
 *
 * A CPU mirror cannot catch that: JavaScript's float64 does not round where a
 * GPU's float32 does. So the rule is checked on the source — every pow() in
 * the sky's shaders takes a clamped base.
 */
function powBases(source: string): string[] {
  // Comments first: the shader explains this rule in prose that names pow().
  const glsl = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const bases: string[] = [];
  for (const m of glsl.matchAll(/\bpow\s*\(/g)) {
    // Walk to the comma that ends the first argument, at depth zero.
    let depth = 0;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < glsl.length; i++) {
      const c = glsl[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) break;
    }
    bases.push(glsl.slice(start, i).trim());
  }
  return bases;
}

test("every pow() base in the sky shader is clamped", () => {
  for (const display of [true, false]) {
    const bases = powBases(skyFragmentShader(display) + skyVertexShader);
    assert.ok(bases.length > 0, "the shader no longer calls pow; retire this test");
    for (const b of bases) {
      assert.match(b, /^(clamp|max|abs)\s*\(/, `pow(${b}, …) can be handed a negative base`);
    }
  }
});

test("the scanner itself flags a bare base", () => {
  const src =
    "// pow(x, y) is undefined for x < 0\nfloat a = pow(facing, 2.0); float b = pow(clamp(x, 0.0, 1.0), y);";
  assert.deepEqual(powBases(src), [
    "facing",
    "clamp(x, 0.0, 1.0)",
  ]);
});
