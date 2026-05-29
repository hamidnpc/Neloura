"""Small launcher API for running Neloura from Python, CLI, or Jupyter.

This module intentionally keeps the current flat repository layout intact. It
prepares a writable runtime directory, imports the existing FastAPI app from
``main.py``, starts uvicorn on localhost, and optionally displays the app in a
Jupyter iframe.
"""

from __future__ import annotations

import argparse
import atexit
import contextlib
import io
import json
import logging
import os
import site
import shutil
import socket
import sys
import sysconfig
import threading
import time
import warnings
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlparse


DEFAULT_HOST = "127.0.0.1"
DEFAULT_RUNTIME_DIR = Path.home() / ".neloura"
__version__ = "0.1.44"
RESOURCE_DIRS = ("static", "vendor", "catalogs", "psf")
RESOURCE_FILES = ("features.html",)
WRITABLE_DIRS = ("files", "files/uploads", "files/segments", "images")

_SERVER: "NelouraServer | None" = None


@dataclass
class NelouraServer:
    """Handle for a running local Neloura server."""

    host: str
    port: int
    runtime_dir: Path
    thread: threading.Thread

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def open_app(self, *, inline: bool | None = None, height: int = 850):
        """Open or display the full Neloura app."""
        return _show_url(self.base_url + "/", inline=inline, height=height)

    def open_fits(
        self,
        path: str | os.PathLike[str],
        *,
        hdu: int = 0,
        inline: bool | None = None,
        height: int = 850,
        copy: bool = False,
    ):
        """Register a FITS file and open it in the Neloura viewer."""
        rel_path = _register_fits_file(Path(path), self.runtime_dir, copy=copy)
        url = f"{self.base_url}/?file={quote(rel_path, safe='/')}&hdu={int(hdu)}"
        return _show_url(url, inline=inline, height=height)


def launch(
    *,
    port: int = 0,
    host: str = DEFAULT_HOST,
    runtime_dir: str | os.PathLike[str] | None = None,
    open_browser: bool = False,
    quiet: bool = True,
) -> NelouraServer:
    """Start Neloura locally and return a server handle.

    Reuses the existing process-local server if it is already running.
    """
    global _SERVER
    if _SERVER is not None and _is_port_open(_SERVER.host, _SERVER.port):
        if open_browser:
            webbrowser.open(_SERVER.base_url + "/")
        return _SERVER

    runtime_path = Path(runtime_dir).expanduser().resolve() if runtime_dir else DEFAULT_RUNTIME_DIR
    source_root = Path(__file__).resolve().parent
    _prepare_runtime_dir(runtime_path, source_root)
    os.environ["NELOURA_RUNTIME_DIR"] = str(runtime_path)
    os.environ["NELOURA_STATIC_DIR"] = str(runtime_path / "static")
    os.environ["NELOURA_QUIET"] = "1" if quiet else "0"
    if _in_colab():
        # Signal main.py to apply Colab-only performance defaults (read FITS into
        # RAM once instead of per-tile random reads from the slow Drive/FUSE mount).
        os.environ.setdefault("NELOURA_IN_COLAB", "1")

    selected_port = port or _find_free_port(host)

    # Import after preparing/chdir so main.py's relative paths resolve under
    # the writable runtime directory, not whatever directory the notebook used.
    previous_cwd = Path.cwd()
    previous_stdout = sys.stdout
    previous_stderr = sys.stderr
    os.chdir(runtime_path)
    try:
        if quiet:
            _quiet_startup_logging()
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=DeprecationWarning)
                warnings.filterwarnings("ignore", message=".*regex.*deprecated.*")
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    import uvicorn
                    from main import app
            sys.stdout = previous_stdout
            sys.stderr = previous_stderr
        else:
            import uvicorn
            from main import app
    except Exception:
        sys.stdout = previous_stdout
        sys.stderr = previous_stderr
        os.chdir(previous_cwd)
        raise

    def _run() -> None:
        if quiet:
            uvicorn.run(app, host=host, port=selected_port, log_level="error", reload=False)
        else:
            uvicorn.run(app, host=host, port=selected_port, log_level="warning", reload=False)

    thread = threading.Thread(target=_run, name="neloura-server", daemon=True)
    thread.start()
    _wait_for_server(host, selected_port)

    _SERVER = NelouraServer(host=host, port=selected_port, runtime_dir=runtime_path, thread=thread)
    atexit.register(lambda: os.chdir(previous_cwd) if Path.cwd() == runtime_path else None)

    if open_browser:
        webbrowser.open(_SERVER.base_url + "/")
    return _SERVER


def open_app(*, inline: bool | None = None, height: int = 850, **launch_kwargs):
    """Start Neloura and show the full app."""
    server = launch(**launch_kwargs)
    return server.open_app(inline=inline, height=height)


def open_fits(
    path: str | os.PathLike[str],
    *,
    hdu: int = 0,
    inline: bool | None = None,
    height: int = 850,
    copy: bool = False,
    **launch_kwargs,
):
    """Start Neloura and open a FITS file.

    In Jupyter this displays an iframe by default. Outside Jupyter it opens a
    browser tab and returns the URL.
    """
    server = launch(**launch_kwargs)
    return server.open_fits(path, hdu=hdu, inline=inline, height=height, copy=copy)


def _quiet_startup_logging() -> None:
    for name in (
        "py.warnings",
        "stdout",
        "stderr",
        "main",
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
    ):
        try:
            logging.getLogger(name).setLevel(logging.ERROR)
            logging.getLogger(name).propagate = False
        except Exception:
            pass


def _prepare_runtime_dir(runtime_dir: Path, source_root: Path) -> None:
    runtime_dir.mkdir(parents=True, exist_ok=True)
    for rel in WRITABLE_DIRS:
        (runtime_dir / rel).mkdir(parents=True, exist_ok=True)
    if _in_colab():
        _ensure_colab_content_shortcut(runtime_dir)

    for name in RESOURCE_DIRS:
        target = _find_resource_dir(name, source_root)
        if target is not None:
            _ensure_link_or_copy(target, runtime_dir / name, required_child=_required_resource_child(name))
    for name in RESOURCE_FILES:
        target = _find_resource_file(name, source_root)
        if target is not None:
            _ensure_link_or_copy(target, runtime_dir / name)
    static_index = runtime_dir / "static" / "index.html"
    if not static_index.is_file():
        checked = "\n".join(f"  - {root / 'static'}" for root in _resource_roots(source_root))
        raise FileNotFoundError(
            "Neloura could not find its static frontend assets. Missing "
            f"{static_index}. Reinstall with `python -m pip install --user -U neloura`.\n"
            f"Checked static asset locations:\n{checked}"
        )


def _find_resource_dir(name: str, source_root: Path) -> Path | None:
    required_child = _required_resource_child(name)
    candidates = [root / name for root in _resource_roots(source_root)]
    for candidate in candidates:
        if candidate.is_dir() and (required_child is None or (candidate / required_child).is_file()):
            return candidate.resolve()
    return None


def _ensure_colab_content_shortcut(runtime_dir: Path) -> None:
    content_dir = Path("/content")
    if not content_dir.is_dir():
        return
    shortcut = runtime_dir / "files" / "content"
    if shortcut.exists() or shortcut.is_symlink():
        return
    try:
        os.symlink(content_dir, shortcut, target_is_directory=True)
    except Exception:
        # If symlinks are unavailable, leave the normal uploads folder usable.
        pass


def _find_resource_file(name: str, source_root: Path) -> Path | None:
    candidates = [root / name for root in _resource_roots(source_root)]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def _resource_roots(source_root: Path) -> list[Path]:
    roots = [
        source_root,
        Path.cwd(),
        Path(sys.prefix) / "share" / "neloura",
        Path(sys.prefix) / "local" / "share" / "neloura",
        Path(site.USER_BASE) / "share" / "neloura",
        Path.home() / ".local" / "share" / "neloura",
        Path("/usr/local/share/neloura"),
        Path("/usr/share/neloura"),
    ]
    for key in ("data", "prefix", "exec_prefix"):
        try:
            value = sysconfig.get_path(key)
        except Exception:
            value = None
        if value:
            roots.append(Path(value) / "share" / "neloura")
    return list(dict.fromkeys(roots))


def _required_resource_child(name: str) -> str | None:
    if name == "static":
        return "index.html"
    return None


def _resource_link_is_usable(link_path: Path, required_child: str | None = None) -> bool:
    if not (link_path.exists() or link_path.is_symlink()):
        return False
    if required_child:
        return (link_path / required_child).is_file()
    return True


def _remove_existing_resource_link(link_path: Path) -> None:
    try:
        if link_path.is_symlink() or link_path.is_file():
            link_path.unlink()
        elif link_path.is_dir():
            shutil.rmtree(link_path)
    except Exception:
        pass


def _ensure_link_or_copy(target: Path, link_path: Path, required_child: str | None = None) -> None:
    if _resource_link_is_usable(link_path, required_child=required_child):
        return
    _remove_existing_resource_link(link_path)
    try:
        os.symlink(target, link_path, target_is_directory=target.is_dir())
    except Exception:
        if target.is_dir():
            shutil.copytree(target, link_path, dirs_exist_ok=True)
        else:
            link_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, link_path)
    if not _resource_link_is_usable(link_path, required_child=required_child):
        raise FileNotFoundError(f"Failed to prepare Neloura resource: {link_path}")


def _register_fits_file(path: Path, runtime_dir: Path, *, copy: bool = False) -> str:
    source = path.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"FITS file not found: {source}")

    uploads_dir = runtime_dir / "files" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    destination = uploads_dir / source.name
    if destination.exists() or destination.is_symlink():
        destination = uploads_dir / f"{source.stem}_{int(time.time())}{source.suffix}"

    if copy:
        shutil.copy2(source, destination)
    else:
        try:
            os.symlink(source, destination)
        except Exception:
            shutil.copy2(source, destination)

    return f"uploads/{destination.name}"


def _show_url(url: str, *, inline: bool | None, height: int):
    if inline is None:
        inline = _in_notebook()
    if inline:
        try:
            if _in_colab():
                _show_colab_url(url, height=height)
                return None

            from IPython.display import IFrame, display

            frame_url = _notebook_display_url(url)
            if frame_url == url and _is_localhost_url(url):
                _show_dynamic_notebook_url(url, height=height)
                return None
            frame = IFrame(src=frame_url, width="100%", height=height)
            display(frame)
            return None
        except Exception as exc:
            _show_notebook_error(url, exc)
            return None
    webbrowser.open(url)
    return url


def _in_notebook() -> bool:
    try:
        from IPython import get_ipython

        shell = get_ipython()
        if shell is None:
            return False
        return shell.__class__.__name__ in {"ZMQInteractiveShell", "Shell"}
    except Exception:
        return False


def _in_colab() -> bool:
    try:
        import google.colab  # type: ignore  # noqa: F401

        return True
    except Exception:
        return False


def _show_colab_url(url: str, *, height: int):
    parsed = urlparse(url)
    if parsed.port is None:
        return url

    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    from google.colab import output  # type: ignore

    return output.serve_kernel_port_as_iframe(
        parsed.port,
        path=path,
        width="100%",
        height=height,
    )


def _show_notebook_error(url: str, exc: Exception) -> None:
    try:
        from IPython.display import HTML, display

        display(HTML(
            "<div style='font-family:sans-serif;line-height:1.45;padding:10px;"
            "border:1px solid #f2c2c2;background:#fff5f5;color:#7a1010;'>"
            "<strong>Neloura could not be shown inline in this notebook.</strong><br/>"
            f"URL: <code>{url}</code><br/>"
            f"Error: <code>{type(exc).__name__}: {exc}</code>"
            "</div>"
        ))
    except Exception:
        pass


def _is_localhost_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.hostname in {"127.0.0.1", "localhost"} and parsed.port is not None


def _show_dynamic_notebook_url(url: str, *, height: int):
    """Display a localhost app from notebooks that hide their proxy prefix.

    Some hosted Jupyter environments do not expose JUPYTERHUB_SERVICE_PREFIX to
    the kernel, but the browser URL still contains the route prefix. This small
    client-side helper tries common jupyter-server-proxy routes. On remote hubs,
    raw ``127.0.0.1`` is never used as a fallback (the user's browser cannot reach
    the kernel host); only local notebooks fall back to localhost.
    """
    from IPython.display import HTML, display

    parsed = urlparse(url)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    payload = {
        "rawUrl": url,
        "port": parsed.port,
        "path": path,
        "height": int(height),
    }
    html = f"""
<div id="neloura-frame-container" style="width:100%; height:{int(height)}px;">
  <div style="font-family: sans-serif; color: #777; padding: 8px;">Opening Neloura...</div>
</div>
<script>
(async function() {{
  const cfg = {json.dumps(payload)};
  const container = document.currentScript.previousElementSibling;
  function prefixFromLocation() {{
    const p = window.location.pathname || "/";
    for (const marker of ["/lab", "/tree", "/notebooks", "/nbclassic"]) {{
      const i = p.indexOf(marker);
      if (i >= 0) return p.slice(0, i).replace(/\\/$/, "");
    }}
    return "";
  }}
  function isRemoteNotebook() {{
    const host = (window.location.hostname || "").toLowerCase();
    return host && host !== "localhost" && host !== "127.0.0.1";
  }}
  const prefix = prefixFromLocation();
  const candidates = [];
  if (prefix) {{
    candidates.push(`${{prefix}}/proxy/${{cfg.port}}${{cfg.path}}`);
    candidates.push(`${{prefix}}/user-redirect/proxy/${{cfg.port}}${{cfg.path}}`);
  }}
  if (!isRemoteNotebook()) {{
    candidates.push(cfg.rawUrl);
  }}

  async function canUse(url) {{
    if (url === cfg.rawUrl && !isRemoteNotebook()) return true;
    try {{
      const res = await fetch(url, {{ method: "GET", credentials: "same-origin" }});
      return res.ok;
    }} catch (_) {{
      return false;
    }}
  }}

  for (const candidate of candidates) {{
    if (await canUse(candidate)) {{
      container.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.src = candidate;
      iframe.width = "100%";
      iframe.height = String(cfg.height);
      iframe.style.border = "0";
      iframe.setAttribute("allowfullscreen", "true");
      container.appendChild(iframe);
      return;
    }}
  }}

  const remote = isRemoteNotebook();
  const proxyHint = prefix
    ? `<code>${{prefix}}/proxy/${{cfg.port}}/</code>`
    : "<code>/proxy/&lt;port&gt;/</code>";
  container.innerHTML = `
    <div style="font-family:sans-serif;line-height:1.5;padding:12px;border:1px solid #f2c2c2;background:#fff5f5;color:#7a1010;border-radius:6px;">
      <strong>Neloura started, but this notebook cannot display it yet.</strong><br/>
      ${{remote
        ? `The app is running on the notebook server at <code>127.0.0.1:${{cfg.port}}</code>, but your browser is on another machine.`
        : "The app is running locally, but this notebook did not expose a working app URL."}}
      <br/><br/>
      Neloura tried ${{proxyHint}}, but Jupyter returned 404. That usually means <code>jupyter-server-proxy</code>
      is not enabled for this notebook server.
      <br/><br/>
      <strong>How to fix it:</strong>
      <ol style="margin:8px 0 0 18px;padding:0;">
        <li>Ask your Jupyter admin to enable <code>jupyter-server-proxy</code> so <code>/proxy/&lt;port&gt;/</code> works.</li>
        <li>If SSH is available, forward the port and open Neloura on your laptop:<br/>
            <code>ssh -L ${{cfg.port}}:127.0.0.1:${{cfg.port}} &lt;your-login@notebook-host&gt;</code><br/>
            then open <code>http://127.0.0.1:${{cfg.port}}/</code>.</li>
      </ol>
    </div>`;
}})();
</script>
"""
    obj = HTML(html)
    display(obj)
    return None


def _notebook_display_url(url: str) -> str:
    """Return a browser-visible URL for notebook iframes.

    In local notebooks, ``http://127.0.0.1:port`` works. In JupyterHub-style
    remote notebooks, the user's browser cannot access the kernel machine's
    localhost directly, so route through jupyter-server-proxy when available.
    """
    parsed = urlparse(url)
    if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.port is None:
        return url

    # JUPYTER_SERVER_ROOT is a filesystem path on most installs, not a browser URL
    # prefix; do not use it here.
    prefix = os.environ.get("JUPYTERHUB_SERVICE_PREFIX") or os.environ.get("NB_PREFIX") or ""
    if not prefix:
        return url

    prefix = "/" + prefix.strip("/")
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    return f"{prefix}/proxy/{parsed.port}{path}"


def _find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.2):
            return True
    except OSError:
        return False


def _wait_for_server(host: str, port: int, timeout_s: float = 20.0) -> None:
    end = time.time() + timeout_s
    while time.time() < end:
        if _is_port_open(host, port):
            return
        time.sleep(0.1)
    raise TimeoutError(f"Neloura server did not start on {host}:{port}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="neloura", description="Run the pip-installed Neloura app.")
    parser.add_argument("path", nargs="?", help="Optional FITS file to open in Neloura")
    parser.add_argument("--hdu", type=int, default=0, help="HDU index to open when a FITS file is provided")
    parser.add_argument("--copy", action="store_true", help="Copy the FITS file into Neloura instead of linking it")
    parser.add_argument("--no-browser", action="store_true", help="Start Neloura without opening a browser tab")

    args = parser.parse_args(argv)
    if args.path:
        open_fits(
            args.path,
            hdu=args.hdu,
            inline=False,
            copy=args.copy,
        )
        return 0

    launch(open_browser=not args.no_browser)
    print("Neloura is running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        return 0

