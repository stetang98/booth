// snarkjs JSON -> Soroban BN254 byte encoding.
//
// soroban-sdk (crypto/bn254.rs) expects:
//   G1  (64B):  be(X) || be(Y)                       each 32-byte big-endian Fp
//   G2 (128B):  be(X.c1) || be(X.c0) || be(Y.c1) || be(Y.c0)
//               NOTE: imaginary limb first — snarkjs JSON stores [c0, c1],
//               so each Fp2 coordinate must be limb-swapped.
//   Fr  (32B):  big-endian U256
//
// snarkjs proof JSON: pi_a = [x, y, '1'], pi_b = [[x_c0, x_c1], [y_c0, y_c1], ['1','0']],
// pi_c = [x, y, '1'] (projective third coordinate dropped).

function beBytes32(decOrBig) {
  let hex = BigInt(decOrBig).toString(16);
  if (hex.length > 64) throw new Error(`value exceeds 32 bytes: ${decOrBig}`);
  return hex.padStart(64, '0');
}

export function encodeG1(point) {
  // point = [x, y, ...]; affine, ignore any third coordinate
  return beBytes32(point[0]) + beBytes32(point[1]);
}

export function encodeG2(point) {
  // point = [[x_c0, x_c1], [y_c0, y_c1], ...] -> c1 || c0 per coordinate
  const [x, y] = point;
  return beBytes32(x[1]) + beBytes32(x[0]) + beBytes32(y[1]) + beBytes32(y[0]);
}

export function encodeFr(value) {
  return beBytes32(value);
}

// proof_bytes (256B): A(64) || B(128) || C(64)
export function encodeProof(proof) {
  return encodeG1(proof.pi_a) + encodeG2(proof.pi_b) + encodeG1(proof.pi_c);
}

// vk_bytes: alpha(64) || beta(128) || gamma(128) || delta(128) || u32-BE ic_len || ic...
export function encodeVerificationKey(vk) {
  const icLen = vk.IC.length.toString(16).padStart(8, '0');
  return (
    encodeG1(vk.vk_alpha_1) +
    encodeG2(vk.vk_beta_2) +
    encodeG2(vk.vk_gamma_2) +
    encodeG2(vk.vk_delta_2) +
    icLen +
    vk.IC.map(encodeG1).join('')
  );
}
