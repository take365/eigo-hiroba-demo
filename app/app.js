const cards = [
  {jp:'ねこ', en:'cat', img:'assets/cat.png', hint:'おうちで いっしょに くらす どうぶつだよ。', example:'I like cats.', translation:'ねこが すきです。'},
  {jp:'りんご', en:'apple', img:'assets/apple.png', hint:'赤くて まるい くだものだよ。', example:'I eat an apple.', translation:'りんごを たべます。'},
  {jp:'かばん', en:'backpack', img:'assets/backpack.png', hint:'きょうしつへ もっていく ものだよ。', example:'My backpack is blue.', translation:'わたしの かばんは あおです。'}
];
let cardIndex = 0, quizIndex = 0, speakIndex = 0, pairIndex = 0;
const $ = s => document.querySelector(s);
function showView(id) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id)); window.scrollTo({top:0, behavior:'smooth'}); if (id === 'quiz') renderQuiz(); if (id === 'speak') renderSpeak(); if (id === 'pair') renderPair(); if (id === 'today') renderToday(); }
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function renderCard() {
  const c = cards[cardIndex]; $('#wordImage').src = c.img; $('#wordImage').alt = c.en+'のイラスト'; $('#wordJp').textContent = c.jp; $('#wordEn').textContent = c.en; $('#wordHint').textContent = c.hint; $('#wordExample').textContent = c.example; $('#wordExample').nextElementSibling.textContent = c.translation; $('#cardCount').textContent = `${cardIndex+1} / ${cards.length}`; $('#cardDots').innerHTML = cards.map((_,i) => `<i class="${i===cardIndex?'active':''}"></i>`).join('');
}
$('#nextCard').addEventListener('click', () => { cardIndex = (cardIndex+1) % cards.length; renderCard(); });
function renderQuiz() {
  const c = cards[quizIndex]; $('#quizImage').src = c.img; $('#quizImage').alt = c.jp+'のイラスト'; $('#quizCount').textContent = `${quizIndex+1} / ${cards.length}`; $('#result').textContent = ''; $('#result').className = 'result'; $('#nextQuiz').disabled = true;
  const options = [c.en, ...cards.filter((_,i)=>i!==quizIndex).map(x=>x.en)].sort(() => Math.random()-.5); $('#choices').innerHTML = options.map(x => `<button class="choice" data-answer="${x}">${x}</button>`).join(''); document.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => answer(b, c.en)));
}
function answer(btn, correct) { document.querySelectorAll('.choice').forEach(b => b.disabled = true); if (btn.dataset.answer === correct) { btn.classList.add('correct'); $('#result').textContent = 'せいかい！ すごいね 🎉'; $('#result').classList.add('ok'); } else { btn.classList.add('wrong'); $('#result').textContent = `おしい！ せいかいは「${correct}」だよ。`; $('#result').classList.add('ng'); document.querySelector(`[data-answer="${correct}"]`).classList.add('correct'); } $('#nextQuiz').disabled = false; }
$('#nextQuiz').addEventListener('click', () => { quizIndex = (quizIndex+1) % cards.length; renderQuiz(); });
function renderSpeak(){const c=cards[speakIndex]; $('#speakImage').src=c.img; $('#speakImage').alt=c.en+'のイラスト'; $('#speakEn').textContent=c.en; $('#speakCount').textContent=`${speakIndex+1} / ${cards.length}`; $('#speakResult').textContent='まずは おてほんを きいてみよう。'; $('#speakResult').className='result';}
$('#speakSample').addEventListener('click',async()=>{const c=cards[speakIndex]; try{const r=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:c.en,target:c.en})}); new Audio(URL.createObjectURL(await r.blob())).play();}catch{}});
$('#nextSpeak').addEventListener('click',()=>{speakIndex=(speakIndex+1)%cards.length;renderSpeak();});
let speakRecorder, speakChunks=[];
$('#speakPractice').addEventListener('click',async()=>{const btn=$('#speakPractice'), status=$('#speakResult'); if(speakRecorder?.state==='recording'){speakRecorder.stop();return;} try{const stream=await navigator.mediaDevices.getUserMedia({audio:true}); speakChunks=[]; speakRecorder=new MediaRecorder(stream); speakRecorder.ondataavailable=e=>speakChunks.push(e.data); speakRecorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop()); btn.textContent='🎙️ いってみる'; status.textContent='はつおんを きいているよ…'; try{const c=cards[speakIndex]; const r=await fetch(`/api/pronounce?expected=${encodeURIComponent(c.en)}`,{method:'POST',headers:{'Content-Type':speakRecorder.mimeType||'audio/webm'},body:new Blob(speakChunks,{type:speakRecorder.mimeType||'audio/webm'})}); const d=await r.json(); status.textContent=d.feedback||'もういちど やってみよう。'; status.className='result '+(d.matched?'ok':'ng');}catch{status.textContent='うまく ききとれなかったよ。';}}; speakRecorder.start(); btn.textContent='⏹ おわる'; status.textContent='いってみよう！'; setTimeout(()=>{if(speakRecorder?.state==='recording')speakRecorder.stop()},2500);}catch{status.textContent='マイクが つかえないようです。';}});
function renderPair(){const c=cards[pairIndex]; $('#pairImage').src=c.img; $('#pairCount').textContent=`${pairIndex+1} / ${cards.length}`; $('#pairResult').textContent=''; $('#pairResult').className='result'; $('#nextPair').disabled=true; const opts=[c.en,...cards.filter((_,i)=>i!==pairIndex).map(x=>x.en)].sort(()=>Math.random()-.5); $('#pairChoices').innerHTML=opts.map(x=>`<button class="choice" data-answer="${x}">${x}</button>`).join(''); document.querySelectorAll('#pairChoices .choice').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#pairChoices .choice').forEach(x=>x.disabled=true); const ok=b.dataset.answer===c.en; b.classList.add(ok?'correct':'wrong'); if(!ok) document.querySelector(`#pairChoices [data-answer="${c.en}"]`).classList.add('correct'); $('#pairResult').textContent=ok?'せいかい！ ぴったりペアだね 🎉':`おしい！ せいかいは「${c.en}」だよ。`; $('#pairResult').classList.add(ok?'ok':'ng'); $('#nextPair').disabled=false;}));}
$('#nextPair').addEventListener('click',()=>{pairIndex=(pairIndex+1)%cards.length;renderPair();});
const todayModes=['quiz','pair','speak','cards']; let todayIndex=0;
function renderToday(){todayIndex=Math.floor(Math.random()*todayModes.length); $('#todayCount').textContent='ランダム'; $('#todayMessage').textContent={quiz:'絵を見て、英単語をえらぼう！',pair:'絵と英単語をつなごう！',speak:'英単語をまねして発音しよう！',cards:'カードでことばをおぼえよう！'}[todayModes[todayIndex]];}
$('#todayStart').addEventListener('click',()=>showView(todayModes[todayIndex]));
let audio;
$('.sound').addEventListener('click', async () => {
  const c = cards[cardIndex]; $('#speakStatus').textContent = 'おてほんの おとを じゅんび中…';
  try { const response = await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:c.en})}); if (!response.ok) throw new Error('speech failed'); audio = new Audio(URL.createObjectURL(await response.blob())); await audio.play(); $('#speakStatus').textContent = 'おてほんを きいたよ'; } catch { $('#speakStatus').textContent = 'おとを じゅんびできませんでした（API設定を確認）'; }
});
let recorder, chunks=[];
$('#speakWord').addEventListener('click', async () => {
  const button = $('#speakWord'); const status = $('#speakStatus');
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true}); recorder = new MediaRecorder(stream); chunks=[]; recorder.ondataavailable=e=>chunks.push(e.data); recorder.onstop=async()=>{ stream.getTracks().forEach(t=>t.stop()); button.classList.remove('recording'); button.querySelector('span').textContent='いってみる'; status.textContent='はつおんを きいているよ…'; try { const result=await fetch(`/api/pronounce?expected=${encodeURIComponent(cards[cardIndex].en)}`,{method:'POST',headers:{'Content-Type':recorder.mimeType||'audio/webm'},body:new Blob(chunks,{type:recorder.mimeType||'audio/webm'})}); const data=await result.json(); status.textContent=data.feedback||'もういちど チャレンジしてみよう。'; status.style.color=data.matched?'#279b78':'#d75d72'; const voice=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:data.feedback,target:cards[cardIndex].en})}); if(voice.ok){const replyAudio=new Audio(URL.createObjectURL(await voice.blob())); await replyAudio.play();}} catch { status.textContent='うまく ききとれなかったよ。もういちど やってみよう。'; } }; recorder.start(); button.classList.add('recording'); button.querySelector('span').textContent='おわる'; status.textContent='いってみよう！'; setTimeout(()=>{if(recorder?.state==='recording') recorder.stop()},2500);
  } catch { status.textContent='マイクが つかえないようです。おてほんを きいてみよう。'; }
});
// Realtime講評が表示されたら、単語を明示して自動読み上げする。
let lastSpokenFeedback = $('#speakResult')?.textContent?.trim() || '';
const speakFeedbackObserver = new MutationObserver(async () => {
  const text = $('#speakResult')?.textContent?.trim() || '';
  if (!text || text === lastSpokenFeedback || text.includes('きいているよ') || text.includes('いってみよう')) return;
  lastSpokenFeedback = text;
  const target = cards[speakIndex]?.en;
  try {
    const response = await fetch('/api/speak', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text, target})});
    if (response.ok) await new Audio(URL.createObjectURL(await response.blob())).play();
  } catch {}
});
speakFeedbackObserver.observe($('#speakResult'), {childList:true, characterData:true, subtree:true});
renderCard();
