# security/

This folder is the durable security/authority design reference for The
Factory — it explains *what* the project is built to prove and *why* the
architecture is shaped the way it is. It is documentation, not build
instructions.

Build instructions live in `../prompts/`. If a prompt and this folder
ever disagree on a security rule, treat that as a bug to fix, not a
choice to make silently — the prompts implement what this folder
specifies.

## Contents

- [`authority-model.md`](./authority-model.md) — the identity, access,
  trust, observability, containment, and revocation model this project
  demonstrates; the exact BAD vs. GOOD authority matrices for every
  agent; the delegation rules enforced by the backend.
- [`threat-model.md`](./threat-model.md) — what this project is and is
  not trying to prove, the containment boundary, and the non-goals that
  keep the demo honest and safe to run repeatedly, live, on a laptop.

## Why this exists as its own top-level folder

`editors_factory` exists to make one argument concrete:

> An autonomous actor with a valid identity can still cause damage when
> access, trust, and delegated authority are badly bounded — and the
> same actor, with the same intelligence, is safely contained when they
> are not.

That argument only lands if the security model is explicit, inspectable,
and enforced in more than one layer (application policy *and* database
grants *and* container isolation). This folder is where that model is
written down once, so every prompt in `../prompts/` implements the same
model instead of each prompt inventing its own version of it.

Project tagline:

> **Break the factory. Learn from it. Reset. Repeat. No regrets.**
