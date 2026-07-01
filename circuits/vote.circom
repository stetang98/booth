pragma circom 2.1.6;

include "circomlib/poseidon.circom";
include "circomlib/mux1.circom";
include "circomlib/bitify.circom";

// One level of a Merkle proof: given the current hash and a sibling, produce the
// parent hash. `pathIndex` selects whether `cur` is the left (0) or right (1) child.
template MerkleLevel() {
    signal input cur;
    signal input sibling;
    signal input pathIndex;   // 0 or 1
    signal output parent;

    pathIndex * (1 - pathIndex) === 0; // boolean constraint

    // left, right = pathIndex ? (sibling, cur) : (cur, sibling)
    component leftMux  = Mux1();
    component rightMux = Mux1();
    leftMux.c[0]  <== cur;
    leftMux.c[1]  <== sibling;
    leftMux.s     <== pathIndex;
    rightMux.c[0] <== sibling;
    rightMux.c[1] <== cur;
    rightMux.s    <== pathIndex;

    component h = Poseidon(2);
    h.inputs[0] <== leftMux.out;
    h.inputs[1] <== rightMux.out;
    parent <== h.out;
}

// Verify a Merkle inclusion proof of `leaf` against `root`, tree of given DEPTH.
template MerkleInclusion(DEPTH) {
    signal input leaf;
    signal input root;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    component levels[DEPTH];
    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;
    for (var i = 0; i < DEPTH; i++) {
        levels[i] = MerkleLevel();
        levels[i].cur       <== hashes[i];
        levels[i].sibling   <== pathElements[i];
        levels[i].pathIndex <== pathIndices[i];
        hashes[i + 1] <== levels[i].parent;
    }
    root === hashes[DEPTH];
}

// Booth anonymous-vote circuit.
//
// Proves: "I know the secret behind a commitment that is a member of the
// eligibility Merkle tree with the given root, my nullifier for this poll is
// nullifierHash, and I am casting voteChoice" — without revealing the commitment
// or which leaf it is.
template Vote(DEPTH) {
    // ---- private ----
    signal input identityNullifier;
    signal input identityTrapdoor;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    // ---- public ----
    signal input merkleRoot;
    signal input nullifierHash;
    signal input pollId;
    signal input voteChoice;

    // commitment = Poseidon(identityNullifier, identityTrapdoor)
    component commit = Poseidon(2);
    commit.inputs[0] <== identityNullifier;
    commit.inputs[1] <== identityTrapdoor;

    // membership in the eligibility tree
    component incl = MerkleInclusion(DEPTH);
    incl.leaf <== commit.out;
    incl.root <== merkleRoot;
    for (var i = 0; i < DEPTH; i++) {
        incl.pathElements[i] <== pathElements[i];
        incl.pathIndices[i]  <== pathIndices[i];
    }

    // nullifierHash = Poseidon(identityNullifier, pollId): deterministic per
    // (voter, poll) so a re-vote collides and is rejected on-chain, but the same
    // voter is unlinkable across different polls.
    component nul = Poseidon(2);
    nul.inputs[0] <== identityNullifier;
    nul.inputs[1] <== pollId;
    nullifierHash === nul.out;

    // Range-constrain voteChoice to [0, 15] (max 16 ballot options) with a
    // full bit decomposition — sound standalone, with no smallness assumption
    // on the input. (The verifier contract additionally derives this public
    // input from a u32, so the check holds in both layers independently.)
    component choiceBits = Num2Bits(4);
    choiceBits.in <== voteChoice;
}

component main {public [merkleRoot, nullifierHash, pollId, voteChoice]} = Vote(16);
