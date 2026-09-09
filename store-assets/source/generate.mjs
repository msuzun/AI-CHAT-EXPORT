// Local store photography: real application pages, isolated demo browser APIs.
// No real account, conversation, external server or user data is used.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(import.meta.dirname, '../..');
const output = join(root, 'store-assets');
const chrome = process.env.STORE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(output, { recursive: true });
await copyFile(join(root, 'icons/icon128.png'), join(output, 'store-icon-128.png'));
const slides = [
  ['01-export-formats','YOUR CONVERSATIONS, YOUR FILES.','Keep the ideas.<br>Choose the format.','Export conversations to PDF, Markdown, Word, HTML or plain text.','PDF · Markdown · Word · HTML · TXT','popup', 'light'],
  ['02-image-preview','REVIEW BEFORE YOU SAVE.','See the details.<br>Keep the context.','Preview your conversation with text, tables and available images before saving.','Conversation preview','preview', 'light'],
  ['03-code-preview','FROM ANSWER TO REFERENCE.','Code worth<br>keeping.','Keep code blocks readable with syntax highlighting in PDF and HTML exports.','Code highlighting · HTML export','code', 'light'],
  ['04-clipboard','TAKE THE NEXT STEP.','Copy it.<br>Make it useful.','Copy a conversation as Markdown or plain text for your notes and documents.','Markdown · Plain text','clipboard', 'dark'],
  ['05-settings','SET IT UP YOUR WAY.','Your language.<br>Your preferences.','Choose English or Turkish for the interface and right-click menu. Save your export defaults.','English / Türkçe · Light / Dark','options', 'dark'],
];
function mock() {
  const p = new URLSearchParams(location.search);
  const mode = p.get('mode');
  const settings = { language:'en', theme:p.get('theme') || 'light', defaultLabelLanguage:'en', defaultFormat:'pdf' };
  const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=200;
  const g=canvas.getContext('2d'); g.fillStyle='#eff6ff'; g.fillRect(0,0,640,200);
  g.font='bold 20px Segoe UI'; g.fillStyle='#172554'; g.fillText('A simple study workflow',24,36);
  ['Explore','Practice','Review'].forEach((v,i)=>{ const x=24+i*207; g.fillStyle=['#dbeafe','#bfdbfe','#93c5fd'][i]; g.beginPath(); g.roundRect(x,65,178,94,12); g.fill(); g.fillStyle='#1e40af'; g.font='bold 24px Segoe UI';g.fillText('0'+(i+1),x+17,99);g.font='18px Segoe UI';g.fillText(v,x+17,133); });
  const image=canvas.toDataURL('image/png');
  const chat = mode==='code' ? { title:'A small JavaScript utility', messages:[
    {role:'user',html:'<p>Write a function that groups notes by topic. Include a short example.</p>'},
    {role:'assistant',html:'<h3>Group notes by topic</h3><p>Use a reducer to collect each note under its topic.</p><pre><code class="language-javascript">function groupByTopic(notes) {\n  return notes.reduce((groups, note) =&gt; {\n    const topic = note.topic || "General";\n    (groups[topic] ??= []).push(note);\n    return groups;\n  }, {});\n}\n\nconst notes = [\n  { topic: "Design", text: "Sketch the flow" },\n  { topic: "Code", text: "Build a prototype" }\n];\n\nconsole.log(groupByTopic(notes));</code></pre><p>Each key contains the notes for one topic.</p>'}
  ]} : { title:'A practical learning plan', messages:[
    {role:'user',html:'<p>Help me plan a focused study session. Include a simple workflow and a short checklist.</p>'},
    {role:'assistant',html:'<h3>Turn a topic into a small project</h3><p>Start with one question, test the idea, then write down what you learned.</p><img alt="Explore, practice and review workflow" src="'+image+'"><table><thead><tr><th>Step</th><th>What to do</th></tr></thead><tbody><tr><td>Explore</td><td>Read one example and ask a question.</td></tr><tr><td>Practice</td><td>Build a small working example.</td></tr><tr><td>Review</td><td>Save your notes and choose a next step.</td></tr></tbody></table><p>Keep the session focused on one achievable outcome.</p>'}
  ]};
  const listeners=[];
  window.chrome = {
    storage: { sync:{ get:async defaults=>({...defaults,...settings}),set:async values=>{Object.assign(settings,values);listeners.forEach(fn=>fn({language:{newValue:settings.language}},'sync'));}},local:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener:fn=>listeners.push(fn),removeListener:()=>{}} },
    tabs:{query:async()=>[{id:1,url:'https://chatgpt.com/c/store-demo'}]},
    scripting:{executeScript:async()=>[]},
    runtime:{openOptionsPage:()=>{},sendMessage:async()=>({ok:true,payload:{appName:'ChatGPT',format:mode==='code'?'html':'pdf',scope:'current',exportData:chat,previewChats:[chat],exportOptions:{labelLanguage:'en',syntaxHighlight:true}}})}
  };
  if(mode==='clipboard') window.addEventListener('load',()=>setTimeout(()=>document.getElementById('clipboardTabBtn').click(),100));
}
const common = `*{box-sizing:border-box}html,body{margin:0;width:1280px;height:800px;overflow:hidden}body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5fc;color:#11203b}.orb{position:absolute;width:850px;height:850px;right:-230px;top:-180px;border-radius:50%;background:radial-gradient(circle,#c5d9ff 0%,#e0eaff 46%,transparent 70%)}.brand{position:absolute;left:58px;top:42px;display:flex;align-items:center;gap:12px;font-size:18px;font-weight:650}.brand img{width:38px;height:38px;border-radius:9px}.copy{position:absolute;left:60px;top:198px;width:420px}.eyebrow{font-size:12px;font-weight:750;letter-spacing:2px;color:#2860bb;margin-bottom:23px}h1{font-size:53px;letter-spacing:-2px;line-height:1.08;margin:0 0 27px;font-weight:720}p{font-size:20px;line-height:1.6;color:#52617a;margin:0;max-width:390px}.tag{display:inline-block;border:1px solid #c3d3eb;border-radius:25px;padding:12px 17px;font-size:13px;font-weight:650;margin-top:31px;color:#265dab;background:#ffffff9c}.foot{position:absolute;bottom:35px;left:60px;font-size:11px;color:#67748c;line-height:1.8}.number{position:absolute;bottom:38px;right:50px;color:#7184a4;font-size:13px;letter-spacing:3px}iframe{border:0;display:block;transform-origin:top left}.frame{position:absolute;overflow:hidden;border-radius:15px;box-shadow:0 24px 65px #183c7526;border:1px solid #c6d3e5;background:#fff}.dark{background:#0b1425;color:#f6f8ff}.dark .orb{background:radial-gradient(circle,#15335a 0%,#101f37 50%,transparent 70%)}.dark p{color:#acbad0}.dark .eyebrow{color:#83b6ff}.dark .tag{background:#142641;color:#a4c9ff;border-color:#2e496f}.dark .brand{color:#e4ecfc}.dark .foot{color:#879ab6}.dark .frame{border-color:#36506f}`;
function sheet(slide,index) {
 const [file,kicker,title,description,tag,mode,theme]=slide;
 let url=mode==='options'?'/options/options.html':'/popup/'+(['preview','code'].includes(mode)?'preview.html':'popup.html');
 url+='?token=demo&mode='+mode+'&theme='+theme;
 const preview=['preview','code'].includes(mode);
 const position=preview?'left:472px;top:133px;width:762px;height:578px':mode==='options'?'left:621px;top:110px;width:514px;height:653px':'left:735px;top:112px;width:320px;height:640px';
 const frame=preview?'width:960px;height:728px;transform:scale(.79375)':mode==='options'?'width:700px;height:890px;transform:scale(.734)':'width:380px;height:760px;transform:scale(.8421)';
 return `<!doctype html><html lang="en"><meta charset="utf-8"><style>${common}</style><body class="${theme==='dark'?'dark':''}"><div class="orb"></div><div class="brand"><img src="/icons/icon128.png">Chat Export for ChatGPT</div><div class="copy"><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p><div class="tag">${tag}</div></div><div class="frame" style="${position}"><iframe src="${url}" style="${frame}"></iframe></div><div class="foot">Independent extension. Not affiliated with or endorsed by OpenAI.<br>Actual extension interface · Sample content</div><div class="number">0${index+1} / 05</div></body></html>`;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/slide') {res.setHeader('Content-Type',types['.html']); res.end(sheet(slides[Number(url.searchParams.get('n'))],Number(url.searchParams.get('n'))));return;}
  if(url.pathname==='/promo') {res.setHeader('Content-Type',types['.html']);res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;width:440px;height:280px;background:#11203b;color:white;font-family:'Segoe UI',sans-serif;padding:30px;box-sizing:border-box}img{width:46px;height:46px;border-radius:10px;float:right}h1{font-size:30px;line-height:1.15;margin:6px 0 12px}p{color:#b5cef3;font-size:15px;line-height:1.6}small{font-size:9px;color:#a2b4ce}</style><img src="/icons/icon128.png"><h1>Chat Export<br>for ChatGPT</h1><p>Keep your conversations.<br>PDF · Markdown · Word · HTML · Text</p><small>Independent extension. Not affiliated with OpenAI.</small>`);return;}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/')) throw Error('Path outside workspace');
  if(!['popup','options','shared','icons','lib'].some(dir=>path.startsWith(join(root,dir)+ '\\')||path.startsWith(join(root,dir)+'/'))) throw Error('Not a demo asset');
  let data=await readFile(path);
  if(extname(path)==='.html') data=Buffer.from(data.toString('utf8').replace('<head>','<head><script>('+mock.toString()+')();</script>'));
  res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(data);
 }catch(error){res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const profile=join(output,'.chrome-profile');
async function capture(name,url,width,height) {
 await new Promise((resolve,reject)=>{
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','--force-device-scale-factor=1','--disable-background-networking','--disable-component-update','--user-data-dir='+profile,`--window-size=${width},${height}`,'--virtual-time-budget=4000','--screenshot='+join(output,name+'.png'),url],{windowsHide:true,stdio:'ignore'});
  const timeout=setTimeout(()=>{child.kill();reject(Error('Screenshot timed out'));},45000);
  child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('Chrome exit '+code));});
 });
 const png=await readFile(join(output,name+'.png'));
 if(png.readUInt32BE(16)!==width||png.readUInt32BE(20)!==height)throw Error('Wrong image size');
 console.log(name+'.png '+width+'x'+height);
}
try {
 for(const [i,slide]of slides.entries())await capture(slide[0],`http://127.0.0.1:${port}/slide?n=${i}`,1280,800);
 await capture('promo-440x280',`http://127.0.0.1:${port}/promo`,440,280);
}finally {
 server.close();
 // Only this generator's disposable profile can be removed.
 if(profile!==join(root,'store-assets','.chrome-profile'))throw Error('Unsafe profile path');
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
