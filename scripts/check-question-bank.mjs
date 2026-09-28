import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const bank=JSON.parse(fs.readFileSync(new URL('public/data/question-bank.json',root),'utf8'));
const c=JSON.parse(fs.readFileSync(new URL('public/data/content.json',root),'utf8'));
assert.equal(bank.questions.length,435);assert.equal(new Set(bank.questions.map(q=>q.id)).size,435);
for(const [section,count]of Object.entries({'practice':158,'law':258,'practice-extra':11,'law-extra':8}))assert.equal(bank.questions.filter(q=>q.section===section).length,count);
for(const section of ['practice','law']){const qs=bank.questions.filter(q=>q.section===section);for(let i=1;i<=qs.length;i++)assert(qs.some(q=>q.number===String(i)))}
for(const q of bank.questions){assert(q.pdfPage>=2&&q.pdfPage<=55);assert(['1','2','3','4'].includes(q.answer));assert(q.text.length>25);assert(q.conceptIds.length>0);for(const id of q.conceptIds)assert(c.concepts.some(x=>x.id===id));for(const key of ['image','answerImage']){assert(q[key].startsWith('question-bank/'));assert(fs.statSync(new URL('public/'+q[key],root)).size>100)}for(let i=1;i<=4;i++)assert(new RegExp('[（(]\\s*'+i+'\\s*[）)]').test(q.text),q.id)}
assert.equal(bank.questions.find(q=>q.id==='practice-1').answer,'2');assert.equal(bank.questions.find(q=>q.id==='practice-3').starred,true);assert.equal(bank.questions.find(q=>q.id==='law-13').answer,'1');assert.equal(bank.questions.find(q=>q.id==='law-75').answer,'3');assert.equal(bank.questions.find(q=>q.id==='law-248').answer,'4');
console.log('435 source questions, continuous numbering, 870 images, answers and mappings validated.');
