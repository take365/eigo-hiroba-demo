import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, readFile as readCached} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const key = process.env.OPENAI_API_KEY;
const openPronounceUrl = (process.env.OPENPRONOUNCE_URL || '').replace(/\/$/, '');
const pronouncePassScore = Number(process.env.PRONOUNCE_PASS_SCORE || 45);
const pronunciationJudgeModel = process.env.PRONUNCIATION_JUDGE_MODEL || 'gpt-5.6-luna';
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
  if (openPronounceUrl) {
    try {
      const opForm = new FormData();
      opForm.append('file', new Blob([audio], {type:req.headers['content-type'] || 'audio/webm'}), 'speech.webm');
      opForm.append('expected_text', expected); opForm.append('lang', 'en');
      const op = await fetch(`${openPronounceUrl}/pronunciation`, {method:'POST', body:opForm});
      if (!op.ok) throw new Error(`OpenPronounce ${op.status}: ${await op.text()}`);
      const result = await op.json();
      const score = Number(result.score ?? 0);
      const transcript = result.transcribe || result.transcript || '';
      const errors = result.differences?.errors || [];
      const heardPhones = (result.differences?.heard_phones || []).join(' ');
      // 小学生向けなので、OpenPronounceの短い単語で出やすい軽微な誤検出を1件まで許容する。
      const matched = score >= pronouncePassScore && errors.length <= 1;
      const feedback = matched
        ? `「${expected}」の音がよくそろっているよ！スコア ${Math.round(score)} 点 🎉`
        : `スコア ${Math.round(score)} 点。${errors[0]?.word ? `「${errors[0].word}」の音を` : '音を'}もう一度ゆっくり言ってみよう。`;
      console.log(`openpronounce result: expected=${expected} score=${score} transcript=${transcript || '(empty)'}`);
      const judged = await judgePronunciation({expected, expectedPhones:(result.differences?.expected_phones || []).flat().join(' '), heardPhones, score, errors}).catch(error => { console.log(`luna pronunciation judge fallback: ${error.message}`); return null; });
      return {transcript: heardPhones ? `${transcript}  /${heardPhones}/` : transcript, matched:judged?.matched ?? matched, feedback:judged?.feedback || feedback, score:judged?.score ?? score, openpronounceScore:score, analysis:judged?'openpronounce+luna':'openpronounce', differences:result.differences || null, prosody:result.prosody || null};
    } catch (error) {
      console.log(`openpronounce unavailable, fallback to transcription: ${error.message}`);
    }
  }
  form.append('file', new File([audio], 'speech.webm', {type:req.headers['content-type'] || 'audio/webm'})); form.append('model','gpt-4o-mini-transcribe'); form.append('language','en');
  const r = await openai('audio/transcriptions',{method:'POST',body:form}); const transcript = (await r.json()).text || ''; console.log(`pronunciation transcript: expected=${expected} heard=${transcript || '(empty)'}`);
  const norm = s => s.toLowerCase().replace(/[^a-z]/g,''); const heard=norm(transcript), target=norm(expected);
  // 空認識や短い断片（cat に対する c など）は一致扱いにしない。
  const distance=(a,b)=>{const row=[...Array(b.length+1).keys()]; for(let i=1;i<=a.length;i++){let prev=row[0]; row[0]=i; for(let j=1;j<=b.length;j++){const cur=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=cur;}} return row[b.length];};
  const matched = Boolean(heard) && (heard===target || (target.length>=4 && distance(heard,target)<=1));
  let feedback = matched ? `「${expected}」と聞こえたよ！すごいね 🎉` : `おしい！「${expected}」を、もう一度ゆっくり言ってみよう。`;
  try { feedback = await realtimeFeedback(expected, transcript); } catch (error) { console.log(`realtime feedback fallback: ${error.message}`); }
  return {transcript,matched,feedback,score:matched?88:42,analysis:'transcription'};
}
async function judgePronunciation({expected, expectedPhones, heardPhones, score, errors}) {
  const prompt = `あなたは小学校3・4年生向け英語発音練習アプリの採点先生です。\n背景：児童が英単語の発音を練習しています。\n対象単語（固定）：${expected}\nお手本の音（IPA/音素）：/${expectedPhones || '不明'}/\n聞こえた音（IPA/音素）：/${heardPhones || '不明'}/\n音声モデルの参考スコア：${Math.round(score)}/100\n音声モデルが報告した誤り数：${errors.length}\n\n「その英単語だと、かろうじて相手に伝わりそう」を60点の目安にして、0〜100点で採点してください。単語が別物、または音がほぼ無い場合だけ低くします。子ども向けなので、多少の音素ずれは減点しすぎず、明らかに伝わるなら70点以上にしてください。対象単語を別の単語に置き換えないでください。返答はJSONのみ。score（整数）、passed（true/false）、hint（日本語1文）、summary（日本語1文）を返してください。`;
  const r = await openai('responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:pronunciationJudgeModel,input:prompt,text:{format:{type:'json_schema',name:'pronunciation_judgement',strict:true,schema:{type:'object',properties:{score:{type:'integer',minimum:0,maximum:100},passed:{type:'boolean'},hint:{type:'string'},summary:{type:'string'}},required:['score','passed','hint','summary'],additionalProperties:false}}}})});
  const data = await r.json(); const raw = data.output_text || data.output?.flatMap(x=>x.content||[]).find(x=>x.text)?.text || ''; const parsed=JSON.parse(raw); return {score:Math.max(0,Math.min(100,Number(parsed.score))),matched:Boolean(parsed.passed),feedback:`${parsed.summary} ${parsed.hint}`};
}
async function realtimeFeedback(expected, transcript) {
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return await new Promise((resolve,reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-mini',{headers:{Authorization:`Bearer ${key}`}});
    let text=''; const timer=setTimeout(()=>{try{ws.close()}catch{} reject(new Error('Realtime timeout'))},15000);
    ws.onopen=()=>{
      const realtimeInstructions = `あなたは小学校3・4年生向け英語学習アプリの先生です。\nいま児童は英単語「${expected}」の発音を練習しています。\n対象単語は必ず英字の「${expected}」として扱い、別の単語に置き換えたり混同したりしないでください。\n音声認識で聞こえた結果を必ず確認し、空欄または明らかに別の単語なら「もういちど ゆっくり言ってみよう」と伝えてください。\n判定は少し甘めにしてください。まず良かった点をほめ、次に一つだけ短い練習ヒントを日本語で返してください。\n返答は1〜2文、長文・専門用語・厳しい評価は禁止です。\n対象単語を返答内で示すときは英字「${expected}」を使い、カタカナによる読み方（例：カット、アップル）は絶対に書かないでください。音声で対象単語を発話するときも、日本語読みではなく正しい自然な英語の発音にしてください。`;
      ws.send(JSON.stringify({type:'session.update',session:{type:'realtime',output_modalities:['text'],instructions:realtimeInstructions}}));
      ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:`背景：児童は小学校3〜4年生。英単語の発音練習をしています。\n対象単語（固定）：${expected}\n音声認識で聞こえた結果（判定材料）：${transcript || '(空の認識結果)'}\nこの認識結果を必ず根拠にして、「${expected}」の発音へのやさしく具体的な日本語の講評を1〜2文で返してください。空または別単語なら合格と言わず、もう一度促してください。対象単語を別の単語と取り違えないでください。`}]}}));
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
