"""Record nine pre-labeled table taps separately from live impacts, then compare them."""
from __future__ import annotations
import argparse
from contextlib import nullcontext
import datetime as dt
import html
import hashlib
import json
import math
from pathlib import Path
import statistics
import time

LEVELS = ("light", "medium", "firm")
PLAN = [("light", 1), ("medium", 1), ("firm", 1),
        ("firm", 2), ("light", 2), ("medium", 2),
        ("medium", 3), ("firm", 3), ("light", 3)]
FLAGS = ("accel_clipped", "fifo_overrun", "i2c_gap", "left_censored", "right_censored", "capture_limited", "timed_out")


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def validate_record(record):
    errors = []
    result, samples = record.get("result") or {}, record.get("samples", [])
    if record.get("level") not in LEVELS or record.get("repeat") not in (1, 2, 3):
        errors.append("unplanned label")
    if not isinstance(result, dict) or not result:
        errors.append("no device result; recording interrupted or cancelled")
        return errors
    if not result.get("detected"):
        errors.append("no settled pulse detected above 2 g")
    if result.get("complete") is not True:
        errors.append("incomplete acceleration capture")
    shift = result.get("rest_shift_g")
    if not isinstance(shift, (int, float)) or not math.isfinite(shift) or not 0 <= shift <= 0.6:
        errors.append("resting baseline shifted or unverified")
    errors += [flag for flag in FLAGS if result.get(flag) is not False]
    for key in ("peak_g", "peak_5ms_g", "span_above_2g_ms", "time_above_2g_ms", "accel_area_g_ms"):
        value = result.get(key)
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            errors.append("invalid " + key)
    if result.get("accel_hz") != 800 or result.get("sample_period_us") != 1250 or result.get("i2c_hz") != 400000:
        errors.append("unexpected acquisition settings")
    if result.get("samples") != len(samples) or len(samples) < 48:
        errors.append("missing waveform samples")
    if not record.get("end_received"):
        errors.append("missing end marker")
    for index, sample in enumerate(samples):
        if sample.get("index") != index or sample.get("trial_id") != result.get("trial_id"):
            errors.append("waveform identity/order mismatch")
            break
        if sample.get("relative_us") != (index - 16) * 1250:
            errors.append("unexpected waveform timeline")
            break
        values = [sample.get(axis) for axis in ("ax", "ay", "az")]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values):
            errors.append("invalid waveform value")
            break
    if samples and not errors:
        actual = max(math.sqrt(sum(sample[a] ** 2 for a in ("ax", "ay", "az"))) for sample in samples)
        if abs(actual - result["peak_g"]) > max(0.03, actual * 0.002):
            errors.append("reported peak does not match waveform")
    return sorted(set(errors))


def analyze(records):
    problems, by_label, rows, identities = [], {}, [], set()
    sites = {r.get("site", "back") for r in records}
    if len(sites) > 1 or any(site not in ("front", "back") for site in sites):
        problems.append("mixed or invalid contact sites; compare front and back separately")
    for record in records:
        identity = (record.get("level"), record.get("repeat"))
        if identity in by_label:
            problems.append("duplicate label: " + str(identity))
        by_label[identity] = record
        result = record.get("result") or {}
        # Session ID and device trial ID must not be reused as different inputs.
        device_identity = (record.get("session"), result.get("trial_id"))
        if device_identity in identities:
            problems.append("reused device trial")
        identities.add(device_identity)
        errors = validate_record(record)
        captured = result.get("detected") is True and bool(record.get("samples"))
        rows.append({"level": identity[0], "repeat": identity[1], "peak_g": result.get("peak_g") if captured else None,
                     "peak_5ms_g": result.get("peak_5ms_g") if captured else None,
                     "span_ms": result.get("span_above_2g_ms") if captured else None,
                     "gyro_peak_dps": result.get("gyro_peak_dps") if captured else None,
                     "observed_window_peak_g": result.get("observed_window_peak_g"),
                     "gyro_complete": result.get("gyro_window_complete") is True and result.get("gyro_clipped") is False,
                     "problems": errors})
        problems += [f"{identity}: {error}" for error in errors]
    for planned in PLAN:
        if planned not in by_label:
            problems.append("missing planned trial: " + str(planned))
    if len(records) != 9:
        problems.append(f"expected 9 attempts, found {len(records)}")
    groups = {}
    for level in LEVELS:
        values = [r["result"]["peak_g"] for r in records
                  if r.get("level") == level and not validate_record(r)]
        secondary = [r["result"]["peak_5ms_g"] for r in records
                     if r.get("level") == level and not validate_record(r)]
        groups[level] = {"usable": len(values), "raw_peak_g": values,
                         "median_peak_g": statistics.median(values) if values else None,
                         "median_peak_5ms_g": statistics.median(secondary) if secondary else None,
                         "min_g": min(values) if values else None, "max_g": max(values) if values else None}
    complete = not problems
    ordered = complete and groups["light"]["median_peak_g"] < groups["medium"]["median_peak_g"] < groups["firm"]["median_peak_g"]
    separated = complete and groups["light"]["max_g"] < groups["medium"]["min_g"] and groups["medium"]["max_g"] < groups["firm"]["min_g"]
    verdict = "incomplete" if not complete else "medians_increase" if ordered else "medians_do_not_increase"
    return {"generated_at": utc_now(), "primary_metric": "raw peak_g",
            "site": next(iter(sites)) if len(sites) == 1 else None,
            "verdict": verdict, "all_nine_usable": complete, "group_medians_increase": ordered,
            "groups_do_not_overlap": separated, "groups": groups, "attempts": rows, "problems": problems,
            "scope": "User-labeled hand taps, one empty helmet, fixed table/support and contact point. No force reference, injury score or calibration factor.",
            "secondary_metrics": "5 ms mean peak, sampled duration and gyro are shown separately; never substituted to make the primary result pass."}


def write_report(summary, directory):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "comparison.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    headline = {"incomplete": "Comparison incomplete", "medians_increase": "Stronger tap labels produced higher median readings",
                "medians_do_not_increase": "Readings did not consistently follow tap strength"}[summary["verdict"]]
    def number(value):
        return f"{value:.1f}" if isinstance(value, (int, float)) and math.isfinite(value) else "—"
    rows = "".join(f"<tr><td>{html.escape(str(r['level']))} {html.escape(str(r['repeat']))}</td><td>{number(r['peak_g'])}</td><td>{number(r['peak_5ms_g'])}</td><td>{number(r['span_ms'])}</td><td>{html.escape(', '.join(r['problems']) or 'complete')}</td></tr>" for r in summary["attempts"])
    cards = "".join(f"<section><h2>{level.title()}</h2><strong>{number(group['median_peak_g'])}</strong> g median<p>{group['usable']} / 3 usable recordings</p></section>" for level, group in summary["groups"].items())
    issues = "".join(f"<li>{html.escape(p)}</li>" for p in summary["problems"])
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Helmet tap comparison</title><style>body{{background:#10271f;color:#f7f7f2;font:17px system-ui;margin:0;padding:40px;max-width:1000px}}h1{{font-size:34px}}.cards{{display:flex;gap:20px}}section{{background:#1d372d;border-radius:16px;padding:24px;flex:1}}strong{{font-size:40px}}table{{width:100%;text-align:left;border-spacing:0 14px}}td,th{{padding-right:18px}}p,li{{color:#c3d2c8;line-height:1.6}}@media(max-width:640px){{.cards{{display:block}}section{{margin-bottom:12px}}body{{padding:20px}}}}</style>
<h1>{headline}</h1><p>Raw peak acceleration is the primary comparison. All nine planned attempts count.</p><div class="cards">{cards}</div>
<h2>Every attempt</h2><table><thead><tr><th>Tap</th><th>Peak g</th><th>5 ms mean g</th><th>Span ms</th><th>Recording</th></tr></thead><tbody>{rows}</tbody></table>
<p>{html.escape(summary['scope'])}</p><p>Groups overlap: {'yes' if summary['all_nine_usable'] and not summary['groups_do_not_overlap'] else 'no' if summary['groups_do_not_overlap'] else 'not assessed'}.</p><ul>{issues}</ul></html>"""
    (directory / "comparison.html").write_text(page, encoding="utf-8")


def read_message(port):
    text = port.readline().decode("utf-8", errors="replace").strip()
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    return None


def capture(args, existing_port=None):
    import serial
    directory = Path(args.directory)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{args.level}-{args.repeat}.json"
    # Reserve the labeled attempt before arming. Never overwrite a failed attempt.
    with path.open("x", encoding="utf-8") as output:
        record = {"session": directory.resolve().name, "level": args.level, "repeat": args.repeat,
                  "started_at": utc_now(), "input": "user_labeled_hand_tap", "support": "same table and orientation",
                  "site": getattr(args, "site", "back"),
                  "contact": f"same marked {getattr(args, 'site', 'back')}-shell spot", "result": None, "samples": [], "end_received": False}
        try:
            with (nullcontext(existing_port) if existing_port else serial.Serial(args.port, 115200, timeout=0.2)) as port:
                port.rts = False
                port.write(b"bench\n"); port.flush()
                deadline = time.monotonic() + 5
                active = False
                while time.monotonic() < deadline:
                    message = read_message(port)
                    if message and message.get("type") == "bench_status":
                        active = message.get("active") is True
                        break
                if not active:
                    raise RuntimeError("Bench mode did not confirm readiness; no tap requested.")
                time.sleep(0.1)  # Quiet prehistory; no sensor/config changes between trials.
                port.write(b"trial\n"); port.flush()
                deadline = time.monotonic() + 70
                trial_id = None
                while time.monotonic() < deadline:
                    message = read_message(port)
                    if not message:
                        continue
                    kind = message.get("type")
                    if kind == "bench_armed":
                        trial_id = message["trial_id"]
                        print(f"READY: ONE {args.level.upper()} tap, repeat {args.repeat}. Same {getattr(args, 'site', 'back')}-shell spot. Recording for 60 seconds.", flush=True)
                    elif kind == "bench_result" and message.get("trial_id") == trial_id:
                        record["result"] = message
                    elif kind == "bench_sample" and message.get("trial_id") == trial_id:
                        record["samples"].append(message)
                    elif kind == "bench_end" and message.get("trial_id") == trial_id:
                        record["end_received"] = True
                        break
                if not record["end_received"]:
                    port.write(b"trialcancel\n"); port.flush()
                    raise RuntimeError("Recording did not finish; attempt retained as incomplete.")
        except (Exception, KeyboardInterrupt) as error:
            record["error"] = str(error)
        record["finished_at"] = utc_now()
        record["validation_errors"] = validate_record(record)
        output.write(json.dumps(record, indent=2) + "\n")
    result = record.get("result") or {}
    # Hide magnitudes until all attempts finish, reducing feedback-driven taps.
    print(json.dumps({"saved": str(path), "recording_complete": not record["validation_errors"],
                      "problems": record["validation_errors"], "error": record.get("error")}), flush=True)
    return 0 if not record["validation_errors"] else 2


def stop(args, existing_port=None):
    import serial
    with (nullcontext(existing_port) if existing_port else serial.Serial(args.port, 115200, timeout=0.2)) as port:
        port.rts = False
        port.write(b"stop\n"); port.flush()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            message = read_message(port)
            if message and message.get("type") == "bench_status" and message.get("active") is False:
                print("Normal detection restored; bench test ended.", flush=True)
                return 0
    print("Normal-mode acknowledgement not received. Check USB/status.", flush=True)
    return 2


def settling_only_failure(record):
    errors = set(validate_record(record))
    return (not record.get("error") and record.get("end_received") is True and
            errors == {"incomplete acceleration capture", "resting baseline shifted or unverified"} and
            isinstance((record.get("result") or {}).get("rest_shift_g"), (int, float)) and
            record["result"]["rest_shift_g"] > 0.6)


def session(args):
    import serial
    directory = Path(args.directory)
    directory.mkdir(parents=True, exist_ok=True)
    site = getattr(args, "site", "back")
    continue_settling = getattr(args, "continue_settling", False)
    planned = [{"level": x, "repeat": n} for x, n in PLAN]
    completed = set()
    if getattr(args, "resume", False):
        saved_plan = json.loads((directory / "plan.json").read_text(encoding="utf-8"))
        if saved_plan.get("trials") != planned or saved_plan.get("site", "back") != site:
            raise ValueError("Resume plan/contact site differs. Existing attempts are unchanged.")
        previous = {}
        missing_seen = False
        for level, repeat in PLAN:
            path = directory / f"{level}-{repeat}.json"
            if not path.exists():
                missing_seen = True
                continue
            if missing_seen:
                raise ValueError("Resume requires a contiguous prefix of attempts; files are unchanged.")
            record = json.loads(path.read_text(encoding="utf-8"))
            if (record.get("level"), record.get("repeat")) != (level, repeat) or record.get("site", "back") != site:
                raise ValueError("Saved attempt label/contact differs. Existing files are unchanged.")
            completed.add((level, repeat))
            previous[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        with (directory / f"resume-{time.time_ns()}.json").open("x", encoding="utf-8") as event:
            event.write(json.dumps({"created_at": utc_now(), "site": site,
                "reason": "user requested full sequence and separate front sequence",
                "continue_settling_flags": continue_settling, "existing_attempt_sha256": previous,
                "baseline_note": "Bench entry establishes a fresh local baseline after this interruption; prior captures remain unchanged."}, indent=2) + "\n")
    else:
        with (directory / "plan.json").open("x", encoding="utf-8") as plan:
            plan.write(json.dumps({"created_at": utc_now(), "trials": planned,
                "primary": "raw peak_g", "support": "same table", "site": site,
                "continue_settling_flags": continue_settling,
                "contact": f"one marked {site}-shell spot"}, indent=2) + "\n")
    with serial.Serial(args.port, 115200, timeout=0.2) as port:
        port.rts = False
        try:
            for index, (level, repeat) in enumerate(PLAN, 1):
                if (level, repeat) in completed:
                    continue
                input(f"Trial {index}/9: {site.upper()} {level.upper()}. Hands off, helmet still. Press Enter when ready; no tap yet. ")
                trial_args = argparse.Namespace(port=args.port, directory=args.directory, level=level, repeat=repeat, site=site)
                if capture(trial_args, port):
                    saved = json.loads((directory / f"{level}-{repeat}.json").read_text(encoding="utf-8"))
                    if continue_settling and settling_only_failure(saved):
                        print("Settling flag retained. Continuing the requested sequence; this reading stays excluded from the primary comparison.", flush=True)
                        continue
                    print("Stopped at an incomplete recording. No extra tap requests.", flush=True)
                    break
        finally:
            normal_restored = stop(args, port) == 0
    records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(directory.glob("*-?.json"))]
    summary = analyze(records)
    summary["site"] = site
    summary["all_nine_attempts_recorded"] = len(records) == 9 and {(r.get("level"), r.get("repeat")) for r in records} == set(PLAN)
    summary["settling_flags_retained_and_sequence_continued"] = continue_settling
    summary["normal_detection_restore_acknowledged"] = normal_restored
    write_report(summary, directory)
    print(json.dumps(summary, indent=2), flush=True)
    return 0 if summary["all_nine_usable"] and normal_restored else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    record = sub.add_parser("capture")
    record.add_argument("--port", default="COM3")
    record.add_argument("--level", choices=LEVELS, required=True)
    record.add_argument("--repeat", type=int, choices=(1, 2, 3), required=True)
    record.add_argument("--directory", required=True)
    record.add_argument("--site", choices=("back", "front"), default="back")
    end = sub.add_parser("stop"); end.add_argument("--port", default="COM3")
    run = sub.add_parser("session")
    run.add_argument("--port", default="COM3"); run.add_argument("--directory", required=True)
    run.add_argument("--site", choices=("back", "front"), default="back")
    run.add_argument("--resume", action="store_true")
    run.add_argument("--continue-settling", action="store_true",
                     help="Keep settling-only flags and finish the requested sequence; quality rejection remains.")
    report = sub.add_parser("report"); report.add_argument("--directory", required=True)
    sub.add_parser("plan")
    args = parser.parse_args()
    if args.command == "capture": return capture(args)
    if args.command == "stop": return stop(args)
    if args.command == "session": return session(args)
    if args.command == "plan":
        print(json.dumps({"plan": [{"level": x, "repeat": n} for x, n in PLAN], "primary": "raw peak_g",
                          "scope": "fixed-site, self-labeled hand-tap repeatability"}, indent=2))
        return 0
    directory = Path(args.directory)
    records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(directory.glob("*-?.json"))]
    summary = analyze(records); write_report(summary, directory)
    print(json.dumps(summary, indent=2))
    return 0 if summary["all_nine_usable"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
