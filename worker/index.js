// Cloudflare Workers + one SQLite-backed Durable Object.
// A single globally coordinated cache ensures at most one upstream attempt every 60 seconds.
const SOURCE = 'https://nerkh.jahankhahan.shop/data/live.json';
const CORS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Accept',
  'Access-Control-Max-Age':'86400',
  'X-Content-Type-Options':'nosniff'
};
function json(body,status=200,headers={}) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=10',...CORS,...headers}
  });
}
export default {
  async fetch(request, env) {
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
    const u = new URL(request.url);
    if(request.method!=='GET'||u.pathname!=='/api/dollar')return json({error:'not_found'},404);
    const object = env.DOLLAR.get(env.DOLLAR.idFromName('tehran-free-market-usd'));
    const result = await object.fetch('https://internal/rate');
    return new Response(result.body,{status:result.status,headers:{...Object.fromEntries(result.headers),...CORS}});
  }
};
export class DollarCache {
  constructor(ctx,env) {this.ctx=ctx;this.env=env;this.pending=null;}
  async fetch(){
    let cached = await this.ctx.storage.get('cached');
    if(!cached||Date.now()-cached.last_attempt_at>=60000){
      if(!this.pending)this.pending=this.refresh(cached).finally(()=>{this.pending=null});
      cached=await this.pending;
    }
    if(!cached||!cached.price_irr)
      return json({error:'source_unavailable',message:'No verified price available yet'},503,{'Cache-Control':'no-store'});
    const {last_attempt_at,...publicData}=cached;
    return json({...publicData,stale:!!publicData.stale||!publicData.market_time||(Date.now()-Date.parse(publicData.fetched_at)>180000)});
  }
  async refresh(old){
    const now=Date.now();
    try {
      const response=await fetch(SOURCE,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      const toman=Number(data?.rates?.dollar);
      if(!Number.isSafeInteger(toman)||toman<1000||toman>1000000000)
        throw new Error('Invalid dollar rate');
      const record={
        price_irr:toman*10,price_toman:toman,unit:'IRR',
        source:'nerkhsanj',market_date:String(data.date||''),
        market_time:String(data.time||''),fetched_at:new Date(now).toISOString(),
        last_attempt_at:now,stale:false
      };
      await this.ctx.storage.put('cached',record);
      return record;
    } catch(e){
      // Keep the last *verified* value, but clearly mark it as stale.
      const record={...(old||{}),last_attempt_at:now,stale:true};
      await this.ctx.storage.put('cached',record);
      return record;
    }
  }
}