import { describe,it,expect,vi } from 'vitest';
vi.mock('../src/ui/sprites',()=>({FAM:{},PORTRAIT:{},CRATE:{},DEER:[],ICON:{},MERCHANT:{},RABBIT:[],WALKERS:[],guestSprite(){}}));
import { SaveStore } from '../src/core/save';
import { RunUI } from '../src/ui/runMode';
import { newRun, goalFor } from '../src/core/run';
import { emptyBuildStats } from '../src/core/build';
const settle=async()=>{for(let i=0;i<5;i++) await Promise.resolve();};
function fixture() {
 const data=new Map<string,string>();let fail='';
 const store=new SaveStore({getItem:k=>data.get(k)??null,setItem(k,v){if(fail && k.includes(fail))throw Error('quota');data.set(k,v);},removeItem:k=>{data.delete(k);}});
 const m=store.loadRun();m.active=newRun(m,444,'paid-once');m.active.day=3;m.active.stage='open';m.active.days=[0,1,2].map(d=>({sales:goalFor(d,1,'joren'),goal:goalFor(d,1,'joren'),served:1,maxCombo:1,angry:0,maxChain:1,bestServe:0,road:'joren' as const}));store.saveRun(m);
 const g:any={store,t:0,mode:'play',tutorial:null,menu:{reset(){}},view:{run:{}},sound:new Proxy({}, {get:()=>()=>{}}),refreshCollection(){},session:{shop:{score:76000,stats:{served:1,maxCombo:1,angry:0},buildStats:emptyBuildStats()}}};
 const ui=new RunUI(g);ui.run=ui.meta.active;
 return {ui,g,store,fail:(key:string)=>{fail=key;}};
}
describe('繁盛記の保存待ち画面',()=>{
 it('Web Lock待ちで最終結果画面を跨いでも安全に描画できる',async()=>{const {ui,g}=fixture();g.sc=new Proxy({W:()=>1},{get:(obj,key)=>key in obj ? obj[key as keyof typeof obj] : ()=>{}});g.hover={add(){}};g.menu.active=[];g.menu.typed='';ui.finishDay();await settle();g.t=5;ui.saving=true;ui.screen='end';expect(()=>ui.draw()).not.toThrow();});
 it('完了後の二重閉店を止め、保存後に結果へ進む',async()=>{const {ui,store}=fixture();ui.finishDay();ui.finishDay();expect(ui.saving).toBe(true);await settle();expect(ui.screen).toBe('end');expect(ui.outcome?.coins).toBe(20000);expect(store.loadCollection().coins).toBe(20000);});
 it('保存できない間は中断や次の日へ進ませず、再試行で復旧する',async()=>{const {ui,store,fail}=fixture();fail('collection');ui.finishDay();await settle();expect(ui.screen).toBe('hub');expect(ui.menuItems().map(i=>i.kana)).toEqual(['さいしこう','もどる']);ui.escape();expect(ui.screen).toBe('hub');expect(store.loadRun().paid).not.toContain('paid-once');fail('');ui.menuItems()[0].act();await settle();expect(ui.screen).toBe('end');expect(ui.outcome?.coins).toBe(20000);expect(store.loadCollection().coins).toBe(20000);});
 it('保存拒否が続いても明示的に通常画面へ戻れる',async()=>{const {ui,g,fail}=fixture();g.toTitle=()=>{g.mode='title';};fail('run');ui.finishDay();await settle();const exit=ui.menuItems().find(it=>it.kana==='もどる');expect(exit).toBeDefined();exit!.act();expect(g.mode).toBe('title');expect(ui.menuItems().some(it=>it.kana==='さいしこう')).toBe(false);});
 it('別タブの進行を保存時に検知し最新の入口へ戻す',async()=>{const {ui,store}=fixture();const latest=store.loadRun();latest.loop=4;store.saveRun(latest);ui.finishDay();await settle();expect(ui.screen).toBe('hub');expect(ui.saveNote).toContain('別タブ');expect(ui.meta.loop).toBe(4);expect(store.loadCollection().coins).toBe(0);});
});


