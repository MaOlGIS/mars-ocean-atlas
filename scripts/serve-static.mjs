// Local preview only; Vercel serves out/ directly without a Node server.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root=resolve('out'), port=Number(process.env.PORT||3001);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.f32':'application/octet-stream','.u8':'application/octet-stream'};
await stat(`${root}/index.html`).catch(()=>{throw new Error('Run npm run build before npm start');});
createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=resolve(root,`.${path}`);
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    let info=await stat(file).catch(()=>null);
    if(info?.isDirectory()){file=resolve(file,'index.html');info=await stat(file).catch(()=>null);}
    if(!info?.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'public, max-age=0, must-revalidate'});
    if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch {res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Static atlas: http://127.0.0.1:${port}`));
