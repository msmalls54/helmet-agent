import copy
import argparse
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from tap_comparison import analyze, validate_record, capture, session, settling_only_failure, write_report, PLAN


def trial(level, repeat, g, trial_id):
    points = []
    for i in range(64):
        points.append({"type": "bench_sample", "trial_id": trial_id, "index": i,
                       "relative_us": (i - 16) * 1250, "ax": g if 16 <= i < 24 else 0, "ay": 0, "az": 0})
    return {"session": "software_test_only", "level": level, "repeat": repeat, "end_received": True,
            "result": {"trial_id": trial_id, "detected": True, "complete": True,
                       "peak_g": g, "peak_5ms_g": g, "span_above_2g_ms": 10,
                       "time_above_2g_ms": 10, "accel_area_g_ms": g * 10,
                       "samples": len(points), "sample_period_us": 1250, "accel_hz": 800, "i2c_hz": 400000, "rest_shift_g": 0,
                       "accel_clipped": False, "fifo_overrun": False, "i2c_gap": False,
                       "left_censored": False, "right_censored": False, "capture_limited": False, "timed_out": False},
            "samples": points}


def dataset():
    return [trial(level, repeat, {"light": 4, "medium": 8, "firm": 12}[level] + repeat / 10, i + 1)
            for i, (level, repeat) in enumerate(PLAN)]


class ComparisonTests(unittest.TestCase):
    def test_cancelled_capture_does_not_invent_hardware_faults(self):
        record = {"level": "light", "repeat": 2, "result": None, "samples": [], "end_received": False}
        self.assertEqual(validate_record(record), ["no device result; recording interrupted or cancelled"])

    def test_front_and_back_are_never_pooled(self):
        records = dataset(); records[0]["site"] = "front"
        result = analyze(records)
        self.assertFalse(result["all_nine_usable"])
        self.assertTrue(any("contact sites" in p for p in result["problems"]))

    def test_report_escapes_invalid_serial_labels_and_values(self):
        record = trial("light", 1, 4.1, 1)
        record["level"] = '<img src=x onerror="alert(1)">'
        record["repeat"] = "<script>alert(1)</script>"
        record["result"]["peak_g"] = "<script>alert(2)</script>"
        with tempfile.TemporaryDirectory() as path:
            write_report(analyze([record]), Path(path))
            page = (Path(path) / "comparison.html").read_text(encoding="utf-8")
            self.assertNotIn("<script>", page)
            self.assertNotIn("<img", page)
            self.assertIn("Comparison incomplete", page)

    def test_increasing_raw_medians(self):
        result = analyze(dataset())
        self.assertTrue(result["all_nine_usable"])
        self.assertTrue(result["group_medians_increase"])
        self.assertTrue(result["groups_do_not_overlap"])

    def test_wrong_order_cannot_be_rescued_by_secondary_metric(self):
        records = dataset()
        for r in records:
            if r["level"] == "firm":
                r["result"]["peak_g"] = 3
                for point in r["samples"]:
                    if point["ax"]: point["ax"] = 3
                r["result"]["peak_5ms_g"] = 90  # Never substituted for primary.
        result = analyze(records)
        self.assertFalse(result["group_medians_increase"])
        self.assertEqual(result["verdict"], "medians_do_not_increase")

    def test_missing_trial_is_incomplete(self):
        result = analyze(dataset()[:-1])
        self.assertFalse(result["all_nine_usable"])
        self.assertEqual(result["verdict"], "incomplete")

    def test_invalid_trial_is_retained_not_dropped_to_get_pass(self):
        records = dataset(); records[0]["result"]["fifo_overrun"] = True
        result = analyze(records)
        self.assertEqual(len(result["attempts"]), 9)
        self.assertFalse(result["all_nine_usable"])
        self.assertFalse(result["group_medians_increase"])

    def test_missing_waveform_rejected(self):
        r = dataset()[0]; r["samples"].pop()
        self.assertIn("missing waveform samples", validate_record(r))

    def test_peak_must_match_the_waveform(self):
        r = dataset()[0]; r["result"]["peak_g"] = 99
        self.assertIn("reported peak does not match waveform", validate_record(r))

    def test_repeated_trial_identity_is_rejected(self):
        records = dataset(); records[1]["result"]["trial_id"] = records[0]["result"]["trial_id"]
        self.assertTrue(any("reused device" in x for x in analyze(records)["problems"]))

    def test_duplicate_label_cannot_replace_a_missing_attempt(self):
        records = dataset(); records[1] = copy.deepcopy(records[0])
        self.assertFalse(analyze(records)["all_nine_usable"])

    def test_no_detected_pulse_is_not_a_zero_strength_success(self):
        r = dataset()[0]; r["result"]["detected"] = False
        self.assertIn("no settled pulse detected above 2 g", validate_record(r))
        report = analyze([r])
        self.assertIsNone(report["attempts"][0]["peak_g"])
        self.assertIsNone(report["attempts"][0]["gyro_peak_dps"])

    def test_wrong_settings_are_not_compared(self):
        r = dataset()[0]; r["result"]["accel_hz"] = 1600
        self.assertIn("unexpected acquisition settings", validate_record(r))

    def test_shifted_resting_pose_is_not_silently_compared(self):
        r = dataset()[0]; r["result"]["rest_shift_g"] = 0.8
        self.assertIn("resting baseline shifted or unverified", validate_record(r))

    def test_missing_end_marker_rejected(self):
        r = dataset()[0]; r["end_received"] = False
        self.assertIn("missing end marker", validate_record(r))

    def test_overlap_is_reported_even_when_medians_increase(self):
        records = dataset()
        r = records[0]; r["result"]["peak_g"] = 9
        for point in r["samples"]:
            if point["ax"]: point["ax"] = 9
        result = analyze(records)
        self.assertTrue(result["group_medians_increase"])
        self.assertFalse(result["groups_do_not_overlap"])


class FakePort:
    def __init__(self, messages):
        self.lines = [json.dumps(m).encode() + b"\n" for m in messages]
        self.writes = []
    def write(self, data): self.writes.append(data)
    def flush(self): pass
    def readline(self): return self.lines.pop(0) if self.lines else b""
    def __enter__(self): return self
    def __exit__(self, *args): pass


class SerialProtocolTests(unittest.TestCase):
    @staticmethod
    def save_planned(args, port):
        record = next(r for r in dataset() if r["level"] == args.level and r["repeat"] == args.repeat)
        record["site"] = args.site
        (Path(args.directory) / f"{args.level}-{args.repeat}.json").write_text(json.dumps(record))
        return 0

    def test_resume_skips_and_preserves_all_previous_attempts_including_rejected(self):
        with tempfile.TemporaryDirectory() as path:
            directory = Path(path)
            (directory / "plan.json").write_text(json.dumps({"trials": [{"level": x, "repeat": n} for x, n in PLAN]}))
            old = {}
            for index, record in enumerate(dataset()[:4]):
                if index == 3:
                    record["result"].update({"complete": False, "rest_shift_g": 0.8})
                target = directory / f"{record['level']}-{record['repeat']}.json"
                target.write_text(json.dumps(record)); old[target] = target.read_bytes()
            with patch("serial.Serial", return_value=FakePort([])), patch("builtins.input", return_value=""), \
                    patch("tap_comparison.capture", side_effect=self.save_planned) as recorder, \
                    patch("tap_comparison.stop", return_value=0), redirect_stdout(io.StringIO()):
                status = session(argparse.Namespace(directory=path, port="FAKE", site="back", resume=True, continue_settling=True))
            self.assertEqual(status, 2)  # All attempts, but quality rejection remains.
            self.assertEqual(recorder.call_count, 5)
            self.assertEqual((recorder.call_args_list[0].args[0].level, recorder.call_args_list[0].args[0].repeat), ("light", 2))
            self.assertTrue(all(target.read_bytes() == content for target, content in old.items()))
            self.assertTrue(json.loads((directory / "comparison.json").read_text())["all_nine_attempts_recorded"])
            self.assertEqual(len(list(directory.glob("resume-*.json"))), 1)

    def test_new_front_session_labels_every_trial_and_plan(self):
        with tempfile.TemporaryDirectory() as path, patch("serial.Serial", return_value=FakePort([])), \
                patch("builtins.input", return_value=""), patch("tap_comparison.capture", side_effect=self.save_planned), \
                patch("tap_comparison.stop", return_value=0), redirect_stdout(io.StringIO()):
            self.assertEqual(session(argparse.Namespace(directory=path, port="FAKE", site="front", resume=False, continue_settling=True)), 0)
            self.assertEqual(json.loads((Path(path) / "plan.json").read_text())["site"], "front")
            self.assertTrue(all(json.loads(p.read_text())["site"] == "front" for p in Path(path).glob("*-?.json")))

    def test_requested_sequence_continues_settling_flag_without_turning_it_into_a_pass(self):
        def flagged_capture(args, port):
            self.save_planned(args, port)
            if (args.level, args.repeat) == ("firm", 1):
                target = Path(args.directory) / "firm-1.json"
                record = json.loads(target.read_text())
                record["result"].update({"complete": False, "rest_shift_g": 0.8})
                target.write_text(json.dumps(record)); return 2
            return 0
        with tempfile.TemporaryDirectory() as path, patch("serial.Serial", return_value=FakePort([])), \
                patch("builtins.input", return_value=""), patch("tap_comparison.capture", side_effect=flagged_capture) as recorder, \
                patch("tap_comparison.stop", return_value=0), redirect_stdout(io.StringIO()):
            self.assertEqual(session(argparse.Namespace(directory=path, port="FAKE", site="back", continue_settling=True)), 2)
            report = json.loads((Path(path) / "comparison.json").read_text())
            self.assertEqual(recorder.call_count, 9)
            self.assertTrue(report["all_nine_attempts_recorded"])
            self.assertFalse(report["all_nine_usable"])

    def test_continuation_does_not_apply_to_clipping_or_data_faults(self):
        record = trial("firm", 1, 12, 1)
        record["result"].update({"complete": False, "rest_shift_g": 0.8})
        self.assertTrue(settling_only_failure(record))
        record["result"]["accel_clipped"] = True
        self.assertFalse(settling_only_failure(record))
        record["result"]["accel_clipped"] = False
        record["result"]["i2c_gap"] = True
        self.assertFalse(settling_only_failure(record))

    def test_session_cannot_succeed_without_normal_restore_acknowledgement(self):
        def saved_capture(args, port):
            record = next(r for r in dataset() if r["level"] == args.level and r["repeat"] == args.repeat)
            (Path(args.directory) / f"{args.level}-{args.repeat}.json").write_text(json.dumps(record))
            return 0
        with tempfile.TemporaryDirectory() as path, patch("serial.Serial", return_value=FakePort([])), \
                patch("builtins.input", return_value=""), patch("tap_comparison.capture", side_effect=saved_capture), \
                patch("tap_comparison.stop", return_value=2) as cleanup, redirect_stdout(io.StringIO()):
            self.assertEqual(session(argparse.Namespace(directory=path, port="FAKE")), 2)
            report = json.loads((Path(path) / "comparison.json").read_text())
            self.assertTrue(report["all_nine_usable"])
            self.assertFalse(report["normal_detection_restore_acknowledged"])
            cleanup.assert_called_once()

    def test_complete_serial_waveform_is_saved_and_values_stay_hidden(self):
        record = trial("light", 1, 4.1, 1)
        messages = [{"type": "bench_status", "active": True}, {"type": "bench_armed", "trial_id": 1},
                    {"type": "bench_result", **record["result"]}, *record["samples"], {"type": "bench_end", "trial_id": 1}]
        port = FakePort(messages)
        with tempfile.TemporaryDirectory() as path, patch("tap_comparison.time.sleep"), redirect_stdout(io.StringIO()) as output:
            args = argparse.Namespace(directory=path, port="FAKE", level="light", repeat=1)
            self.assertEqual(capture(args, port), 0)
            saved = json.loads((Path(path) / "light-1.json").read_text())
            self.assertEqual(saved["result"]["peak_g"], 4.1)
            self.assertEqual(len(saved["samples"]), 64)
            self.assertNotIn('"peak_g"', output.getvalue())
            self.assertEqual(port.writes, [b"bench\n", b"trial\n"])
            self.assertEqual(saved["validation_errors"], [])

    def test_existing_attempt_is_never_overwritten_or_armed_again(self):
        port = FakePort([])
        with tempfile.TemporaryDirectory() as path:
            target = Path(path) / "light-1.json"; target.write_text('{"original":true}')
            args = argparse.Namespace(directory=path, port="FAKE", level="light", repeat=1)
            with self.assertRaises(FileExistsError): capture(args, port)
            self.assertEqual(target.read_text(), '{"original":true}')
            self.assertEqual(port.writes, [])

    def test_rejected_bench_start_saves_failure_without_requesting_tap(self):
        port = FakePort([{"type": "bench_status", "active": False}])
        with tempfile.TemporaryDirectory() as path, redirect_stdout(io.StringIO()) as output:
            args = argparse.Namespace(directory=path, port="FAKE", level="light", repeat=1)
            self.assertEqual(capture(args, port), 2)
            self.assertNotIn("READY:", output.getvalue())
            self.assertEqual(port.writes, [b"bench\n"])
            self.assertTrue((Path(path) / "light-1.json").exists())


if __name__ == "__main__":
    unittest.main()
