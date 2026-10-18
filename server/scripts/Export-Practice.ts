// Reviewable data export only. Does not open SQLite or contact a messaging API.
import { writeFileSync } from "node:fs";
import { simulatedPracticeWeek, DEMO_LABEL, FOOTBALL_SOURCES } from "../src/practice-data.js";
const week = simulatedPracticeWeek();
const path = "../evidence/simulated-practice-week.json";
writeFileSync(path, JSON.stringify({ label: DEMO_LABEL, simulated: true,
  generated_at: new Date().toISOString(), calendar_time_zone: "America/Los_Angeles",
  construction: "Authored fictional high-school practice scenario informed by published football exposure research. Not a fitted population model, clinical simulator, or real athlete record.",
  medical_history_scope: "Invented staff-record examples, deliberately including 0, 4 and 5 reported concussions. Not representative prevalence. Trainer context only; no injury score or clearance.",
  sources: FOOTBALL_SOURCES, ...week }, null, 2) + "\n");
console.log(JSON.stringify({ exported: path, fictional_players: week.players.length, observed_periods: week.periods.length, fictional_impacts: week.hits.length, database_writes: 0, messages_sent: 0 }));
