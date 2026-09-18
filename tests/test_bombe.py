import unittest

from bombepilot.bombe import BombeJob, BombeSolver, build_menu
from bombepilot.enigma import EnigmaMachine


class BombeTests(unittest.TestCase):
    def test_menu_preserves_crib_alignment(self) -> None:
        job = BombeJob(ciphertext="XYYYXYXY", crib="BCD", crib_offset=1)
        menu = build_menu(job)
        self.assertEqual([(edge.offset, edge.plaintext, edge.ciphertext) for edge in menu.edges], [
            (1, "B", "Y"),
            (2, "C", "Y"),
            (3, "D", "Y"),
        ])

    def test_solver_recovers_known_rotor_position(self) -> None:
        plaintext = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG"
        ciphertext = EnigmaMachine(positions="MCK").encrypt(plaintext)
        job = BombeJob(ciphertext=ciphertext, crib=plaintext[7:15], crib_offset=7)
        result = BombeSolver().solve(job)
        self.assertTrue(any(stop.positions == "MCK" for stop in result.stops))
        self.assertEqual(result.events[0]["event"], "search_started")
        self.assertEqual(result.events[-1]["event"], "search_finished")

    def test_diagonal_board_recovers_unknown_steckers(self) -> None:
        plaintext = "WETTERVORHERSAGEBEGINNZEHNUHRNULLNULL"
        ciphertext = EnigmaMachine(positions="AAA", plugboard="AV BS").encrypt(plaintext)
        job = BombeJob(ciphertext=ciphertext, crib=plaintext)
        result = BombeSolver(position_limit=1).solve(job)
        self.assertEqual(len(result.stops), 1)
        stop = result.stops[0]
        self.assertEqual(stop.positions, "AAA")
        self.assertEqual(stop.plugboard, "AV BS")
        self.assertEqual(stop.surviving_tests, 1)

    def test_search_limit_is_observable(self) -> None:
        job = BombeJob(ciphertext="XYZXYZXY", crib="ABC")
        result = BombeSolver(position_limit=4).solve(job)
        self.assertEqual(result.positions_tested, 4)
        self.assertTrue(any(event["event"] == "search_limit_reached" for event in result.events))


if __name__ == "__main__":
    unittest.main()
