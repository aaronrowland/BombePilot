"""Dependency-free web visualiser for the Bombe reference implementation."""

from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import unquote, urlparse
from uuid import uuid4

from .bombe import BombeJob, BombeSolver, build_menu
from .enigma import EnigmaMachine

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = PROJECT_ROOT / "web"
PLAINTEXT = "WETTERVORHERSAGEBEGINNZEHNUHRNULLNULL"
SECRET_POSITIONS = "AAA"
SECRET_PLUGBOARD = "AV BS"

_jobs: dict[str, dict[str, object]] = {}
_jobs_lock = threading.Lock()


def fixture() -> dict[str, object]:
    machine = EnigmaMachine(positions=SECRET_POSITIONS, plugboard=SECRET_PLUGBOARD)
    ciphertext = machine.encrypt(PLAINTEXT)
    job = BombeJob(ciphertext=ciphertext, crib=PLAINTEXT)
    menu = build_menu(job)
    return {
        "ciphertext": ciphertext,
        "crib": PLAINTEXT,
        "menu_root": menu.root,
        "menu_edges": [edge.__dict__ for edge in menu.edges],
        "positions": 26**3,
        "hidden_plugboard": len(SECRET_PLUGBOARD.split()),
    }


def _serialise_result(result: object) -> dict[str, object]:
    return {
        "run_id": result.run_id,
        "positions_tested": result.positions_tested,
        "hypotheses_tested": result.hypotheses_tested,
        "elapsed_seconds": result.elapsed_seconds,
        "stops": [
            {
                "positions": stop.positions,
                "test_letter": stop.test_letter,
                "plugboard": stop.plugboard,
                "surviving_tests": stop.surviving_tests,
            }
            for stop in result.stops
        ],
    }


def _start_run(mode: str) -> str:
    run_id = str(uuid4())
    limit = 4096 if mode == "quick" else 26**3
    data = {"status": "running", "events": [], "result": None, "mode": mode}
    with _jobs_lock:
        _jobs[run_id] = data

    def on_event(event: dict[str, object]) -> None:
        with _jobs_lock:
            events = data["events"]
            events.append(event)
            if len(events) > 600:
                del events[:100]

    def worker() -> None:
        try:
            machine = EnigmaMachine(positions=SECRET_POSITIONS, plugboard=SECRET_PLUGBOARD)
            ciphertext = machine.encrypt(PLAINTEXT)
            job = BombeJob(ciphertext=ciphertext, crib=PLAINTEXT)
            result = BombeSolver(position_limit=limit).solve(job, on_event=on_event)
            with _jobs_lock:
                data["status"] = "complete"
                data["result"] = _serialise_result(result)
        except Exception as exc:  # Keep the browser informed if a run fails.
            with _jobs_lock:
                data["status"] = "error"
                data["error"] = str(exc)

    threading.Thread(target=worker, name=f"bombe-{run_id[:8]}", daemon=True).start()
    return run_id


class Handler(BaseHTTPRequestHandler):
    server_version = "BombePilot/0.1"

    def log_message(self, format: str, *args: object) -> None:
        return

    def _send_json(self, payload: object, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str) -> None:
        if not path.is_file() or WEB_ROOT not in path.parents:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/":
            self._send_file(WEB_ROOT / "index.html", "text/html; charset=utf-8")
        elif path == "/app.js":
            self._send_file(WEB_ROOT / "app.js", "text/javascript; charset=utf-8")
        elif path == "/styles.css":
            self._send_file(WEB_ROOT / "styles.css", "text/css; charset=utf-8")
        elif path == "/api/fixture":
            self._send_json(fixture())
        elif path.startswith("/api/run/"):
            run_id = unquote(path.rsplit("/", 1)[-1])
            with _jobs_lock:
                data = _jobs.get(run_id)
                if data is None:
                    self._send_json({"error": "run not found"}, HTTPStatus.NOT_FOUND)
                    return
                payload = {
                    "status": data["status"],
                    "mode": data["mode"],
                    "events": list(data["events"]),
                }
                if data["result"] is not None:
                    payload["result"] = data["result"]
                if "error" in data:
                    payload["error"] = data["error"]
            self._send_json(payload)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/run":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length) or b"{}")
            mode = request.get("mode", "quick")
            if mode not in {"quick", "full"}:
                raise ValueError("mode must be quick or full")
            self._send_json({"run_id": _start_run(mode)}, HTTPStatus.ACCEPTED)
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    host = "127.0.0.1"
    port = 8765
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"BombePilot visualiser: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping BombePilot visualiser.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
