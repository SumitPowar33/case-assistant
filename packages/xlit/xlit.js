// Phonetic English-letters -> Indian script engine (rule based, with a police-word dictionary).
// The production app would put AI4Bharat IndicXlit behind the same interface; this keeps the demo offline.
var XLIT = (function () {
  var V = [ // roman, independent, matra
    ['aa', 'आ', 'ा'], ['A', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ou', 'औ', 'ौ'],
    ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['I', 'ई', 'ी'], ['oo', 'ऊ', 'ू'], ['uu', 'ऊ', 'ू'], ['U', 'ऊ', 'ू'],
    ['Ru', 'ऋ', 'ृ'], ['e_', 'ऎ', 'ॆ'], ['o_', 'ऒ', 'ॊ'], ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['E', 'ऍ', 'ॅ'],
    ['o', 'ओ', 'ो'], ['O', 'ऑ', 'ॉ']
  ];
  var C = [ // longest first
    ['ksh', 'क्ष'], ['dny', 'ज्ञ'], ['chh', 'छ'], ['shh', 'ष'],
    ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['zh', 'झ'], ['Th', 'ठ'], ['Dh', 'ढ'], ['th', 'थ'],
    ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['Sh', 'ष'], ['gy', 'ज्ञ'], ['tr', 'त्र'],
    ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['T', 'ट'], ['D', 'ड'], ['N', 'ण'], ['t', 'त'],
    ['d', 'द'], ['n', 'न'], ['p', 'प'], ['f', 'फ'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'],
    ['l', 'ल'], ['L', 'ळ'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['x', 'क्स'], ['q', 'क'],
    ['z', 'ज'], ['R', 'र'], ['K', 'क'], ['G', 'ग'], ['J', 'ज'], ['P', 'प'], ['B', 'ब'], ['M', 'म'],
    ['Y', 'य'], ['H', 'ह'], ['V', 'व'], ['W', 'व'], ['S', 'स'], ['F', 'फ'], ['C', 'क'], ['Z', 'ज'], ['X', 'क्स'], ['Q', 'क']
  ];
  var DIGITS = { mr: 0x966, hi: 0x966 };
  var LANGS = {
    mr: { name: 'Marathi', label: 'मराठी', off: 0, tag: 'mr', finalVirama: false },
    hi: { name: 'Hindi', label: 'हिन्दी', off: 0, tag: 'hi', finalVirama: false },
    gu: { name: 'Gujarati', label: 'ગુજરાતી', off: 0x180, tag: 'gu', finalVirama: false },
    bn: { name: 'Bengali', label: 'বাংলা', off: 0x80, tag: 'bn', finalVirama: false },
    pa: { name: 'Punjabi', label: 'ਪੰਜਾਬੀ', off: 0x100, tag: 'pa', finalVirama: false },
    or: { name: 'Odia', label: 'ଓଡ଼ିଆ', off: 0x200, tag: 'or', finalVirama: false },
    ta: { name: 'Tamil', label: 'தமிழ்', off: 0x280, tag: 'ta', finalVirama: true },
    te: { name: 'Telugu', label: 'తెలుగు', off: 0x300, tag: 'te', finalVirama: true },
    kn: { name: 'Kannada', label: 'ಕನ್ನಡ', off: 0x380, tag: 'kn', finalVirama: true },
    ml: { name: 'Malayalam', label: 'മലയാളം', off: 0x400, tag: 'ml', finalVirama: true }
  };
  // Words police type every day. First item is the top suggestion.
  var DICT = {
    mr: { police: 'पोलीस', fir: 'एफआयआर', panchnama: 'पंचनामा', aaropi: 'आरोपी', aropi: 'आरोपी',
      firyadi: 'फिर्यादी', sakshidar: 'साक्षीदार', gunha: 'गुन्हा', thane: 'ठाणे',
      mobile: 'मोबाईल', bank: 'बँक', jabab: 'जबाब', japti: 'जप्ती', nyayalay: 'न्यायालय', court: 'कोर्ट',
      maze: 'माझे', mazhe: 'माझे', majhe: 'माझे', naav: 'नाव', nav: 'नाव', aahe: 'आहे', ahe: 'आहे', aani: 'आणि', ani: 'आणि',
      patil: 'पाटील', pawar: 'पवार', deshmukh: 'देशमुख', kulkarni: 'कुलकर्णी', joshi: 'जोशी', shinde: 'शिंदे',
      jadhav: 'जाधव', more: 'मोरे', kale: 'काळे', gaikwad: 'गायकवाड', chavan: 'चव्हाण', shaikh: 'शेख', kalyan: 'कल्याण',
      ganesh: 'गणेश', sunil: 'सुनील', anil: 'अनिल', rahul: 'राहुल', pooja: 'पूजा', mahesh: 'महेश', suresh: 'सुरेश',
      dnyaneshwar: 'ज्ञानेश्वर', shreekant: 'श्रीकांत', vishwas: 'विश्वास', station: 'स्टेशन', august: 'ऑगस्ट',
      madhe: 'मध्ये', madhye: 'मध्ये', la: 'ला', gelo: 'गेलो', ghari: 'घरी', vel: 'वेळ', vaajata: 'वाजता', vajta: 'वाजता',
      sangli: 'सांगली', satara: 'सातारा', kolhapur: 'कोल्हापूर', nashik: 'नाशिक', solapur: 'सोलापूर', santosh: 'संतोष',
      rupaye: 'रुपये', lakh: 'लाख', pune: 'पुणे', mumbai: 'मुंबई', nagpur: 'नागपूर', maharashtra: 'महाराष्ट्र',
      cyber: 'सायबर', online: 'ऑनलाइन', whatsapp: 'व्हॉट्सॲप', upi: 'यूपीआय', ota: 'ओटीपी', otp: 'ओटीपी', call: 'कॉल',
      mi: 'मी', tumhi: 'तुम्ही', tyanni: 'त्यांनी', tyani: 'त्यांनी', mala: 'मला', video: 'व्हिडिओ', paise: 'पैसे', divashi: 'दिवशी' },
    hi: { police: 'पुलिस', fir: 'एफआईआर', panchnama: 'पंचनामा', aaropi: 'आरोपी', aropi: 'आरोपी',
      shikayat: 'शिकायत', gawah: 'गवाह', gavah: 'गवाह', thana: 'थाना', mobile: 'मोबाइल', bank: 'बैंक', bayan: 'बयान',
      zabti: 'ज़ब्ती', jabti: 'जब्ती', adalat: 'अदालत', court: 'कोर्ट', mera: 'मेरा', naam: 'नाम', hai: 'है', aur: 'और',
      sharma: 'शर्मा', verma: 'वर्मा', singh: 'सिंह', kumar: 'कुमार', yadav: 'यादव', gupta: 'गुप्ता', mishra: 'मिश्रा',
      khan: 'ख़ान', delhi: 'दिल्ली', station: 'स्टेशन', august: 'अगस्त', thane: 'थाने', ko: 'को', mein: 'में', di: 'दी',
      rupaye: 'रुपये', lakh: 'लाख', cyber: 'साइबर', online: 'ऑनलाइन', whatsapp: 'व्हाट्सऐप', otp: 'ओटीपी', call: 'कॉल',
      main: 'मैं', maine: 'मैंने', unhone: 'उन्होंने', mujhe: 'मुझे', video: 'वीडियो', paise: 'पैसे', din: 'दिन' }
  };
  var ANUSVARA_BEFORE = /^(k|g|c|j|t|d|p|b|T|D|s|sh|z)/;

  function startsAt(s, i, list) {
    for (var k = 0; k < list.length; k++) if (s.substr(i, list[k][0].length) === list[k][0]) return list[k];
    return null;
  }
  // Roman word -> Devanagari (Marathi/Hindi spelling conventions).
  function prep(w, lang) {
    w = w.replace(/tion$/, 'shan').replace(/tion(?=[a-z])/, 'shan');
    w = w.replace(/c(?=[eiy])/g, 's');
    if (LANGS[lang] && LANGS[lang].finalVirama) return w.replace(/i_$/, 'i'); // Dravidian: keep what was typed
    // Indian typing habit: a word ending in a, i (and u in Marathi) after a consonant is the long vowel
    w = w.replace(/([^aeiouAEIOU])a$/, '$1aa').replace(/([^aeiouAEIOU])i$/, '$1ee').replace(/i_$/, 'i');
    return w;
  }
  function toDeva(w, lang) {
    w = prep(w, lang);
    if (lang === 'mr') w = w.replace(/([^aeiouAEIOU])u$/, '$1oo');
    var out = '', i = 0, pending = false; // pending = last char is a bare consonant
    while (i < w.length) {
      var ch = w[i];
      // n / m before a stop consonant at syllable end -> anusvara
      if ((ch === 'n' || ch === 'm') && pending === false && out && i + 1 < w.length && ANUSVARA_BEFORE.test(w.substr(i + 1)) &&
          !startsAt(w, i + 1, V)) { out += 'ं'; i++; continue; }
      var c = startsAt(w, i, C);
      if (c) {
        // Hindi keeps nukta sounds for z and f
        var g = c[1];
        if (lang === 'hi' && c[0] === 'z') g = 'ज़';
        if (lang === 'hi' && c[0] === 'f') g = 'फ़';
        if (pending) out += '्';
        out += g; pending = true; i += c[0].length; continue;
      }
      var v = startsAt(w, i, V);
      if (v) {
        if (pending) out += v[2]; else out += v[1];
        pending = false; i += v[0].length; continue;
      }
      if (ch === '.' && w[i + 1] === 'n') { out += 'ं'; i += 2; continue; }
      if (ch === '~') { out += 'ँ'; i++; continue; }
      if (/[0-9]/.test(ch)) { out += String.fromCharCode(0x966 + (+ch)); pending = false; i++; continue; }
      out += ch; pending = false; i++;
    }
    return { text: out, endsBare: pending };
  }
  var TAMIL_FOLD = { 'ख': 'क', 'ग': 'क', 'घ': 'क', 'छ': 'च', 'झ': 'ज', 'ठ': 'ट', 'ड': 'ट', 'ढ': 'ट', 'थ': 'त', 'द': 'त', 'ध': 'त',
    'फ': 'प', 'ब': 'प', 'भ': 'प', 'ऋ': 'रु', 'ृ': 'ु', 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो', 'ं': 'म्', 'ँ': 'म्', 'ञ': 'ञ' };
  var FOLD = {
    bn: { 'व': 'ब', 'ळ': 'ल', 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो' },
    pa: { 'ष': 'श', 'ऋ': 'रि', 'ृ': 'ि', 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो', 'ञ': 'ञ', 'ँ': 'ं' },
    or: { 'व': 'ब', 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो' },
    te: { 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो' },
    kn: { 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो' },
    ml: { 'ऍ': 'ए', 'ॅ': 'े', 'ऑ': 'ओ', 'ॉ': 'ो', 'ँ': 'ं' },
    gu: { 'ॅ': 'ॅ' }
  };
  function toScript(deva, lang) {
    var L = LANGS[lang];
    if (!L || L.off === 0) return deva;
    var s = deva.replace(/़/g, '');
    if (lang === 'pa') s = s.replace(/श/g, 'स़').replace(/ळ/g, 'ल़');
    if (lang === 'ta') s = s.charAt(0) + s.slice(1).replace(/न/g, 'ऩ');
    var fold = lang === 'ta' ? TAMIL_FOLD : (FOLD[lang] || {});
    var t = '';
    for (var i = 0; i < s.length; i++) t += (fold[s[i]] !== undefined ? fold[s[i]] : s[i]);
    var r = '';
    for (var j = 0; j < t.length; j++) {
      var code = t.charCodeAt(j);
      if (code >= 0x900 && code <= 0x97F) r += String.fromCharCode(code + L.off); else r += t[j];
    }
    if (lang === 'pa') r = r.replace(/ਸ਼਼/g, 'ਸ਼').replace(/ਲ਼/g, 'ਲ਼');
    return r;
  }
  function word(w, lang) {
    var d = toDeva(w, lang), s = d.text;
    var native = toScript(s, lang);
    if (LANGS[lang] && LANGS[lang].finalVirama && d.endsBare) native += String.fromCharCode(0x94D + LANGS[lang].off);
    return native;
  }
  // Up to 4 suggestions for one roman word.
  function suggest(w, lang) {
    if (!w) return [];
    var list = [], lower = w.toLowerCase();
    var dict = DICT[lang];
    if (dict && dict[lower]) list.push(dict[lower]);
    if (!/^[a-zA-Z.~]+$/.test(w)) return list.length ? list : [w];
    var base = word(w, lang);
    if (list.indexOf(base) < 0) list.push(base);
    var vars = [];
    var aPos = [];
    for (var q = 1; q < w.length - 1; q++) if (w[q] === 'a' && w[q - 1] !== 'a' && 'aeiou'.indexOf(w[q + 1]) < 0) aPos.push(q);
    aPos.slice(0, 2).forEach(function (q) { vars.push(w.slice(0, q) + 'aa' + w.slice(q + 1)); });
    if (LANGS[lang] && LANGS[lang].finalVirama) {
      if (/(^|[^e])e(?!e)/.test(w)) vars.unshift(w.replace(/(^|[^e])e(?!e)/g, '$1e_'));
      if (/(^|[^o])o(?!o)/.test(w)) vars.unshift(w.replace(/(^|[^o])o(?!o)/g, '$1o_'));
    }
    if (/sh/.test(w)) vars.push(w.replace(/sh/, 'Sh'));
    // schwa the typist left out: kamla -> kamala, faisla -> faisala
    var m = /^(.*?[aeiou]+)([bcdfgjklmnpqrstvwxz])(?!h)([bcdfgjklmpqrstvwxz])(.*)$/.exec(w);
    if (m) vars.push(m[1] + m[2] + 'a' + m[3] + m[4]);
    if (/i$/.test(w)) vars.push(w.replace(/i$/, 'i_'));
    if (/n[aeiou]/.test(w)) vars.push(w.replace(/n(?=[aeiou])/, 'N'));
    if (/t(?!h)/.test(w)) vars.push(w.replace(/t(?!h)/, 'T'));
    if (/d(?!h)/.test(w)) vars.push(w.replace(/d(?!h)/, 'D'));
    if (/l/.test(w) && lang === 'mr') vars.push(w.replace(/l/, 'L'));
    for (var k = 0; k < vars.length && list.length < 5; k++) {
      var c = word(vars[k], lang);
      if (list.indexOf(c) < 0) list.push(c);
    }
    list.push(w); // keep the English spelling as the last choice
    return list.slice(0, 6);
  }
  // Convert every roman word in a sentence (top suggestion each).
  function sentence(text, lang) {
    return text.replace(/[A-Za-z][A-Za-z~]*/g, function (m) { return suggest(m, lang)[0]; });
  }
  return { LANGS: LANGS, word: word, suggest: suggest, sentence: sentence, toScript: toScript };
})();
export default XLIT;
