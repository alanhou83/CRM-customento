"""校验并打包CBOS已整理的增量JSON，不猜测业务日期，不读取邮箱或自动发送消息。"""
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args();d=json.loads(a.source.read_text())
assert d.get('schemaVersion')==1 and d.get('source')=='CBOS'
assert re.fullmatch(r'[A-Za-z0-9_-]+',d.get('batchId',''))
assert d.get('exportedAt') and isinstance(d.get('inquiries'),list) and isinstance(d.get('followups'),list)
for field,key in [('inquiries','sourceImportId'),('followups','eventId')]:
 ids=set()
 for row in d[field]:
  assert row.get(key) and row[key] not in ids and isinstance(row.get('revision'),int) and row['revision']>0
  ids.add(row[key])
a.output.mkdir(parents=True,exist_ok=True);path=a.output/(d['batchId']+'.json');content=json.dumps(d,ensure_ascii=False,indent=2)+'\n';assert not path.exists() or path.read_text()==content,'同一批次ID不得改写内容';path.write_text(content);print(path.name)
