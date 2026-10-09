import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync('public/data/manifest.json','utf8'));
async function slider(page: import('@playwright/test').Page,name:string,value:number){
  await page.getByRole('slider',{name,exact:true}).fill(String(value));
}
test('GPU map, scenario controls, numeric inspection, reset and error-free navigation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.getByTestId('ocean-coverage')).toHaveText(`${manifest.defaultCoverage.toFixed(2)}%`);
  await expect(page.getByRole('status',{name:'Map data status'})).toContainText('NASA MOLA');
  await page.waitForTimeout(2000);
  const canvas=page.locator('canvas');
  await canvas.screenshot({path:'test-results/atlas-map.png'});
  const rect=(await canvas.boundingBox())!;
  await page.mouse.click(rect.x+rect.width*.4,rect.y+rect.height*.45);
  await expect(page.getByTestId('terrain-elevation')).toBeVisible();
  // Independently locate the clicked finest cell and read its exact little-endian numeric chunk.
  const scale=Math.max(180,Math.min(rect.width-390,(rect.height-145)*2));
  const longitude=(((rect.width*.4-(rect.width-330)/2)/scale+.5)*360+360)%360;
  const latitude=90-((rect.height*.45-(rect.height/2-25))/scale+.25)*360;
  const gx=Math.floor(longitude*manifest.ppd),gy=Math.floor((90-latitude)*manifest.ppd),size=manifest.tileSize;
  const buffer=readFileSync(`public/data/samples/${Math.floor(gx/size)}/${Math.floor(gy/size)}.f32`);
  const elevation=buffer.readFloatLE(((gy%size)*size+gx%size)*4);
  const numeric=(text:string)=>Number(text.replaceAll('−','-').replaceAll(',','').replace(' m',''));
  expect(numeric(await page.getByTestId('terrain-elevation').innerText())).toBe(elevation);
  expect(numeric(await page.getByTestId('water-depth').innerText())).toBe(Math.max(0,manifest.defaultWaterM-elevation));
  let tileRequests=0;page.on('request',request=>{if(request.url().includes('/data/tiles/'))tileRequests++;});
  await slider(page,'Ocean coverage',0);await expect(page.getByTestId('ocean-coverage')).toHaveText('0.00%');
  await slider(page,'Ocean coverage',100);await expect(page.getByTestId('ocean-coverage')).toHaveText('100.00%');
  await slider(page,'Water elevation',0);await expect(page.getByTestId('water-elevation')).toHaveText('0 m');
  await expect(page.getByTestId('ocean-coverage')).not.toHaveText('100.00%');
  expect(tileRequests).toBe(0);
  await page.getByRole('button',{name:'Reset to 71%'}).click();await expect(page.getByTestId('ocean-coverage')).toHaveText(`${manifest.defaultCoverage.toFixed(2)}%`);
  await page.getByRole('button',{name:'Zoom in'}).click();await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.4);await page.mouse.wheel(0,-350);await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Fit entire planet'}).click();
  await slider(page,'Terrain shading',0);await expect(page.getByTestId('ocean-coverage')).toHaveText(`${manifest.defaultCoverage.toFixed(2)}%`);
  await page.getByRole('button',{name:'About this map'}).click();await expect(page.getByRole('dialog')).toContainText(`${manifest.defaultCoverage.toFixed(4)}%`);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await page.getByRole('button',{name:'About this map'}).click();await page.getByRole('button',{name:'Back to the atlas'}).click();
  await slider(page,'Terrain shading',.85);
  await page.screenshot({path:'test-results/atlas-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('mobile viewport, both controls usable and no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('status',{name:'Map data status'})).toContainText('NASA MOLA');
  await slider(page,'Ocean coverage',50);await expect(page.getByTestId('ocean-coverage')).toContainText('50.');
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.screenshot({path:'test-results/atlas-mobile.png',fullPage:true});
});
