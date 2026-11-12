const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const strings=JSON.parse(fs.readFileSync('src/i18n.json','utf8'));
// src/i18n.js in a fake page: location, <html lang>, browser language and load state.
function i18n({url,htmlLang='',navLang,readyState='complete'}={}){
 const u=url?new URL(url):null,g={BxI18nStrings:strings};
 if(u)g.location={hostname:u.hostname,pathname:u.pathname};
 g.document={readyState,documentElement:{lang:htmlLang}};
 if(navLang)g.navigator={language:navLang};
 g.globalThis=g;vm.runInNewContext(fs.readFileSync('src/i18n.js','utf8'),g);return g.BxI18n;
}
test('language follows the www.xbox.com locale, then <html lang>, then the browser',()=>{
 assert.equal(i18n({url:'https://www.xbox.com/en-US/play',navLang:'pt-BR'}).lang,'en');
 assert.equal(i18n({url:'https://www.xbox.com/es-MX/play/games',navLang:'en-US'}).lang,'es');
 assert.equal(i18n({url:'https://www.xbox.com/pt-BR/play',navLang:'en-US'}).lang,'pt');
 assert.equal(i18n({url:'https://www.xbox.com/fr-FR/play',navLang:'pt-BR'}).lang,'en','unsupported language falls back to English');
 assert.equal(i18n({url:'https://www.xbox.com/zh-TW/play',navLang:'pt-BR'}).lang,'en');
 assert.equal(i18n({url:'https://play.xbox.com/play/games',htmlLang:'es-ES',navLang:'en-US'}).lang,'es');
 assert.equal(i18n({url:'https://play.xbox.com/play',navLang:'pt-PT'}).lang,'pt');
 assert.equal(i18n({url:'https://play.xbox.com/play',navLang:'de-DE'}).lang,'en');
 assert.equal(i18n({}).lang,'pt','no language source: the pt-BR source texts');
});
test('the browser language is not cached while the page loads; <html lang> wins once set',()=>{
 const g={BxI18nStrings:strings,location:{hostname:'play.xbox.com',pathname:'/play'},navigator:{language:'en-US'},document:{readyState:'loading',documentElement:{lang:''}}};
 g.globalThis=g;vm.runInNewContext(fs.readFileSync('src/i18n.js','utf8'),g);
 assert.equal(g.BxI18n.lang,'en');
 g.document.documentElement.lang='es-MX';assert.equal(g.BxI18n.lang,'es');
 g.document.documentElement.lang='en-US';assert.equal(g.BxI18n.lang,'es','cached after a real source');
});
test('t() translates, interpolates and falls back to pt-BR; separators follow the language',()=>{
 const key=Object.keys(strings).find(k=>/\{0\}/.test(k));
 const en=i18n({navLang:'en-US'}),pt=i18n({navLang:'pt-BR'}),es=i18n({navLang:'es-ES'});
 assert.equal(en.t(key,'X'),strings[key].en.replace(/\{0\}/g,'X'));
 assert.equal(pt.t(key,'X'),key.replace(/\{0\}/g,'X'));
 assert.equal(en.t('texto sem tradução {0}',1),'texto sem tradução 1');
 assert.deepEqual([en.decimal,en.thousands,pt.decimal,pt.thousands,es.decimal],['.',',',',','.',',']);
});
test('every t() text in src has English and Spanish, with the same placeholders',()=>{
 const files=['src','src/play'].flatMap(d=>fs.readdirSync(d).filter(f=>f.endsWith('.js')).map(f=>path.join(d,f)));
 const used=new Set(),missing=[];
 for(const f of files){
  for(const m of fs.readFileSync(f,'utf8').matchAll(/\bt\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`$\\]*`)/g)){
   const key=vm.runInNewContext(m[1]);used.add(key);if(!strings[key])missing.push(f+': '+key);
  }
 }
 assert.deepEqual(missing,[]);
 assert.ok(used.size>100,'texts wrapped in t(): '+used.size);
 const holes=s=>(s.match(/\{\d\}/g)||[]).sort().join();
 for(const [k,v] of Object.entries(strings))for(const l of ['en','es']){
  assert.ok(typeof v[l]==='string'&&v[l].trim(),`${l} missing: ${k}`);
  assert.equal(holes(v[l]),holes(k),`${l} placeholders differ: ${k}`);
 }
});
