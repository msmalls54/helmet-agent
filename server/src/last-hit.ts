import { z } from "zod";
import { widget, type MCPServer } from "mcp-use/server";
import { compactImpact } from "./impacts.js";
import type { Store, ImpactRow } from "./store.js";
import { TELEMETRY_NOTICE, INTERPRETATION_RULE } from "./telemetry.js";
import { defaultAlertConfig, type AlertConfig } from "./alert-loop.js";
import { helmetMap } from "./helmet-map.js";

export function lastHit(store: Store) {
  const row = store.db.prepare("SELECT * FROM impacts ORDER BY impact_id DESC LIMIT 1").get() as ImpactRow | undefined;
  return row ? compactImpact(row) : null;
}
export function lastHitReview(store: Store, impactId: number, config: AlertConfig = defaultAlertConfig) {
  const table=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='alert_jobs'").get();
  const row=table ? store.db.prepare("SELECT state,policy,detail FROM alert_jobs WHERE impact_id=?").get(impactId) as {state:string;policy:string|null;detail:string|null}|undefined : undefined;
  const legacy=!!row && !row.policy && row.state==="delivered";
  const title=legacy ? "Text delivered (earlier rules)" : row?.state==="observed" ? "Recorded · no automatic text" :
    row?.state==="delivered" ? "Text delivery reported" : row?.state==="review_pending" ? "Trainer message in progress" :
    row?.state==="suppressed" ? "Recorded · automatic text held" :
    row?.state==="skipped" ? "Recorded · automatic review skipped" :
    row?.state==="needs_attention" ? "Review needs attention · check details" :
    row?.state==="dry_run" ? "Dry run · no text sent" :
    config.mode==="off" ? "Automatic texts off" : "Recorded · review pending";
  return {state:row?.state??null,title,legacy_policy:legacy,mode:config.mode,rules:config.policy,
    assessment:row?.policy?JSON.parse(row.policy):null,
    detail:legacy?"This event was processed before the selective rules were enabled.":row?.detail??null};
}
export type LastHitReview=ReturnType<typeof lastHitReview>;
export function registerLastHit(server: MCPServer, store: Store, config: AlertConfig = defaultAlertConfig) {
  server.tool({ name: "show_last_hit", description: `Open the live helmet: latest reading, trainer-message status and a cumulative 60-minute helmet map. More or stronger readings darken the map; named directions add to their zone, undirected readings add across the whole helmet. Color is a visual summary of relative readings, not injury risk. Refreshes without sending texts. ${TELEMETRY_NOTICE} ${INTERPRETATION_RULE}`,
    schema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { name: "helmet", invoking: "Loading the last helmet hit…", invoked: "Last helmet hit shown" } },
    async () => {
      const hit = lastHit(store);
      const review=hit?lastHitReview(store,hit.impact_id,config):null;
      const row=hit?store.getImpact(hit.impact_id):null;
      const map=row?helmetMap(store,row.player,row.helmet_id):null;
      const direction = hit && ["front", "back", "left", "right", "top"].includes(hit.location)
        ? `, sensor direction: ${hit.location}` : "";
      const message = hit
        ? `${hit.player}: latest ${Number(hit.peak_g.toFixed(2))} g${direction}; ${map?.count??0} complete readings on the 60-minute map. Undirected readings shade the whole helmet. ${TELEMETRY_NOTICE}`
        : `No helmet impacts received yet. ${TELEMETRY_NOTICE}`;
      return widget({ props: { hit, review, map, notice: TELEMETRY_NOTICE, interpretation_rule: INTERPRETATION_RULE }, message });
    });
}
