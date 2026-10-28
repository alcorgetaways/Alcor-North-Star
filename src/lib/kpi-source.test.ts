import {afterEach,describe,expect,it,vi} from 'vitest';
import {fetchSourceMonth} from './kpi-source.server';
const credentials={metricoolToken:'test-token',metricoolUser:'test-user',localoToken:'test-localo',localoOrg:'test-org'};
afterEach(()=>vi.unstubAllGlobals());
describe('Read-only source accounting',()=>{
  it('counts posts but never invents reach or unsupported metrics',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{id:'i1',network:'instagram',publicationDate:{dateTime:'2026-09-05T10:00:00'},metrics:{views:7}},{id:'i2',network:'instagram',publicationDate:{dateTime:'2026-09-12T10:00:00'},metrics:{views:3}},{id:'f1',network:'facebook',publicationDate:{dateTime:'2026-09-08T10:00:00'},metrics:{}}]})));
    const result=await fetchSourceMonth('metricool','profile','2026-09-01',credentials);
    expect(result.values['instagram.posts']).toBe(2);
    expect(result.values['instagram.content_views']).toBe(10);
    expect(result.values['facebook.content_views']).toBeUndefined();
    expect(result.values['instagram.reach']).toBeUndefined();
  });
  it('withholds a partial monthly page instead of returning a false total',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[],page:{nextCursor:'next-page'}})));
    await expect(fetchSourceMonth('metricool','profile','2026-09-01',credentials)).rejects.toThrow('partial page');
  });
  it('maps Localo chat-click and booking-click series to the new main KPI keys',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(_url: unknown, init?: { body?: string })=>{
      const body=JSON.parse(String(init?.body??'{}')) as {id?:number;method?:string;params?:{arguments?:{query?:string;variables?:{args?:{metrics?:string[]}}}}};
      if(body.method==='initialize')return Response.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2024-11-05'}},{headers:{'Mcp-Session-Id':'s1'}});
      if(body.method==='notifications/initialized')return new Response('',{status:202});
      if(body.method==='tools/list')return Response.json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'query',annotations:{readOnlyHint:true}}]}});
      if(body.method==='tools/call'){
        const q=String(body.params?.arguments?.query??'');const metrics=body.params?.arguments?.variables?.args?.metrics??[];
        let data:unknown={};
        if(q.includes('googleMetricSeries'))data={googleMetricSeries:[{date:'2026-09-01',value:metrics.includes('BUSINESS_CONVERSATIONS')?4:metrics.includes('BUSINESS_BOOKINGS')?2:1}]};
        else if(q.includes('latestPlaceSnapshot'))data={place:{latestPlaceSnapshot:{rating:4.5,reviewsCount:10}}};
        else if(q.includes('reviewsChart'))data={reviewsChart:[]};
        else if(q.includes('activePlaceKeywords'))data={place:{activePlaceKeywords:[]}};
        return Response.json({jsonrpc:'2.0',id:body.id,result:{content:[{type:'text',text:JSON.stringify({data})}]}});
      }
      throw new Error('unexpected '+String(body.method));
    }));
    const result=await fetchSourceMonth('localo','place-1','2026-09-01',credentials);
    expect(result.values['chat_clicks']).toBe(4);
    expect(result.values['booking_clicks']).toBe(2);
    expect(result.values['views']).toBe(1);
  });
});