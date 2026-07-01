#!/usr/bin/env bash
# Reproduces the circuit build from scratch: compile -> phase-2 setup -> VK.
# Prereqs: circom 2.2.x (cargo install circom), node deps (npm install).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p circuits/build
circom circuits/vote.circom --r1cs --wasm --sym -o circuits/build -l circuits

# Public Hermez Powers-of-Tau (phase 1), power 14 — enough for ~16k constraints
if [ ! -f circuits/build/pot14.ptau ]; then
  curl -L -o circuits/build/pot14.ptau \
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau"
fi

cd circuits/build
npx snarkjs groth16 setup vote.r1cs pot14.ptau vote_0000.zkey
npx snarkjs zkey contribute vote_0000.zkey vote_final.zkey \
  --name="booth dev contribution" -e="$(head -c 64 /dev/urandom | xxd -p | tr -d '\n')"
npx snarkjs zkey export verificationkey vote_final.zkey verification_key.json
echo "OK: circuits/build/{vote_final.zkey, verification_key.json, vote_js/vote.wasm}"
