const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const state = { seen: new Set(), running: false };
const fixture = {
  // Generated with rotor order I-II-III, starting position AAA, and hidden
  // steckers AV BS. The browser receives only ciphertext and crib.
  ciphertext: "KLHFRTCQDNNLVPRNUZTCSANZZGCVHYEUOQCVS",
  crib: "WETTERVORHERSAGEBEGINNZEHNUHRNULLNULL",
  cribOffset: 0,
};
const $ = (id) => document.getElementById(id);

function renderFixture() {
  const menu = buildMenu(fixture);
  $("ciphertext").textContent = fixture.ciphertext;
  $("crib").textContent = fixture.crib;
  $("menu-root").textContent = menu.root;
  $("menu-edges").innerHTML = menu.edges.slice(0, 18).map((edge) =>
    `<span class="edge"><b>${edge.plaintext}</b><i>→</i><b>${edge.ciphertext}</b><small>@${edge.offset}</small></span>`
  ).join("");
}

function setStatus(text, kind = "ready") {
  $("status").textContent = text;
  $("status-dot").className = `status-dot ${kind}`;
}

function renderRotors(positions) {
  if (!positions || positions.length !== 3) return;
  $("rotor-left").textContent = positions[0];
  $("rotor-middle").textContent = positions[1];
  $("rotor-right").textContent = positions[2];
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
    renderRotors(event.positions);
    $("positions-tested").textContent = event.positions_tested.toLocaleString();
    $("hypotheses-tested").textContent = event.hypotheses_tested.toLocaleString();
    $("latest-test").textContent = event.positions;
    $("relay-state").textContent = `${event.surviving_tests} surviving`;
    $("progress-bar").style.width = `${(event.positions_tested / 17576) * 100}%`;
    renderRelays(event);
  } else if (event.event === "stop") {
    line.innerHTML = `<span>STOP</span> ${event.positions} · test ${event.test_letter} · ${event.surviving_tests} survivor${event.surviving_tests === 1 ? "" : "s"}`;
    renderRotors(event.positions);
    $("latest-test").textContent = `${event.positions} / ${event.test_letter}`;
    $("relay-state").textContent = `${event.surviving_tests} surviving`;
    renderRelays(event);
  } else if (event.event === "search_started") {
    line.innerHTML = `<span>INIT</span> root ${event.root} · ${event.edges} menu edges · ${event.vertices} letters`;
  } else if (event.event === "search_finished") {
    line.innerHTML = `<span>DONE</span> ${event.positions_tested.toLocaleString()} positions · ${event.stops} stops`;
  }
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function renderResult(result) {
  $("positions-tested").textContent = result.positionsTested.toLocaleString();
  $("hypotheses-tested").textContent = result.hypothesesTested.toLocaleString();
  $("stop-count").textContent = result.stops.length.toLocaleString();
  $("progress-bar").style.width = `${(result.positionsTested / 17576) * 100}%`;
  $("stops").innerHTML = result.stops.slice(0, 40).map((stop) =>
    `<tr><td><code>${stop.positions}</code></td><td><code>${stop.testLetter}</code></td><td><code>${stop.plugboard || "—"}</code></td><td>${stop.survivingTests}</td></tr>`
  ).join("") || `<tr><td colspan="4" class="empty">No stops recorded.</td></tr>`;

  // The fixture's first stop is deliberately a valid checking-machine
  // result: the Bombe recovered AAA and the partial stecker AV BS.
  const verified = result.stops.find((stop) => stop.positions === "AAA" && stop.plugboard === "AV BS");
  if (verified) {
    const plaintext = new EnigmaMachine(verified.positions, verified.plugboard).encrypt(fixture.ciphertext);
    $("checker-panel").hidden = false;
    $("recovered-setting").textContent = `${verified.positions} · ${verified.plugboard}`;
    $("decoded-message").textContent = plaintext;
    $("decoded-reading").textContent = "Weather forecast — beginning ten o'clock, zero zero.";
  }
}

async function run(mode) {
  if (state.running) return;
  state.running = true;
  state.seen.clear();
  $("event-log").innerHTML = "";
  $("stops").innerHTML = `<tr><td colspan="4" class="empty">Scanning…</td></tr>`;
  $("stop-count").textContent = "0";
  $("positions-tested").textContent = "0";
  $("hypotheses-tested").textContent = "0";
  $("progress-bar").style.width = "0%";
  $("quick-run").disabled = true;
  $("full-run").disabled = true;
  $("run-mode").textContent = mode === "quick" ? "· 4,096-position training run" : "· full run";
  setStatus("Running", "running");
  const limit = mode === "quick" ? 4096 : 17576;
  try {
    const result = await runBombe(fixture, limit, addEvent);
    renderResult(result);
    setStatus(`Complete · ${result.elapsedSeconds.toFixed(2)}s`, "complete");
  } catch (error) {
    setStatus(`Error: ${error.message}`, "error");
  } finally {
    state.running = false;
    $("quick-run").disabled = false;
    $("full-run").disabled = false;
  }
}

$("quick-run").addEventListener("click", () => run("quick"));
$("full-run").addEventListener("click", () => run("full"));
renderFixture();
renderRelays();
