import { useEffect, useRef, useState } from "react";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import type { exposureLoad } from "../../src/practice.js";

export const widgetMetadata: WidgetMetadata = {
  title: "Helmet Agent — practice review",
  description: "Sample practice: compare contact by player, drill and day.",
  exposeAsTool: false,
};
type Report = ReturnType<typeof exposureLoad>;
export function PracticePicture({ report, theme }: { report?: Report; theme?: "light" | "dark" }) {
  const [day,setDay]=useState("Thu"),[drill,setDrill]=useState("inside_run");
  const athlete=report?.players[0];
  const periods=(report?.periods??[]).filter(p=>p.day===day);
  const selected=periods.find(p=>p.drill===drill)??periods[0];
  const focus=report?.review_candidates.find(p=>p.period_id===selected?.id);
  const peer=report?.peer_comparisons.find(p=>p.period_id===selected?.id);
  const prior=(report?.periods??[]).filter(p=>p.drill===selected?.drill && p.session_type===selected?.session_type && p.starts_at<(selected?.starts_at??""));
  const priorCount=prior.reduce((n,p)=>n+p.usable_count,0),priorMinutes=prior.reduce((n,p)=>n+p.observed_minutes,0);
  const ownRatio=selected && priorCount>0 ? (selected.usable_count/selected.observed_minutes)/(priorCount/priorMinutes):null;
  const notable=!!focus||!!peer?.notable;
  const peerRows=selected ? [{player:athlete?.player??"—",position:athlete?.position,count:selected.usable_count,observed_minutes:selected.observed_minutes,impacts_per_10_minutes:selected.impacts_per_10_minutes},...(peer?.peers??[])]:[];
  const maxRate=Math.max(1,...peerRows.map(p=>p.impacts_per_10_minutes)),maxCount=Math.max(1,...periods.map(p=>p.usable_count));
  const labels:Record<string,string[]>={stretch:["Stretch"],position_warmup:["Position","warm-up"],walkthrough:["Walk-","through"],inside_run:["Inside","run"],unit:["Unit"],team:["Team"],scout:["Scout"],game:["Game"]};
  const key=(action:()=>void)=>(e:React.KeyboardEvent<SVGGElement>)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();action();}};
  const largest=report?.team_context?.largest_single_event;
  return <svg xmlns="http://www.w3.org/2000/svg" width="960" height="500" viewBox="0 0 960 500" role="group"
    className="practice-card" data-theme={theme} aria-label={report?.summary??"Sample practice loading"}
    style={{width:"100%",height:"auto",maxWidth:800,display:"block",margin:"0 auto",fontFamily:"Segoe UI, Arial, sans-serif"}}>
    <style>{`
      .practice-card{--surface:#e6e2db;--text:#1e2b35;--muted:#596773;--bar:#8599a6;--panel:#d7d8d2;--accent:#235d67;background:var(--surface)}
      .practice-card text{fill:var(--text)}.practice-card .muted{fill:var(--muted)}
      .practice-card .clickable{cursor:pointer}.practice-card .clickable:focus{outline:2px solid var(--accent);outline-offset:3px}
      .practice-card[data-theme="dark"]{--surface:#10271f;--text:#f1f3e8;--muted:#a5b7ac;--bar:#65816e;--panel:#1d382b;--accent:#b7cc8d}
      @media(prefers-color-scheme:dark){.practice-card:not([data-theme="light"]){--surface:#10271f;--text:#f1f3e8;--muted:#a5b7ac;--bar:#65816e;--panel:#1d382b;--accent:#b7cc8d}}
    `}</style>
    <rect x="28" y="18" width="190" height="25" rx="12" fill="#b87c242b"/>
    <text x="123" y="35" textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="1.2">SAMPLE PRACTICE</text>
    <text x="28" y="79" fontSize="34" fontWeight="700">{notable?`Review ${athlete?.player}`:athlete?.player??"Practice"} <tspan fontSize="23" className="muted">{athlete?.position??""} · {selected?.drill_label??"practice"}</tspan></text>
    <text x="29" y="103" className="muted" fontSize="13">{athlete?.practice_role??"Practice review"}{selected?.max_g!==null&&selected?.max_g!==undefined?` · period max ${selected.max_g} g`:""}</text>
    <text x="925" y="35" textAnchor="end" className="muted" fontSize="13">{largest?`Week's largest: ${largest.player} · ${largest.peak_g} g (${largest.session_type})`:"Practice week"}</text>
    {["Mon","Tue","Wed","Thu","Fri"].map((d,i)=><g key={d} className="clickable" role="button" tabIndex={0} aria-label={`Show ${d}`} aria-pressed={day===d} onClick={()=>setDay(d)} onKeyDown={key(()=>setDay(d))}>
      <rect x={28+i*64} y="120" width="56" height="27" rx="13" fill={day===d?"var(--text)":"var(--panel)"}/>
      <text x={56+i*64} y="138" textAnchor="middle" fontSize="13" fontWeight="700" style={{fill:day===d?"var(--surface)":"var(--muted)"}}>{d}</text>
    </g>)}
    <text x="28" y="179" fontSize="15" fontWeight="600" className="muted">{{Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday"}[day]} · choose a drill</text>
    <rect x="28" y="194" width="425" height="161" rx="14" fill="var(--panel)"/>
    {periods.map((p,i)=>{const x=43+i*(periods.length===1?60:57),height=p.usable_count/maxCount*83,active=p.id===selected?.id;return <g key={p.id} className="clickable" role="button" tabIndex={0} aria-label={`${p.drill_label}: ${p.usable_count} impacts in ${p.observed_minutes} minutes`} aria-pressed={active} onClick={()=>setDrill(p.drill)} onKeyDown={key(()=>setDrill(p.drill))}>
      <title>{p.drill_label}: {p.usable_count} recorded impacts / {p.observed_minutes} observed minutes</title>
      <rect x={x} y={306-Math.max(height,2)} width="35" height={Math.max(height,2)} rx="4" fill={active?(notable?"#E5484D":"var(--accent)"):"var(--bar)"}/>
      <text x={x+17.5} y={295-height} textAnchor="middle" fontSize="23" fontWeight="700">{p.usable_count}</text>
      <text x={x+17.5} y="325" textAnchor="middle" fontSize="13" className="muted">{(labels[p.drill]??[p.drill]).map((l,j)=><tspan key={l} x={x+17.5} dy={j?14:0}>{l}</tspan>)}</text>
    </g>;})}
    <text x="484" y="179" fontSize="15" fontWeight="600" className="muted">Same drill, same time</text>
    <rect x="480" y="194" width="450" height="161" rx="14" fill="var(--panel)"/>
    {peerRows.map((p,i)=><g key={p.player}>
      <text x="496" y={226+i*43} fontSize="17" fontWeight={i===0?"700":"400"}>{p.player}<tspan dx="6" fontSize="12" className="muted">{p.position}</tspan></text>
      <rect x="596" y={212+i*43} width={Math.max(2,p.impacts_per_10_minutes/maxRate*219)} height="18" rx="5" fill={i===0?(notable?"#E5484D":"var(--accent)"):"var(--bar)"}/>
      <text x="914" y={226+i*43} textAnchor="end" fontSize="14" fontWeight="700">{p.count} / {p.observed_minutes} min</text>
    </g>)}
    {peerRows.length<2&&<text x="496" y="280" fontSize="13" className="muted">No other players recorded in this period.</text>}
    <text x="28" y="396" fontSize="35" fontWeight="700">{ownRatio===null?"—":ownRatio.toFixed(2)+"×"}<tspan dx="10" fontSize="15" fontWeight="400" className="muted">earlier hit rate</tspan></text>
    <text x="29" y="418" fontSize="12" className="muted">{priorMinutes?`${selected?.usable_count??0} / ${selected?.observed_minutes??0} min now · ${priorCount} / ${priorMinutes} earlier min`:"No earlier complete period for this comparison"}</text>
    <text x="482" y="396" fontSize="35" fontWeight="700">{peer?.ratio_to_highest_peer===null||peer?.ratio_to_highest_peer===undefined?"—":peer.ratio_to_highest_peer.toFixed(2)+"×"}<tspan dx="10" fontSize="15" fontWeight="400" className="muted">highest other-player rate</tspan></text>
    <text x="484" y="418" fontSize="12" className="muted">{peer?.peer_count??0} other players · different playing roles</text>
    <text x="29" y="449" fontSize="19" fontWeight="700">{notable?`Trainer: check ${athlete?.player}. Coach: review ${selected?.drill_label.toLowerCase()}.`:"No pattern flagged in this period."}</text>
    <text x="29" y="471" fontSize="12" className="muted">Select a day and drill to compare contact. This view sends no texts.</text>
  </svg>;
}
export default function PracticeWidget(){
  const {props,theme,callTool,isAvailable}=useWidget<{report:Report}>();
  const [loaded,setLoaded]=useState<Report>(),[failed,setFailed]=useState(false);
  const action=useRef(callTool);action.current=callTool;
  useEffect(()=>{
    if(!isAvailable || props.report)return;
    let disposed=false;
    void action.current("show_practice_week",{player:"#72"}).then(result=>{
      if(result.isError || !result.structuredContent?.report)throw new Error("No practice data");
      if(!disposed)setLoaded(result.structuredContent.report as Report);
    }).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;};
  },[isAvailable,!!props.report]);
  return <McpUseProvider autoSize>{failed&&!props.report&&!loaded
    ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 140" role="img" aria-label="Practice data could not load. Run show_practice_week in Tools."><text x="24" y="50" fill="#b45b36">Practice data could not load.</text><text x="24" y="84" fill="#778899">Open Tools → show_practice_week → Execute.</text></svg>
    : <PracticePicture report={props.report??loaded} theme={theme}/>}</McpUseProvider>;
}
