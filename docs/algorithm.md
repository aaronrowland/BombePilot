# Bombe algorithm notes

BombePilot models the logical part of the Turing–Welchman Bombe rather than
brute-forcing complete Enigma keys.

## 1. Crib to menu

The operator aligns a guessed plaintext crib with ciphertext. Each non-self
pair creates a menu edge labelled with the character position. A self-pair is
discarded because Enigma's reflector-based scrambler cannot map a letter to
itself at one position.

The menu is a graph whose vertices are letters and whose edges connect the
plaintext and ciphertext letters. Repeated letters create the loops and webs
that make a crib useful. BombePilot chooses the highest-degree vertex as its
test point.

## 2. Scrambler equations

At position `i`, let `S_i` be the Enigma rotor/reflector permutation with the
plugboard removed, and let `P` be the unknown reciprocal plugboard. For a menu
edge from plaintext `p` to ciphertext `c`:

```text
P(c) = S_i(P(p))
```

For each rotor position, the solver tests all 26 possible values for `P(root)`.
It propagates the consequences through the menu in both directions.

## 3. Diagonal-board constraint

The plugboard is reciprocal, so:

```text
P(P(x)) = x
```

Every assignment therefore assigns its reverse at the same time. If a letter
would receive two different partners, the hypothesis is contradictory and is
rejected. This is the software equivalent of the diagonal board's permanent
cross-connections.

## 4. Stops

The physical Bombe scanned the 17,576 rotor positions and used relay state to
identify a stop. Here, a rotor position is reported as a stop when fewer than
all 26 test-letter hypotheses survive contradiction propagation. A stop gives
the rotor position, a test letter, and partial stecker information. It must be
checked against the full message, just as Bombe operators checked stops on a
separate checking machine.

The diagonal-board idea was Gordon Welchman's major enhancement to Turing's
original Bombe design; this project names the implementation explicitly so
that the historical attribution is clear.

Further reading:

- https://www.rutherfordjournal.org/article030108.html
- https://bombe.org.uk/running-the-bombe/
- https://bombe.org.uk/bombe-description/
