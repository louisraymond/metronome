import { st } from './state.js';
import { idx, nn, namesForKey, cycleOfFourthsForUI, roman } from './utils.js';

/* chord object */
function chordObj(root, quality, beatsLen){
  return {
    root, quality,
    label:`${root}${quality==='maj7'?'maj7':quality}`,
    roman: roman(1, quality),
    beatsLen
  };
}

/* --- Single Chords --- */
export function buildSingleChart(){
  const prefer=st.preferFlats;
  const pattern=document.getElementById('pattern').value;
  const sk=document.getElementById('startKey').value;
  const order=buildKeyOrder(pattern,sk,prefer);
  const quals=selectedQualities();
  const bars=Math.max(1, +document.getElementById('barsPerChordSingle').value||1);
  const beatsPer = bars * st.beatsPerBar;
  const chart=[];
  order.forEach(key=>{
    const N = namesForKey(key, prefer);
    const spelledKey = N[idx(key)];
    quals.forEach(q=> chart.push(chordObj(spelledKey,q,beatsPer)));
  });
  return chart;
}

function buildKeyOrder(pattern,startKey,preferFlats){
  const cycle = cycleOfFourthsForUI(preferFlats);
  if(pattern==='cycle-4ths'){
    const i = cycle.indexOf(startKey)>=0? cycle.indexOf(startKey):0;
    return Array.from({length:12},(_,k)=> cycle[(i+k)%12]);
  }
  if(pattern==='chromatic-up' || pattern==='chromatic-down'){
    let i = idx(startKey), out=[];
    for(let k=0;k<12;k++){ out.push(nn(i, preferFlats)); i += (pattern==='chromatic-up'?1:-1); }
    return out;
  }
  // random order
  const pool=[...new Set(cycle)];
  for(let i=pool.length-1;i>0;i--){
    const j=Math.floor(Math.random()* (i+1));
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return pool;
}

function selectedQualities(){
  const checks=document.querySelectorAll('#singleConfig input[type="checkbox"][value]');
  const out=[]; checks.forEach(c=>{ if(c.checked) out.push(c.value); });
  return out.length?out:['maj7','m7','7','m7b5'];
}

/* --- II–V–I --- */
function barSplit() {
  const L = st.beatsPerBar;
  const ii = Math.floor(L/2);
  const v  = L - ii;
  const I  = L;
  return {ii,v,I};
}

function pushIIVI(seq,keyName){
  const {ii,v,I} = barSplit();
  const names = namesForKey(keyName, st.preferFlats);
  const Ipc=idx(keyName), IIpc=(Ipc+2)%12, Vpc=(Ipc+7)%12;
  seq.push({label:`${names[IIpc]}m7`, roman:'ii7', beatsLen:ii});
  seq.push({label:`${names[Vpc]}7`,  roman:'V7',  beatsLen:v});
  seq.push({label:`${names[Ipc]}maj7`, roman:'Imaj7', beatsLen:I});
}

function buildIIVIClassic(startKey){
  const cycle = cycleOfFourthsForUI(st.preferFlats);
  const start = cycle.indexOf(startKey)>=0? cycle.indexOf(startKey):0;
  const seq=[];
  for(let k=0;k<12;k++){ const keyName=cycle[(start+k)%12]; pushIIVI(seq,keyName); }
  return seq;
}

function buildIIVIYourPattern(startKey){
  const seq=[]; let kName=startKey;
  const usedPC=new Set();
  while(usedPC.size<12){
    pushIIVI(seq,kName); usedPC.add(idx(kName));
    const iiOfKey=nn((idx(kName)+2)%12, st.preferFlats);
    pushIIVI(seq,iiOfKey); usedPC.add(idx(iiOfKey));
    kName=nn((idx(kName)+11)%12, st.preferFlats); // down a semitone
    if(seq.length>200) break;
  }
  return seq;
}

export function buildIIVI(){
  const start=document.getElementById('iiviStartKey').value;
  const scheme=document.getElementById('iiviScheme').value;
  return scheme==='classic'? buildIIVIClassic(start) : buildIIVIYourPattern(start);
}
