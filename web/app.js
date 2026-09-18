const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const state = { seen: new Set(), running: false, job: null, encodedCiphertext: "" };
const $ = (id) => document.getElementById(id);

function renderFixture() {
  if (!state.job) {
    $("ciphertext").textContent = "Encode a message above, then send it here.";
    $("crib").textContent = "No crib loaded";
    $("menu-root").textContent = "—";
    $("menu-edges").innerHTML = `<span class="muted">The Bombe menu will appear after you load ciphertext.</span>`;
    return;
  }
  const menu = buildMenu(state.job);
  $("ciphertext").textContent = state.job.ciphertext;
  $("crib").textContent = state.job.crib;
  $("menu-root").textContent = menu.root;
  $("menu-edges").innerHTML = menu.edges.slice(0, 18).map((edge) =>
    `<span class="edge"><b>${edge.plaintext}</b><i>→</i><b>${edge.ciphertext}</b><small>@${edge.offset}</small></span>`
  ).join("");
}

function setStatus(text, kind = "ready") {
  $("status").textContent = text;
  $("status-dot").className = `status-dot ${kind}`;
}

function renderRotors(positions, rotorOrder) {
  if (!positions || positions.length !== 3) return;
  $("rotor-left").textContent = positions[0];
  $("rotor-middle").textContent = positions[1];
  $("rotor-right").textContent = positions[2];
  if (rotorOrder) $("rotor-order-current").textContent = rotorOrder;
}

function renderRelays(event) {
  const active = new Set();
  if (event?.test_letter) active.add(event.test_letter);
  if (event?.positions) [...event.positions].forEach((letter) => active.add(letter));
  $("relay-grid").innerHTML = [...alphabet].map((letter) =>
    `<span class="relay ${active.has(letter) ? "active" : ""}">${letter}</span>`
  ).join("");
}

function addEvent(event) {
  const key = JSON.stringify(event);
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const log = $("event-log");
  const line = document.createElement("div");
  line.className = `log-line ${event.event === "stop" ? "stop-line" : ""}`;
  if (event.event === "progress") {
    line.innerHTML = `<span>SCAN</span> ${event.positions} · ${event.positions_tested.toLocaleString()} positions · ${event.hypotheses_tested.toLocaleString()} hypotheses`;
    renderRotors(event.positions, event.rotor_order);
    $("positions-tested").textContent = event.positions_tested.toLocaleString();
    $("hypotheses-tested").textContent = event.hypotheses_tested.toLocaleString();
    $("latest-test").textContent = event.positions;
    $("relay-state").textContent = `${event.surviving_tests} surviving`;
    $("progress-bar").style.width = `${((event.position_index || 0) / (event.positions_per_order || 17576)) * 100}%`;
    renderRelays(event);
  } else if (event.event === "stop") {
    line.innerHTML = `<span>STOP</span> ${event.positions} · test ${event.test_letter} · ${event.surviving_tests} survivor${event.surviving_tests === 1 ? "" : "s"}`;
    renderRotors(event.positions, event.rotor_order);
    $("latest-test").textContent = `${event.rotor_order} / ${event.positions} / ${event.test_letter}`;
    $("relay-state").textContent = `${event.surviving_tests} surviving`;
    renderRelays(event);
  } else if (event.event === "rotor_order_started") {
    line.innerHTML = `<span>ORDER</span> ${event.rotor_order} · ${event.rotor_order_index}/${event.rotor_orders}`;
    $("rotor-order-current").textContent = event.rotor_order;
  } else if (event.event === "verified") {
    line.innerHTML = `<span>CHECK</span> verified ${event.rotor_order} at ${event.positions} · ${event.plugboard || "no inferred pairs"}`;
    $("rotor-order-current").textContent = event.rotor_order;
  } else if (event.event === "search_started") {
    line.innerHTML = `<span>INIT</span> root ${event.root} · ${event.rotor_orders} rotor orders · ${event.edges} menu edges`;
  } else if (event.event === "search_finished") {
    line.innerHTML = `<span>DONE</span> ${event.rotor_orders_tested} rotor order${event.rotor_orders_tested === 1 ? "" : "s"} · ${event.positions_tested.toLocaleString()} positions · ${event.stops} stops`;
  }
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function renderResult(result) {
  $("positions-tested").textContent = result.positionsTested.toLocaleString();
  $("hypotheses-tested").textContent = result.hypothesesTested.toLocaleString();
  $("stop-count").textContent = result.stops.length.toLocaleString();
  $("progress-bar").style.width = result.verifiedStop ? "100%" : "0%";
  $("stops").innerHTML = result.stops.slice(0, 40).map((stop) =>
    `<tr><td><code>${stop.rotorNames.join(" ")}</code></td><td><code>${stop.positions}</code></td><td><code>${stop.testLetter}</code></td><td><code>${stop.plugboard || "—"}</code></td><td>${stop.survivingTests}</td></tr>`
  ).join("") || `<tr><td colspan="5" class="empty">No stops recorded.</td></tr>`;

  $("checker-panel").hidden = true;
  const verified = result.stops.find((stop) => {
    try {
      const decoded = new EnigmaMachine(
        stop.positions,
        stop.plugboard,
        stop.rotorNames,
        state.job.reflector || "B",
      ).encrypt(state.job.ciphertext);
      const offset = state.job.cribOffset || 0;
      return decoded.slice(offset, offset + state.job.crib.length) === state.job.crib;
    } catch (_) {
      return false;
    }
  });
  if (verified) {
    const plaintext = new EnigmaMachine(
      verified.positions,
      verified.plugboard,
      verified.rotorNames,
      state.job.reflector || "B",
    ).encrypt(state.job.ciphertext);
    $("checker-panel").hidden = false;
    $("checker-chip").textContent = "STOP VERIFIED";
    $("checker-chip").className = "chip chip-success";
    $("checker-explanation").textContent = "The checking machine found a candidate that reproduces the crib. This is the Bombe’s solved setting for the evidence supplied.";
    $("recovered-setting").textContent = `${verified.rotorNames.join(" ")} · ${verified.positions} · ${verified.plugboard || "no inferred pairs"}`;
    $("decoded-message").textContent = plaintext;
    $("decoded-reading").textContent = "The checking machine found a setting consistent with the crib.";
    return true;
  }
  $("checker-panel").hidden = false;
  $("checker-chip").textContent = result.stops.length ? "NOT VERIFIED" : "NO STOP";
  $("checker-chip").className = "chip chip-warning";
  $("checker-explanation").textContent = result.stops.length
    ? "The Bombe found candidate stops, but the checking machine could not validate one against the complete crib. Try a longer or more distinctive crib."
    : "No rotor position survived the Bombe constraints. Check the crib, rotor order, reflector, and message alignment.";
  $("recovered-setting").textContent = result.stops.length ? "Candidate stops only" : "No setting found";
  $("decoded-message").textContent = "—";
  $("decoded-reading").textContent = result.stops.length ? "Use a longer crib to separate the correct setting from false stops." : "Try another crib or verify the Enigma settings.";
  return false;
}

async function run(mode) {
  if (state.running) return;
  if (!state.job) {
    setStatus("Encode a message and use its ciphertext in the Bombe first.", "error");
    return;
  }
  state.running = true;
  state.seen.clear();
  $("event-log").innerHTML = "";
  $("stops").innerHTML = `<tr><td colspan="5" class="empty">Scanning…</td></tr>`;
  $("checker-panel").hidden = true;
  $("stop-count").textContent = "0";
  $("positions-tested").textContent = "0";
  $("hypotheses-tested").textContent = "0";
  $("progress-bar").style.width = "0%";
  $("quick-run").disabled = true;
  $("full-run").disabled = true;
  $("run-mode").textContent = mode === "quick" ? "· 4,096 positions per rotor order" : "· 17,576 positions per rotor order";
  setStatus("Running", "running");
  const limit = mode === "quick" ? 4096 : 17576;
  try {
    const result = await runBombe(state.job, limit, addEvent, true);
    const verified = renderResult(result);
    setStatus(
      verified ? `Verified setting found · ${result.elapsedSeconds.toFixed(2)}s` : `${result.stops.length} candidate stop${result.stops.length === 1 ? "" : "s"}; not verified`,
      verified ? "complete" : "warning",
    );
  } catch (error) {
    setStatus(`Error: ${error.message}`, "error");
  } finally {
    state.running = false;
    $("quick-run").disabled = false;
    $("full-run").disabled = false;
  }
}

function runSimulator() {
  const positions = $("sim-positions").value.toUpperCase().replace(/[^A-Z]/g, "");
  const rotorNames = [$("sim-rotor-left").value, $("sim-rotor-middle").value, $("sim-rotor-right").value];
  const message = $("sim-input").value.toUpperCase().replace(/[^A-Z]/g, "");
  if (positions.length !== 3 || message.length === 0) {
    $("sim-status").textContent = "Enter three window letters and at least one message letter.";
    return;
  }
  try {
    const machine = new EnigmaMachine(positions, $("sim-plugboard").value.toUpperCase(), rotorNames, $("sim-reflector").value);
    const output = machine.encrypt(message);
    $("sim-output").textContent = output;
    state.encodedCiphertext = output;
    $("sim-status").textContent = `Encoded ${message.length} letters. You can now decode it or send it to the Bombe.`;
  } catch (error) {
    $("sim-status").textContent = `Machine error: ${error.message}`;
  }
}

function decodeSimulator() {
  const positions = $("sim-positions").value.toUpperCase().replace(/[^A-Z]/g, "");
  const rotorNames = [$("sim-rotor-left").value, $("sim-rotor-middle").value, $("sim-rotor-right").value];
  const ciphertext = state.encodedCiphertext;
  if (positions.length !== 3 || !ciphertext) {
    $("sim-status").textContent = "Encode the current message first, then decode its output.";
    return;
  }
  try {
    const machine = new EnigmaMachine(positions, $("sim-plugboard").value.toUpperCase(), rotorNames, $("sim-reflector").value);
    const plaintext = machine.encrypt(ciphertext);
    $("sim-output").textContent = plaintext;
    $("sim-status").textContent = `Decoded ${plaintext.length} letters using the same starting windows and plugboard.`;
  } catch (error) {
    $("sim-status").textContent = `Machine error: ${error.message}`;
  }
}

function resetSimulator() {
  state.encodedCiphertext = "";
  $("sim-output").textContent = "—";
  $("sim-status").textContent = "Output cleared. Enter a message to begin again.";
}

function invalidateCiphertext() {
  if (!state.encodedCiphertext) return;
  state.encodedCiphertext = "";
  $("sim-output").textContent = "—";
  $("sim-status").textContent = "Settings changed. Encode the current message again.";
}

function useCiphertextInBombe() {
  const ciphertext = state.encodedCiphertext;
  const crib = $("sim-crib").value.toUpperCase().replace(/[^A-Z]/g, "");
  if (!ciphertext) {
    $("sim-status").textContent = "Encode a message first.";
    return;
  }
  if (!crib || crib.length > ciphertext.length) {
    $("sim-status").textContent = "Enter a crib that fits inside the ciphertext.";
    return;
  }
  state.job = {
    ciphertext,
    crib,
    cribOffset: 0,
    rotorNames: [$("sim-rotor-left").value, $("sim-rotor-middle").value, $("sim-rotor-right").value],
    reflector: $("sim-reflector").value,
  };
  renderFixture();
  $("message-source").textContent = "FROM YOUR ENIGMA MACHINE";
  $("sim-status").textContent = "Ciphertext loaded into the Bombe. Run the quick demonstration below.";
  $("quick-run").scrollIntoView({ behavior: "smooth", block: "center" });
}

$("quick-run").addEventListener("click", () => run("quick"));
$("full-run").addEventListener("click", () => run("full"));
$("sim-encode").addEventListener("click", runSimulator);
$("sim-decode").addEventListener("click", decodeSimulator);
$("use-in-bombe").addEventListener("click", useCiphertextInBombe);
$("sim-reset").addEventListener("click", resetSimulator);
$("sim-input").addEventListener("input", invalidateCiphertext);
$("sim-positions").addEventListener("input", invalidateCiphertext);
$("sim-plugboard").addEventListener("input", invalidateCiphertext);
$("sim-rotor-left").addEventListener("change", invalidateCiphertext);
$("sim-rotor-middle").addEventListener("change", invalidateCiphertext);
$("sim-rotor-right").addEventListener("change", invalidateCiphertext);
$("sim-reflector").addEventListener("change", invalidateCiphertext);
renderFixture();
renderRelays();
