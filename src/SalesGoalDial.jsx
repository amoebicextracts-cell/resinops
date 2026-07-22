import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { pipelineRevenue } from "./lib/revenue";

function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});}

// Business days (Mon-Fri) remaining in [today, end], inclusive of today if
// today is a business day.
function businessDaysRemaining(end){
  const today=new Date(); today.setHours(0,0,0,0);
  const endD=new Date(end+"T00:00:00");
  if(endD<today) return 0;
  let n=0;
  for(let d=new Date(today); d<=endD; d.setDate(d.getDate()+1)){
    const day=d.getDay();
    if(day!==0&&day!==6) n++;
  }
  return n;
}

export function activeGoal(goals){
  const today=new Date().toISOString().split("T")[0];
  const inPeriod=goals.filter(g=>g.periodStart<=today&&today<=g.periodEnd);
  if(!inPeriod.length) return null;
  return inPeriod.reduce((a,g)=>!a||new Date(g.createdAt||0)>new Date(a.createdAt||0)?g:a, null);
}

export default function SalesGoalDial({compact,refreshToken}){
  const [goals,setGoals]=useState([]);
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [g,o]=await Promise.all([db.sales_goals.list(),db.sales_orders.list()]);
        setGoals(g);
        setOrders(o);
      }catch(e){ console.error("SalesGoalDial load error:",e); }
      setLoading(false);
    }
    load();
  },[refreshToken]);

  if(loading) return null;
  const goal=activeGoal(goals);
  if(!goal){
    return(
      <div style={{background:"var(--surface-2)",border:"1px dashed var(--border-2)",borderRadius:10,padding:"14px 16px",marginBottom:16,fontSize:12,color:"var(--text-3)"}}>
        🎯 No active sales goal set for today's period — set one in Sales & Pre-Orders → Goals.
      </div>
    );
  }

  const {confirmedRevenue}=pipelineRevenue(orders);
  const goalAmount=parseFloat(goal.goalAmount)||0;
  const pctToGoal=goalAmount>0?Math.min(100,confirmedRevenue/goalAmount*100):0;
  const remaining=Math.max(0,goalAmount-confirmedRevenue);
  const bizDaysLeft=businessDaysRemaining(goal.periodEnd);
  const perDayNeeded=bizDaysLeft>0?remaining/bizDaysLeft:remaining;

  // Pace: compare % of goal achieved against % of period elapsed — ahead
  // or on pace is "good", moderately behind is "warning", well behind
  // (or past the deadline with money still owed) is "critical". Reuses
  // the same status-color convention (--accent-2/--amber/--danger) used
  // for margin/status pills everywhere else in the app.
  const totalDays=Math.max(1,Math.round((new Date(goal.periodEnd)-new Date(goal.periodStart))/86400000)+1);
  const elapsedDays=Math.max(0,Math.round((new Date()-new Date(goal.periodStart))/86400000));
  const pctElapsed=Math.min(100,elapsedDays/totalDays*100);
  const paceGap=pctToGoal-pctElapsed;
  const status = remaining<=0 ? "good" : paceGap>=-5 ? "good" : paceGap>=-20 ? "warn" : "bad";
  const statusColor = status==="good"?"var(--accent-2)":status==="warn"?"var(--amber)":"var(--danger)";
  const statusLabel = remaining<=0?"Goal hit":status==="good"?"On pace":status==="warn"?"Slightly behind":"Behind pace";

  return(
    <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:10,padding:compact?"14px 16px":"18px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>🎯 Sales Goal — {new Date(goal.periodStart+"T00:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})} to {new Date(goal.periodEnd+"T00:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}</div>
        <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:10,background:statusColor+"33",color:statusColor}}>{statusLabel}</span>
      </div>
      <div style={{height:10,background:"var(--surface-2)",borderRadius:5,overflow:"hidden",marginBottom:6}}>
        <div style={{width:pctToGoal+"%",height:"100%",background:statusColor,borderRadius:5,transition:"width 0.3s"}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-3)",marginBottom:compact?0:12}}>
        <span>{fmtC(confirmedRevenue)} of {fmtC(goalAmount)} ({pctToGoal.toFixed(0)}%)</span>
        <span>{remaining>0?fmtC(perDayNeeded)+"/business day to hit goal ("+bizDaysLeft+" left)":"Goal reached 🎉"}</span>
      </div>
    </div>
  );
}
