import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('public/nomenclature/mars.json','utf8'));

test('official landmark alignment, collisions, filters, search, wrapping and oceans',async({page})=>{
 test.setTimeout(90000);
 await page.addInitScript(()=>{
  const uniform=WebGL2RenderingContext.prototype.uniform3f;
  WebGL2RenderingContext.prototype.uniform3f=function(location,x,y,scale){(window as unknown as {labelCamera:{x:number;y:number;scale:number}}).labelCamera={x,y,scale};uniform.call(this,location,x,y,scale);};
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 const labels=page.locator('.feature-label');await expect(labels.first()).toBeVisible();
 const canvas=page.locator('canvas'),rect=(await canvas.boundingBox())!;
 const scale=Math.max(180,Math.min(rect.width-390,(rect.height-145)*2)),origin={x:(rect.width-330)/2,y:rect.height/2-25};
 for(const name of ['Olympus Mons','Valles Marineris','Hellas Planitia']){
  const f=catalog.features.find((f:{name:string})=>f.name===name),label=page.getByRole('button',{name:`Feature: ${name}`,exact:true});
  await expect(label).toBeVisible();const b=(await label.boundingBox())!;
  expect(Math.abs(b.x+b.width/2-rect.x-origin.x-(f.longitude/360-.5)*scale)).toBeLessThan(1);
  expect(Math.abs(b.y+b.height/2-rect.y-origin.y-((90-f.latitude)/360-.25)*scale)).toBeLessThan(1);
 }
 const overlap=await labels.evaluateAll(elements=>{const boxes=elements.map(e=>e.getBoundingClientRect());return boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));});expect(overlap).toBe(false);
 await page.getByRole('button',{name:'Feature: Olympus Mons',exact:true}).click();
 await expect(page.getByRole('region',{name:'Geographical feature information'})).toContainText('610.13');
 await page.getByRole('button',{name:'Close feature information'}).click();
 await expect(page.getByRole('region',{name:'Geographical feature information'})).toHaveCount(0);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 const before=await labels.evaluateAll(elements=>elements.map(e=>e.getAttribute('data-feature-id')));
 await page.getByRole('slider',{name:'Ocean coverage',exact:true}).fill('100');
 await expect(page.getByTestId('ocean-coverage')).toHaveText('100.00%');
 await expect.poll(()=>labels.evaluateAll(elements=>elements.map(e=>e.getAttribute('data-feature-id')))).toEqual(before);
 await page.getByRole('checkbox',{name:'Feature labels',exact:true}).uncheck();await expect(labels).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Feature labels',exact:true}).check();
 await page.getByRole('button',{name:'Find & filter'}).click();
 await page.getByRole('checkbox',{name:'Mountains',exact:true}).uncheck();
 await expect(page.getByRole('button',{name:'Feature: Olympus Mons',exact:true})).toHaveCount(0);
 await page.getByRole('searchbox',{name:'Find a Martian feature'}).fill('Olympus');
 await page.getByRole('list',{name:'Feature search results'}).getByRole('button',{name:/Olympus Mons/}).click();
 await expect(page.getByRole('region',{name:'Geographical feature information'})).toContainText('Olympus Mons');
 await expect(page.getByRole('button',{name:'Feature: Olympus Mons',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close feature information'}).click();
 await canvas.focus();for(let i=0;i<80;i++)await page.keyboard.press('ArrowRight');
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(labels.first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{
  const camera=(window as unknown as {labelCamera:{x:number;y:number;scale:number}}).labelCamera,rect=document.querySelector('canvas')!.getBoundingClientRect();
  const ox=(rect.width-(rect.width>850?330:0))/2,oy=rect.height/2-25;
  return [...document.querySelectorAll<HTMLElement>('.feature-label')].every(e=>{
   const b=e.getBoundingClientRect(),dx=b.x+b.width/2-rect.x-ox-(Number(e.dataset.longitude)/360-camera.x)*camera.scale;
   const dy=b.y+b.height/2-rect.y-oy-((90-Number(e.dataset.latitude))/360-camera.y)*camera.scale;
   return Math.abs(dx-Math.round(dx/camera.scale)*camera.scale)<1&&Math.abs(dy)<1;
  });
 })).toBe(true);
 await page.getByRole('button',{name:'Fit entire planet'}).click();
 await expect(page.getByRole('button',{name:'Feature: Hellas Planitia',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/labels-desktop.png'});
 expect(errors).toEqual([]);
});

test('mobile labels and search remain usable without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('checkbox',{name:'Feature labels',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Find & filter'}).click();
 await page.getByRole('searchbox',{name:'Find a Martian feature'}).fill('Hellas');
 await page.getByRole('list',{name:'Feature search results'}).getByRole('button',{name:/Hellas Planitia/}).click();
 await expect(page.getByRole('region',{name:'Geographical feature information'})).toContainText('Hellas Planitia');
 await expect(page.getByRole('button',{name:'Feature: Hellas Planitia',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:'test-results/labels-mobile.png'});
});
