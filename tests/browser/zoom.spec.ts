import { test, expect } from '@playwright/test';

test('a stationary wide viewport does not evict and reload visible finest-level tiles', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:3840,height:2160});
  const counts=new Map<string,number>();
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/data/tiles/'))counts.set(path,(counts.get(path)||0)+1);});
  await page.goto('/');
  await expect(page.getByRole('status',{name:'Map data status'})).toContainText('NASA MOLA');
  await expect.poll(()=>[...counts.keys()].filter(p=>p.startsWith('/data/tiles/4/')).length,{timeout:45000}).toBeGreaterThan(400);
  await expect.poll(()=>[...counts.keys()].filter(p=>p.startsWith('/data/tiles/4/')).length,{timeout:45000}).toBe(512);
  await page.waitForLoadState('networkidle');
  await page.getByRole('slider',{name:'Water elevation',exact:true}).fill('0');
  await page.waitForTimeout(500);
  const duplicates=[...counts.entries()].filter(([,count])=>count>1);
  console.log(JSON.stringify({unique:counts.size,requests:[...counts.values()].reduce((a,b)=>a+b,0),duplicates:duplicates.length,examples:duplicates.slice(0,5)}));
  await page.screenshot({path:'test-results/wide-zoom.png'});
  expect(duplicates, 'stationary visible tiles must remain resident, even when the visible set exceeds the idle cache budget').toEqual([]);
});

test('LOD boundaries, delayed tiles, longitude wrapping and GPU calls remain valid',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[], badResponses:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/data/')&&!response.ok())badResponses.push(response.url());});
  await page.addInitScript(()=>{
    const gpuErrors:number[]=[],lods:Record<string,number>={};let scale=0,tileLevel=0;
    (window as unknown as {lods:Record<string,number>}).lods=lods;
    (window as unknown as {gpuErrors:number[]}).gpuErrors=gpuErrors;
    const proto=WebGL2RenderingContext.prototype,draw=proto.drawArrays,u3=proto.uniform3f,u4=proto.uniform4f;
    proto.uniform3f=function(location,x,y,z){scale=z;u3.call(this,location,x,y,z);};
    proto.uniform4f=function(location,x,y,w,h){tileLevel=Math.round(Math.log2(1/w))-1;u4.call(this,location,x,y,w,h);};
    proto.drawArrays=function(...args:Parameters<WebGL2RenderingContext['drawArrays']>){
      draw.apply(this,args);lods[String(scale)]=Math.max(lods[String(scale)]??-1,tileLevel);const error=this.getError();if(error!==this.NO_ERROR)gpuErrors.push(error);
    };
  });
  // A child arriving after a zoom change must not disturb the current camera.
  await page.route('**/data/tiles/3/**',async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.continue();});
  const levels=new Set<number>();
  page.on('request',request=>{const match=new URL(request.url()).pathname.match(/^\/data\/tiles\/(\d+)\//);if(match)levels.add(Number(match[1]));});
  await page.setViewportSize({width:390,height:2160});await page.goto('/');
  await expect(page.getByRole('status',{name:'Map data status'})).toContainText('NASA MOLA');
  // Measure the canvas (layout margins differ on mobile), then fit immediately
  // below and above each actual world-width LOD boundary.
  for(const target of [359,361,719,721,1439,1441,2879,2881]){
    let width=target+(target<500?38:390);
    await page.setViewportSize({width,height:2160});await page.waitForTimeout(100);
    let rect=(await page.locator('canvas').boundingBox())!;
    width+=width-rect.width;
    await page.setViewportSize({width,height:2160});await page.waitForTimeout(100);
    rect=(await page.locator('canvas').boundingBox())!;
    const scale=Math.max(180,Math.min(rect.width-(rect.width>850?390:38),(rect.height-145)*2));
    expect(scale).toBe(target);
    await page.getByRole('button',{name:'Fit entire planet'}).click();
    const expected=Math.max(0,Math.min(4,Math.ceil(Math.log2(scale/360))));
    await expect.poll(()=>page.evaluate(s=>(window as unknown as {lods:Record<string,number>}).lods[String(s)],scale),{timeout:10000}).toBe(expected);
  }
  const canvas=page.locator('canvas');await canvas.focus();
  // Cross both longitude seams at a high zoom and continue rendering.
  for(let i=0;i<70;i++)await page.keyboard.press('ArrowRight');
  for(let i=0;i<70;i++)await page.keyboard.press('ArrowLeft');
  await page.getByRole('button',{name:'Zoom in'}).click();
  await page.getByRole('button',{name:'Zoom out'}).click();
  await page.getByRole('button',{name:'Fit entire planet'}).click();
  await page.waitForTimeout(1500);
  expect([...levels].sort()).toEqual([0,1,2,3,4]);
  expect(errors).toEqual([]);expect(badResponses).toEqual([]);
  expect(await page.evaluate(()=>(window as unknown as {gpuErrors:number[]}).gpuErrors)).toEqual([]);
});

test('a transient tile failure retries while the camera stays stationary',async({page})=>{
  test.setTimeout(30000);
  let attempts=0;
  await page.route('**/data/tiles/0/0/0.png',async route=>{
    attempts++;if(attempts===1)await route.fulfill({status:503,body:'Temporary failure'});else await route.continue();
  });
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect.poll(()=>attempts,{timeout:22000}).toBe(2);
  await expect(page.getByRole('status',{name:'Map data status'})).toContainText('NASA MOLA');
  await page.waitForTimeout(500);expect(attempts).toBe(2);
});
