/** Self-contained monitor page. Kept as a string so it bundles into server.mjs (no asset path at runtime). */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QMS Monitor</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1c2330;--mut:#667085;--line:#e4e7ec;--ok:#12805c;--warn:#b25e09;--crit:#c0262d;--info:#2563a8;--bar:#3b82f6;--bar2:#e11d48;--bar3:#f59e0b}
@media(prefers-color-scheme:dark){:root{--bg:#10141b;--card:#171c26;--fg:#e6e9ef;--mut:#8b94a7;--line:#262d3b;--ok:#3ecf9b;--warn:#f0a53c;--crit:#ff6b72;--info:#6aa9f0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
h1{font-size:17px;margin:0}main{padding:16px;max-width:1280px;margin:auto;display:grid;gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow:auto}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin:0 0 10px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.kpi b{display:block;font-size:22px}.kpi span{color:var(--mut);font-size:12px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--mut);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}td.w{white-space:normal;word-break:break-word;max-width:520px}
.ins{border-left:4px solid var(--line);padding:8px 12px;margin:0 0 8px;background:var(--bg);border-radius:0 6px 6px 0}
.ins.critical{border-color:var(--crit)}.ins.warning{border-color:var(--warn)}.ins.info{border-color:var(--info)}.ins.ok{border-color:var(--ok)}
.ins b{display:block}.ins small{color:var(--mut)}.ins .adv{margin-top:4px}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
select,input,button{font:inherit;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}
.bad{color:var(--crit)}.mut{color:var(--mut)}svg{width:100%;height:150px;display:block}
@media(max-width:560px){.two{grid-template-columns:1fr}}
</style></head><body>
<header><h1>QMS Monitor <span class="mut" id="meta"></span></h1>
<div>Window <select id="win"><option value="5">5 min</option><option value="15" selected>15 min</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option></select>
<span class="mut" id="stamp"></span></div></header>
<main id="app"><div class="card" id="auth" hidden><h2>Access token</h2><input id="tok" type="password" placeholder="MONITOR_TOKEN" size="36"> <button id="go">Connect</button><div class="bad" id="err"></div></div>
<div class="card"><h2>Diagnosis</h2><div id="insights" class="mut">Loading...</div></div>
<div class="card"><div class="kpis" id="kpis"></div></div>
<div class="card"><h2>Timeline (per minute): requests, p95 latency, pool queue</h2><svg id="chart" viewBox="0 0 800 150" preserveAspectRatio="none"></svg><div class="mut" id="legend"></div></div>
<div class="two"><div class="card"><h2>Slowest / heaviest routes</h2><div id="routes"></div></div><div class="card"><h2>Where traffic comes from</h2><div id="sources"></div></div></div>
<div class="two"><div class="card"><h2>Repeated polling (source to route)</h2><div id="pairs"></div></div><div class="card"><h2>Database queries</h2><div id="queries"></div></div></div>
<div class="two"><div class="card"><h2>Errors</h2><div id="errors"></div></div><div class="card"><h2>Browser vs server latency</h2><div id="client"></div></div></div>
<div class="card"><h2>Recent slow or failed requests</h2><div id="slow"></div></div>
<div class="card"><h2>Recent slow queries / DB errors</h2><div id="slowq"></div></div>
</main>
<script>
(function(){
var $=function(i){return document.getElementById(i)};
var token=sessionStorage.getItem('qmsMonitorToken')||new URLSearchParams(location.search).get('token')||'';
if(location.search.indexOf('token=')>=0)history.replaceState(null,'',location.pathname);
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function ms(n){n=+n||0;return n>=1000?(n/1000).toFixed(2)+'s':Math.round(n)+'ms'}
function api(p){return fetch(p,{headers:{Authorization:'Bearer '+token},cache:'no-store'}).then(function(r){if(r.status===401){return r.json().catch(function(){return {}}).then(function(j){var e=new Error('401');e.reason=(j.reason||'')+(j.build?' [server build '+j.build+', pid '+j.serverPid+']':'');throw e})}if(!r.ok)throw new Error(String(r.status));return r.json()})}
function table(cols,rows){if(!rows.length)return '<span class="mut">No data</span>';
 var h='<table><tr>'+cols.map(function(c){return '<th class="'+(c.n?'n':'')+'">'+esc(c.h)+'</th>'}).join('')+'</tr>';
 rows.forEach(function(r){h+='<tr>'+cols.map(function(c){var v=c.f(r);return '<td class="'+(c.n?'n ':'')+(c.w?'w':'')+'">'+(c.raw?v:esc(v))+'</td>'}).join('')+'</tr>'});return h+'</table>'}
function kpi(l,v,bad){return '<div class="kpi"><b class="'+(bad?'bad':'')+'">'+esc(v)+'</b><span>'+esc(l)+'</span></div>'}
function chart(tl){var svg=$('chart');if(!tl.length){svg.innerHTML='';return}
 var W=800,H=150,n=tl.length,bw=W/Math.max(n,1);
 var mx=Math.max.apply(null,tl.map(function(t){return t.n}).concat([1]));
 var mp=Math.max.apply(null,tl.map(function(t){return t.p95}).concat([100]));
 var mq=Math.max.apply(null,tl.map(function(t){return t.pendingMax}).concat([1]));
 var bars='',line='',q='';
 tl.forEach(function(t,i){var x=i*bw,h=t.n/mx*(H-10);bars+='<rect x="'+x.toFixed(1)+'" y="'+(H-h).toFixed(1)+'" width="'+Math.max(bw-1,1).toFixed(1)+'" height="'+h.toFixed(1)+'" fill="var(--bar)" opacity=".35"><title>'+new Date(t.t).toLocaleTimeString()+' n='+t.n+' err='+t.err+' p95='+Math.round(t.p95)+'ms pending='+t.pendingMax+' lag='+t.lagMax+'ms</title></rect>';
  line+=(i?'L':'M')+(x+bw/2).toFixed(1)+' '+(H-t.p95/mp*(H-10)).toFixed(1);
  if(t.pendingMax>0)q+='<rect x="'+x.toFixed(1)+'" y="0" width="'+Math.max(bw-1,1).toFixed(1)+'" height="'+(4+t.pendingMax/mq*14).toFixed(1)+'" fill="var(--bar2)"/>';
  if(t.err>0)q+='<rect x="'+x.toFixed(1)+'" y="'+(H-4)+'" width="'+Math.max(bw-1,1).toFixed(1)+'" height="4" fill="var(--bar3)"/>'});
 svg.innerHTML=bars+'<path d="'+line+'" fill="none" stroke="var(--bar)" stroke-width="2" vector-effect="non-scaling-stroke"/>'+q;
 $('legend').textContent='Bars: requests/min (max '+mx+'). Line: p95 latency (max '+ms(mp)+'). Red strip on top: requests were queued for a DB connection. Amber strip at bottom: 5xx errors.'}
function render(d,rec){
 var s=d.snapshot,t=s.totals,l=d.live,p=l.pool;
 $('meta').textContent='pid '+l.pid+(l.pm2!=null?' (pm2 '+l.pm2+')':'')+(l.workers&&l.workers.length>1?' / '+l.workers.length+' workers (pids '+l.workers.map(function(w){return w.pid}).join(', ')+')':'')+' / up '+Math.round(l.uptimeSec/60)+' min / node '+l.node;
 $('stamp').textContent=' updated '+new Date().toLocaleTimeString();
 $('insights').innerHTML=d.insights.map(function(i){return '<div class="ins '+i.severity+'"><b>'+esc(i.title)+'</b><span>'+esc(i.detail)+'</span>'+(i.advice?'<div class="adv"><small>Suggestion: '+esc(i.advice)+'</small></div>':'')+'</div>'}).join('')||'<span class="mut">No findings</span>';
 $('kpis').innerHTML=kpi('requests',t.count)+kpi('req/s',t.rps.toFixed(1))+kpi('p50',ms(t.p50))+kpi('p95',ms(t.p95),t.p95>1000)+kpi('p99',ms(t.p99),t.p99>3000)+kpi('avg DB time',ms(t.avgDbMs))+kpi('avg pool wait',ms(t.avgAcquireMs),t.avgAcquireMs>50)+kpi('5xx rate',(t.errorRate*100).toFixed(2)+'%',t.errorRate>0.01)+kpi('aborted',t.aborted)+kpi('in flight now',l.inflight)+kpi('pool now',p?(p.borrowed+'/'+p.max+' used, '+p.pending+' waiting'):'n/a',p&&p.pending>0)+kpi('event-loop lag max',ms(s.lag.maxMs),s.lag.maxMs>200);
 chart(s.timeline);
 $('routes').innerHTML=table([{h:'Route',f:function(r){return r.route},w:1},{h:'n',n:1,f:function(r){return r.n}},{h:'avg',n:1,f:function(r){return ms(r.avgMs)}},{h:'p95',n:1,f:function(r){return ms(r.p95)}},{h:'max',n:1,f:function(r){return ms(r.maxMs)}},{h:'avg DB',n:1,f:function(r){return ms(r.avgDbMs)}},{h:'5xx',n:1,f:function(r){return r.err}}],s.routes.slice(0,15));
 $('sources').innerHTML=table([{h:'Source (page@ip)',f:function(r){return r.source}},{h:'n',n:1,f:function(r){return r.n}},{h:'share',n:1,f:function(r){return (r.share*100).toFixed(1)+'%'}},{h:'avg',n:1,f:function(r){return ms(r.avgMs)}},{h:'5xx',n:1,f:function(r){return r.err}}],s.sources.slice(0,15));
 $('pairs').innerHTML=table([{h:'Source',f:function(r){return r.source}},{h:'Route',f:function(r){return r.route},w:1},{h:'/min',n:1,f:function(r){return r.perMin.toFixed(1)}}],s.pairs.slice(0,12));
 $('queries').innerHTML=table([{h:'Query shape',f:function(r){return r.shape},w:1},{h:'n',n:1,f:function(r){return r.n}},{h:'avg',n:1,f:function(r){return ms(r.avgMs)}},{h:'p95',n:1,f:function(r){return ms(r.p95)}},{h:'max',n:1,f:function(r){return ms(r.maxMs)}},{h:'err',n:1,f:function(r){return r.err}}],s.queries.slice(0,12));
 $('errors').innerHTML=table([{h:'Kind',f:function(r){return r.kind}},{h:'Code',f:function(r){return r.code}},{h:'Route',f:function(r){return r.route},w:1},{h:'n',n:1,f:function(r){return r.n}},{h:'idle drops',n:1,f:function(r){return r.idleDrops}},{h:'Last message',f:function(r){return r.msg},w:1}],s.errors.slice(0,12));
 $('client').innerHTML=table([{h:'Route',f:function(r){return r.route},w:1},{h:'n',n:1,f:function(r){return r.n}},{h:'browser p95',n:1,f:function(r){return ms(r.clientP95)}},{h:'server p95',n:1,f:function(r){return ms(r.serverP95)}},{h:'failed',n:1,f:function(r){return r.fail}}],s.client.slice(0,12));
 $('slow').innerHTML=table([{h:'Time',f:function(r){return new Date(r.t).toLocaleTimeString()}},{h:'Route',f:function(r){return r.route},w:1},{h:'Status',f:function(r){return r.aborted?'aborted':r.status}},{h:'Total',n:1,f:function(r){return ms(r.ms)}},{h:'DB',n:1,f:function(r){return ms(r.dbMs)}},{h:'Pool wait',n:1,f:function(r){return ms(r.acquireMs)}},{h:'Source',f:function(r){return r.source}}],rec.slowRequests.slice(0,20));
 $('slowq').innerHTML=table([{h:'Time',f:function(r){return new Date(r.t).toLocaleTimeString()}},{h:'Query',f:function(r){return r.shape},w:1},{h:'ms',n:1,f:function(r){return ms(r.ms)}},{h:'Route',f:function(r){return r.route},w:1},{h:'Error',f:function(r){return r.error||''},w:1}],rec.slowQueries.slice(0,15));
}
function tick(){
 $('auth').hidden=!!token&&!$('err').textContent;
 if(!token){$('auth').hidden=false;return}
 var w=$('win').value;
 Promise.all([api('/api/monitor/summary?window='+w),api('/api/monitor/recent')]).then(function(r){$('err').textContent='';$('auth').hidden=true;render(r[0],r[1])}).catch(function(e){
  if(e.message==='401'){sessionStorage.removeItem('qmsMonitorToken');token='';$('auth').hidden=false;$('err').textContent='Invalid token'+(e.reason?' - '+e.reason:'')}else{$('stamp').textContent=' cannot reach server ('+e.message+') - retrying'}})}
$('go').onclick=function(){token=$('tok').value.trim();sessionStorage.setItem('qmsMonitorToken',token);$('err').textContent='';tick()};
$('win').onchange=tick;
if(token)sessionStorage.setItem('qmsMonitorToken',token);
tick();setInterval(tick,5000);
})();
</script></body></html>`;
