const cards = [
  {jp:'ねこ', en:'cat', img:'assets/cat.png', hint:'おうちで いっしょに くらす どうぶつだよ。', example:'I like cats.', translation:'ねこが すきです。'},
  {jp:'りんご', en:'apple', img:'assets/apple.png', hint:'赤くて まるい くだものだよ。', example:'I eat an apple.', translation:'りんごを たべます。'},
  {jp:'かばん', en:'backpack', img:'assets/backpack.png', hint:'きょうしつへ もっていく ものだよ。', example:'My backpack is blue.', translation:'わたしの かばんは あおです。'}
];
let cardIndex = 0, quizIndex = 0;
const $ = s => document.querySelector(s);
function showView(id) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id)); window.scrollTo({top:0, behavior:'smooth'}); if (id === 'quiz') renderQuiz(); }
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
    const stream = await navigator.mediaDevices.getUserMedia({audio:true}); recorder = new MediaRecorder(stream); chunks=[]; recorder.ondataavailable=e=>chunks.push(e.data); recorder.onstop=async()=>{ stream.getTracks().forEach(t=>t.stop()); button.classList.remove('recording'); button.querySelector('span').textContent='いってみる'; status.textContent='はつおんを きいているよ…'; const result=await fetch(`/api/pronounce?expected=${encodeURIComponent(cards[cardIndex].en)}`,{method:'POST',headers:{'Content-Type':recorder.mimeType||'audio/webm'},body:new Blob(chunks,{type:recorder.mimeType||'audio/webm'})}); const data=await result.json(); status.textContent=data.feedback||'もういちど チャレンジしてみよう。'; status.style.color=data.matched?'#279b78':'#d75d72'; }; recorder.start(); button.classList.add('recording'); button.querySelector('span').textContent='おわる'; status.textContent='いってみよう！'; setTimeout(()=>{if(recorder?.state==='recording') recorder.stop()},2500);
  } catch { status.textContent='マイクが つかえないようです。おてほんを きいてみよう。'; }
});
renderCard();
