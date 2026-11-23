"""匿名浏览器回归；需要Python Playwright和Chromium，不连接真实云端。"""
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
        codes = page.evaluate('''()=>{
          localStorage.setItem(SK.prodcat,JSON.stringify({products:[
            {id:'anon-fg',nameCN:'匿名成品',type:'blank',categoryCode:'CTR',hasStock:true,skus:[{id:'fg-sku',skuCode:'CTR-9001-01',stockUnit:'个'}]},
            {id:'anon-raw',nameCN:'匿名板材',type:'raw',categoryCode:'BRD',hasStock:true,skus:[{id:'raw-sku',skuCode:'BRD-9001-01',stockUnit:'张'}]}
          ]}));
          localStorage.setItem(SK.production,JSON.stringify(CrmProductionModel.empty()));
          var catalog=getProdCatData();showPage('production');CrmProduction.openLibrary('recipes');
          return {fg:catalog.products[0].skus[0].skuCode,raw:catalog.products[1].skus[0].skuCode};
        }''')
        def pick(field, value):
            page.locator('#' + field + '-query').fill(value)
            page.locator('[data-px=pick-sku][data-value^="' + field + '|"]').first.click()
        def submit():
            page.locator('#pn-form button[type=submit]').click()
        def closed():
            expect(page.locator('#pn-dialog')).to_be_hidden()
        def new(name):
            page.locator('[data-px=new-plan]').click()
            page.locator('#px-plan-name').fill(name)
        new('匿名具体加工')
        expect(page.locator('#px-plan-kind')).to_have_value('product')
        assert page.locator('#px-plan-generic').count() == 0
        # 先填工序和用料，再选产品；中间操作不会强制提交完整表单。
        page.locator('[data-px=plan-step-add]').click()
        page.locator('#px-stage-name-0').fill('匿名切割')
        page.locator('#px-stage-req-0').fill('保留完整要求\n尚未选择成品时允许继续配置')
        page.locator('[data-px=plan-item-add]').click()
        pick('px-item-sku-0', codes['raw'])
        page.locator('#px-item-qty-0').fill('1')
        page.locator('#px-item-output-0').fill('9')
        submit()
        expect(page.locator('#px-plan-error')).to_contain_text('选中要生产的产品SKU')
        expect(page.locator('#px-plan-name')).to_have_value('匿名具体加工')
        expect(page.locator('#px-stage-req-0')).to_have_value('保留完整要求\n尚未选择成品时允许继续配置')
        expect(page.locator('#px-item-output-0')).to_have_value('9')
        assert page.evaluate('CrmProduction.data().production.processRecipes.length') == 0
        # 切换模板不静默删除已填物料，说明如何改回。
        page.locator('#px-plan-kind').select_option('route')
        expect(page.locator('#pn-form button[type=submit]')).to_be_disabled()
        expect(page.locator('#px-plan-error')).to_contain_text('已填物料仍保留')
        expect(page.locator('#px-item-output-0')).to_have_value('9')
        page.locator('#px-plan-kind').select_option('product')
        pick('px-plan-sku', codes['fg'])
        submit()
        closed()
        saved = page.evaluate('CrmProduction.data().production.processRecipes[0]')
        assert saved['scopeSku'] == codes['fg'] and len(saved['items']) == 1
        # 继续补充保持原产品和工艺；历史版本不变。
        page.locator('[data-px=revise-plan]').click()
        expect(page.locator('#px-plan-sku')).to_have_value(codes['fg'])
        page.locator('#px-plan-req').fill('追加要求')
        submit()
        closed()
        assert page.evaluate('CrmProduction.data().production.processRecipes.length') == 2
        assert page.evaluate('CrmProduction.data().production.processRecipes[0].requirements') == saved['requirements']
        new('匿名通用路线')
        page.locator('#px-plan-kind').select_option('route')
        expect(page.locator('.px-material-section')).to_be_hidden()
        page.locator('[data-px=plan-step-add]').click()
        page.locator('#px-stage-name-0').fill('匿名整理')
        submit()
        closed()
        template = page.evaluate('CrmProduction.data().production.processRecipes.at(-1)')
        assert template['kind'] == 'route' and template['scopeSku'] == '' and template['items'] == []
        # 精确输入SKU可保存；仅输入模糊文字不猜测匹配。
        new('匿名精确编码')
        page.locator('#px-plan-sku-query').fill('匿名成品')
        submit()
        expect(page.locator('#px-plan-error')).to_contain_text('选中要生产的产品SKU')
        page.locator('#px-plan-sku-query').fill(codes['fg'])
        submit()
        closed()
        assert page.evaluate('CrmProduction.data().production.processRecipes.at(-1).scopeSku') == codes['fg']
        # 包装的通用开关保留；选中SKU时自动改为具体产品，防止同样的清空问题。
        page.locator('[data-px=tab][data-value=packaging]').click()
        new('匿名指定包装')
        expect(page.locator('#px-plan-generic')).to_be_checked()
        pick('px-plan-sku', codes['fg'])
        expect(page.locator('#px-plan-generic')).not_to_be_checked()
        submit()
        closed()
        assert page.evaluate('CrmProduction.data().production.packagingPlans[0].scopeSku') == codes['fg']
        page.locator('[data-px=tab][data-value=recipes]').click()
        new('匿名手机草稿')
        for width in [320, 390, 736, 1280]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.locator('.pn-dialog-content').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        assert not errors, errors
        browser.close()
        print('工艺用途回归通过：无冲突默认开关，选中SKU不丢失，未完成草稿可配置，缺SKU原表单提示/保留，通用路线无SKU保存，切换不删物料，精确编码和包装范围、旧版本与手机布局。')
finally:
    server.shutdown()
    server.server_close()
