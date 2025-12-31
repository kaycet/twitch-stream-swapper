# Vibe Kanban Commands - Copy These Exactly

## Setup Script:
```
echo Setup complete - Chrome extension requires no build step
```

## Dev Server Script:
Use this ONE-LINER (no file needed):

```
node -e "const http=require('http'),fs=require('fs'),path=require('path');const m={'html':'text/html','js':'application/javascript','css':'text/css','json':'application/json','png':'image/png'};const s=http.createServer((r,res)=>{let p=path.join(process.cwd(),r.url==='/'?'dev.html':r.url);if(!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end('Not Found');return}try{res.writeHead(200,{'Content-Type':m[path.extname(p).slice(1)]||'application/octet-stream','Access-Control-Allow-Origin':'*'});res.end(fs.readFileSync(p))}catch(e){res.writeHead(500);res.end('Error')}});s.listen(8080,()=>console.log('Dev server: http://localhost:8080'))"
```

## Cleanup Script:
```
(leave empty/blank)
```

---

## Alternative: Simpler Dev Server (if above doesn't work)

If Node.js one-liner has issues, use Python (if installed):

**Dev Server Script:**
```
python -m http.server 8080
```

Or PowerShell (Windows):

**Dev Server Script:**
```
powershell -Command "Start-Process -NoNewWindow python -ArgumentList '-m','http.server','8080'"
```

