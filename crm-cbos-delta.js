/* CBOS增量计划器：仅更新询盘及背景，不触碰订单/采购/库存/财务。 */
(function(root){
  'use strict';
  var fields=['date','alias','company','country','source','person','product','qty','notes','status','grade','amount','currency','flags','archived','expired','suggestedNextAction','email','phone','wechat','wangwang'];
  function copy(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function plan(stores,envelope,choices){
    if(!envelope||envelope.schemaVersion!==1||!envelope.batchId||envelope.source!=='CBOS'||!Array.isArray(envelope.inquiries)||!Array.isArray(envelope.followups))throw new Error('CBOS增量格式错误');
    var data=copy(stores),settings=data.crm_settings_v5||(data.crm_settings_v5={}),list=data.crm_inq_v5||(data.crm_inq_v5=[]),conflicts=[],stats={added:0,updated:0,followups:0};
    settings.cbosAppliedBatches=settings.cbosAppliedBatches||[];
    if(settings.cbosAppliedBatches.indexOf(envelope.batchId)>=0)return {stores:data,conflicts:[],stats:stats};
    var ids=new Set();
    envelope.inquiries.forEach(function(row){
      if(!row.sourceImportId||ids.has(row.sourceImportId)||!Number.isInteger(row.revision)||row.revision<1)throw new Error('CBOS询盘缺编号/版本或编号重复');ids.add(row.sourceImportId);
      var target=list.find(function(i){return i.sourceImportId===row.sourceImportId;});
      var tombstone=(data.crm_deleted_records_v1||[]).find(function(d){return d.store==='crm_inq_v5'&&d.sourceImportId===row.sourceImportId;});
      if(!target&&tombstone){var deletionPath='/cbos-deleted/'+row.sourceImportId;if(!choices||!choices[deletionPath]){conflicts.push({path:deletionPath,base:tombstone,local:'CRM已删除',remote:row});return;}if(choices[deletionPath]==='local')return;data.crm_deleted_records_v1=data.crm_deleted_records_v1.filter(function(d){return d!==tombstone;});}

      if(!target){var id=Math.max(Number(data.crm_inq_highwater_v1)||1,1,...list.map(function(i){return Number(i.id)||0;}))+1;target={id:id,sourceImportId:row.sourceImportId,followups:[],flags:[],_v2migrated:true,amount:null,currency:'',person:'',grade:'',date:''};list.push(target);data.crm_inq_highwater_v1=id+1;stats.added++;}
      if(target.cbosRevision&&row.revision<=target.cbosRevision)return;
      var base=target.cbosBaseline||{},next=copy(base);
      fields.forEach(function(k){
        var incoming=(row.fields||{})[k];if(incoming===undefined||incoming===null||incoming==='')return;
        if(k==='status'&&['新询盘','互动中','报价中','打样中','追单中','沉默中','已成单','失效'].indexOf(incoming)<0)throw new Error('CBOS状态无效');
        var path='/cbos/'+row.sourceImportId+'/'+k;
        if(same(target[k],incoming)||same(target[k],base[k])||target[k]===undefined||target[k]===''){target[k]=copy(incoming);}
        else if(!same(incoming,base[k])){if(choices&&choices[path])target[k]=copy(choices[path]==='remote'?incoming:target[k]);else conflicts.push({path:path,base:base[k],local:target[k],remote:incoming});}
        next[k]=copy(incoming);
      });
      if(row.fields&&row.fields.status==='已成单')target.archived=true;
      if(row.fields&&row.fields.status==='失效')target.expired=true;
      target.cbosBaseline=next;target.cbosRevision=row.revision;target.importedStatusNeedsReview=true;stats.updated++;
    });
    var eventIds=new Set();
    envelope.followups.forEach(function(event){
      if(!event.eventId||eventIds.has(event.eventId)||!event.inquiryId||!event.content||!Number.isInteger(event.revision)||event.revision<1)throw new Error('CBOS跟进缺事件编号/内容/版本或重复');eventIds.add(event.eventId);
      var target=list.find(function(i){return i.sourceImportId===event.inquiryId;});if(!target)throw new Error('跟进没有对应询盘');
      var events=target.cbosEvents||(target.cbosEvents={}),old=events[event.eventId];
      if(old&&event.revision<=old.revision)return;
      var text=(event.date||'日期待核')+' ['+(event.person||'经办人待核')+'] '+event.content;
      if(!target.followups)target.followups=[];
      if(old&&old.text!==text){var index=target.followups.indexOf(old.text),path='/cbos-event/'+event.eventId;if(index<0){if(!choices||!choices[path]){conflicts.push({path:path,base:old.text,local:'CRM已更改或移除该跟进',remote:text});return;}if(choices[path]==='local')return;}else target.followups.splice(index,1);}
      if(target.followups.indexOf(text)<0){target.followups.push(text);stats.followups++;}
      events[event.eventId]={revision:event.revision,text:text};
    });
    if(envelope.backgrounds){
      settings.inquiryBackgrounds=settings.inquiryBackgrounds||{};
      envelope.backgrounds.forEach(function(bg){
        if(!bg.alias||!bg.id||!bg.fields)throw new Error('背景资料缺稳定编号/客户代号');var key=bg.alias.trim().toUpperCase();var rows=settings.inquiryBackgrounds[key]||(settings.inquiryBackgrounds[key]=[]);var target=rows.find(function(b){return b.importId===bg.id;});if(!target){target={importId:bg.id};rows.push(target);}
        var bgbase=target.cbosBaseline||{};['website','business','position','assessment','source','date'].forEach(function(k){var v=bg.fields[k];if(!v)return;var path='/cbos-background/'+bg.id+'/'+k;if(!target[k]||same(target[k],bgbase[k])||same(target[k],v))target[k]=v;else if(!same(v,bgbase[k])){if(choices&&choices[path])target[k]=choices[path]==='remote'?v:target[k];else conflicts.push({path:path,base:bgbase[k],local:target[k],remote:v});}bgbase[k]=v;});target.cbosBaseline=bgbase;
      });
    }
    settings.cbosAppliedBatches.push(envelope.batchId);
    return {stores:data,conflicts:conflicts,stats:stats};
  }
  root.CrmCbosDelta={plan:plan,fields:fields};
})(window);
