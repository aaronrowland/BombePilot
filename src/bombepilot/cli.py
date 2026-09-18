"""Command-line entry point for the first BombePilot demonstration."""

from __future__ import annotations

import json

from .bombe import BombeJob, BombeSolver
from .enigma import EnigmaMachine


def main() -> None:
    plaintext = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG"
    machine = EnigmaMachine(positions="MCK")
    ciphertext = machine.encrypt(plaintext)
    crib = plaintext[7:15]
    job = BombeJob(ciphertext=ciphertext, crib=crib, crib_offset=7)
    result = BombeSolver().solve(job)
    print(json.dumps({
        "ciphertext": ciphertext,
        "crib": crib,
        "positions_tested": result.positions_tested,
        "stops": [
            {
                "positions": stop.positions,
                "test_letter": stop.test_letter,
                "plugboard": stop.plugboard,
                "surviving_tests": stop.surviving_tests,
            }
            for stop in result.stops[:20]
        ],
        "stops_found": len(result.stops),
        "positions_per_second": result.positions_per_second,
        "run_id": result.run_id,
    }, indent=2))


if __name__ == "__main__":
    main()
