import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, readFile as readCached} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const key = process.env.OPENAI_API_KEY;
const audioDir = join(root, '.cache', 'audio');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'};
const wordInfo = {cat:{jp:'ねこ'},apple:{jp:'りんご'},backpack:{jp:'かばん'}};
const preloadWords = ['cat','apple','backpack'];

async function openai(path, options) {
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const response = await fetch(`https://api.openai.com/v1/${path}`, { ...options, headers:{Authorization:`Bearer ${key}`,...(options.headers||{})} });
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
  return response;
}
async function body(req) { const chunks=[]; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
async function json(req) { return JSON.parse((await body(req)).toString('utf8') || '{}'); }
async function send(res, status, data, headers={}) { res.writeHead(status, {'Cache-Control':'no-store','Access-Control-Allow-Origin':'*',...headers}); res.end(data); }
async function speak(text, target='') {
  const safe = text.toLowerCase().replace(/[^a-z0-9_-]/g,'_'); const path = join(audioDir, `${safe}.mp3`);
  try { const cached = await readCached(path); console.log(`speech cache hit: ${text}`); return cached; } catch {}
  console.log(`speech API generate: ${text}`);
  await mkdir(audioDir,{recursive:true});
  const instruction = target ? `Speak clearly and slowly for an elementary school English learner. When saying the target English word "${target}", use its correct natural English pronunciation, never a Japanese katakana reading.` : 'Speak clearly and slowly for an elementary school English learner.';
  const r = await openai('audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'coral',input:text,instructions:instruction,response_format:'mp3'})});
  const data = Buffer.from(await r.arrayBuffer()); await writeFile(path,data); return data;
}
async function pronunciation(req, expected) {
  const audio = await body(req); const form = new FormData();
  form.append('file', new File([audio], 'speech.webm', {type:req.headers['content-type'] || 'audio/webm'})); form.append('model','gpt-4o-mini-transcribe'); form.append('language','en');
  const r = await openai('audio/transcriptions',{method:'POST',body:form}); const transcript = (await r.json()).text || '';
  const norm = s => s.toLowerCase().replace(/[^a-z]/g,''); const heard=norm(transcript), target=norm(expected);
  const matched = heard === target || heard.includes(target) || target.includes(heard);
  let feedback = matched ? `「${expected}」と聞こえたよ！すごいね 🎉` : `おしい！「${expected}」を、もう一度ゆっくり言ってみよう。`;
  try { feedback = await realtimeFeedback(expected, transcript); } catch (error) { console.log(`realtime feedback fallback: ${error.message}`); }
  return {transcript,matched,feedback};
}
async function realtimeFeedback(expected, transcript) {
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return await new Promise((resolve,reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-mini',{headers:{Authorization:`Bearer ${key}`}});
    let text=''; const timer=setTimeout(()=>{try{ws.close()}catch{} reject(new Error('Realtime timeout'))},15000);
    ws.onopen=()=>{
      const realtimeInstructions = `あなたは小学校3・4年生向け英語学習アプリの先生です。\nいま児童は英単語「${expected}」の発音を練習しています。\n対象単語は必ず英字の「${expected}」として扱い、別の単語に置き換えたり混同したりしないでください。\n判定は少し甘めにしてください。まず良かった点をほめ、次に一つだけ短い練習ヒントを日本語で返してください。\n返答は1〜2文、長文・専門用語・厳しい評価は禁止です。\n対象単語を返答内で示すときは英字「${expected}」を使い、カタカナによる読み方（例：カット、アップル）は絶対に書かないでください。音声で対象単語を発話するときも、日本語読みではなく正しい自然な英語の発音にしてください。`;
      ws.send(JSON.stringify({type:'session.update',session:{type:'realtime',output_modalities:['text'],instructions:realtimeInstructions}}));
      ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:`背景：児童は小学校3〜4年生。英単語の発音練習をしています。\n対象単語（固定）：${expected}\n音声認識で聞こえた結果：${transcript || '(聞き取りにくい)'}\nこの「${expected}」の発音への、やさしく具体的な日本語の講評を1〜2文で返してください。対象単語を別の単語と取り違えないでください。`}]}}));
      ws.send(JSON.stringify({type:'response.create',response:{output_modalities:['text']}}));
    };
    ws.onmessage=event=>{ try { const msg=JSON.parse(event.data); if ((msg.type==='response.output_text.delta'||msg.type==='response.text.delta')&&msg.delta) text+=msg.delta; if (msg.type==='response.done') { clearTimeout(timer); ws.close(); resolve(text.trim() || 'よくチャレンジしたね！もう一度言ってみよう。'); } if (msg.type==='error') { clearTimeout(timer); ws.close(); reject(new Error(msg.error?.message||'Realtime error')); } } catch (error) { clearTimeout(timer); ws.close(); reject(error); } };
    ws.onerror=()=>{clearTimeout(timer); reject(new Error('Realtime connection error'))};
  });
}
const server = createServer(async (req,res) => {
  try {
    if (req.method === 'OPTIONS') return send(res,204,'');
    if (req.method === 'POST' && req.url === '/api/speak') { const {text,target} = await json(req); const data=await speak(text,target); return send(res,200,data,{'Content-Type':'audio/mpeg'}); }
    if (req.method === 'POST' && req.url?.startsWith('/api/pronounce')) { const expected=decodeURIComponent(new URL(req.url,'http://localhost').searchParams.get('expected')||''); const result=await pronunciation(req,expected); return send(res,200,JSON.stringify(result),{'Content-Type':'application/json'}); }
    const requested = decodeURIComponent((req.url||'/').split('?')[0]); const file = normalize(join(root, requested === '/' ? 'index.html' : requested.slice(1))); if (!file.startsWith(root)) return send(res,403,'Forbidden');
    const data = await readFile(file); return send(res,200,data,{'Content-Type':mime[extname(file)] || 'application/octet-stream'});
  } catch (error) { return send(res,500,JSON.stringify({error:error.message}),{'Content-Type':'application/json'}); }
});
server.listen(port,()=>{ console.log(`English demo running at http://localhost:${port}`); Promise.all(preloadWords.map(speak)).then(()=>console.log('speech preload ready')).catch(error=>console.log(`speech preload skipped: ${error.message}`)); });
