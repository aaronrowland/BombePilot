"""A computational model of the Turing–Welchman Bombe process.

The Bombe did not try every plugboard. It tested a rotor order and rotor
position, selected one menu letter as a test point, and propagated the
resulting plugboard hypothesis through a menu of scramblers. The diagonal
board enforced the reciprocal nature of the plugboard. A setting that did not
produce a contradiction was recorded as a *stop* for later checking.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from itertools import permutations, product
import time
from typing import Callable, Iterator
from uuid import uuid4

from .enigma import ALPHABET, ROTOR_SPECS, EnigmaMachine, clean_text


@dataclass(frozen=True)
class BombeJob:
    ciphertext: str
    crib: str
    crib_offset: int = 0
    rotors: tuple[str, str, str] = ("I", "II", "III")
    reflector: str = "B"
    ring_settings: str = "AAA"
    rotor_pool: tuple[str, ...] = tuple(ROTOR_SPECS)
    candidate_orders: tuple[tuple[str, str, str], ...] | None = None

    def __post_init__(self) -> None:
        ciphertext = clean_text(self.ciphertext)
        crib = clean_text(self.crib)
        if not crib:
            raise ValueError("crib must not be empty")
        if self.crib_offset < 0 or self.crib_offset + len(crib) > len(ciphertext):
            raise ValueError("crib must fit within ciphertext at crib_offset")
        if len(self.rotors) != 3 or len(set(self.rotors)) != 3 or any(rotor not in ROTOR_SPECS for rotor in self.rotors):
            raise ValueError("rotors must contain three distinct known rotor names")
        if len(self.rotor_pool) < 3 or len(set(self.rotor_pool)) != len(self.rotor_pool) or any(rotor not in ROTOR_SPECS for rotor in self.rotor_pool):
            raise ValueError("rotor_pool must contain distinct known rotor names")
        if self.candidate_orders is not None:
            if not self.candidate_orders:
                raise ValueError("candidate_orders must not be empty")
            for order in self.candidate_orders:
                if len(order) != 3 or len(set(order)) != 3 or any(rotor not in ROTOR_SPECS for rotor in order):
                    raise ValueError("candidate_orders must contain three distinct known rotor names")
        object.__setattr__(self, "ciphertext", ciphertext)
        object.__setattr__(self, "crib", crib)

    @property
    def rotor_orders(self) -> tuple[tuple[str, str, str], ...]:
        """All candidate three-rotor orders from the available rotor pool."""

        return self.candidate_orders or tuple(permutations(self.rotor_pool, 3))


@dataclass(frozen=True)
class MenuEdge:
    """One crib relationship and the scrambler position at which it occurs."""

    offset: int
    plaintext: str
    ciphertext: str


@dataclass(frozen=True)
class Menu:
    edges: tuple[MenuEdge, ...]
    root: str

    @property
    def vertices(self) -> set[str]:
        return {edge.plaintext for edge in self.edges} | {edge.ciphertext for edge in self.edges}


@dataclass(frozen=True)
class Candidate:
    positions: str
    test_letter: str
    steckers: tuple[tuple[str, str], ...]
    surviving_tests: int
    rotor_order: tuple[str, str, str] = ("I", "II", "III")

    @property
    def plugboard(self) -> str:
        """Human-readable partial stecker information from the stop."""

        return " ".join(left + right for left, right in self.steckers if left != right)


@dataclass
class BombeResult:
    run_id: str
    stops: list[Candidate] = field(default_factory=list)
    positions_tested: int = 0
    hypotheses_tested: int = 0
    elapsed_seconds: float = 0.0
    events: list[dict[str, object]] = field(default_factory=list)

    @property
    def candidates(self) -> list[Candidate]:
        """Compatibility alias: Bombe stops are the candidate settings."""

        return self.stops

    @property
    def positions_per_second(self) -> float:
        if self.elapsed_seconds == 0:
            return 0.0
        return self.positions_tested / self.elapsed_seconds


def build_menu(job: BombeJob) -> Menu:
    """Construct a menu and choose its highest-degree test letter.

    A real operator selected a useful connected web, usually favouring
    repeated letters and loops. This implementation keeps every supplied
    non-self edge and uses the most connected letter as the test point.
    """

    edges = tuple(
        MenuEdge(job.crib_offset + index, plaintext, job.ciphertext[job.crib_offset + index])
        for index, plaintext in enumerate(job.crib)
        if plaintext != job.ciphertext[job.crib_offset + index]
    )
    if not edges:
        raise ValueError("crib produces no menu edges")
    degrees: dict[str, int] = {}
    for edge in edges:
        degrees[edge.plaintext] = degrees.get(edge.plaintext, 0) + 1
        degrees[edge.ciphertext] = degrees.get(edge.ciphertext, 0) + 1
    root = max(degrees, key=lambda letter: (degrees[letter], letter))

    # A Bombe menu is a connected web. If a caller supplies several separate
    # fragments, retain the component containing the selected test point.
    connected = {root}
    changed = True
    while changed:
        changed = False
        for edge in edges:
            if edge.plaintext in connected or edge.ciphertext in connected:
                before = len(connected)
                connected.update((edge.plaintext, edge.ciphertext))
                changed = len(connected) != before
    connected_edges = tuple(
        edge for edge in edges if edge.plaintext in connected and edge.ciphertext in connected
    )
    return Menu(edges=connected_edges, root=root)


def _scrambler_table(
    job: BombeJob,
    positions: str,
    offsets: set[int],
    rotor_order: tuple[str, str, str],
) -> dict[int, tuple[str, ...]]:
    """Return S_i, the plugboard-free Enigma permutation for each menu edge."""

    machine = EnigmaMachine(
        rotors=rotor_order,
        reflector=job.reflector,
        positions=positions,
        ring_settings=job.ring_settings,
    )
    table: dict[int, tuple[str, ...]] = {}
    for offset in range(max(offsets) + 1):
        machine.step()
        if offset in offsets:
            table[offset] = tuple(machine.transform_core(letter) for letter in ALPHABET)
    return table


class _Contradiction(Exception):
    pass


def _propagate(
    menu: Menu,
    scramblers: dict[int, tuple[str, ...]],
    test_letter: str,
) -> dict[str, str]:
    """Propagate one test stecker through the menu and diagonal board.

    If P is the unknown plugboard and S is the Enigma scrambler, each menu
    edge p -> c gives P(c) = S(P(p)). The diagonal board adds P(P(x)) = x.
    """

    assigned: dict[str, str] = {}
    pending: deque[str] = deque()

    def assign(letter: str, value: str) -> None:
        existing = assigned.get(letter)
        if existing is not None and existing != value:
            raise _Contradiction
        reverse = assigned.get(value)
        if reverse is not None and reverse != letter:
            raise _Contradiction
        changed = existing is None
        assigned[letter] = value
        assigned[value] = letter
        if changed:
            pending.append(letter)
            pending.append(value)

    assign(menu.root, test_letter)
    while pending:
        current = pending.popleft()
        value = assigned[current]
        for edge in menu.edges:
            if edge.plaintext == current:
                target = scramblers[edge.offset][ord(value) - ord("A")]
                assign(edge.ciphertext, target)
            if edge.ciphertext == current:
                target = scramblers[edge.offset][ord(value) - ord("A")]
                assign(edge.plaintext, target)
    return assigned


def _stecker_pairs(mapping: dict[str, str]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((letter, value) for letter, value in mapping.items() if letter <= value))


class BombeSolver:
    """Reference implementation of rotor scanning plus menu propagation."""

    def __init__(self, position_limit: int = 26**3) -> None:
        if position_limit <= 0:
            raise ValueError("position_limit must be positive")
        self.position_limit = position_limit

    def iter_positions(self) -> Iterator[str]:
        for values in product(ALPHABET, repeat=3):
            yield "".join(values)

    def solve(
        self,
        job: BombeJob,
        on_event: Callable[[dict[str, object]], None] | None = None,
    ) -> BombeResult:
        run_id = str(uuid4())
        result = BombeResult(run_id=run_id)
        menu = build_menu(job)
        started = time.perf_counter()
        offsets = {edge.offset for edge in menu.edges}

        def emit(event: str, **data: object) -> None:
            record = {"run_id": run_id, "event": event, **data}
            result.events.append(record)
            if on_event:
                on_event(record)

        rotor_orders = job.rotor_orders
        emit(
            "search_started",
            root=menu.root,
            edges=len(menu.edges),
            vertices=len(menu.vertices),
            rotor_orders=len(rotor_orders),
            positions_per_order=26**3,
        )
        limit_reached = False
        for rotor_order in rotor_orders:
            emit("rotor_order_started", rotor_order=" ".join(rotor_order))
            for positions in self.iter_positions():
                if result.positions_tested >= self.position_limit:
                    emit("search_limit_reached", limit=self.position_limit)
                    limit_reached = True
                    break
                result.positions_tested += 1
                scramblers = _scrambler_table(job, positions, offsets, rotor_order)
                surviving: list[tuple[str, dict[str, str]]] = []
                for test_letter in ALPHABET:
                    result.hypotheses_tested += 1
                    try:
                        mapping = _propagate(menu, scramblers, test_letter)
                    except _Contradiction:
                        continue
                    surviving.append((test_letter, mapping))

                # Software analogue of a Bombe stop: fewer than all 26 test
                # hypotheses survive the diagonal-board contradiction test.
                if surviving and len(surviving) < 26:
                    for test_letter, mapping in surviving:
                        stop = Candidate(
                            positions,
                            test_letter,
                            _stecker_pairs(mapping),
                            len(surviving),
                            rotor_order,
                        )
                        result.stops.append(stop)
                        emit(
                            "stop",
                            rotor_order=" ".join(rotor_order),
                            positions=positions,
                            test_letter=test_letter,
                            surviving_tests=len(surviving),
                        )
                if result.positions_tested % 128 == 0:
                    emit(
                        "progress",
                        rotor_order=" ".join(rotor_order),
                        positions=positions,
                        positions_tested=result.positions_tested,
                        hypotheses_tested=result.hypotheses_tested,
                        surviving_tests=len(surviving),
                    )
            if limit_reached:
                break
        result.elapsed_seconds = time.perf_counter() - started
        emit(
            "search_finished",
            positions_tested=result.positions_tested,
            hypotheses_tested=result.hypotheses_tested,
            stops=len(result.stops),
            elapsed_seconds=result.elapsed_seconds,
        )
        return result
