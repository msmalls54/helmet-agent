"""Capture real USB Serial lines; optionally send one firmware command."""
import argparse
import datetime
import pathlib
import time

import serial

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", default="COM3")
parser.add_argument("--seconds", type=float, default=15)
parser.add_argument("--send")
parser.add_argument("--log", required=True)
args = parser.parse_args()
log_path = pathlib.Path(args.log)
log_path.parent.mkdir(parents=True, exist_ok=True)

# Explicit settings avoid the 1200-baud touch used to enter bootloader mode.
with serial.Serial(args.port, 115200, timeout=0.2) as port:
    port.rts = False
    if args.send is not None:
        time.sleep(0.3)
        port.write((args.send + "\n").encode("ascii"))
        port.flush()
    deadline = time.monotonic() + args.seconds
    with log_path.open("w", encoding="utf-8", newline="\n") as output:
        output.write("# USB capture UTC: " + datetime.datetime.now(datetime.timezone.utc).isoformat() + "\n")
        while time.monotonic() < deadline:
            line = port.readline().decode("utf-8", errors="replace").rstrip("\r\n")
            if line:
                print(line, flush=True)
                output.write(line + "\n")
                output.flush()
