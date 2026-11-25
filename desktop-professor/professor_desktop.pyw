import base64
import json
import math
import os
import socket
import ssl
import struct
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, simpledialog

from PIL import Image, ImageDraw, ImageTk

try:
    import winsound
except ImportError:
    winsound = None

CHROMA_KEY = "#ff00fe"
APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parent
SPRITES_DIR = PROJECT_ROOT / "public" / "sprites" / "professor"
SOUNDS_DIR = APP_DIR / "sounds"
STRESS_SOUNDS = [
    "professor_slam.wav",
    "professor_grumble.wav",
    "professor_alarm.wav",
]
CONFIG_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "CPREStudioProfessor"
CONFIG_PATH = CONFIG_DIR / "config.json"
STARTUP_DIR = (
    Path(os.environ.get("APPDATA", str(Path.home())))
    / "Microsoft"
    / "Windows"
    / "Start Menu"
    / "Programs"
    / "Startup"
)
STARTUP_VBS = STARTUP_DIR / "CPRE-Professor-Flutuante.vbs"

MOOD_CONFIG = {
    "idle": ("professor-idle-sheet-512px.png", 4, 3),
    "thinking": ("professor-thinking-sheet-512px.png", 4, 3),
    "talking": ("professor-talking-sheet-512px.png", 4, 7),
    "angry_slam": ("professor-angry_slam-sheet-512px.png", 6, 8),
    "celebrate_clap": ("professor-celebrate_clap-sheet-512px.png", 4, 6),
}

DEFAULT_CONFIG = {
    "study_url": "https://ireb-cpre-studio.vercel.app/estudar",
    "target_questions": 10,
    "window_minutes": 120,
    "sprite_size": 128,
    "pos_x": None,
    "pos_y": None,
    "test_stress": False,
    "sound_on_stress": True,
    "supabase_url": "",
    "supabase_anon_key": "",
    "refresh_token": "",
    "user_email": "",
}


def load_env_supabase() -> tuple[str, str]:
    env_file = PROJECT_ROOT / ".env.local"
    url = ""
    key = ""
    if env_file.exists():
        try:
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k == "NEXT_PUBLIC_SUPABASE_URL":
                    url = v
                elif k == "NEXT_PUBLIC_SUPABASE_ANON_KEY":
                    key = v
        except Exception:
            pass
    return url, key


def load_config() -> dict:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                cfg.update(saved)
        except Exception:
            pass
    env_url, env_key = load_env_supabase()
    if not cfg.get("supabase_url") and env_url:
        cfg["supabase_url"] = env_url
    if not cfg.get("supabase_anon_key") and env_key:
        cfg["supabase_anon_key"] = env_key
    return cfg


def save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


class SupabaseSyncClient:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.access_token: str = ""
        self.token_expires_at: float = 0.0

    @property
    def configured(self) -> bool:
        return bool(self.cfg.get("supabase_url") and self.cfg.get("supabase_anon_key"))

    @property
    def logged_in(self) -> bool:
        return self.configured and bool(self.cfg.get("refresh_token"))

    def sign_in_password(self, email: str, password: str) -> tuple[bool, str]:
        if not self.configured:
            return False, "Supabase não encontrado no .env.local."
        url = f"{self.cfg['supabase_url'].rstrip('/')}/auth/v1/token?grant_type=password"
        payload = json.dumps({"email": email.strip(), "password": password}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "apikey": self.cfg["supabase_anon_key"],
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.access_token = data.get("access_token", "")
                self.token_expires_at = time.time() + int(data.get("expires_in", 3600)) - 60
                self.cfg["refresh_token"] = data.get("refresh_token", "")
                self.cfg["user_email"] = email.strip()
                save_config(self.cfg)
                return True, "Conta conectada com sucesso!"
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read().decode("utf-8"))
                msg = err.get("error_description") or err.get("msg") or str(e)
            except Exception:
                msg = f"Erro HTTP {e.code}"
            return False, msg
        except Exception as e:
            return False, str(e)

    def _ensure_token(self) -> bool:
        if not self.logged_in:
            return False
        if self.access_token and time.time() < self.token_expires_at:
            return True
        url = f"{self.cfg['supabase_url'].rstrip('/')}/auth/v1/token?grant_type=refresh_token"
        payload = json.dumps({"refresh_token": self.cfg["refresh_token"]}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "apikey": self.cfg["supabase_anon_key"],
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.access_token = data.get("access_token", "")
                self.token_expires_at = time.time() + int(data.get("expires_in", 3600)) - 60
                if data.get("refresh_token"):
                    self.cfg["refresh_token"] = data["refresh_token"]
                    save_config(self.cfg)
                return bool(self.access_token)
        except Exception:
            return False

    def fetch_study_progress(self, window_minutes: int) -> dict | None:
        if not self._ensure_token():
            return None
        base = self.cfg["supabase_url"].rstrip("/")
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=window_minutes)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        headers = {
            "apikey": self.cfg["supabase_anon_key"],
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
        }
        try:
            q_window = urllib.parse.urlencode(
                {
                    "select": "question_codigo,created_at",
                    "created_at": f"gte.{cutoff}",
                    "order": "created_at.desc",
                }
            )
            req1 = urllib.request.Request(f"{base}/rest/v1/user_attempts?{q_window}", headers=headers)
            with urllib.request.urlopen(req1, timeout=8) as r1:
                recent_rows = json.loads(r1.read().decode("utf-8"))

            q_latest = urllib.parse.urlencode(
                {"select": "created_at", "order": "created_at.desc", "limit": "1"}
            )
            req2 = urllib.request.Request(f"{base}/rest/v1/user_attempts?{q_latest}", headers=headers)
            with urllib.request.urlopen(req2, timeout=8) as r2:
                latest_rows = json.loads(r2.read().decode("utf-8"))

            if isinstance(recent_rows, list):
                unique_codes = {
                    row.get("question_codigo")
                    for row in recent_rows
                    if isinstance(row, dict) and row.get("question_codigo")
                }
                answered = len(unique_codes)
            else:
                answered = 0
            last_iso = latest_rows[0]["created_at"] if latest_rows else None
            minutes_since = None
            if last_iso:
                dt = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
                minutes_since = max(0, int((datetime.now(timezone.utc) - dt).total_seconds() // 60))

            return {
                "answered": answered,
                "minutes_since": minutes_since,
                "synced": True,
            }
        except Exception:
            return None


def make_rounded_pill(text: str, bg: str, fg: str = "#ffffff", font_size: int = 10) -> ImageTk.PhotoImage:
    """Cria uma imagem PNG de pílula arredondada com fundo chroma-key limpo (sem serrilhado)."""
    # Usaremos Canvas/Label nativo ou imagem limpa; label com padx/pady é super nítido no Windows
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    return ImageTk.PhotoImage(img)


class SupabaseRealtimeClient:
    """Cliente WebSocket leve (stdlib pura) para ouvir INSERTs em public.user_attempts em tempo real."""

    def __init__(self, sync_client: SupabaseSyncClient, on_change):
        self.sync = sync_client
        self.on_change = on_change
        self._stop = threading.Event()
        self._sock = None
        self._thread = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def restart(self):
        self.stop()
        self.start()

    def stop(self):
        self._stop.set()
        try:
            if self._sock:
                self._sock.close()
        except Exception:
            pass
        self._sock = None

    def _ws_send(self, sock, text: str):
        payload = text.encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", n))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", n))
        header.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        sock.sendall(bytes(header) + masked)

    def _recv_exact(self, sock, n: int) -> bytes:
        buf = bytearray()
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("WebSocket closed")
            buf.extend(chunk)
        return bytes(buf)

    def _ws_recv(self, sock) -> tuple[int, bytes]:
        b1, b2 = self._recv_exact(sock, 2)
        opcode = b1 & 0x0F
        masked = bool(b2 & 0x80)
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack("!H", self._recv_exact(sock, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self._recv_exact(sock, 8))[0]
        mask_key = self._recv_exact(sock, 4) if masked else None
        data = self._recv_exact(sock, length) if length else b""
        if mask_key:
            data = bytes(b ^ mask_key[i % 4] for i, b in enumerate(data))
        return opcode, data

    def _loop(self):
        while not self._stop.is_set():
            if not self.sync.logged_in or not self.sync._ensure_token():
                self._stop.wait(5.0)
                continue

            sock = None
            try:
                parsed = urllib.parse.urlparse(self.sync.cfg["supabase_url"])
                host = parsed.hostname
                port = parsed.port or 443
                apikey = urllib.parse.quote(self.sync.cfg["supabase_anon_key"], safe="")
                path = f"/realtime/v1/websocket?apikey={apikey}&vsn=1.0.0"

                raw_sock = socket.create_connection((host, port), timeout=12)
                ctx = ssl.create_default_context()
                sock = ctx.wrap_socket(raw_sock, server_hostname=host)
                self._sock = sock

                ws_key = base64.b64encode(os.urandom(16)).decode("ascii")
                handshake = (
                    f"GET {path} HTTP/1.1\r\n"
                    f"Host: {host}\r\n"
                    f"Upgrade: websocket\r\n"
                    f"Connection: Upgrade\r\n"
                    f"Sec-WebSocket-Key: {ws_key}\r\n"
                    f"Sec-WebSocket-Version: 13\r\n\r\n"
                )
                sock.sendall(handshake.encode("ascii"))

                resp = b""
                while b"\r\n\r\n" not in resp:
                    chunk = sock.recv(1024)
                    if not chunk:
                        raise ConnectionError("Handshake failed")
                    resp += chunk
                if b"101 " not in resp.split(b"\r\n", 1)[0]:
                    raise ConnectionError("WebSocket upgrade rejected")

                join_msg = {
                    "topic": "realtime:public:user_attempts",
                    "event": "phx_join",
                    "payload": {
                        "config": {
                            "broadcast": {"ack": False, "self": False},
                            "presence": {"key": ""},
                            "postgres_changes": [
                                {"event": "INSERT", "schema": "public", "table": "user_attempts"}
                            ],
                        },
                        "access_token": self.sync.access_token,
                    },
                    "ref": "1",
                }
                self._ws_send(sock, json.dumps(join_msg))

                sock.settimeout(25.0)
                ref_num = 2
                last_hb = time.time()

                while not self._stop.is_set():
                    if time.time() - last_hb >= 25.0:
                        hb = {
                            "topic": "phoenix",
                            "event": "heartbeat",
                            "payload": {},
                            "ref": str(ref_num),
                        }
                        ref_num += 1
                        self._ws_send(sock, json.dumps(hb))
                        last_hb = time.time()

                    try:
                        opcode, data = self._ws_recv(sock)
                    except socket.timeout:
                        continue

                    if opcode == 0x8:  # close
                        break
                    elif opcode == 0x9:  # ping -> pong
                        mask = os.urandom(4)
                        hdr = bytes([0x8A, 0x80 | len(data)]) + mask
                        sock.sendall(hdr + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))
                    elif opcode == 0x1 and data:  # text frame
                        try:
                            msg = json.loads(data.decode("utf-8"))
                            if msg.get("event") == "postgres_changes":
                                self.on_change()
                        except Exception:
                            pass
            except Exception:
                pass
            finally:
                try:
                    if sock:
                        sock.close()
                except Exception:
                    pass
                self._sock = None

            self._stop.wait(5.0)


class DesktopProfessorApp:
    def __init__(self):
        self.cfg = load_config()
        self.sync = SupabaseSyncClient(self.cfg)
        self.started_at = time.time()

        self.root = tk.Tk()
        self.root.title("Prof. IREB Flutuante")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg=CHROMA_KEY)
        self.root.attributes("-transparentcolor", CHROMA_KEY)

        self.current_mood = "idle"
        self.current_frame = 0
        self.stressed = False
        self.last_stressed = False
        self.last_sound_at = 0.0
        self.sound_index = 0
        self.snooze_until = 0.0
        self.answered_count = 0
        self.synced = False
        self._poll_job_id = None

        self.frames_cache: dict[tuple[str, int], list[ImageTk.PhotoImage]] = {}

        # Container principal transparente
        self.container = tk.Frame(self.root, bg=CHROMA_KEY)
        self.container.pack()

        # Balão de fala (visível só quando estressado ou aviso)
        self.bubble_frame = tk.Frame(
            self.container,
            bg="#e11d48",
            padx=10,
            pady=5,
            highlightthickness=1,
            highlightbackground="#ffe4e6",
        )
        self.bubble_label = tk.Label(
            self.bubble_frame,
            text="",
            bg="#e11d48",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            wraplength=190,
            justify="center",
        )
        self.bubble_label.pack()

        # Canvas transparente para desenhar apenas o sprite do professor (sem fundo!)
        size = int(self.cfg.get("sprite_size", 128))
        self.canvas = tk.Canvas(
            self.container,
            width=size + 12,
            height=size + 12,
            bg=CHROMA_KEY,
            highlightthickness=0,
            bd=0,
            cursor="hand2",
        )
        self.canvas.pack()
        self.sprite_item = self.canvas.create_image((size + 12) // 2, (size + 12) // 2)

        # Selo discreto abaixo dos pés
        self.badge_label = tk.Label(
            self.container,
            text=f"0/{self.cfg['target_questions']}",
            bg="#18181b",
            fg="#ffffff",
            font=("Segoe UI", 8, "bold"),
            padx=9,
            pady=2,
            cursor="hand2",
        )
        self.badge_label.pack(pady=(0, 2))

        # Drag / Click / Right-Click
        self._drag_start_x = 0
        self._drag_start_y = 0
        self._win_start_x = 0
        self._win_start_y = 0
        self._moved = False

        for widget in (self.canvas, self.badge_label, self.bubble_label, self.bubble_frame):
            widget.bind("<ButtonPress-1>", self._on_press)
            widget.bind("<B1-Motion>", self._on_drag)
            widget.bind("<ButtonRelease-1>", self._on_release)
            widget.bind("<Button-3>", self._show_context_menu)

        self._position_window()
        self._load_mood_frames("idle")
        self._animate()
        self._poll_status()
        self.realtime = SupabaseRealtimeClient(
            self.sync,
            on_change=lambda: self.root.after(150, self._poll_status),
        )
        self.realtime.start()

    def _position_window(self):
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = self.cfg.get("pos_x")
        y = self.cfg.get("pos_y")
        if x is None or y is None:
            size = int(self.cfg.get("sprite_size", 128))
            x = sw - size - 48
            y = sh - size - 130
        x = max(0, min(int(x), sw - 80))
        y = max(0, min(int(y), sh - 80))
        self.root.geometry(f"+{x}+{y}")

    def _load_mood_frames(self, mood: str) -> list[ImageTk.PhotoImage]:
        size = int(self.cfg.get("sprite_size", 128))
        key = (mood, size)
        if key in self.frames_cache:
            return self.frames_cache[key]

        filename, frame_count, _ = MOOD_CONFIG.get(mood, MOOD_CONFIG["idle"])
        path = SPRITES_DIR / filename
        frames: list[ImageTk.PhotoImage] = []
        if path.exists():
            sheet = Image.open(path).convert("RGBA")
            fw = sheet.width // frame_count
            fh = sheet.height
            for i in range(frame_count):
                crop = sheet.crop((i * fw, 0, (i + 1) * fw, fh))
                resized = crop.resize((size, size), Image.Resampling.NEAREST)
                # Garante transparência limpa para chroma-key no Windows
                bg = Image.new("RGBA", (size, size), (255, 0, 254, 255))
                alpha = resized.getchannel("A")
                # Binariza alpha para evitar halos rosados nas bordas
                mask = alpha.point(lambda a: 255 if a > 110 else 0)
                bg.paste(resized, (0, 0), mask)
                frames.append(ImageTk.PhotoImage(bg.convert("RGB")))
        self.frames_cache[key] = frames
        return frames

    def _animate(self):
        frames = self._load_mood_frames(self.current_mood)
        _, _, fps = MOOD_CONFIG.get(self.current_mood, MOOD_CONFIG["idle"])
        if frames:
            self.current_frame = (self.current_frame + 1) % len(frames)
            self.canvas.itemconfigure(self.sprite_item, image=frames[self.current_frame])

            size = int(self.cfg.get("sprite_size", 128))
            cx = (size + 12) // 2
            cy = (size + 12) // 2
            if self.current_mood == "angry_slam":
                dx = (-3 if self.current_frame % 3 == 0 else 3 if self.current_frame % 3 == 1 else 0)
                dy = 3 if self.current_frame == 3 else 0
                self.canvas.coords(self.sprite_item, cx + dx, cy + dy)
            else:
                self.canvas.coords(self.sprite_item, cx, cy)

        delay = max(80, int(1000 / max(1, fps)))
        self.root.after(delay, self._animate)

    def _poll_status(self):
        if self._poll_job_id is not None:
            try:
                self.root.after_cancel(self._poll_job_id)
            except Exception:
                pass
            self._poll_job_id = None

        if time.time() < self.snooze_until:
            self.root.withdraw()
            self._poll_job_id = self.root.after(15_000, self._poll_status)
            return
        else:
            if self.root.state() == "withdrawn":
                self.root.deiconify()

        def worker():
            target = int(self.cfg.get("target_questions", 10))
            win_min = int(self.cfg.get("window_minutes", 120))
            test_stress = bool(self.cfg.get("test_stress", False))

            if test_stress:
                status = {
                    "answered": self.answered_count,
                    "target": target,
                    "mood": "angry_slam",
                    "stressed": True,
                    "goal_met": False,
                    "message": f"OBJEÇÃO! Modo teste ativo: bora fazer {target} questões!",
                    "synced": self.synced,
                }
                self.root.after(0, lambda: self._apply_status(status))
                return

            remote = self.sync.fetch_study_progress(win_min)
            if remote is not None:
                answered = remote["answered"]
                minutes_since = remote["minutes_since"]
                synced = True
            else:
                answered = 0
                minutes_since = int((time.time() - self.started_at) // 60)
                synced = False

            remaining = max(0, target - answered)
            goal_met = answered >= target
            warning_min = int(win_min * 0.75)

            if goal_met:
                mood = "idle"
                stressed = False
                msg = ""
            elif minutes_since is None or minutes_since >= win_min:
                mood = "angry_slam"
                stressed = True
                hrs = max(1, round(win_min / 60))
                msg = (
                    f"OBJEÇÃO! {hrs}h sem {target} questões! Clica aqui!"
                    if answered == 0
                    else f"Faltam {remaining} questões! Clica aqui e bora estudar!"
                )
            elif minutes_since >= warning_min:
                mood = "thinking"
                stressed = False
                msg = f"Faltam {remaining} questões para bater a meta..."
            else:
                mood = "idle"
                stressed = False
                msg = ""

            status = {
                "answered": answered,
                "target": target,
                "mood": mood,
                "stressed": stressed,
                "goal_met": goal_met,
                "message": msg,
                "synced": synced,
            }
            self.root.after(0, lambda: self._apply_status(status))

        threading.Thread(target=worker, daemon=True).start()
        # Realtime atualiza instantaneamente a cada nova questão; timer de 3 min só checa virada da janela de 2h
        self._poll_job_id = self.root.after(180_000, self._poll_status)

    def _apply_status(self, status: dict):
        self.answered_count = status["answered"]
        self.synced = status["synced"]
        self.stressed = status["stressed"]
        target = status["target"]
        mood = status["mood"]

        if mood != self.current_mood:
            self.current_mood = mood
            self.current_frame = 0

        if status["stressed"]:
            self.bubble_frame.configure(bg="#e11d48", highlightbackground="#ffe4e6")
            self.bubble_label.configure(bg="#e11d48", text=status["message"])
            self.bubble_frame.pack(before=self.canvas, pady=(0, 3))
            self.badge_label.configure(
                text=f"BORA! {self.answered_count}/{target}",
                bg="#e11d48",
            )
            now = time.time()
            if self.cfg.get("sound_on_stress", True) and (
                not self.last_stressed or now - self.last_sound_at >= 300
            ):
                self._play_stress_sound()
                self.last_sound_at = now
        elif mood == "thinking" and status["message"]:
            self.bubble_frame.configure(bg="#d97706", highlightbackground="#fef3c7")
            self.bubble_label.configure(bg="#d97706", text=status["message"])
            self.bubble_frame.pack(before=self.canvas, pady=(0, 3))
            self.badge_label.configure(
                text=f"{self.answered_count}/{target} ⏳",
                bg="#d97706",
            )
        elif status["goal_met"]:
            self.bubble_frame.pack_forget()
            self.badge_label.configure(
                text=f"{self.answered_count}/{target} ✓",
                bg="#059669",
            )
        else:
            self.bubble_frame.pack_forget()
            if not self.sync.logged_in:
                self.badge_label.configure(
                    text="Conectar conta",
                    bg="#4f46e5",
                )
            elif not self.synced:
                self.badge_label.configure(
                    text=f"{self.answered_count}/{target} • reconectando",
                    bg="#52525b",
                )
            else:
                self.badge_label.configure(
                    text=f"{self.answered_count}/{target}",
                    bg="#18181b",
                )

        self.last_stressed = status["stressed"]

    def _on_press(self, event):
        self._drag_start_x = event.x_root
        self._drag_start_y = event.y_root
        self._win_start_x = self.root.winfo_x()
        self._win_start_y = self.root.winfo_y()
        self._moved = False

    def _on_drag(self, event):
        dx = event.x_root - self._drag_start_x
        dy = event.y_root - self._drag_start_y
        if abs(dx) > 5 or abs(dy) > 5:
            self._moved = True
        if self._moved:
            nx = self._win_start_x + dx
            ny = self._win_start_y + dy
            self.root.geometry(f"+{nx}+{ny}")

    def _on_release(self, event):
        if self._moved:
            self.cfg["pos_x"] = self.root.winfo_x()
            self.cfg["pos_y"] = self.root.winfo_y()
            save_config(self.cfg)
        elif event.widget is self.badge_label and not self.sync.logged_in:
            self._open_login_dialog()
        else:
            webbrowser.open(self.cfg.get("study_url", DEFAULT_CONFIG["study_url"]))

    def _show_context_menu(self, event):
        menu = tk.Menu(self.root, tearoff=0)
        menu.add_command(
            label="Abrir /estudar agora",
            command=lambda: webbrowser.open(self.cfg.get("study_url", DEFAULT_CONFIG["study_url"])),
        )
        menu.add_command(label="Atualizar contagem agora", command=self._poll_status)
        menu.add_separator()

        email = self.cfg.get("user_email")
        auth_label = f"Conta conectada ({email}) — trocar" if self.sync.logged_in else "Conectar conta CPRE Studio..."
        menu.add_command(label=auth_label, command=self._open_login_dialog)
        menu.add_command(label="Configurar meta (questões / tempo)...", command=self._open_goal_dialog)

        size_menu = tk.Menu(menu, tearoff=0)
        for label, px in (("Pequeno (96px)", 96), ("Médio (128px)", 128), ("Grande (168px)", 168)):
            size_menu.add_command(label=label, command=lambda s=px: self._set_size(s))
        menu.add_cascade(label="Tamanho do Professor", menu=size_menu)

        stress_var = tk.BooleanVar(value=bool(self.cfg.get("test_stress", False)))
        menu.add_checkbutton(
            label="Testar modo estressado agora",
            variable=stress_var,
            command=lambda: self._toggle_test_stress(stress_var.get()),
        )

        sound_var = tk.BooleanVar(value=bool(self.cfg.get("sound_on_stress", True)))
        menu.add_checkbutton(
            label="Som quando estressado",
            variable=sound_var,
            command=lambda: self._toggle_sound(sound_var.get()),
        )
        menu.add_command(label="Testar som estressado agora", command=self._play_stress_sound)

        startup_var = tk.BooleanVar(value=STARTUP_VBS.exists())
        menu.add_checkbutton(
            label="Iniciar junto com o Windows",
            variable=startup_var,
            command=lambda: self._toggle_startup(startup_var.get()),
        )

        menu.add_separator()
        menu.add_command(label="Pausar por 30 minutos", command=self._snooze_30m)
        menu.add_command(label="Fechar Professor", command=self.root.destroy)

        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _set_size(self, px: int):
        self.cfg["sprite_size"] = px
        save_config(self.cfg)
        self.canvas.configure(width=px + 12, height=px + 12)
        self.canvas.coords(self.sprite_item, (px + 12) // 2, (px + 12) // 2)
        self._load_mood_frames(self.current_mood)

    def _toggle_test_stress(self, enabled: bool):
        self.cfg["test_stress"] = enabled
        save_config(self.cfg)
        self._poll_status()

    def _toggle_sound(self, enabled: bool):
        self.cfg["sound_on_stress"] = enabled
        save_config(self.cfg)

    def _play_stress_sound(self):
        if not winsound:
            return
        try:
            wav = SOUNDS_DIR / STRESS_SOUNDS[self.sound_index % len(STRESS_SOUNDS)]
            self.sound_index += 1
            if wav.exists():
                winsound.PlaySound(str(wav), winsound.SND_FILENAME | winsound.SND_ASYNC)
            else:
                winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
        except Exception:
            pass

    def _toggle_startup(self, enable: bool):
        try:
            if enable:
                launcher = APP_DIR / "Iniciar-Professor-PC.vbs"
                STARTUP_VBS.write_text(launcher.read_text(encoding="utf-8"), encoding="utf-8")
                messagebox.showinfo("CPRE Studio", "Prof. IREB configurado para iniciar com o Windows!")
            else:
                if STARTUP_VBS.exists():
                    STARTUP_VBS.unlink()
                messagebox.showinfo("CPRE Studio", "Inicialização automática removida.")
        except Exception as e:
            messagebox.showerror("Erro", f"Não foi possível alterar inicialização: {e}")

    def _snooze_30m(self):
        self.snooze_until = time.time() + 1800
        self.root.withdraw()

    def _open_login_dialog(self):
        email = simpledialog.askstring(
            "Conectar conta CPRE Studio",
            "Digite seu e-mail do CPRE Studio:",
            initialvalue=self.cfg.get("user_email", ""),
            parent=self.root,
        )
        if not email:
            return
        password = simpledialog.askstring(
            "Conectar conta CPRE Studio",
            "Digite sua senha:",
            show="*",
            parent=self.root,
        )
        if not password:
            return
        ok, msg = self.sync.sign_in_password(email, password)
        if ok:
            messagebox.showinfo("CPRE Studio", msg)
            self._poll_status()
            self.realtime.restart()
        else:
            messagebox.showerror("Erro de login", msg)

    def _open_goal_dialog(self):
        target = simpledialog.askinteger(
            "Meta de Estudo",
            "Quantas questões mínimas por janela?",
            initialvalue=int(self.cfg.get("target_questions", 10)),
            minvalue=1,
            maxvalue=100,
            parent=self.root,
        )
        if target is None:
            return
        window_min = simpledialog.askinteger(
            "Janela de Tempo",
            "Janela em minutos (120 = 2 horas):",
            initialvalue=int(self.cfg.get("window_minutes", 120)),
            minvalue=5,
            maxvalue=720,
            parent=self.root,
        )
        if window_min is None:
            return
        self.cfg["target_questions"] = target
        self.cfg["window_minutes"] = window_min
        save_config(self.cfg)
        self._poll_status()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    DesktopProfessorApp().run()
