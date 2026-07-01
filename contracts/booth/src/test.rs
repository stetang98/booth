#![cfg(test)]
extern crate std;

use super::*;
use serde::Deserialize;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, Bytes, BytesN, Env, String as SorobanString,
};

#[derive(Deserialize)]
struct FixtureVote {
    name: std::string::String,
    proof_bytes: std::string::String,
    nullifier_hash: std::string::String,
    vote_choice: u32,
}

#[derive(Deserialize)]
struct Fixtures {
    vk_bytes: std::string::String,
    merkle_root: std::string::String,
    poll_id: u32,
    votes: std::vec::Vec<FixtureVote>,
}

fn fixtures() -> Fixtures {
    serde_json::from_str(include_str!("../test_fixtures.json")).unwrap()
}

fn bytes_from_hex(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, &hex::decode(s).unwrap())
}

fn bytes32_from_hex(env: &Env, s: &str) -> BytesN<32> {
    let raw: [u8; 32] = hex::decode(s).unwrap().try_into().unwrap();
    BytesN::from_array(env, &raw)
}

fn bytes256_from_hex(env: &Env, s: &str) -> BytesN<256> {
    let raw: [u8; 256] = hex::decode(s).unwrap().try_into().unwrap();
    BytesN::from_array(env, &raw)
}

struct Setup {
    env: Env,
    client: BoothContractClient<'static>,
    fx: Fixtures,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    let fx = fixtures();
    let organizer = Address::generate(&env);
    let vk = bytes_from_hex(&env, &fx.vk_bytes);
    let contract_id = env.register(BoothContract, (vk,));
    let client = BoothContractClient::new(&env, &contract_id);

    // Fixture proofs are bound to poll_id from the fixture file. Poll ids are
    // sequential from 0, so create filler polls until the next id matches.
    let root = bytes32_from_hex(&env, &fx.merkle_root);
    let choices = vec![
        &env,
        SorobanString::from_str(&env, "Approve"),
        SorobanString::from_str(&env, "Reject"),
        SorobanString::from_str(&env, "Abstain"),
        SorobanString::from_str(&env, "Postpone"),
    ];
    for _ in 0..=fx.poll_id {
        client.create_poll(
            &organizer,
            &SorobanString::from_str(&env, "Ratify the 2026 treasury budget"),
            &choices,
            &root,
            &17280,
        );
    }
    Setup { env, client, fx }
}

#[test]
fn honest_vote_verifies_and_tallies() {
    let s = setup();
    let v = &s.fx.votes[0];
    assert_eq!(v.name, "voter1_choice2");

    s.client.vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v.proof_bytes),
        &bytes32_from_hex(&s.env, &v.nullifier_hash),
        &v.vote_choice,
    );

    let poll = s.client.get_poll(&s.fx.poll_id);
    assert_eq!(poll.tallies.get_unchecked(v.vote_choice), 1);
    assert!(s
        .client
        .has_voted(&s.fx.poll_id, &bytes32_from_hex(&s.env, &v.nullifier_hash)));
}

#[test]
fn second_voter_counts_separately() {
    let s = setup();
    let v1 = &s.fx.votes[0];
    let v2 = &s.fx.votes[1];
    s.client.vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v1.proof_bytes),
        &bytes32_from_hex(&s.env, &v1.nullifier_hash),
        &v1.vote_choice,
    );
    s.client.vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v2.proof_bytes),
        &bytes32_from_hex(&s.env, &v2.nullifier_hash),
        &v2.vote_choice,
    );
    let poll = s.client.get_poll(&s.fx.poll_id);
    assert_eq!(poll.tallies.get_unchecked(v1.vote_choice), 1);
    assert_eq!(poll.tallies.get_unchecked(v2.vote_choice), 1);
}

#[test]
fn revote_with_same_nullifier_is_rejected() {
    let s = setup();
    let v1 = &s.fx.votes[0];
    // votes[2] is voter 1 again, different choice, same nullifier
    let revote = &s.fx.votes[2];
    assert_eq!(revote.name, "voter1_revote_choice3");
    assert_eq!(revote.nullifier_hash, v1.nullifier_hash);

    s.client.vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v1.proof_bytes),
        &bytes32_from_hex(&s.env, &v1.nullifier_hash),
        &v1.vote_choice,
    );
    let result = s.client.try_vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &revote.proof_bytes),
        &bytes32_from_hex(&s.env, &revote.nullifier_hash),
        &revote.vote_choice,
    );
    assert_eq!(result, Err(Ok(Error::AlreadyVoted)));
}

#[test]
fn tampered_proof_is_rejected() {
    let s = setup();
    let v = &s.fx.votes[0];
    let mut raw = hex::decode(&v.proof_bytes).unwrap();
    raw[0] ^= 0x01; // corrupt one byte of proof.A.x
    let arr: [u8; 256] = raw.try_into().unwrap();
    let result = s.client.try_vote(
        &s.fx.poll_id,
        &BytesN::from_array(&s.env, &arr),
        &bytes32_from_hex(&s.env, &v.nullifier_hash),
        &v.vote_choice,
    );
    // corrupted A.x is either not on the curve (host panics -> InvalidAction)
    // or fails the pairing (InvalidProof); both mean rejection
    assert!(result.is_err());
}

#[test]
fn proof_does_not_authorize_a_different_choice() {
    let s = setup();
    let v = &s.fx.votes[0];
    // same valid proof, but claiming a different public voteChoice
    let result = s.client.try_vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v.proof_bytes),
        &bytes32_from_hex(&s.env, &v.nullifier_hash),
        &1u32,
    );
    assert_eq!(result, Err(Ok(Error::InvalidProof)));
}

#[test]
fn vote_after_poll_end_is_rejected() {
    let s = setup();
    let v = &s.fx.votes[0];
    s.env.ledger().with_mut(|l| l.sequence_number += 20_000);
    let result = s.client.try_vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v.proof_bytes),
        &bytes32_from_hex(&s.env, &v.nullifier_hash),
        &v.vote_choice,
    );
    assert_eq!(result, Err(Ok(Error::PollEnded)));
}

#[test]
fn non_canonical_nullifier_is_rejected() {
    let s = setup();
    let v = &s.fx.votes[0];
    // nullifier >= r aliases another scalar; must be refused outright
    let too_big = [0xffu8; 32];
    let result = s.client.try_vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v.proof_bytes),
        &BytesN::from_array(&s.env, &too_big),
        &v.vote_choice,
    );
    assert_eq!(result, Err(Ok(Error::InvalidFieldElement)));
}

#[test]
fn print_vote_cost() {
    let s = setup();
    let v = &s.fx.votes[0];
    s.env.cost_estimate().budget().reset_default();
    s.client.vote(
        &s.fx.poll_id,
        &bytes256_from_hex(&s.env, &v.proof_bytes),
        &bytes32_from_hex(&s.env, &v.nullifier_hash),
        &v.vote_choice,
    );
    std::println!("{}", s.env.cost_estimate().budget());
}
