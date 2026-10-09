import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const production=process.env.ATLAS_PRODUCTION==='1';
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
export default defineConfig({
  testDir:'./tests/browser', timeout:45000, workers:1,
  use:{baseURL:'http://127.0.0.1:3002',browserName:'chromium',launchOptions:{executablePath,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']},screenshot:'only-on-failure'},
  webServer:{command:production?'PORT=3002 node scripts/serve-static.mjs':'ATLAS_QA=1 node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3002',url:'http://127.0.0.1:3002',reuseExistingServer:false,timeout:120000}
});
