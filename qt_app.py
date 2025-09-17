import os
import sys
from pathlib import Path
import socket
import threading
import time
from contextlib import closing
import ast
import shutil
import logging
from logging.handlers import RotatingFileHandler

from PyQt6.QtCore import QUrl, Qt, QTimer
from PyQt6.QtWidgets import QApplication, QMainWindow, QFileDialog
from PyQt6.QtGui import QIcon, QGuiApplication, QDesktopServices
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEnginePage


def _configure_logging(logs_dir: str) -> None:
    """Configure Python logging to write rotating logs in ~/Neloura/logs/python.log"""
    try:
        python_log = os.path.join(logs_dir, 'python.log')
        handler = RotatingFileHandler(python_log, maxBytes=2_000_000, backupCount=3)
        formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s')
        handler.setFormatter(formatter)
        root = logging.getLogger()
        root.setLevel(logging.INFO)
        root.addHandler(handler)
        # Quiet noisy Matplotlib font cache messages
        logging.getLogger('matplotlib.font_manager').setLevel(logging.ERROR)
        # Also direct uvicorn logs
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            logging.getLogger(name).addHandler(handler)
    except Exception:
        pass


def find_free_port(preferred: int | None = None) -> int:
    if preferred is not None:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", preferred))
                return preferred
            except OSError:
                pass
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server_in_thread(port: int) -> threading.Thread:
    # We import here to avoid importing uvicorn/PyQt at module import in packagers
    import uvicorn
    from main import app  # uses existing FastAPI app without modifying main.py

    def run():
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            reload=False,
        )

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


def wait_for_server(port: int, timeout_s: float = 10.0) -> bool:
    end = time.time() + timeout_s
    url = f"http://127.0.0.1:{port}/"
    import urllib.request
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


class MainWindow(QMainWindow):
    def __init__(self, server_port: int, user_data_dir: str):
        super().__init__()
        self.setWindowTitle("Neloura")
        self.resize(1280, 800)
        self._user_data_dir = user_data_dir
        self._logs_dir = os.path.join(self._user_data_dir, 'logs')
        self._js_log_path = os.path.join(self._logs_dir, 'js.log')

        self.view = QWebEngineView(self)
        # Use a custom page that opens external links in the system browser
        profile = self.view.page().profile()
        self.view.setPage(ExternalLinksPage(profile, self.view, self._js_log_path))
        # Handle downloads triggered by JS (e.g., canvas save, href with download attribute)
        try:
            if hasattr(profile, 'setDownloadPath'):
                profile.setDownloadPath(self._user_data_dir)
            profile.downloadRequested.connect(self._on_download_requested)
        except Exception:
            pass
        self.setCentralWidget(self.view)
        self.view.settings().setAttribute(
            self.view.settings().WebAttribute.PluginsEnabled, True
        )

        self.view.setUrl(QUrl(f"http://127.0.0.1:{server_port}/"))

    def _on_download_requested(self, download):
        """Let user pick where to save, defaulting to ~/Neloura.

        Supports both PyQt6 QWebEngineDownloadRequest and legacy API with setPath().
        """
        suggested = 'download'
        try:
            if hasattr(download, 'downloadFileName'):
                attr = getattr(download, 'downloadFileName')
                suggested = attr() if callable(attr) else attr or suggested
            elif hasattr(download, 'suggestedFileName'):
                attr = getattr(download, 'suggestedFileName')
                suggested = attr() if callable(attr) else attr or suggested
            elif hasattr(download, 'url'):
                try:
                    u = download.url() if callable(download.url) else download.url
                    if hasattr(u, 'path'):
                        path = u.path()
                        if path:
                            suggested = os.path.basename(path) or suggested
                except Exception:
                    pass
        except Exception:
            pass
        initial_path = os.path.join(self._user_data_dir, suggested)
        # Ask where to save
        try:
            save_path, _ = QFileDialog.getSaveFileName(self, "Save file", initial_path)
        except Exception:
            save_path = initial_path
        if not save_path:
            return
        try:
            if hasattr(download, 'setDownloadDirectory') and hasattr(download, 'setDownloadFileName'):
                download.setDownloadDirectory(os.path.dirname(save_path))
                download.setDownloadFileName(os.path.basename(save_path))
                if hasattr(download, 'accept'):
                    download.accept()
            elif hasattr(download, 'setPath'):
                download.setPath(save_path)
                if hasattr(download, 'accept'):
                    download.accept()
        except Exception:
            # Best-effort; if it fails, we just let the default behavior happen
            try:
                if hasattr(download, 'accept'):
                    download.accept()
            except Exception:
                pass


def _resolve_base_dir() -> str:
    """Return the directory where bundled resources (e.g., static/) live.

    Priority order:
    - sys._MEIPASS (onefile extraction dir)
    - macOS app bundle Resources dir (…/Contents/Resources)
    - directory of this file (unbundled run)
    """
    base = getattr(sys, '_MEIPASS', None)
    if base:
        return base
    try:
        exe_path = Path(sys.executable).resolve()
        # Look for …/Contents
        for parent in exe_path.parents:
            if parent.name == 'Contents':
                resources = parent / 'Resources'
                if resources.is_dir():
                    return str(resources)
                break
    except Exception:
        pass
    return os.path.dirname(os.path.abspath(__file__))


def _find_main_py(base_dir: str) -> str:
    """Locate main.py when running bundled or unbundled.

    Searches multiple likely locations inside a macOS .app and source tree.
    """
    candidates: list[Path] = []
    # 1) Explicit env override for debugging
    env_path = os.environ.get('NELOURA_MAINPY')
    if env_path:
        candidates.append(Path(env_path))
    # 2) sys._MEIPASS
    base_meipass = getattr(sys, '_MEIPASS', None)
    if base_meipass:
        candidates.append(Path(base_meipass) / 'main.py')
    # 3) macOS bundle layout
    try:
        exe_path = Path(sys.executable).resolve()
        for parent in exe_path.parents:
            if parent.name == 'Contents':
                candidates.append(parent / 'Resources' / 'main.py')
                candidates.append(parent / 'MacOS' / 'main.py')
                candidates.append(parent / 'Frameworks' / 'main.py')
                break
    except Exception:
        pass
    # 4) alongside resolved base_dir
    candidates.append(Path(base_dir) / 'main.py')
    # 5) cwd and source file dir
    candidates.append(Path.cwd() / 'main.py')
    try:
        candidates.append(Path(__file__).resolve().parent / 'main.py')
    except Exception:
        pass
    for c in candidates:
        if c.is_file():
            return str(c)
        # Some bundlers may place a directory named 'main.py' with the file inside
        if c.is_dir() and (c / 'main.py').is_file():
            return str((c / 'main.py'))
    # Fallback: search within the app bundle 'Contents' tree
    try:
        exe_path = Path(sys.executable).resolve()
        app_root = None
        for parent in exe_path.parents:
            if parent.name == 'Contents':
                app_root = parent
                break
        if app_root is not None:
            for p in (app_root / 'Resources').rglob('main.py'):
                if p.is_file():
                    return str(p)
            for p in (app_root / 'MacOS').rglob('main.py'):
                if p.is_file():
                    return str(p)
            for p in (app_root / 'Frameworks').rglob('main.py'):
                if p.is_file():
                    return str(p)
    except Exception:
        pass
    raise FileNotFoundError('main.py not found in bundled resources or source tree')


def _parse_main_dir_constants(main_py_path: str) -> dict:
    """Parse directory-name constants from main.py without importing it.

    Requires these keys to be present in main.py:
    STATIC_DIRECTORY, IMAGE_DIR, PSF_DIRECTORY, CATALOGS_DIRECTORY,
    FILES_DIRECTORY, UPLOADS_DIRECTORY.
    """
    required_keys = {
        'STATIC_DIRECTORY',
        'IMAGE_DIR',
        'PSF_DIRECTORY',
        'CATALOGS_DIRECTORY',
        'FILES_DIRECTORY',
        'UPLOADS_DIRECTORY',
    }
    with open(main_py_path, 'r', encoding='utf-8') as f:
        src = f.read()
    tree = ast.parse(src, filename=main_py_path)
    values: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name) and target.id in required_keys:
                if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                    values[target.id] = node.value.value
    missing = required_keys - values.keys()
    if missing:
        raise RuntimeError(f"Missing required constants in main.py: {', '.join(sorted(missing))}")
    return values


def _ensure_link_or_copy(target: str, link_path: str) -> None:
    if not target or not os.path.exists(target):
        return
    # If already present (dir or link), do nothing
    if os.path.islink(link_path) or os.path.exists(link_path):
        return
    # Try symlink first
    try:
        os.symlink(target, link_path)
        return
    except Exception:
        pass
    # Fallback: copy
    try:
        if os.path.isdir(target):
            shutil.copytree(target, link_path, dirs_exist_ok=True)
        else:
            os.makedirs(os.path.dirname(link_path), exist_ok=True)
            shutil.copy2(target, link_path)
    except Exception:
        pass


def main():
    # Configure QtWebEngine to avoid sandbox crashes in bundled apps
    os.environ.setdefault('QTWEBENGINE_DISABLE_SANDBOX', '1')
    os.environ.setdefault('QTWEBENGINE_CHROMIUM_FLAGS', '--no-sandbox')
    # Ensure Matplotlib uses a fast, non-interactive backend in the server
    os.environ['MPLBACKEND'] = 'Agg'

    # Resolve packaged resources and prepare a user-writable working dir
    base_dir = _resolve_base_dir()
    main_py_path = _find_main_py(base_dir)
    consts = _parse_main_dir_constants(main_py_path)
    static_dir_name = consts['STATIC_DIRECTORY']
    image_dir_name = consts['IMAGE_DIR']
    psf_dir_name = consts['PSF_DIRECTORY']
    catalogs_dir_name = consts['CATALOGS_DIRECTORY']
    files_dir_name = consts['FILES_DIRECTORY']
    uploads_dir_name = consts['UPLOADS_DIRECTORY']

    app_static_dir = os.path.join(base_dir, static_dir_name)
    app_psf_dir = os.path.join(base_dir, psf_dir_name)
    app_catalogs_dir = os.path.join(base_dir, catalogs_dir_name)

    user_data_dir = os.path.join(str(Path.home()), 'Neloura')
    os.makedirs(user_data_dir, exist_ok=True)
    logs_dir = os.path.join(user_data_dir, 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    _configure_logging(logs_dir)
    # Persist Matplotlib config/cache to avoid rebuilding fonts every launch
    mpl_config_dir = os.path.join(user_data_dir, 'mplconfig')
    # Override PyInstaller's mpl runtime hook temp setting
    os.environ['MPLCONFIGDIR'] = mpl_config_dir
    cache_root = os.path.join(user_data_dir, 'cache')
    os.environ['XDG_CACHE_HOME'] = cache_root
    try:
        os.makedirs(mpl_config_dir, exist_ok=True)
        os.makedirs(os.path.join(cache_root, 'matplotlib'), exist_ok=True)
    except Exception:
        pass
    os.makedirs(os.path.join(user_data_dir, files_dir_name), exist_ok=True)
    os.makedirs(os.path.join(user_data_dir, uploads_dir_name), exist_ok=True)
    os.makedirs(os.path.join(user_data_dir, image_dir_name), exist_ok=True)

    # Create links or copies in user_data_dir so main.py's relative paths resolve using constants:
    _ensure_link_or_copy(app_static_dir, os.path.join(user_data_dir, static_dir_name))
    if os.path.isdir(app_psf_dir):
        _ensure_link_or_copy(app_psf_dir, os.path.join(user_data_dir, psf_dir_name))
    if os.path.isdir(app_catalogs_dir):
        _ensure_link_or_copy(app_catalogs_dir, os.path.join(user_data_dir, catalogs_dir_name))

    # Switch working directory so FastAPI mounts resolve to user_data_dir
    try:
        os.chdir(user_data_dir)
    except Exception:
        pass

    # Pre-import Matplotlib to ensure font cache is initialized under our dirs
    try:
        import matplotlib  # noqa: F401
        try:
            # Reduce matplotlib log noise
            import matplotlib as _mpl
            _mpl.set_loglevel('error')
        except Exception:
            pass
        try:
            # Ensure our visible cache dir points to the actual Matplotlib cache
            real_cachedir = matplotlib.get_cachedir()
            desired_cache_root = os.path.join(user_data_dir, 'cache')
            desired_mpl_cache = os.path.join(desired_cache_root, 'matplotlib')
            os.makedirs(desired_cache_root, exist_ok=True)
            if os.path.islink(desired_mpl_cache) or os.path.exists(desired_mpl_cache):
                # If it's an empty dir we created earlier, replace with symlink to real cache
                try:
                    if os.path.isdir(desired_mpl_cache) and not os.listdir(desired_mpl_cache):
                        os.rmdir(desired_mpl_cache)
                except Exception:
                    pass
            if not os.path.exists(desired_mpl_cache):
                try:
                    os.symlink(real_cachedir, desired_mpl_cache)
                except Exception:
                    pass
            # Log where cache actually lives for debugging
            logging.getLogger(__name__).info("Matplotlib cache dir: %s", real_cachedir)
        except Exception:
            pass
        # Warm the font cache so subsequent launches skip scanning
        try:
            from matplotlib import font_manager as _fm
            # Force a fresh build if cache missing
            try:
                _fm._load_fontmanager(try_read_cache=False)  # type: ignore[attr-defined]
            except Exception:
                # Fallback: scan system fonts (also warms cache)
                _ = _fm.findSystemFonts(fontpaths=None, fontext='ttf')
                _ = _fm.findSystemFonts(fontpaths=None, fontext='otf')
        except Exception:
            pass
    except Exception:
        pass

    # Start server AFTER paths are prepared and CWD is set
    port = find_free_port(preferred=8000)
    server_thread = start_server_in_thread(port)
    # Optionally wait until server is reachable
    wait_for_server(port, timeout_s=12.0)

    app = QApplication(sys.argv)
    QApplication.setApplicationName("Neloura")
    QGuiApplication.setApplicationDisplayName("Neloura")

    # Set app/window icon (uses bundled PNG; works on macOS dock when running unbundled)
    icon_path = os.path.join(static_dir_name, "logo", "android-chrome-512x512.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))

    window = MainWindow(server_port=port, user_data_dir=user_data_dir)
    window.show()

    exit_code = app.exec()
    # On exit, the daemon thread will terminate with process; nothing to join
    sys.exit(exit_code)


class ExternalLinksPage(QWebEnginePage):
    """Opens target=_blank and external navigations in the default browser.

    Also mirrors JS console messages into a file inside ~/Neloura/logs/js.log
    when a log path is provided.
    """
    def __init__(self, profile, parent=None, js_log_path: str | None = None):
        super().__init__(profile, parent)
        self._js_log_path = js_log_path
        try:
            # Connect console message signal for JS logs
            self.consoleMessage.connect(self._on_console_message)
        except Exception:
            pass

    def _on_console_message(self, level, message, line, source_id):
        try:
            if not self._js_log_path:
                return
            with open(self._js_log_path, 'a', encoding='utf-8') as f:
                f.write(f"[{level}] {source_id}:{line}: {message}\n")
        except Exception:
            pass

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):
        # For links clicked inside the page, open external HTTP(S) in system browser
        if nav_type == QWebEnginePage.NavigationType.NavigationTypeLinkClicked:
            if url.scheme() in ("http", "https"):
                QDesktopServices.openUrl(url)
                return False
        return super().acceptNavigationRequest(url, nav_type, is_main_frame)

    def createWindow(self, web_window_type):
        # target=_blank triggers this; capture URL then open externally
        popup_page = QWebEnginePage(self.profile(), self)

        def handle_url(u, p=popup_page):
            try:
                if u.scheme() in ("http", "https", "mailto"):
                    QDesktopServices.openUrl(u)
            finally:
                # Delete the temp page on the next event loop tick to avoid crashes
                QTimer.singleShot(0, p.deleteLater)

        popup_page.urlChanged.connect(handle_url)
        return popup_page



if __name__ == "__main__":
    main()


