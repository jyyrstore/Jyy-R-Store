const test=require('node:test');
const assert=require('node:assert/strict');
const {formatIDR}=require('../../src/utils/currency');
const {hmac}=require('../../src/utils/crypto');
const {pageParams}=require('../../src/utils/pagination');
const {icon}=require('../../src/utils/icons');

test('currency formatting is IDR-localized',()=>assert.match(formatIDR(15000),/15[.]000|Rp\s?15[.]000/i));
test('pagination clamps page/limit safely',()=>assert.deepEqual(pageParams({page:0,limit:500}),{page:1,limit:100,offset:0}));
test('webhook HMAC helper is deterministic',()=>assert.equal(hmac('hello','secret'),'88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b'));
test('icon system returns SVG',()=>assert.match(icon('download'),/^<svg[\s\S]*<\/svg>$/));


test('navigation icons stay visibly scalable',()=>{
  const fs=require('fs');
  const nav=fs.readFileSync(require.resolve('../../public/css/navigation.css'),'utf8');
  const responsive=fs.readFileSync(require.resolve('../../public/css/responsive.css'),'utf8');
  const components=fs.readFileSync(require.resolve('../../public/css/components.css'),'utf8');

  assert.match(
    nav,
    /\.nav-link svg\{width:32px;height:32px;max-width:32px;max-height:32px;min-width:32px;min-height:32px;flex:0 0 32px/
  );

  assert.match(
    responsive,
    /\.bottom-item svg\{width:32px;height:32px;max-width:32px;max-height:32px;min-width:32px;min-height:32px;flex:0 0 32px/
  );

  assert.match(
    components,
    /\.icon\{[^}]*max-width:none;max-height:none/
  );
});
