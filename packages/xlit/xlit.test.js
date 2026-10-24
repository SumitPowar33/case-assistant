import { writeFileSync } from 'node:fs';
import X from './xlit.js';
let fail = 0, n = 0;
function eq(label, got, want) { n++; if (got !== want) { fail++; console.log('FAIL', label, 'got', got, [...got].map(c => c.codePointAt(0).toString(16)).join(' '), 'want', want); } }
// 1. pure rules (word): what a careful typist gets
const rules = [
  ['mr','ramesh','रमेश'],['mr','kamal','कमल'],['mr','sanjay','संजय'],['mr','mumbaee','मुंबई'],['mr','aahe','आहे'],
  ['mr','kalyaaN','कल्याण'],['mr','paaTeel','पाटील'],['mr','pradeep','प्रदीप'],['mr','shreekaant','श्रीकांत'],
  ['mr','saakSheedaar','साक्षीदार'],['mr','gaNesh','गणेश'],['mr','vishvaas','विश्वास'],['mr','ghar','घर'],
  ['mr','gaaDi','गाडी'],['mr','kshitij','क्षितिज'],['mr','dnyaaneshwar','ज्ञानेश्वर'],['mr','baaL','बाळ'],
  ['mr','214','२१४'],['mr','guru','गुरू'],['mr','sTeshan','स्टेशन'],['mr','naav','नाव'],
  ['hi','zameen','ज़मीन'],['hi','shikaayat','शिकायत'],['hi','sharma','शर्मा'],['hi','mera','मेरा'],['hi','guru','गुरु'],
  ['hi','faisalaa','फ़ैसला'],['ta','raman','ரமன்'],['ta','naaN','நாண்'],['ta','kumaar','குமார்'],['te','ramesh','రమేశ్'],
  ['kn','ramesh','ರಮೇಶ್'],['ml','ramesh','രമേശ്'],['gu','ramesh','રમેશ'],['bn','ramesh','রমেশ'],
  ['pa','ramesh','ਰਮੇਸ਼'.normalize('NFC')],['or','ramesh','ରମେଶ'],['bn','vikaas','বিকাস'],['gu','baaL','બાળ'],
  ['te','raama','రామ'],['te','raamaa','రామా'],['kn','sita','ಸಿತ'],['te','chhatrapati','ఛత్రపతి'],['or','vikaas','ବିକାସ'],
];
for (const [l,i,e] of rules) eq(l+' '+i, X.word(i,l), e);
// 2. top suggestion for casual typing (dictionary + rules)
const top = [
  ['mr','patil','पाटील'],['mr','police','पोलीस'],['mr','kulkarni','कुलकर्णी'],['mr','deshmukh','देशमुख'],
  ['mr','firyadi','फिर्यादी'],['mr','mumbai','मुंबई'],['hi','police','पुलिस'],['hi','sharma','शर्मा'],['hi','hai','है'],
  ['mr','ramesh','रमेश'],['ta','ramesh','ரமேஶ்'],['mr','station','स्टेशन'],['mr','mala','मला'],
];
for (const [l,i,e] of top) eq('top '+l+' '+i, X.suggest(i,l)[0], e);
// 3. suggestion list properties
for (const w of ['patil','kalyan','ganesh','vishwas','shreekant','santosh','anita']) {
  const s = X.suggest(w,'mr'); n++;
  if (s.length < 2 || s.length > 6 || new Set(s).size !== s.length || s[s.length-1] !== w) { fail++; console.log('FAIL suggest props', w, s); }
  console.log('  suggest', w, s.join(' | '));
}
// casual words where the right spelling must appear somewhere in the list
const inList = [['mr','kalyan','कल्याण'],['mr','santosh','संतोष'],['mr','anita','अनिता'],['mr','sangli','सांगली'],['hi','kamla','कमला'],['ta','chennai','சென்னை'],['te','venkat','వెంకత్'],['hi','faisla','फ़ैसला'],['mr','sachin','सचिन'],['mr','pari','परि']];
for (const [l,w,e] of inList) { n++; const s = X.suggest(w,l); if (s.indexOf(e) < 0) { fail++; console.log('MISS', l, w, e, 'in', s.join(' | ')); } }
// 4. sentences
const S = (t,l) => X.sentence(t,l);
console.log(S('maze naav ramesh patil aahe. mi 21 august la bank madhe gelo', 'mr'));
console.log(S('mera naam ramesh hai aur maine police ko shikayat di', 'hi'));
eq('sentence keeps punctuation', S('police, bank.', 'mr'), 'पोलीस, बँक.');
eq('empty', S('', 'mr'), '');
eq('already native untouched', S('रमेश patil', 'mr'), 'रमेश पाटील');
// 5. no stray Devanagari in other scripts, no unassigned code points
const outs = [];
for (const l of Object.keys(X.LANGS)) for (const w of ['ramesh','kshitij','dnyaneshwar','baaL','vishwas','Shashtri','Rushi','Office','bEt','sangli','chhatrapati','jhaaD','phal','thoDa','ghaav','nyay','vyakti','jnyaan','~','.nd'])
  outs.push([l, w, X.word(w, l)]);
writeFileSync(new URL('./xlit.out.json', import.meta.url), JSON.stringify(outs));
for (const [l,w,o] of outs) if (l !== 'mr' && l !== 'hi' && /[ऀ-ॿ]/.test(o)) { fail++; console.log('DEVANAGARI LEAK', l, w, o); }
console.log(fail ? `${fail}/${n} failed` : `all ${n} checks passed`);
process.exitCode = fail ? 1 : 0;
