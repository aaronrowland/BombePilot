// Browser reference implementation of the same Turing–Welchman Bombe logic
// as src/bombepilot/bombe.py. It keeps the algorithm explicit so the
// visualiser remains inspectable and deterministic when hosted statically.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROTOR_SPECS = {
  I: ["EKMFLGDQVZNTOWYHXUSPAIBRCJ", "Q"],
  II: ["AJDKSIRUXBLHWTMCQGZNPYFVOE", "E"],
  III: ["BDFHJLCPRTXVZNYEIWGAKMUSQO", "V"],
  IV: ["ESOVPZJAYQUIRHXLNFTGKDCMWB", "J"],
  V: ["VZBRGITYUPSDNHLXAWMJQOFECK", "Z"],
};
const REFLECTORS = {
  B: "YRUHQSLDPXNGOKMIEBFZCWVJAT",
  C: "FVPJIAOYEDRZXWGCTKUQSBNMHL",
};
const indexOf = (letter) => letter.charCodeAt(0) - 65;

function plugboard(pairs) {
  const mapping = Object.fromEntries([...ALPHABET].map((letter) => [letter, letter]));
  for (const pair of pairs.split(/\s+/).filter(Boolean)) {
    const [left, right] = pair;
    mapping[left] = right;
    mapping[right] = left;
  }
  return mapping;
}

class Rotor {
  constructor(name, position = 0, ring = 0) {
    this.wiring = ROTOR_SPECS[name][0];
    this.notch = indexOf(ROTOR_SPECS[name][1]);
    this.position = position;
    this.ring = ring;
  }
  atNotch() { return this.position === this.notch; }
  forward(value) {
    const shifted = (value + this.position - this.ring + 26) % 26;
    const wired = indexOf(this.wiring[shifted]);
    return (wired - this.position + this.ring + 26) % 26;
  }
  reverse(value) {
    const shifted = (value + this.position - this.ring + 26) % 26;
    const wired = this.wiring.indexOf(ALPHABET[shifted]);
    return (wired - this.position + this.ring + 26) % 26;
  }
}

class EnigmaMachine {
  constructor(positions = "AAA", pairs = "", rotorNames = ["I", "II", "III"], reflector = "B") {
    this.rotors = [
      new Rotor(rotorNames[0], indexOf(positions[0])),
      new Rotor(rotorNames[1], indexOf(positions[1])),
      new Rotor(rotorNames[2], indexOf(positions[2])),
    ];
    this.plugboard = plugboard(pairs);
    this.reflector = REFLECTORS[reflector] || REFLECTORS.B;
  }
  get positions() { return this.rotors.map((rotor) => ALPHABET[rotor.position]).join(""); }
  step() {
    const [left, middle, right] = this.rotors;
    const middleAtNotch = middle.atNotch();
    const rightAtNotch = right.atNotch();
    if (middleAtNotch) left.position = (left.position + 1) % 26;
    if (middleAtNotch || rightAtNotch) middle.position = (middle.position + 1) % 26;
    right.position = (right.position + 1) % 26;
  }
  transformCore(letter) {
    let value = indexOf(letter);
    for (const rotor of [...this.rotors].reverse()) value = rotor.forward(value);
    value = indexOf(this.reflector[value]);
    for (const rotor of this.rotors) value = rotor.reverse(value);
    return ALPHABET[value];
  }
  encode(letter) {
    this.step();
    return this.plugboard[this.transformCore(this.plugboard[letter])];
  }
  encrypt(text) { return [...text].map((letter) => this.encode(letter)).join(""); }
}

function buildMenu(job) {
  const edges = [...job.crib].map((plaintext, index) => ({
    offset: job.cribOffset + index,
    plaintext,
    ciphertext: job.ciphertext[job.cribOffset + index],
  })).filter((edge) => edge.plaintext !== edge.ciphertext);
  if (!edges.length) throw new Error("crib produces no menu edges");
  const degrees = {};
  for (const edge of edges) {
    degrees[edge.plaintext] = (degrees[edge.plaintext] || 0) + 1;
    degrees[edge.ciphertext] = (degrees[edge.ciphertext] || 0) + 1;
  }
  const root = Object.keys(degrees).sort((a, b) => degrees[b] - degrees[a] || a.localeCompare(b))[0];
  const connected = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (connected.has(edge.plaintext) || connected.has(edge.ciphertext)) {
        const before = connected.size;
        connected.add(edge.plaintext);
        connected.add(edge.ciphertext);
        changed ||= connected.size !== before;
      }
    }
  }
  return {
    root,
    edges: edges.filter((edge) => connected.has(edge.plaintext) && connected.has(edge.ciphertext)),
    vertices: connected,
  };
}

function scramblerTable(job, positions, offsets) {
  const machine = new EnigmaMachine(
    positions,
    "",
    job.rotorNames || ["I", "II", "III"],
    job.reflector || "B",
  );
  const table = {};
  const maxOffset = Math.max(...offsets);
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    machine.step();
    if (offsets.has(offset)) table[offset] = [...ALPHABET].map((letter) => machine.transformCore(letter));
  }
  return table;
}

function propagate(menu, scramblers, testLetter) {
  const assigned = {};
  const pending = [];
  const assign = (letter, value) => {
    if (assigned[letter] !== undefined && assigned[letter] !== value) throw new Error("contradiction");
    if (assigned[value] !== undefined && assigned[value] !== letter) throw new Error("contradiction");
    const changed = assigned[letter] === undefined;
    assigned[letter] = value;
    assigned[value] = letter;
    if (changed) pending.push(letter, value);
  };
  assign(menu.root, testLetter);
  while (pending.length) {
    const current = pending.shift();
    const value = assigned[current];
    for (const edge of menu.edges) {
      if (edge.plaintext === current) assign(edge.ciphertext, scramblers[edge.offset][indexOf(value)]);
      if (edge.ciphertext === current) assign(edge.plaintext, scramblers[edge.offset][indexOf(value)]);
    }
  }
  return assigned;
}

function steckerPairs(mapping) {
  return Object.keys(mapping).filter((letter) => letter <= mapping[letter]).sort()
    .map((letter) => letter + mapping[letter]).filter((pair) => pair[0] !== pair[1]).join(" ");
}

function positionAt(number) {
  return ALPHABET[Math.floor(number / 676)]
    + ALPHABET[Math.floor(number / 26) % 26]
    + ALPHABET[number % 26];
}

async function runBombe(job, limit, onEvent) {
  const menu = buildMenu(job);
  const result = { positionsTested: 0, hypothesesTested: 0, stops: [], elapsedSeconds: 0 };
  const offsets = new Set(menu.edges.map((edge) => edge.offset));
  const started = performance.now();
  onEvent({ event: "search_started", root: menu.root, edges: menu.edges.length, vertices: menu.vertices.size });

  let number = 0;
  while (number < limit) {
    const chunkEnd = Math.min(number + 48, limit);
    while (number < chunkEnd) {
      const positions = positionAt(number++);
      result.positionsTested += 1;
      const scramblers = scramblerTable(job, positions, offsets);
      const surviving = [];
      for (const testLetter of ALPHABET) {
        result.hypothesesTested += 1;
        try { surviving.push({ testLetter, mapping: propagate(menu, scramblers, testLetter) }); }
        catch (_) { /* relay contradiction: this hypothesis is rejected */ }
      }
      if (surviving.length > 0 && surviving.length < 26) {
        for (const survivor of surviving) {
          const stop = {
            positions,
            testLetter: survivor.testLetter,
            plugboard: steckerPairs(survivor.mapping),
            survivingTests: surviving.length,
          };
          result.stops.push(stop);
          onEvent({ event: "stop", positions, test_letter: survivor.testLetter, surviving_tests: surviving.length, plugboard: stop.plugboard });
        }
      }
      if (result.positionsTested % 128 === 0) {
        onEvent({ event: "progress", positions, positions_tested: result.positionsTested, hypotheses_tested: result.hypothesesTested, surviving_tests: surviving.length });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  result.elapsedSeconds = (performance.now() - started) / 1000;
  onEvent({ event: "search_finished", positions_tested: result.positionsTested, hypotheses_tested: result.hypothesesTested, stops: result.stops.length, elapsed_seconds: result.elapsedSeconds });
  return result;
}
