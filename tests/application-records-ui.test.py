"""匿名选用记录回归；需要Python Playwright/Chromium，不连接云端。"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import shutil
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        if not self.path.startswith('/CRM-customento/'):
            self.send_error(404)
            return
        self.path = self.path[len('/CRM-customento'):]
        super().do_GET()
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
        ctx = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/fonts.googleapis.com/**', lambda route: route.abort())
        page.goto('http://127.0.0.1:' + str(server.server_port) + '/CRM-customento/crm-v5_final_5.html')
        page.wait_for_function('window.CrmProcessUI!==undefined')
        ids = page.evaluate('''()=>{
          localStorage.setItem(SK.prodcat,JSON.stringify({products:[
            {id:'anon-fg',nameCN:'匿名成品',type:'blank',categoryCode:'CTR',hasStock:true,skus:[{id:'fg-a',skuCode:'CTR-9001-01',variantCN:'甲款',stockUnit:'个'},{id:'fg-b',skuCode:'CTR-9001-02',variantCN:'乙款',stockUnit:'个'}]},
            {id:'anon-raw',nameCN:'匿名板材',type:'raw',categoryCode:'BRD',hasStock:true,skus:[{id:'raw-a',skuCode:'BRD-9001-01',stockUnit:'张'}]},
            {id:'anon-pkg',nameCN:'匿名纸箱',type:'packaging',categoryCode:'PKG',hasStock:true,skus:[{id:'pkg-a',skuCode:'PKG-9001-01',stockUnit:'个'}]}
          ]}));
          var cat=getProdCatData(),fg=cat.products[0].skus[0].skuCode,other=cat.products[0].skus[1].skuCode,raw=cat.products[1].skus[0].skuCode,box=cat.products[2].skus[0].skuCode;
          orders=[{id:101,orderNumber:'匿名订单',items:[{id:'line-a',skuCode:fg,nameCN:'匿名甲款',qty:101,unit:'个'},{id:'line-b',skuCode:other,nameCN:'匿名乙款',qty:10,unit:'个'}]}];localStorage.setItem(SK.ord,JSON.stringify(orders));
          localStorage.setItem(SK.production,JSON.stringify(CrmProductionModel.empty()));var s=CrmProduction.data(),ctx={id:'anon-batch',at:'2026-11-24T01:00:00Z',person:'匿名主管'};
          var batch=CrmProductionModel.createBatch(s,['101'],false,ctx,'匿名工单'),p=s.production.products[0],q=s.production.products[1];
          var r=CrmProcessModel.savePlan(s,'recipe',{name:'匿名加工版本',kind:'product',scopeSku:fg,route:[{name:'匿名切割'}],items:[{skuCode:raw,qty:1,perOutput:10}]},{...ctx,id:'anon-recipe'});
          var pack=CrmProcessModel.savePlan(s,'packaging',{name:'匿名包装版本',scopeSku:fg,items:[{skuCode:box,qty:1,perOutput:20}],carton:{pcs:20}},{...ctx,id:'anon-pack'});
          var template=CrmProcessModel.savePlan(s,'recipe',{name:'匿名通用路线',kind:'route',route:[{name:'匿名整理'}],items:[]},{...ctx,id:'anon-template'});
          localStorage.setItem(SK.production,JSON.stringify(s.production));showPage('production');return {p:p.id,q:q.id,r:r.id,pack:pack.id,template:template.id};
        }''')
        def submit():
            page.locator('#pn-form button[type=submit]').click()
        def close():
            page.locator('#pn-dialog button[data-pn=close-modal]').first.click()
            expect(page.locator('#pn-dialog')).to_be_hidden()
        def manage(pid):
            page.locator('[data-px=apply][data-value="' + pid + '"]').click()
        inventory = page.evaluate('CrmProduction.data().inventory')
        manage(ids['p'])
        page.locator('#px-apply-recipe').select_option(ids['r'])
        page.locator('#px-apply-pack').select_option(ids['pack'])
        submit()
        expect(page.locator('.px-application-success')).to_contain_text('选用已保存')
        expect(page.locator('.px-application-record')).to_have_count(1)
        expect(page.locator('.px-application-record')).to_contain_text('101 个')
        expect(page.locator('.px-application-record')).to_contain_text('Alan')
        expect(page.locator('.px-application-record')).to_contain_text('选用：')
        assert page.locator('#px-apply-qty').count() == 0
        expect(page.locator('#pn-root .px-task-plan-status').first).to_contain_text('已安排 101/101')
        close()
        manage(ids['p'])
        expect(page.locator('#pn-dialog')).to_contain_text('工艺和包装已全部安排')
        assert page.locator('#px-apply-recipe').count() == 0
        old_id = page.locator('.px-application-record').get_attribute('data-application-id')
        page.locator('[data-px=edit-application]').click()
        expect(page.locator('#px-apply-qty')).to_have_value('101')
        expect(page.locator('#px-apply-recipe')).to_have_value(ids['r'])
        expect(page.locator('#px-apply-pack')).to_have_value(ids['pack'])
        page.locator('#px-apply-qty').fill('60')
        page.locator('#px-apply-reason').fill('本批先安排一部分')
        submit()
        expect(page.locator('.px-application-success')).to_contain_text('调整已保存')
        apps = page.evaluate('CrmProduction.data().production.processApplications')
        assert len(apps) == 2 and next(a for a in apps if a['id'] == old_id)['qty'] == 101
        assert next(a for a in apps if a['status'] == 'active')['qty'] == 60
        expect(page.locator('#pn-dialog')).to_contain_text('剩余 41')
        page.locator('[data-px=apply-add]').click()
        expect(page.locator('#px-apply-qty')).to_have_value('41')
        page.locator('#px-apply-recipe').select_option(ids['r'])
        page.locator('#px-apply-pack').select_option(ids['pack'])
        submit()
        expect(page.locator('.px-application-success')).to_contain_text('选用已保存')
        assert page.evaluate('CrmProcessModel.coverage(CrmProduction.data(),' + repr(ids['p']) + ',false)') == 101
        expect(page.locator('#pn-dialog')).to_contain_text('工艺和包装已全部安排')
        page.locator('[data-px=edit-application]').first.click()
        page.locator('#px-apply-qty').fill('20')
        close()
        assert page.evaluate('CrmProcessModel.coverage(CrmProduction.data(),' + repr(ids['p']) + ',false)') == 101
        # 库方案修订后，查看的仍是选用当时v1。
        page.evaluate('''rid=>{CrmProduction.helpers.commit(s=>{var r=s.production.processRecipes.find(r=>r.id===rid);CrmProcessModel.savePlan(s,'recipe',{...r,previousId:r.id,name:'匿名库新版本'},{id:'anon-recipe-v2',at:'2026-11-24T02:00:00Z',person:'匿名主管'});},'production');CrmProduction.helpers.render();}''', ids['r'])
        manage(ids['p'])
        page.locator('[data-px=application-detail]').first.click()
        expect(page.locator('#pn-dialog h2')).to_have_text('选用记录 · 当时配置')
        expect(page.locator('#pn-dialog')).to_contain_text('匿名加工版本 · v1')
        expect(page.locator('#pn-dialog')).not_to_contain_text('匿名库新版本')
        page.locator('#pn-dialog [data-px=application-manager]').click()
        for width in [320, 390, 736, 1280]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.locator('.pn-dialog-content').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        close()
        manage(ids['q'])
        page.locator('#px-apply-recipe').select_option(ids['template'])
        expect(page.locator('#px-apply-quantity')).to_be_hidden()
        expect(page.locator('#px-apply-pack')).to_be_disabled()
        submit()
        expect(page.locator('.px-application-success')).to_contain_text('仅更新工序')
        expect(page.locator('#pn-dialog')).to_contain_text('通用路线带入记录')
        assert page.evaluate('CrmProcessModel.coverage(CrmProduction.data(),' + repr(ids['q']) + ',false)') == 0
        close()
        # 下达后可查看，但不能误把历史作为空白新增或直接调整。
        page.evaluate('''pid=>{CrmProduction.helpers.commit(s=>{var p=s.production.products.find(p=>p.id===pid);p.route.forEach(r=>r.assignees=['匿名员工']);CrmProductionModel.releaseRoute(s,p.id,false);},'production');CrmProduction.helpers.render();}''', ids['p'])
        manage(ids['p'])
        expect(page.locator('#pn-dialog')).to_contain_text('任务已下达')
        assert page.locator('[data-px=edit-application]').count() == 0
        close()
        page.locator('[data-pn=workflow]').click()
        expect(page.locator('.px-workflow li')).to_have_count(6)
        expect(page.locator('#pn-dialog')).to_contain_text('已有料的部分可先安排')
        page.locator('[data-px=work-tab][data-value=materials]').first.click()
        expect(page.locator('#pn-dialog')).to_be_hidden()
        expect(page.locator('[data-pn=tab][data-value=materials]')).to_have_class('on')
        assert page.evaluate('CrmProduction.data().inventory') == inventory
        page.reload()
        page.wait_for_function('window.CrmProcessUI!==undefined')
        assert page.evaluate('CrmProduction.data().production.processApplications.length') == 3
        assert not errors, errors
        browser.close()
        print('选用界面通过：保存后显示记录、产品行安排量、满额不再给空白0表单、调整保留原值/原因、剩余数量补充、取消不改、历史快照、路线留痕、下达只读、操作顺序入口、手机布局及重载保留。')
finally:
    server.shutdown()
    server.server_close()
