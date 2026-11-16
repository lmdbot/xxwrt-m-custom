/**
 * Render sparse REAL measurements over their observed interval. Selecting
 * 24 h / 7 d / 30 d still filters raw data; zooming the x axis never creates
 * synthetic samples or interpolates across long gaps.
 */
export function buildTrendChart(points=[],metric='cpu',range='h24') {
  const values=(Array.isArray(points)?points:[])
    .filter(x=>Number.isFinite(x?.time)&&Number.isFinite(x?.value))
    .slice().sort((a,b)=>a.time-b.time)
  const empty={points:[],segments:[],areaPaths:[],paths:[],minimum:null,maximum:null,
    average:null,firstTime:null,lastTime:null,flat:false,gaps:0}
  if(!values.length)return empty
  const width=360,height=220,left=42,right=345,top=26,bottom=171
  const firstTime=values[0].time,lastTime=values.at(-1).time
  const minimum=Math.min(...values.map(x=>x.value))
  const maximum=Math.max(...values.map(x=>x.value))
  const average=values.reduce((sum,p)=>sum+p.value,0)/values.length
  const flat=maximum-minimum<0.01
  const span=maximum-minimum
  const pad=flat?1:Math.max(span*0.18,metric==='load1'?0.05:0.5)
  // A constant series should remain visible in the middle, including 0%.
  const low=minimum-pad,high=maximum+pad
  const dots=values.map(p=>({
    time:p.time,value:p.value,
    x:values.length===1?(left+right)/2:
      left+(p.time-firstTime)/Math.max(1,lastTime-firstTime)*(right-left),
    y:top+(high-p.value)/Math.max(0.0001,high-low)*(bottom-top)
  }))
  // Typical bucket spacing depends on the user-selected history window.
  // Never bridge missing hours/days just because the dataset is sparse.
  const gapThreshold=range==='d30'?9*3600000:range==='d7'?2*3600000:25*60000
  const segments=[]
  let current=[]
  for(let i=0;i<dots.length;i++){
    if(i>0&&dots[i].time-dots[i-1].time>gapThreshold){
      if(current.length)segments.push(current)
      current=[]
    }
    current.push(dots[i])
  }
  if(current.length)segments.push(current)
  const paths=segments.filter(s=>s.length>=2).map(s=>
    s.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' '))
  const areaPaths=segments.filter(s=>s.length>=2).map(s=>
    'M'+s[0].x.toFixed(1)+' '+bottom+
    ' '+s.map(p=>'L'+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ')+
    ' L'+s.at(-1).x.toFixed(1)+' '+bottom+' Z')
  return {points:dots,segments,paths,areaPaths,minimum,maximum,average,
    firstTime,lastTime,flat,gaps:Math.max(0,segments.length-1),
    axisHigh:maximum,axisLow:minimum,width,height}
}
