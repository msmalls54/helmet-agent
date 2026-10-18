"""Visible 115200-baud monitor: print readings, log them, send typed commands."""
import argparse
import pathlib
import threading

import serial
from serial.tools import list_ports

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port")
args = parser.parse_args()
if args.port is None:
    found = [port.device for port in list_ports.comports()
             if port.vid == 0x239A and port.pid == 0x8113]
    if len(found) != 1:
        parser.error("Expected exactly one Feather application port. Check USB, or pass --port COM<number>.")
    args.port = found[0]
project = pathlib.Path(__file__).resolve().parents[1]
log_path = project / "evidence" / "serial-live.log"
log_path.parent.mkdir(exist_ok=True)
stop = threading.Event()


def receive(port, log):
    try:
        while not stop.is_set():
            line = port.readline().decode("utf-8", errors="replace").rstrip("\r\n")
            if line:
                print(line, flush=True)
                log.write(line + "\n")
                log.flush()
    except serial.SerialException as error:
        print("USB connection lost:", error, flush=True)
        stop.set()


try:
    with serial.Serial(args.port, 115200, timeout=0.2) as port, log_path.open("a", encoding="utf-8") as log:
        port.rts = False
        print("Helmet Serial Monitor -", args.port, "- 115200 baud", flush=True)
        print("Readings appear below. Type cal, next, zero, status, or help, then press Enter.", flush=True)
        print("Close this window before uploading. Ctrl+C also closes the monitor.", flush=True)
        worker = threading.Thread(target=receive, args=(port, log), daemon=True)
        worker.start()
        try:
            while not stop.is_set():
                text = input()
                if stop.is_set():
                    break
                port.write((text + "\n").encode("ascii"))
                port.flush()
        finally:
            stop.set()
            worker.join(timeout=1)
except (serial.SerialException, OSError) as error:
    print("Could not use", args.port, ":", error, flush=True)
    print("Close other serial monitors. Check USB cable/port and BOOT+RESET. The COM number can change.", flush=True)
except (KeyboardInterrupt, EOFError):
    pass
