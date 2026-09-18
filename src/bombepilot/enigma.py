"""Small, explicit Enigma reference model used as a correctness oracle."""

from __future__ import annotations

from dataclasses import dataclass
import string

ALPHABET = string.ascii_uppercase

ROTOR_SPECS: dict[str, tuple[str, str]] = {
    "I": ("EKMFLGDQVZNTOWYHXUSPAIBRCJ", "Q"),
    "II": ("AJDKSIRUXBLHWTMCQGZNPYFVOE", "E"),
    "III": ("BDFHJLCPRTXVZNYEIWGAKMUSQO", "V"),
    "IV": ("ESOVPZJAYQUIRHXLNFTGKDCMWB", "J"),
    "V": ("VZBRGITYUPSDNHLXAWMJQOFECK", "Z"),
}

REFLECTORS: dict[str, str] = {
    "B": "YRUHQSLDPXNGOKMIEBFZCWVJAT",
    "C": "FVPJIAOYEDRZXWGCTKUQSBNMHL",
}


def _index(char: str) -> int:
    if len(char) != 1 or char not in ALPHABET:
        raise ValueError(f"expected an uppercase A-Z character, got {char!r}")
    return ord(char) - ord("A")


def clean_text(text: str) -> str:
    """Return uppercase A-Z text, rejecting rather than silently discarding data."""

    result = text.upper()
    if any(char not in ALPHABET for char in result):
        raise ValueError("text may contain only A-Z characters")
    return result


class Plugboard:
    """An involutive plugboard mapping.

    Patching through pairs keeps the mapping explicit and makes it easy to
    serialise in later job and audit records.
    """

    def __init__(self, pairs: str = "") -> None:
        self._mapping = {char: char for char in ALPHABET}
        compact = "".join(pairs.upper().split())
        if len(compact) % 2:
            raise ValueError("plugboard pairs must contain an even number of letters")
        for left, right in zip(compact[::2], compact[1::2]):
            if left not in ALPHABET or right not in ALPHABET:
                raise ValueError("plugboard pairs may contain only A-Z characters")
            if left == right or self._mapping[left] != left or self._mapping[right] != right:
                raise ValueError(f"invalid or repeated plugboard pair: {left}{right}")
            self._mapping[left] = right
            self._mapping[right] = left

    def map(self, char: str) -> str:
        return self._mapping[char]

    def pairs(self) -> str:
        seen: set[str] = set()
        result: list[str] = []
        for char in ALPHABET:
            partner = self._mapping[char]
            if char != partner and char not in seen and partner not in seen:
                result.append(char + partner)
                seen.update((char, partner))
        return " ".join(result)


@dataclass
class Rotor:
    name: str
    position: int = 0
    ring_setting: int = 0

    @property
    def wiring(self) -> str:
        return ROTOR_SPECS[self.name][0]

    @property
    def notch(self) -> int:
        return _index(ROTOR_SPECS[self.name][1])

    def at_notch(self) -> bool:
        return self.position == self.notch

    def forward(self, value: int) -> int:
        shifted = (value + self.position - self.ring_setting) % 26
        wired = _index(self.wiring[shifted])
        return (wired - self.position + self.ring_setting) % 26

    def reverse(self, value: int) -> int:
        shifted = (value + self.position - self.ring_setting) % 26
        wired = self.wiring.index(ALPHABET[shifted])
        return (wired - self.position + self.ring_setting) % 26


class EnigmaMachine:
    """Three-rotor Enigma model with stepping and plugboard support."""

    def __init__(
        self,
        rotors: tuple[str, str, str] = ("I", "II", "III"),
        reflector: str = "B",
        positions: str = "AAA",
        ring_settings: str = "AAA",
        plugboard: str = "",
    ) -> None:
        if len(rotors) != 3 or any(name not in ROTOR_SPECS for name in rotors):
            raise ValueError("rotors must be three known rotor names")
        if reflector not in REFLECTORS:
            raise ValueError(f"unknown reflector {reflector!r}")
        if len(positions) != 3 or len(ring_settings) != 3:
            raise ValueError("positions and ring_settings must have length three")
        self.rotors = [
            Rotor(name, _index(position), _index(ring))
            for name, position, ring in zip(rotors, positions, ring_settings)
        ]
        self.reflector = REFLECTORS[reflector]
        self.reflector_name = reflector
        self.plugboard = Plugboard(plugboard)

    @property
    def positions(self) -> str:
        return "".join(ALPHABET[rotor.position] for rotor in self.rotors)

    def copy(self) -> "EnigmaMachine":
        return EnigmaMachine(
            tuple(rotor.name for rotor in self.rotors),
            self.reflector_name,
            self.positions,
            "".join(ALPHABET[rotor.ring_setting] for rotor in self.rotors),
            self.plugboard.pairs(),
        )

    def set_positions(self, positions: str) -> None:
        if len(positions) != 3 or any(char not in ALPHABET for char in positions):
            raise ValueError("positions must be three uppercase letters")
        for rotor, position in zip(self.rotors, positions):
            rotor.position = _index(position)

    def step(self) -> None:
        left, middle, right = self.rotors
        middle_at_notch = middle.at_notch()
        right_at_notch = right.at_notch()
        if middle_at_notch:
            left.position = (left.position + 1) % 26
        if middle_at_notch or right_at_notch:
            middle.position = (middle.position + 1) % 26
        right.position = (right.position + 1) % 26

    def transform_core(self, char: str) -> str:
        """Transform one character without plugboard substitution."""

        value = _index(char)
        for rotor in reversed(self.rotors):
            value = rotor.forward(value)
        value = _index(self.reflector[value])
        for rotor in self.rotors:
            value = rotor.reverse(value)
        return ALPHABET[value]

    def encode_char(self, char: str) -> str:
        char = clean_text(char)
        self.step()
        entered = self.plugboard.map(char)
        exited = self.transform_core(entered)
        return self.plugboard.map(exited)

    def encrypt(self, text: str) -> str:
        return "".join(self.encode_char(char) for char in clean_text(text))
