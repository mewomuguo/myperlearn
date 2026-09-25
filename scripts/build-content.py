import json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
spec=root/'docs/spec'
cat=json.loads((spec/'concept-catalog.json').read_text())['concepts']
inv=json.loads((spec/'lecture-inventory.json').read_text())
rows={}
for line in (root/'content/lessons.tsv').read_text().splitlines():
 if not line.strip():continue
 fields=line.split('|');assert len(fields)==7,(fields[0],len(fields));assert fields[0] not in rows;rows[fields[0]]=fields[1:]
assert set(rows)=={c['id'] for c in cat},(len(rows),set(c['id'] for c in cat)-set(rows))
blocked={'P3-04':'原表格末列遭截切，比例待核。','P5-14':'分紅表格符號不清，待核原表。','P5-27':'政府長照制度敘述待核對。','P5-38':'機關名稱與費率具有版本差異。','L3-02':'長照扣除金額適用年度待核。','L3-04':'給付所得稅與基本所得額需補充適用條件。','L3-08':'遺產稅級距適用年度待核。','L4-04':'特種個資同意条件與原題待核。','L4-05':'原文與題目申報期限起算點不同。','L5-14':'資金運用比例版本與例外待核。'}
questions=[]
for c in cat:
 e,example,q1,o1,q2,o2=rows[c['id']];c['lesson']={'explanation':e,'example':example,'recall':[c['outcome'],'遮住說明，用自己的話說出規則與適用條件。']}
 if c['id'] in blocked:c['issue']=blocked[c['id']]
 for index,(stem,opts) in enumerate([(q1,o1),(q2,o2)],1):
  choices=opts.split('~');assert len(choices)==4 and len(set(choices))==4,c['id']
  options=[{'id':k,'text':v} for k,v in zip('abcd',choices)]
  shift=(sum(map(ord,c['id']))+index)%4;options=options[shift:]+options[:shift]
  questions.append({'id':c['id']+'-Q'+str(index),'version':'1.0.0','familyId':c['id']+'-F'+str(index),'conceptId':c['id'],'stem':stem,'options':options,'correctOptionId':'a','explanation':e,'optionReasons':{k:('符合此講義考點。' if k=='a' else '此選項不符合本題條件；請對照解析中的規則與範圍。') for k in 'abcd'},'numeric':'數字／期限' in c['tags'],'status':'quarantined' if c['id'] in blocked else 'source_checked','sourcePages':c['printedPages'],'origin':'lecture_adapted','scope':'lecture_115_07'})
content={'version':'1.0.0-lecture11507','chapters':inv['chapters'],'concepts':cat,'questions':questions,'plans':json.loads((spec/'plan-v1.json').read_text()),'sources':[{'title':'保險講義.pdf・115年7月版','note':'114頁（印刷頁4–117）。重要度取自星級、A+、章末262題與重複概念。本網站提供原創改寫短課與題目，並非官方題庫；未公開原講義。'},{'title':'壽險公會資格測驗資訊','url':'https://www.lia-roc.org.tw/list_article?article_content=167','note':'正式報名科目、題數、時間與及格規則仍須依報名簡章確認。金融市場常識與職業道德不在本講義範圍。'},{'title':'全國法規資料庫・保險法','url':'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0390002','note':'用於交叉確認契約規則；學習內容標示講義版本，未宣稱所有數字均為最新法規。'}]}
(root/'public/data/content.json').write_text(json.dumps(content,ensure_ascii=False,indent=2))
print(len(cat),'concepts',len(questions),'questions',sum(q['status']=='source_checked' for q in questions),'enabled')
