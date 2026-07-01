//! Booth — anonymous on-chain voting for Stellar.
//!
//! A ballot is accepted only with a Groth16 zero-knowledge proof, verified
//! on-chain via the Protocol 25/26 BN254 host functions, that the voter's
//! identity commitment is a member of the poll's eligibility Merkle tree and
//! that their per-poll nullifier has not been used before. The contract never
//! learns which member voted.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    panic_with_error, vec, Address, Bytes, BytesN, Env, String, Vec, U256,
};

const G1_SIZE: u32 = 64;
const G2_SIZE: u32 = 128;
/// vk_bytes layout: alpha(64) || beta(128) || gamma(128) || delta(128) || u32-BE ic_len || ic…
const VK_HEADER_SIZE: u32 = G1_SIZE + 3 * G2_SIZE + 4;

/// BN254 scalar-field modulus `r`, big-endian. Public inputs must be < r,
/// otherwise two distinct byte strings could alias the same field element
/// (e.g. a nullifier reused as `nullifier + r`).
const BN254_FR_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58,
    0x5d, 0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00,
    0x00, 0x01,
];

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    MalformedVk = 1,
    PollNotFound = 2,
    PollEnded = 3,
    InvalidChoice = 4,
    AlreadyVoted = 5,
    InvalidProof = 6,
    InvalidFieldElement = 7,
    TooManyChoices = 8,
}

#[derive(Clone)]
#[contracttype]
pub struct Poll {
    pub organizer: Address,
    pub title: String,
    pub choices: Vec<String>,
    /// Poseidon Merkle root of the eligibility commitments (32-byte BE field element).
    pub root: BytesN<32>,
    /// Last ledger (exclusive) at which votes are accepted.
    pub end_ledger: u32,
    pub tallies: Vec<u32>,
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Vk,
    PollCount,
    Poll(u32),
    Nullifier(u32, BytesN<32>),
}

#[contractevent]
#[derive(Clone)]
pub struct PollCreated {
    #[topic]
    pub poll_id: u32,
    pub organizer: Address,
    pub root: BytesN<32>,
}

#[contractevent]
#[derive(Clone)]
pub struct Voted {
    #[topic]
    pub poll_id: u32,
    pub nullifier_hash: BytesN<32>,
    pub vote_choice: u32,
}

struct VerificationKey {
    alpha: Bn254G1Affine,
    beta: Bn254G2Affine,
    gamma: Bn254G2Affine,
    delta: Bn254G2Affine,
    ic: Vec<Bn254G1Affine>,
}

fn read_g1(env: &Env, bytes: &Bytes, offset: u32) -> Bn254G1Affine {
    let mut buf = [0u8; G1_SIZE as usize];
    bytes.slice(offset..offset + G1_SIZE).copy_into_slice(&mut buf);
    Bn254G1Affine::from_array(env, &buf)
}

fn read_g2(env: &Env, bytes: &Bytes, offset: u32) -> Bn254G2Affine {
    let mut buf = [0u8; G2_SIZE as usize];
    bytes.slice(offset..offset + G2_SIZE).copy_into_slice(&mut buf);
    Bn254G2Affine::from_array(env, &buf)
}

fn parse_vk(env: &Env, vk_bytes: &Bytes) -> Result<VerificationKey, Error> {
    if vk_bytes.len() < VK_HEADER_SIZE {
        return Err(Error::MalformedVk);
    }
    let alpha = read_g1(env, vk_bytes, 0);
    let beta = read_g2(env, vk_bytes, G1_SIZE);
    let gamma = read_g2(env, vk_bytes, G1_SIZE + G2_SIZE);
    let delta = read_g2(env, vk_bytes, G1_SIZE + 2 * G2_SIZE);

    let mut len_buf = [0u8; 4];
    vk_bytes
        .slice(VK_HEADER_SIZE - 4..VK_HEADER_SIZE)
        .copy_into_slice(&mut len_buf);
    let ic_len = u32::from_be_bytes(len_buf);
    if ic_len == 0 || vk_bytes.len() != VK_HEADER_SIZE + ic_len * G1_SIZE {
        return Err(Error::MalformedVk);
    }
    let mut ic = vec![env];
    for i in 0..ic_len {
        ic.push_back(read_g1(env, vk_bytes, VK_HEADER_SIZE + i * G1_SIZE));
    }
    Ok(VerificationKey { alpha, beta, gamma, delta, ic })
}

/// Groth16: e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1,
/// with vk_x = ic[0] + Σ publics[i] · ic[i+1] (computed with the CAP-0080 MSM
/// host function).
fn verify_groth16(
    env: &Env,
    vk: &VerificationKey,
    proof_bytes: &BytesN<256>,
    publics: &Vec<Bn254Fr>,
) -> bool {
    if publics.len() + 1 != vk.ic.len() {
        return false;
    }
    let bn254 = env.crypto().bn254();
    let proof: Bytes = proof_bytes.into();
    let a = read_g1(env, &proof, 0);
    let b = read_g2(env, &proof, G1_SIZE);
    let c = read_g1(env, &proof, G1_SIZE + G2_SIZE);

    let mut msm_points = vec![env];
    for i in 1..vk.ic.len() {
        msm_points.push_back(vk.ic.get_unchecked(i));
    }
    let sum = bn254.g1_msm(msm_points, publics.clone());
    let vk_x = bn254.g1_add(&vk.ic.get_unchecked(0), &sum);

    let neg_a = -&a;
    bn254.pairing_check(
        vec![env, neg_a, vk.alpha.clone(), vk_x, c],
        vec![env, b, vk.beta.clone(), vk.gamma.clone(), vk.delta.clone()],
    )
}

/// A 32-byte value is only a valid public input if it is a canonical BN254
/// scalar (< r).
fn to_fr(env: &Env, bytes: &BytesN<32>) -> Result<Bn254Fr, Error> {
    let value = U256::from_be_bytes(env, &bytes.into());
    let modulus = U256::from_be_bytes(env, &Bytes::from_array(env, &BN254_FR_MODULUS_BE));
    if value >= modulus {
        return Err(Error::InvalidFieldElement);
    }
    Ok(value.into())
}

fn extend_instance(env: &Env) {
    // ~7 days threshold, ~30 days target (5s ledgers)
    env.storage().instance().extend_ttl(120_960, 518_400);
}

#[contract]
pub struct BoothContract;

#[contractimpl]
impl BoothContract {
    /// Deploys with the Groth16 verification key for the vote circuit.
    /// The VK is immutable for the life of the contract.
    pub fn __constructor(env: Env, vk_bytes: Bytes) {
        if parse_vk(&env, &vk_bytes).is_err() {
            panic_with_error!(&env, Error::MalformedVk);
        }
        env.storage().instance().set(&DataKey::Vk, &vk_bytes);
        env.storage().instance().set(&DataKey::PollCount, &0u32);
        extend_instance(&env);
    }

    /// Opens a poll over a fixed eligibility set. `root` is the Poseidon
    /// Merkle root of the registered identity commitments; publishing it
    /// freezes the electorate for this poll. Anyone can be an organizer —
    /// polls are self-sovereign.
    pub fn create_poll(
        env: Env,
        organizer: Address,
        title: String,
        choices: Vec<String>,
        root: BytesN<32>,
        duration_ledgers: u32,
    ) -> Result<u32, Error> {
        organizer.require_auth();

        // the circuit range-checks voteChoice < 16
        if choices.len() < 2 || choices.len() > 16 {
            return Err(Error::TooManyChoices);
        }
        to_fr(&env, &root)?;

        let poll_id: u32 = env.storage().instance().get(&DataKey::PollCount).unwrap();
        let mut tallies = vec![&env];
        for _ in 0..choices.len() {
            tallies.push_back(0u32);
        }
        let poll = Poll {
            organizer: organizer.clone(),
            title,
            choices,
            root,
            end_ledger: env.ledger().sequence() + duration_ledgers,
            tallies,
        };
        let key = DataKey::Poll(poll_id);
        env.storage().persistent().set(&key, &poll);
        env.storage().persistent().extend_ttl(&key, 120_960, 518_400);
        env.storage().instance().set(&DataKey::PollCount, &(poll_id + 1));
        extend_instance(&env);

        PollCreated { poll_id, organizer, root: poll.root.clone() }.publish(&env);
        Ok(poll_id)
    }

    /// Casts an anonymous ballot. The proof shows, in zero knowledge:
    ///   1. the voter knows the secrets of a commitment in the poll's tree,
    ///   2. `nullifier_hash` = Poseidon(identityNullifier, poll_id),
    ///   3. the ballot choice is bound into the proof.
    /// The transaction's signing key is unrelated to the voter identity.
    pub fn vote(
        env: Env,
        poll_id: u32,
        proof_bytes: BytesN<256>,
        nullifier_hash: BytesN<32>,
        vote_choice: u32,
    ) -> Result<(), Error> {
        let poll_key = DataKey::Poll(poll_id);
        let mut poll: Poll = env
            .storage()
            .persistent()
            .get(&poll_key)
            .ok_or(Error::PollNotFound)?;

        if env.ledger().sequence() >= poll.end_ledger {
            return Err(Error::PollEnded);
        }
        if vote_choice >= poll.tallies.len() {
            return Err(Error::InvalidChoice);
        }
        let nullifier_key = DataKey::Nullifier(poll_id, nullifier_hash.clone());
        if env.storage().persistent().has(&nullifier_key) {
            return Err(Error::AlreadyVoted);
        }

        // Public signals in circuit order: [merkleRoot, nullifierHash, pollId,
        // voteChoice]. Root and pollId come from contract state, never the
        // caller, so a proof against a stale or foreign root can't be replayed.
        let publics = vec![
            &env,
            to_fr(&env, &poll.root)?,
            to_fr(&env, &nullifier_hash)?,
            U256::from_u32(&env, poll_id).into(),
            U256::from_u32(&env, vote_choice).into(),
        ];

        let vk_bytes: Bytes = env.storage().instance().get(&DataKey::Vk).unwrap();
        let vk = parse_vk(&env, &vk_bytes)?;
        if !verify_groth16(&env, &vk, &proof_bytes, &publics) {
            return Err(Error::InvalidProof);
        }

        env.storage().persistent().set(&nullifier_key, &());
        env.storage()
            .persistent()
            .extend_ttl(&nullifier_key, 120_960, 518_400);

        let count = poll.tallies.get_unchecked(vote_choice) + 1;
        poll.tallies.set(vote_choice, count);
        env.storage().persistent().set(&poll_key, &poll);
        env.storage().persistent().extend_ttl(&poll_key, 120_960, 518_400);
        extend_instance(&env);

        Voted { poll_id, nullifier_hash, vote_choice }.publish(&env);
        Ok(())
    }

    pub fn get_poll(env: Env, poll_id: u32) -> Result<Poll, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Poll(poll_id))
            .ok_or(Error::PollNotFound)
    }

    pub fn get_poll_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::PollCount).unwrap_or(0)
    }

    pub fn has_voted(env: Env, poll_id: u32, nullifier_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(poll_id, nullifier_hash))
    }
}

mod test;
