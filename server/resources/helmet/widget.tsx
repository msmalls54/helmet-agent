import { useEffect, useId, useRef, useState } from "react";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import type { LastHitReview } from "../../src/last-hit.js";
import type { HelmetMap, HelmetZone } from "../../src/helmet-map.js";

export const widgetMetadata: WidgetMetadata = {
  title: "Helmet Agent — last hit",
  description: "Live helmet readings and a rolling 60-minute impact map.",
  exposeAsTool: false,
};
interface Hit {
  impact_id: number; player: string; peak_g: number; location: string;
  location_validated: boolean; received_at: string;
  quality: { fifo_samples: number; gyro_window_complete: boolean; accel_clipped: boolean; gyro_clipped: boolean; accel_window_left_censored?: boolean };
}
interface Props { hit: Hit | null; notice: string; review?: LastHitReview | null; map?: HelmetMap | null }

export function HelmetPicture({ hit, theme, review, map, refreshError }: { hit: Hit | null; theme?: "light" | "dark"; review?: LastHitReview | null; map?: HelmetMap | null; refreshError?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const detectedSide = hit && ["front", "back", "left", "right", "top"].includes(hit.location) ? hit.location : null;
  const time = hit ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(new Date(hit.received_at)) : null;
  const cardHeight = 380;
  const qualityWarning = hit && (hit.quality.fifo_samples !== 32 || !hit.quality.gyro_window_complete || hit.quality.accel_clipped || hit.quality.gyro_clipped || hit.quality.accel_window_left_censored);
  const weight = (name: HelmetZone) => map?.zone_weights[name] ?? 0;
  // A fixed visual scale darkens monotonically as readings accumulate. It is not a medical scale.
  const zoneStyle = (name: HelmetZone) => ({ fill: `color-mix(in srgb, #E5484D ${(100*(1-Math.exp(-weight(name)/4))).toFixed(2)}%, var(--zone))` });
  const outline = "M482 75Q555 48 628 75C656 104 671 148 666 198C659 265 615 310 555 327C495 310 451 265 444 198C439 148 454 104 482 75Z";

  // Intrinsic dimensions let the host size its iframe without viewport units.
  return <svg xmlns="http://www.w3.org/2000/svg" width="760" height={cardHeight} viewBox={`0 0 760 ${cardHeight}`} role="img"
    className="helmet-telemetry-card"
    data-theme={theme}
    aria-label={hit ? `${hit.player}. Latest ${hit.peak_g.toFixed(2)} g relative helmet reading. ${time}. ${map?.count??0} complete readings in the last 60 minutes. Undirected hits shade the whole helmet.${detectedSide ? ` Latest sensor direction: ${detectedSide.toUpperCase()}.` : ""}${review ? ` ${review.title}.` : ""}` : "Helmet Agent. Waiting for a hit."}
    style={{ width: "100%", height: "auto", maxWidth: 720, display: "block", margin: "0 auto", fontFamily: "Segoe UI, Arial, sans-serif" }}>
    <style>{`
      .helmet-telemetry-card { --surface: #e6e2db; --text: #1e2b35; --muted: #596773; --zone: #f7f7f2; --divider: #c9d2cc; --edge: #8f9da7; background: var(--surface); }
      .helmet-telemetry-card .helmet-text { fill: var(--text); }
      .helmet-telemetry-card .helmet-muted { fill: var(--muted); }
      .helmet-telemetry-card .helmet-zone { fill: var(--zone); transition: fill .5s ease; }
      .helmet-telemetry-card[data-theme="dark"] { --surface: #10271f; --text: #f1f3e8; --muted: #a5b7ac; --zone: #f7f7f2; --divider: #c9d2cc; --edge: #d2dbd5; }
      @media (prefers-color-scheme: dark) {
        .helmet-telemetry-card:not([data-theme="light"]) { --surface: #10271f; --text: #f1f3e8; --muted: #a5b7ac; --zone: #f7f7f2; --divider: #c9d2cc; --edge: #d2dbd5; }
      }
      @media (prefers-reduced-motion: reduce) {
        .helmet-telemetry-card .helmet-zone { transition: none; }
      }
    `}</style>
    <defs><clipPath id={`${uid}-helmet`}><path d={outline} transform="translate(555 195) scale(.9) translate(-555 -195)" /></clipPath></defs>

    <text x="33" y="30" className="helmet-muted" fontSize="13" fontWeight="600">Live helmet · rolling 60 minutes</text>
    <text x="32" y="77" className="helmet-text" fontSize="40" fontWeight="700">{hit?.player ?? "Helmet Agent"}</text>
    {time && <text x="728" y="43" textAnchor="end" className="helmet-muted" fontSize="17">{time}</text>}
    <text x="29" y="181" className="helmet-text" fontSize="94" fontWeight="700" letterSpacing="-4">
      {hit ? hit.peak_g.toFixed(2) : "—"}<tspan fontSize="40" fontWeight="400" letterSpacing="0"> g</tspan>
    </text>
    <text x="33" y="213" className="helmet-muted" fontSize="19">latest relative helmet reading</text>
    {!hit && <text x="32" y="270" className="helmet-text" fontSize="23" fontWeight="600">Waiting for a hit</text>}

    <g data-direction-diagram="true" data-direction-basis="cumulative-recordings" transform="translate(139 32) scale(.75)">
    <title>{`${map?.count??0} complete readings, including ${map?.undirected_count??0} without direction. Each undirected reading shades all zones but counts once. Rolling window by server arrival time; older readings fade out. This is a fixed visual scale, not injury risk.`}</title>
    <path d={outline} fill="var(--zone)" stroke="var(--edge)" strokeWidth="1.5" />
    <g clipPath={`url(#${uid}-helmet)`}>
      <path data-side="front" className="helmet-zone" style={zoneStyle("front")} d="M555 195L420 40H690Z" />
      <path data-side="right" className="helmet-zone" style={zoneStyle("right")} d="M555 195L690 40V350Z" />
      <path data-side="back" className="helmet-zone" style={zoneStyle("back")} d="M555 195L690 350H420Z" />
      <path data-side="left" className="helmet-zone" style={zoneStyle("left")} d="M555 195L420 350V40Z" />
      <path d="M420 40L690 350M690 40L420 350" fill="none" stroke="var(--divider)" strokeWidth="2" />
      <circle data-side="top" className="helmet-zone" style={zoneStyle("top")} cx="555" cy="195" r="42" stroke="var(--divider)" strokeWidth="2" />
    </g>
    <path d={outline} fill="none" stroke="var(--edge)" strokeWidth="1.5" />
    <path d="M475 88L468 70Q555 34 642 70L635 88" fill="none" stroke="var(--edge)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M483 79Q555 54 627 79" fill="none" stroke="var(--divider)" strokeWidth="4" />
    <path d="M548 39L555 32L562 39" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <text x="555" y="21" textAnchor="middle" className="helmet-muted" fontSize="12" fontWeight="600" letterSpacing="1.5">FRONT</text>
    <text x="555" y="366" textAnchor="middle" className="helmet-text" fontSize="21" fontWeight="600">{map?.count??0} hits · last 60 min</text>
    </g>
    <text x="555" y="330" textAnchor="middle" className="helmet-muted" fontSize="12">More red = more or stronger readings</text>
    <text x="555" y="347" textAnchor="middle" className="helmet-muted" fontSize="11">Undirected hits shade the whole helmet</text>

    {review&&<g><title>{review.detail??review.assessment?.summary??review.title}</title>
      <text x="32" y="263" className="helmet-text" fontSize="22" fontWeight="700">{review.title}</text>
      <text x="33" y="287" className="helmet-muted" fontSize="13">Text after one reading ≥{review.rules.singleG} g</text>
      <text x="33" y="307" className="helmet-muted" fontSize="13">or {review.rules.clusterCount} hits ≥{review.rules.clusterMinG} g in {review.rules.clusterWindowMs/1000} seconds</text>
    </g>}
    {qualityWarning && <text x="32" y="338" fill="#ad661e" fontSize="12" fontWeight="600">Capture quality warning · inspect hit details</text>}
    {!qualityWarning && !!map?.excluded_count && <text x="32" y="338" className="helmet-muted" fontSize="11">{map.excluded_count} captures excluded · incomplete, clipped or test data</text>}
    {refreshError && <text x="32" y="351" fill="#ad661e" fontSize="11">Refresh paused · showing saved readings</text>}
  </svg>;
}

export default function HelmetWidget() {
  const { props, theme, callTool, isAvailable } = useWidget<Props>();
  const [fresh,setFresh] = useState<Props|null>(null), [refreshError,setRefreshError] = useState(false);
  const action = useRef(callTool); action.current = callTool;
  useEffect(()=>{
    if(!isAvailable)return;
    let disposed=false,busy=false;
    const refresh=async()=>{
      if(busy || document.hidden)return;
      busy=true;
      try {
        const result=await action.current("show_last_hit",{});
        if(result.isError || !result.structuredContent || !("hit" in result.structuredContent))throw new Error("No readings");
        if(!disposed){setFresh(result.structuredContent as unknown as Props);setRefreshError(false);}
      } catch { if(!disposed)setRefreshError(true); } finally {busy=false;}
    };
    void refresh(); const timer=setInterval(()=>void refresh(),10000);
    return()=>{disposed=true;clearInterval(timer);};
  },[isAvailable]);
  const view=fresh??props;
  return <McpUseProvider autoSize><HelmetPicture hit={view.hit ?? null} review={view.review} map={view.map} theme={theme} refreshError={refreshError}/></McpUseProvider>;
}
