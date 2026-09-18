import unittest

from bombepilot.enigma import EnigmaMachine, Plugboard


class EnigmaTests(unittest.TestCase):
    def test_round_trip_with_same_configuration(self) -> None:
        plaintext = "THEQUICKBROWNFOX"
        settings = dict(positions="MCK", plugboard="AV BS CG DL FU HZ IN KM OW RX")
        ciphertext = EnigmaMachine(**settings).encrypt(plaintext)
        decoded = EnigmaMachine(**settings).encrypt(ciphertext)
        self.assertEqual(decoded, plaintext)

    def test_plugboard_is_involutive(self) -> None:
        plugboard = Plugboard("AV BS")
        self.assertEqual(plugboard.map("A"), "V")
        self.assertEqual(plugboard.map("V"), "A")
        self.assertEqual(plugboard.map("C"), "C")

    def test_double_step_changes_expected_rotors(self) -> None:
        machine = EnigmaMachine(positions="AEV")
        machine.step()
        self.assertEqual(machine.positions, "BFW")


if __name__ == "__main__":
    unittest.main()
