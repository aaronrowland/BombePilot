# BombePilot

BombePilot is a modern, AI-ready engineering project inspired by Alan Turing's
electromechanical Bombe. It uses a deterministic Enigma reference model and a
crib-based search engine as the foundation for future hardware acceleration,
verification automation, and engineering-assistant workflows.

The central design principle is simple:

> AI may plan, observe, explain, and diagnose a run. The cryptanalytic core
> remains deterministic, testable, and responsible for proving its result.

## Current slice

The initial implementation provides:

- a typed Enigma machine model with historically recognisable rotors,
  reflector, stepping, and plugboard support;
- a Bombe-style menu builder, diagonal-board propagation, and stop detector;
- structured search results and trace events;
- a command-line demo;
- known-answer and invariant tests.

Run the demo without installing the package:

```bash
PYTHONPATH=src python -m bombepilot.cli
```

## Web visualiser

The `web/` directory is a dependency-free static visualiser. It runs the same
menu, scrambler, diagonal-board, and stop logic in the browser, so it can be
served directly by Cloudflare Pages without a Python runtime.

For a local preview, serve the repository root with any static file server and
open `web/index.html`. The hosted version provides a quick 4,096-position
demonstration and an optional full 17,576-position sweep.

For Cloudflare Pages, use `web` as the output directory and leave the build
command empty. A root-level fallback is included for deployments that publish
the repository root instead.

Run the tests:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
```

## Direction

The implementation follows the Bombe abstraction rather than brute-forcing
plugboard configurations. A crib creates a menu of plaintext/ciphertext
relationships. For each rotor position, the solver tests a hypothesised
stecker for one menu letter, propagates consequences through the plugboard-free
scrambler permutations, and enforces the reciprocal plugboard constraint—the
software equivalent of the diagonal board. Rotor positions with surviving
hypotheses are emitted as stops for later checking.

The detailed algorithm is documented in [docs/algorithm.md](docs/algorithm.md).

The next layers are deliberately separated from the reference model:

1. benchmark and optimise the search backend on Arm64;
2. add a native parallel backend with differential tests against Python;
3. add a small RTL constraint lane and cocotb verification environment;
4. expose typed tools for experiment submission, trace inspection, and log
   analysis;
5. add an AI engineering assistant that can explain failures and propose
   reproducible experiments without arbitrary shell access.

This makes the project relevant to hardware design and verification automation,
AI-assisted engineering workflows, and measurable productivity improvement.
