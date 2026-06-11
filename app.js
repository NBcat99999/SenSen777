const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const TODAY=new Date().toISOString().slice(0,10), MONTH=TODAY.slice(0,7);
const money=n=>'¥'+Number(n||0).toLocaleString('zh-CN',{maximumFractionDigits:0});
const pct=n=>`${Number(n||0).toFixed(1)}%`;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let state;
const toast=text=>{const el=$('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)};
const financeBus=new EventTarget();
const broadcast=(action,modules='全部模块')=>{
 $('#actionSignal').textContent=`${action} → ${modules}`;
 financeBus.dispatchEvent(new CustomEvent('finance:changed',{detail:{action,modules}}));
};
const api=async(path,options={})=>{const res=await fetch(path,{headers:options.body instanceof FormData?{}:{'Content-Type':'application/json'},...options});if(!res.ok)throw new Error(await res.text());return res.json()};
const metric=(label,value,sub='',cls='')=>`<div class="metric ${cls}"><span>${label}</span><strong>${value}</strong><span>${sub}</span></div>`;
const sum=rows=>rows.reduce((total,row)=>total+Number(row.amount||0),0);
const costTotal=row=>Number(row.unitAmount||0)*Number(row.quantity||0);
const monthContains=(row,month)=>{
 const start=String(row.date||row.startDate||'').slice(0,7);
 const end=String(row.endDate||'').slice(0,7);
 return Boolean(start)&&start<=month&&(!end||end>=month);
};
const evidenceFor=id=>state.evidence.some(x=>x.transactionId===id);
const claimHasTicket=x=>Boolean(x.invoiceNo||x.attachmentId);
const transactionHasTicket=x=>Boolean(x.invoiceNo||evidenceFor(x.id));
const glossary=[
 ['Actual Cash','实际现金','期初现金＋累计收入＋融资－经营支出－已支付报销','对应已经真实发生的银行及现金收付','低于零为重大风险'],
 ['Available Cash','可用现金','实际现金－待审核报销－已审核未支付报销','反映扣除已知承诺后的真实资金余量','低于三个月净消耗需预警'],
 ['Committed Cash','承诺现金','待审核报销＋已审核未支付报销','虽未付款但已有较高概率流出的现金','应纳入短期资金安排'],
 ['Accrued Expense','权责费用','经营支出＋已审核报销＋已支付报销','按经济事项发生确认费用，而非只看付款','与现金支出需分别管理'],
 ['Accounts Payable','应付账款','未结贸易应付＋已审核未支付报销','衡量公司已经形成但尚未支付的义务','到期前必须纳入现金计划'],
 ['MRR','月度经常性收入','当月可重复订阅收入合计','衡量可预测收入基础','连续下降即预警'],
 ['ARR','年度经常性收入','MRR × 12','用于融资估值和增长比较','不能混入一次性收入'],
 ['MoM Growth','月度环比增长率','（本月收入－上月收入）÷ 上月收入','判断增长速度是否持续','连续两月为负需复盘'],
 ['Gross Margin','毛利率','（收入－直接交付成本）÷ 收入','反映商业模式盈利空间','服务型公司低于 50%需关注'],
 ['NRR','净收入留存率','期末存量客户收入 ÷ 期初存量客户收入','包含续费、扩容、降配和流失','低于 100%说明存量萎缩'],
 ['GRR','毛收入留存率','（期初收入－流失－降配）÷ 期初收入','不包含扩容，更严格衡量留存','低于 85%需关注'],
 ['Logo Retention','客户数量留存率','期末留存客户数 ÷ 期初客户数','衡量客户是否持续续约','早期应逐客户跟踪'],
 ['CAC','客户获取成本','销售与市场投入 ÷ 新增付费客户数','衡量获取一个客户的现金成本','需与 LTV 联合判断'],
 ['LTV','客户终身价值','客单价 × 毛利率 ÷ 月流失率','估算单个客户贡献的长期毛利','数据少时仅作敏感性分析'],
 ['LTV / CAC','客户终身价值与获客成本比','LTV ÷ CAC','衡量获客投入是否经济','低于 3 倍通常需关注'],
 ['CAC Payback','获客成本回收期','CAC ÷ 单客户月毛利','衡量多久收回获客投入','超过 12至18个月需关注'],
 ['Burn Rate','现金消耗率','月度现金流出－月度现金流入','衡量每月净消耗现金','应结合增长结果判断'],
 ['Projected Net Burn','预计净消耗','固定成本＋本月已确认报销－MRR 对应毛利','用于前瞻性估算现金消耗，而非只看历史','持续增加需压缩成本或提升毛利'],
 ['Burn Multiple','现金消耗倍数','净现金消耗 ÷ 新增 ARR','衡量烧钱换增长的效率','高于 2 倍需重点关注'],
 ['Runway','现金可支撑时间','可用现金 ÷ 预计月度净消耗','估算资金还能支持多久','低于 6 个月为融资预警'],
 ['DSO','应收账款周转天数','应收账款 ÷ MRR × 30','衡量客户回款速度','超过合同账期需催收'],
 ['AR Aging','应收账款账龄','按逾期天数分组应收余额','识别坏账与现金风险','逾期 30 天以上需升级'],
 ['EBITDA','息税折旧摊销前利润','净利润＋利息＋税项＋折旧摊销','观察核心经营盈利能力','初创期用于趋势而非粉饰亏损'],
 ['Rule of 40','40 法则','收入增长率＋利润率','平衡软件企业增长与盈利','成熟期合计低于 40需解释'],
 ['Revenue Concentration','收入集中度','最大客户收入 ÷ 总收入','识别对单一客户依赖','超过 30%通常需披露'],
 ['Pipeline Coverage','销售管道覆盖倍数','有效商机金额 ÷ 销售目标','判断未来收入目标支撑度','低于 3 倍需补充商机']
 ,['Evidence Coverage','票据覆盖率','有发票号码或附件的费用笔数 ÷ 费用总笔数','衡量代账、税务及尽调证据完整性','低于 90%需立即补齐']
];
const rulebook=[
 ['现金安全','Runway（现金可支撑时间）≥12个月','6至12个月','<6个月','冻结非核心支出并启动融资'],
 ['收入规模','ARR（年度经常性收入）≥300万元','100万至300万元','<100万元','优先验证续费与标准化交付'],
 ['客户验证','付费客户≥20家','8至19家','<8家','逐客户建立续费和效果底稿'],
 ['毛利质量','毛利率≥60%','45%至60%','<45%','拆解人工及外包交付成本'],
 ['客户集中度','最大客户<20%','20%至30%','>30%','增加客户组合并限制单一依赖'],
 ['单位经济','LTV/CAC（价值成本比）≥3倍','1.5至3倍','<1.5倍','暂停低效获客渠道'],
 ['回款效率','DSO（应收账款周转天数）≤30天','31至60天','>60天','升级催收并调整付款条款'],
 ['票据合规','票据覆盖率≥95%','90%至95%','<90%','暂停报销支付并补齐凭证'],
 ['续费质量','续约概率≥85%','70%至85%','<70%','启动客户成功干预'],
 ['融资准备','罗盘≥80分','65至80分','<65分','先补经营证据再正式路演'],
 ['应付压力','应付<可用现金20%','20%至40%','>40%','重排付款优先级'],
 ['数据真实性','已入账数据证据可核验','部分字段缺证据','规划口径对外使用','规划与已入账口径必须隔离']
];

function normalize(){
 ['accounts','transactions','incomeEntries','costItems','evidence','obligations','investors','reimbursements','investorTargets','fundingSignals','demoCustomers'].forEach(k=>state[k]??=[]);
 state.demoMode??=true;
 state.assumptions??={};state.operating??={};
 state.operating.customers??=4;state.operating.mrr??=50000;
 state.assumptions.employees??=5;state.assumptions.grossMargin??=60;
 state.assumptions.fixedCost??=90000;state.assumptions.fundingTarget??=3000000;
 state.dividendRules??={};
 state.dividendRules.founderPool??=60;state.dividendRules.cofounderPool??=30;state.dividendRules.employeeEsop??=10;
 state.dividendRules.vestingYearsMin??=4;state.dividendRules.vestingYearsMax??=5;state.dividendRules.cliffMonths??=12;
 state.dividendRules.pmfDividendRate??=0;state.dividendRules.retentionReserveRate??=20;
 state.dividendRules.afterTaxProfit??=1000000;state.dividendRules.qualifiedFinancing??=5000000;
 state.dividendRules.founderDeferredCompCap??=300000;state.dividendRules.financingBonusRate??=5;
 state.dividendRules.leaverRepurchase??='无离职回购';
}

function derive(month=MONTH){
 const customerRecords=state.demoMode?state.demoCustomers:[];
 const customers=customerRecords.filter(x=>x.active!==false&&!['暂停服务','已流失'].includes(x.status));
 const modeledMrr=customers.length?sum(customers.map(x=>({amount:x.mrr}))):Number(state.operating.mrr||0);
 const modeledSetup=customers.length?sum(customers.filter(x=>String(x.startDate).startsWith(month)).map(x=>({amount:x.setupRevenue}))):0;
 const weightedMargin=customers.length?customers.reduce((s,x)=>s+Number(x.mrr)*Number(x.grossMargin),0)/modeledMrr:Number(state.assumptions.grossMargin||0);
 const txIncome=state.transactions.filter(x=>x.type==='income');
 const txFinancing=state.transactions.filter(x=>x.type==='financing');
 const txExpense=state.transactions.filter(x=>x.type==='expense');
 const incomeEntries=state.incomeEntries||[];
 const costItems=state.costItems||[];
 const recognizedIncome=incomeEntries.filter(x=>['已确认','已回款'].includes(x.status));
 const receivedIncome=incomeEntries.filter(x=>x.status==='已回款');
 const recognizedCosts=costItems.filter(x=>['已发生','已支付'].includes(x.status));
 const paidCosts=costItems.filter(x=>x.status==='已支付');
 const committedCosts=costItems.filter(x=>x.status==='已发生');
 const activeClaims=state.reimbursements.filter(x=>x.status!=='已驳回');
 const pendingClaims=activeClaims.filter(x=>x.status==='待审核');
 const approvedClaims=activeClaims.filter(x=>x.status==='已审核');
 const paidClaims=activeClaims.filter(x=>x.status==='已支付');
 const recognizedClaims=activeClaims.filter(x=>['已审核','已支付'].includes(x.status));
 const monthFilter=rows=>rows.filter(x=>String(x.date||'').startsWith(month));
 const opening=sum(state.accounts.map(x=>({amount:x.openingBalance})));
 const modeledIncome=modeledMrr+modeledSetup;
 const actualCash=opening+sum(txIncome)+sum(txFinancing)+sum(receivedIncome)-sum(txExpense)-sum(paidCosts.map(x=>({amount:costTotal(x)})))-sum(paidClaims);
 const committedReimbursements=sum(pendingClaims)+sum(approvedClaims);
 const committedOperatingCosts=sum(committedCosts.filter(x=>x.frequency==='monthly'?monthContains(x,month):String(x.date||'').startsWith(month)).map(x=>({amount:costTotal(x)})));
 const availableCash=actualCash-committedReimbursements-committedOperatingCosts;
 const monthIncome=sum(monthFilter(txIncome))+sum(monthFilter(receivedIncome));
 const monthAccruedRevenue=sum(monthFilter(recognizedIncome));
 const monthTransactionExpense=sum(monthFilter(txExpense));
 const monthlyCostRows=costItems.filter(x=>x.status!=='暂停'&&(x.frequency==='monthly'?monthContains(x,month):String(x.date||'').startsWith(month)));
 const monthRecognizedCosts=sum(monthlyCostRows.filter(x=>['已发生','已支付'].includes(x.status)).map(x=>({amount:costTotal(x)})));
 const monthPaidCosts=sum(monthFilter(paidCosts).map(x=>({amount:costTotal(x)})));
 const monthBudgetCosts=sum(monthlyCostRows.map(x=>({amount:costTotal(x)})));
 const directCostRunRate=sum(monthlyCostRows.filter(x=>x.costNature==='direct').map(x=>({amount:costTotal(x)})));
 const operatingCostRunRate=sum(monthlyCostRows.filter(x=>x.costNature!=='direct').map(x=>({amount:costTotal(x)})));
 const monthPaidClaims=sum(monthFilter(paidClaims));
 const monthRecognizedClaims=sum(monthFilter(recognizedClaims));
 const monthPendingClaims=sum(monthFilter(pendingClaims));
 const cashOutflow=monthTransactionExpense+monthPaidCosts+monthPaidClaims;
 const accrualExpense=monthTransactionExpense+monthRecognizedCosts+monthRecognizedClaims;
 const mrr=modeledMrr;
 const detailedCosts=costItems.some(x=>x.status!=='暂停');
 const fixedCost=detailedCosts?monthBudgetCosts:Number(state.assumptions.fixedCost||0);
 const grossMargin=detailedCosts&&modeledIncome?Math.max(0,(modeledIncome-directCostRunRate)/modeledIncome*100):weightedMargin;
 const projectedGrossProfit=Math.max(0,modeledIncome-directCostRunRate);
 const projectedNetBurn=Math.max(0,fixedCost+monthRecognizedClaims-modeledIncome);
 const runway=projectedNetBurn>0?availableCash/projectedNetBurn:99;
 const openAR=sum(state.obligations.filter(x=>x.type==='receivable'&&x.status!=='已结清'));
 const openTradeAP=sum(state.obligations.filter(x=>x.type==='payable'&&x.status!=='已结清'));
 const reimbursementAP=sum(approvedClaims);
 const costAP=sum(recognizedCosts.filter(x=>x.status==='已发生').map(x=>({amount:costTotal(x)})));
 const openAP=openTradeAP+reimbursementAP+costAP;
 const ticketItems=[
  ...txExpense.map(x=>({ok:transactionHasTicket(x)})),
  ...activeClaims.map(x=>({ok:claimHasTicket(x)})),
  ...recognizedCosts.map(x=>({ok:Boolean(x.invoiceNo)}))
 ];
 const ticketRate=ticketItems.length?ticketItems.filter(x=>x.ok).length/ticketItems.length*100:100;
 const cashBurn=Math.max(0,cashOutflow-monthIncome);
 const operatingResult=modeledIncome-fixedCost-monthRecognizedClaims;
 const dso=mrr?openAR/mrr*30:null;
 const customerCount=customers.length||Number(state.operating.customers||0);
 const averageCac=customers.length?customers.reduce((s,x)=>s+Number(x.acquisitionCost),0)/customers.length:null;
 const monthlyChurn=customers.length?Math.max(.01,(100-customers.reduce((s,x)=>s+Number(x.renewalProbability),0)/customers.length)/100):null;
 const arpa=customerCount?mrr/customerCount:0;
 const ltv=monthlyChurn?arpa*(grossMargin/100)/monthlyChurn:null;
 const ltvCac=averageCac?ltv/averageCac:null;
 const largestMrr=customers.length?Math.max(...customers.map(x=>Number(x.mrr))):null;
 const concentration=largestMrr&&mrr?largestMrr/mrr*100:null;
 const retention=customers.length?customers.reduce((s,x)=>s+Number(x.renewalProbability),0)/customers.length:null;
 const rules=state.dividendRules||{},poolTotal=Number(rules.founderPool||0)+Number(rules.cofounderPool||0)+Number(rules.employeeEsop||0);
 const distributableProfit=Number(rules.afterTaxProfit||0)*(1-Number(rules.retentionReserveRate||0)/100);
 const dividendPool=Math.max(0,distributableProfit*Number(rules.pmfDividendRate||0)/100);
 const financingCompPool=Math.min(Number(rules.qualifiedFinancing||0)*Number(rules.financingBonusRate||0)/100,Number(rules.founderDeferredCompCap||0));
 return{
  opening,actualCash,availableCash,committedReimbursements,committedOperatingCosts,monthIncome,monthAccruedRevenue,monthTransactionExpense,
  monthPaidClaims,monthPaidCosts,monthRecognizedCosts,monthBudgetCosts,monthRecognizedClaims,monthPendingClaims,cashOutflow,accrualExpense,mrr,grossMargin,
  fixedCost,projectedGrossProfit,projectedNetBurn,runway,openAR,openAP,reimbursementAP,ticketRate,
  cashBurn,operatingResult,pendingClaims,approvedClaims,paidClaims,activeClaims,dso,
  customerCount,averageCac,monthlyChurn,arpa,ltv,ltvCac,concentration,retention,customers,customerRecords,modeledIncome,
  incomeEntries,costItems,directCostRunRate,operatingCostRunRate,detailedCosts,
  dividendRules:rules,poolTotal,distributableProfit,dividendPool,financingCompPool
 };
}

function renderDashboard(){
 const f=derive(),customers=f.customerCount,avg=customers?f.mrr/customers:0;
 $('#dashboardMetrics').innerHTML=[
  metric('实际现金',money(f.actualCash),'仅统计已发生收付款',f.actualCash<0?'risk':'good'),
  metric('可用现金',money(f.availableCash),'扣除待审及待付报销',f.availableCash<0?'risk':'good'),
 metric('MRR（月度经常性收入）',money(f.mrr),'可重复合同收入'),
  metric('本月确认收入',money(f.monthAccruedRevenue),'已确认及已回款收入'),
  metric('本月权责成本',money(f.accrualExpense),'已发生、已支付及已审核费用'),
  metric('Runway（现金可支撑时间）',f.runway>=99?'现金净流入':`${f.runway.toFixed(1)} 个月`,'可用现金 ÷ 预计净消耗',f.runway<6?'risk':'good'),
 metric('应收 / 应付',`${money(f.openAR)} / ${money(f.openAP)}`,'应付含已审核报销',f.openAR>f.mrr||f.openAP>f.actualCash?'risk':'')
 ].join('');
 renderCompass(f);
 const severe=f.availableCash<0||f.runway<3,warning=f.runway<6||f.ticketRate<90||customers<8||f.openAR>f.mrr;
 $('#healthLabel').textContent=severe?'经营状态 / HIGH RISK（高风险）':warning?'经营状态 / ATTENTION（重点关注）':'经营状态 / STABLE（基本稳定）';
 $('#healthLabel').style.color=severe?'var(--red)':warning?'var(--amber)':'var(--green)';
 $('#healthReason').textContent=severe?'可用现金或现金安全垫已触发红线，回款、支出控制和融资应进入最高优先级。':warning?'客户验证、现金安全、回款或票据完整度尚未达到机构稳健标准。':'现金、费用和证据链暂未触发重大预警。';
 $('#dataFreshness').textContent=`DATA（数据） ${String(state.updatedAt||'').slice(0,16).replace('T',' ')}`;
 const actions=[];
 if(f.runway<6)actions.push(['现金安全',`可用现金 ${money(f.availableCash)}，预计净消耗 ${money(f.projectedNetBurn)}，现金可支撑 ${f.runway.toFixed(1)} 个月。`,'CFO（首席财务官）']);
 if(customers<8)actions.push(['收入验证',`当前 ${customers} 个客户，单客户月均收入 ${money(avg)}；优先完成续费与效果核验。`,'CEO（首席执行官）']);
 if(f.openAR>0)actions.push(['回款执行',`未结清应收 ${money(f.openAR)}，DSO（应收账款周转天数）${f.dso===null?'待计算':`${f.dso.toFixed(0)} 天`}。`,'销售负责人']);
 if(f.committedReimbursements>0)actions.push(['报销负债',`待审核及待支付报销合计 ${money(f.committedReimbursements)}，已从可用现金中预留。`,'审批负责人']);
 if(f.ticketRate<95)actions.push(['票据合规',`票据完整度 ${pct(f.ticketRate)}，影响代账交接及机构尽调。`,'全员']);
 if(!actions.length)actions.push(['保持节奏','继续跟踪客户留存、毛利率、回款和获客效率。','管理层']);
 $('#managementActions').innerHTML=actions.slice(0,3).map((x,i)=>`<div class="action-item"><span class="action-index">0${i+1}</span><div><b>${x[0]}</b><p>${x[1]}</p></div><span>${x[2]}</span></div>`).join('');
 $('#operatingPulse').innerHTML=[
  ['实际现金流入',money(f.monthIncome),'已发生客户回款'],
  ['权责确认收入',money(f.monthAccruedRevenue),'已确认及已回款'],
  ['合同月度收入',money(f.modeledIncome),'当前有效合同预算'],
  ['现金流出',money(f.cashOutflow),'含已付成本及报销'],
  ['权责成本',money(f.accrualExpense),'成本发生及报销审核口径'],
  ['成本运行率',money(f.fixedCost),'当前月度预算成本'],
  ['预计经营结果',money(f.operatingResult),'合同收入－成本－报销']
 ].map(x=>`<div class="pulse-row"><span>${x[0]}<small>${x[2]}</small></span><b>${x[1]}</b></div>`).join('');
 const form=$('#snapshotForm');
 [['customers',customers],['mrr',f.mrr],['employees',state.assumptions.employees],['grossMargin',f.grossMargin],['fixedCost',f.fixedCost],['fundingTarget',state.assumptions.fundingTarget]].forEach(([k,v])=>form.elements[k].value=v);
 renderProfessionalMetrics(f);
 const activity=[
  ...state.transactions.map(x=>({date:x.date,item:x.type==='income'?'客户回款':x.type==='expense'?'公司支出':'融资流入',party:x.counterparty,amount:x.amount,out:x.type==='expense',impact:x.type==='expense'?'现金与费用已减少':'现金已增加'})),
  ...state.incomeEntries.map(x=>({date:x.date,item:`收入：${x.category}`,party:x.customer,amount:x.amount,out:false,impact:x.status==='已回款'?'已确认收入并增加现金':x.status==='已确认'?'已确认收入，不增加现金':`${x.status}，不进入实际现金`})),
  ...state.costItems.map(x=>({date:x.date,item:`成本：${x.name}`,party:x.counterparty||x.category,amount:costTotal(x),out:true,impact:x.status==='已支付'?'确认成本并减少现金':x.status==='已发生'?'确认成本并形成应付':`${x.status}，仅参与预算`})),
  ...state.reimbursements.map(x=>({date:x.date,item:`报销：${x.description}`,party:x.applicant,amount:x.amount,out:true,impact:x.status==='待审核'?'降低可用现金':x.status==='已审核'?'计入费用与应付':x.status==='已支付'?'计入费用并减少现金':'不计入经营指标'}))
 ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10);
 $('#recentActivityRows').innerHTML=activity.map(x=>`<tr><td>${x.date}</td><td>${esc(x.item)}</td><td>${esc(x.party)}</td><td class="${x.out?'amount-expense':'amount-income'}">${x.out?'-':'+'}${money(x.amount)}</td><td>${esc(x.impact)}</td></tr>`).join('');
}

function compassModel(f){
 const cash=Math.max(0,Math.min(100,f.runway>=18?100:f.runway/18*100));
 const growth=Math.max(0,Math.min(100,(f.customerCount/20*45)+(f.mrr/300000*55)));
 const efficiency=Math.max(0,Math.min(100,(f.grossMargin/70*55)+((f.ltvCac||0)/3*45)));
 const compliance=Math.max(0,Math.min(100,f.ticketRate));
 const readiness=Math.max(0,Math.min(100,(f.customerCount/20*25)+(f.mrr*12/3000000*30)+(f.grossMargin/65*20)+((f.retention||0)/85*15)+((100-(f.concentration||50))/80*10)));
 const score=cash*.22+growth*.22+efficiency*.2+compliance*.16+readiness*.2;
 return{cash,growth,efficiency,compliance,readiness,score};
}
function renderCompass(f){
 const c=compassModel(f),grade=c.score>=80?'A / 可进入机构融资准备':c.score>=65?'B / 可启动融资预热':c.score>=50?'C / 先补经营证据':'D / 暂不适合机构融资';
 $('#compassScore').textContent=Math.round(c.score);
 $('#compassGrade').textContent=grade;
 $('#compassNeedle').style.transform=`rotate(${-120+c.score*2.4}deg)`;
 $('#compassDimensions').innerHTML=[['现金安全',c.cash],['增长验证',c.growth],['单位经济',c.efficiency],['财务合规',c.compliance],['融资准备',c.readiness]].map(x=>`<div class="dimension-row"><span>${x[0]}</span><div><i style="width:${x[1]}%"></i></div><b>${Math.round(x[1])}</b></div>`).join('');
 const channelScores=[
  ['经营自筹',Math.min(100,45+f.grossMargin*.5+(f.runway>12?20:0)),'收入与毛利驱动'],
  ['天使 / 种子',Math.min(100,40+c.growth*.35+c.readiness*.25),'团队与早期验证'],
  ['VC（风险投资）',Math.min(100,c.growth*.35+c.efficiency*.3+c.readiness*.35),'高增长与可复制'],
  ['产业资本',Math.min(100,45+(f.customerCount/20*20)+c.readiness*.25),'旅游与渠道协同'],
  ['政府产业基金',Math.min(100,35+c.compliance*.25+c.readiness*.25+(f.customerCount>=10?15:0)),'区域落地与产业政策'],
  ['银行 / 信贷',Math.min(100,15+(f.runway>12?15:0)+(f.mrr/500000*30)+c.compliance*.2),'稳定现金流与征信']
 ];
 $('#channelFit').innerHTML=channelScores.sort((a,b)=>b[1]-a[1]).map((x,i)=>`<div class="channel-row"><span><b>0${i+1}</b>${x[0]}<small>${x[2]}</small></span><div><i style="width:${Math.round(x[1])}%"></i></div><strong>${Math.round(x[1])}%</strong></div>`).join('');
}

function renderProfessionalMetrics(f){
 const priorDate=new Date();priorDate.setMonth(priorDate.getMonth()-1);const prior=priorDate.toISOString().slice(0,7);
 const priorIncome=sum(state.transactions.filter(x=>x.type==='income'&&x.date.startsWith(prior)))+sum(state.incomeEntries.filter(x=>x.status==='已回款'&&x.date.startsWith(prior)));
 const mom=priorIncome?((f.monthIncome-priorIncome)/priorIncome*100):null;
 const values=[
  ['MRR（月度经常性收入）',money(f.mrr),'经营快照录入'],
  ['ARR（年度经常性收入）',money(f.mrr*12),'MRR × 12'],
  ['MoM Growth（月度环比增长率）',mom===null?'待录入':pct(mom),'需至少两个月收入'],
  ['Gross Margin（毛利率）',pct(f.grossMargin),f.detailedCosts?'合同收入－直接交付成本':'当前管理层假设',f.grossMargin<50?'risk':'good'],
  ['CAC（客户获取成本）',f.averageCac===null?'待录入':money(f.averageCac),'销售获客投入 ÷ 客户数',f.averageCac>15000?'risk':'good'],
  ['LTV（客户终身价值）',f.ltv===null?'待录入':money(f.ltv),'客单价 × 毛利率 ÷ 流失率'],
  ['LTV / CAC（价值成本比）',f.ltvCac===null?'待录入':`${f.ltvCac.toFixed(1)} 倍`,'低于 3 倍需关注',f.ltvCac<3?'risk':'good'],
  ['Revenue Concentration（收入集中度）',f.concentration===null?'待录入':pct(f.concentration),'最大客户月费 ÷ MRR',f.concentration>30?'risk':'good'],
  ['Accrued Expense（权责费用）',money(f.accrualExpense),'经营成本＋交易支出＋已审核/已支付报销'],
  ['Accounts Payable（应付账款）',money(f.openAP),'贸易应付＋已审核报销'],
  ['Committed Cash（承诺现金）',money(f.committedReimbursements+f.committedOperatingCosts),'成本预算/应付＋待审核/待支付报销'],
  ['Burn Rate（现金消耗率）',money(f.cashBurn),'现金流出－现金流入',f.cashBurn>0?'risk':'good'],
  ['Projected Net Burn（预计净消耗）',money(f.projectedNetBurn),'固定成本＋报销－月毛利',f.projectedNetBurn>0?'risk':'good'],
  ['Runway（现金可支撑时间）',f.runway>=99?'现金净流入':`${f.runway.toFixed(1)} 个月`,'可用现金 ÷ 预计净消耗',f.runway<6?'risk':'good'],
  ['DSO（应收账款周转天数）',f.dso===null?'待录入':`${f.dso.toFixed(0)} 天`,'应收 ÷ MRR × 30',f.dso>45?'risk':''],
  ['Evidence Coverage（票据覆盖率）',pct(f.ticketRate),'有发票号码或附件的费用占比',f.ticketRate<90?'risk':'good']
 ];
 $('#professionalMetrics').innerHTML=values.map(x=>metric(x[0],x[1],x[2],x[3]||'')).join('');
 renderGlossary();
 $('#rulebookRows').innerHTML=rulebook.map(x=>`<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td><td>${esc(x[2])}</td><td>${esc(x[3])}</td><td>${esc(x[4])}</td></tr>`).join('');
}
function renderGlossary(){
 const q=($('#glossarySearch')?.value||'').trim().toLowerCase();
 $('#glossaryRows').innerHTML=glossary.filter(x=>!q||x.join(' ').toLowerCase().includes(q)).map(x=>`<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td><td>${esc(x[2])}</td><td>${esc(x[3])}</td><td>${esc(x[4])}</td></tr>`).join('');
}

function renderReimbursements(){
 const f=derive(),pending=sum(f.pendingClaims),approved=sum(f.approvedClaims),paidMonth=sum(f.paidClaims.filter(x=>String(x.date).startsWith(MONTH)));
 const missing=f.activeClaims.filter(x=>!claimHasTicket(x)).length;
 $('#reimbursementMetrics').innerHTML=[
  metric('待审核',money(pending),'降低可用现金'),
  metric('已审核待支付',money(approved),'计入费用与应付'),
  metric('本月已支付',money(paidMonth),`缺票据 ${missing} 笔`,missing?'risk':'good')
 ].join('');
 $('#reimbursementCount').textContent=`${state.reimbursements.length} 笔记录`;
 $('#reimbursementRows').innerHTML=[...state.reimbursements].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr><td>${x.date}</td><td><b>${esc(x.applicant)}</b><br><small>${esc(x.description)}｜${esc(x.payee)}</small></td><td class="amount-expense">${money(x.amount)}</td><td>${x.attachmentId?`<a href="/api/reimbursement-file/${x.attachmentId}">查看附件</a>`:x.invoiceNo?esc(x.invoiceNo):'<span class="badge risk">待补</span>'}</td><td><select data-reimbursement-status="${x.id}"><option ${x.status==='待审核'?'selected':''}>待审核</option><option ${x.status==='已审核'?'selected':''}>已审核</option><option ${x.status==='已支付'?'selected':''}>已支付</option><option ${x.status==='已驳回'?'selected':''}>已驳回</option></select></td></tr>`).join('')||'<tr><td colspan="5">暂无报销记录。</td></tr>';
 $$('[data-reimbursement-status]').forEach(el=>el.onchange=async()=>{
  const changes={status:el.value,statusUpdatedAt:new Date().toISOString()};
  if(el.value==='已支付')changes.paidAt=new Date().toISOString();
  const r=await api('/api/update',{method:'POST',body:JSON.stringify({collection:'reimbursements',id:el.dataset.reimbursementStatus,changes})});
  state=r.state;renderAll();broadcast(`报销状态变更为${el.value}`,'现金 / 费用 / 应付 / 代账 / 周报');toast('状态已更新，全部指标已重算');
 });
 renderReimbursementImpact();
}

function renderCustomers(){
 const f=derive(),rows=state.demoMode?state.demoCustomers:[],q=$('#customerSearch').value.trim().toLowerCase();
 const filtered=rows.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
 $('#customerMetrics').innerHTML=[
  metric('客户记录',rows.length,state.demoMode?`有效合同 ${f.customerCount} 家`:'已入账经营口径'),
  metric('MRR（月度经常性收入）',money(f.mrr),'客户月费汇总'),
  metric('ARPA（单客户月均收入）',money(f.arpa),'MRR ÷ 客户数'),
  metric('加权毛利率',pct(f.grossMargin),'按客户月费加权'),
  metric('平均 CAC（获客成本）',f.averageCac===null?'待录入':money(f.averageCac),'获客投入均值'),
  metric('LTV / CAC（价值成本比）',f.ltvCac===null?'待录入':`${f.ltvCac.toFixed(1)} 倍`,'建议高于 3 倍',f.ltvCac<3?'risk':'good')
 ].join('');
 const groups=f.customers.reduce((o,x)=>(o[x.sector]=(o[x.sector]||0)+Number(x.mrr),o),{});
 const total=Object.values(groups).reduce((a,b)=>a+b,0)||1;
 $('#customerMix').innerHTML=Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([name,value])=>`<div class="mix-row"><span>${esc(name)}<small>${money(value)} / ${pct(value/total*100)}</small></span><div><i style="width:${value/total*100}%"></i></div></div>`).join('')||'<div class="brief">正式客户明细尚未录入。</div>';
 const risks=[];
 if((f.concentration||0)>30)risks.push(['客户集中度',`最大客户占 MRR（月度经常性收入）${pct(f.concentration)}，超过 30% 警戒线。`]);
 const lowRenewal=f.customers.filter(x=>Number(x.renewalProbability)<70).length;
 if(lowRenewal)risks.push(['续约风险',`${lowRenewal} 家客户续约概率低于 70%。`]);
 const slow=f.customers.filter(x=>Number(x.paymentDays)>=45).length;
 if(slow)risks.push(['回款风险',`${slow} 家客户合同账期达到 45 天。`]);
 if(!risks.length)risks.push(['结构正常','当前客户集中度、续费和回款未触发重大预警。']);
 $('#customerRisks').innerHTML=risks.map((x,i)=>`<div class="action-item"><span class="action-index">0${i+1}</span><div><b>${x[0]}</b><p>${x[1]}</p></div></div>`).join('');
 $('#customerRows').innerHTML=filtered.map(x=>`<tr><td><b>${esc(x.displayName||x.name)}</b></td><td>${esc(x.city)}<br><small>${esc(x.sector)}</small></td><td>${esc(x.product)}<br><small>${x.contractMonths||'-'}个月合同</small></td><td><input class="cell-input" data-customer-field="mrr" data-customer-id="${x.id}" type="number" min="0" value="${Number(x.mrr||0)}"></td><td><input class="cell-input percent" data-customer-field="grossMargin" data-customer-id="${x.id}" type="number" min="0" max="100" value="${Number(x.grossMargin||0)}"></td><td><input class="cell-input" data-customer-field="acquisitionCost" data-customer-id="${x.id}" type="number" min="0" value="${Number(x.acquisitionCost||0)}"></td><td><input class="cell-input compact" data-customer-field="paymentDays" data-customer-id="${x.id}" type="number" min="0" value="${Number(x.paymentDays||0)}"><small>${esc(x.paymentStatus||'正常')}${x.outstanding?` / 欠款${money(x.outstanding)}`:''}</small></td><td><input class="cell-input percent" data-customer-field="renewalProbability" data-customer-id="${x.id}" type="number" min="0" max="100" value="${Number(x.renewalProbability||0)}"></td><td><select class="cell-select" data-customer-field="status" data-customer-id="${x.id}">${['稳定续费','交付中','待续约','回款关注','暂停服务','已流失'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="9">尚未录入客户合同。</td></tr>';
 $$('[data-customer-field]').forEach(el=>el.onchange=()=>saveCustomerField(el));
 $('#toggleDemoMode').textContent=state.demoMode?'切换至已入账口径':'切换至经营规划口径';
 $('#demoBanner').innerHTML=state.demoMode?'<b>经营规划口径</b><span>客户合同及预算参与经营预测；暂停和流失客户不计入当前收入。</span>':'<b>已入账口径</b><span>当前仅使用已入账资金流水及正式经营参数。</span>';
 $('#demoBanner').classList.toggle('live',!state.demoMode);
 renderContractImpact();
}
async function saveCustomerField(el){
 const field=el.dataset.customerField,id=el.dataset.customerId;
 let value=field==='status'?el.value:Number(el.value||0);
 const changes={[field]:value};
 if(field==='status')changes.active=!['暂停服务','已流失'].includes(value);
 const r=await api('/api/update',{method:'POST',body:JSON.stringify({collection:'demoCustomers',id,changes})});
 state=r.state;renderAll();broadcast(`客户${field==='mrr'?'预算':field==='status'?'状态':'指标'}已调整`,'收入 / 毛利 / 现金预测 / 罗盘 / 融资');toast('已保存并重算全部指标');
}

function renderContractImpact(){
 const form=$('#contractForm'),mrr=Number(form.elements.mrr.value||0),setup=Number(form.elements.setupRevenue.value||0),months=Number(form.elements.contractMonths.value||0),margin=Number(form.elements.grossMargin.value||0);
 const total=mrr*months+setup,annual=mrr*12,grossProfit=total*margin/100;
 $('#contractImpact').innerHTML=`<b>合同联动预览</b><span>MRR（月度经常性收入）增加 ${money(mrr)}｜ARR（年度经常性收入）增加 ${money(annual)}｜合同总额 ${money(total)}｜预计合同毛利 ${money(grossProfit)}</span><small>保存后会联动客户模型、收入预测、毛利、Runway（现金可支撑时间）和投行资本适配雷达。</small>`;
}

function renderFinanceImpact(){
 const incomeForm=$('#incomeForm'),costForm=$('#costForm');
 const incomeAmount=Number(incomeForm.elements.amount.value||0),incomeStatus=incomeForm.elements.status.value;
 const unitAmount=Number(costForm.elements.unitAmount.value||0),quantity=Number(costForm.elements.quantity.value||0),costAmount=unitAmount*quantity,costStatus=costForm.elements.status.value;
 $('#incomeImpact').innerHTML=`<b>收入联动预览</b><span>金额 ${money(incomeAmount)}｜权责收入 ${['已确认','已回款'].includes(incomeStatus)?`增加 ${money(incomeAmount)}`:'暂不增加'}｜实际现金 ${incomeStatus==='已回款'?`增加 ${money(incomeAmount)}`:'暂不增加'}</span><small>合同预算和已开票只保留业务证据，不提前确认收入或现金。</small>`;
 $('#costImpact').innerHTML=`<b>成本联动预览</b><span>总成本 ${money(costAmount)}｜权责成本 ${['已发生','已支付'].includes(costStatus)?`增加 ${money(costAmount)}`:'暂不增加'}｜实际现金 ${costStatus==='已支付'?`减少 ${money(costAmount)}`:'暂不减少'}</span><small>每月固定成本会持续进入月度预算，终止日期后停止计算。</small>`;
}

function renderFinanceInputs(){
 const f=derive();
 $('#financeInputMetrics').innerHTML=[
  metric('合同月度收入',money(f.modeledIncome),'客户合同预算'),
  metric('本月确认收入',money(f.monthAccruedRevenue),'权责发生口径'),
  metric('本月实际回款',money(f.monthIncome),'现金收付口径'),
  metric('月度预算成本',money(f.monthBudgetCosts),'固定与单次成本'),
  metric('本月权责成本',money(f.accrualExpense),'已发生及已支付'),
  metric('本月现金流出',money(f.cashOutflow),'已付款成本及报销')
 ].join('');
 $('#customerOptions').innerHTML=state.demoCustomers.map(x=>`<option value="${esc(x.displayName||x.name)}"></option>`).join('');
 $('#incomeCount').textContent=`${state.incomeEntries.length} 笔`;
 $('#costCount').textContent=`${state.costItems.length} 笔`;
 $('#incomeRows').innerHTML=[...state.incomeEntries].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr>
  <td><input class="cell-input date" data-income-field="date" data-income-id="${x.id}" type="date" value="${esc(x.date)}"></td>
  <td><input class="cell-input text" data-income-field="customer" data-income-id="${x.id}" value="${esc(x.customer)}"></td>
  <td>${esc(x.contractNo||'-')}<br><small>${esc(x.category)}</small></td>
  <td><input class="cell-input" data-income-field="amount" data-income-id="${x.id}" type="number" min="0" step="0.01" value="${Number(x.amount||0)}"></td>
  <td><select class="cell-select" data-income-field="status" data-income-id="${x.id}">${['合同预算','已开票','已确认','已回款'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></td>
  <td><input class="cell-input text" data-income-field="invoiceNo" data-income-id="${x.id}" value="${esc(x.invoiceNo||'')}"></td>
 </tr>`).join('')||'<tr><td colspan="6">尚未录入收入明细。</td></tr>';
 $('#costRows').innerHTML=[...state.costItems].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr>
  <td><input class="cell-input date" data-cost-field="date" data-cost-id="${x.id}" type="date" value="${esc(x.date)}"></td>
  <td><input class="cell-input text" data-cost-field="name" data-cost-id="${x.id}" value="${esc(x.name)}"><br><small>${esc(x.counterparty||'')}</small></td>
  <td>${esc(x.category)}<br><small>${x.costNature==='direct'?'直接交付成本':'期间费用'}</small></td>
  <td><input class="cell-input" data-cost-field="unitAmount" data-cost-id="${x.id}" type="number" min="0" step="0.01" value="${Number(x.unitAmount||0)}"></td>
  <td><input class="cell-input compact" data-cost-field="quantity" data-cost-id="${x.id}" type="number" min="0.01" step="0.01" value="${Number(x.quantity||0)}"></td>
  <td class="amount-expense">${money(costTotal(x))}</td>
  <td><select class="cell-select" data-cost-field="frequency" data-cost-id="${x.id}"><option value="monthly" ${x.frequency==='monthly'?'selected':''}>每月固定</option><option value="oneoff" ${x.frequency==='oneoff'?'selected':''}>单次发生</option></select></td>
  <td><select class="cell-select" data-cost-field="status" data-cost-id="${x.id}">${['预算','已发生','已支付','暂停'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></td>
  <td><input class="cell-input text" data-cost-field="invoiceNo" data-cost-id="${x.id}" value="${esc(x.invoiceNo||'')}"></td>
 </tr>`).join('')||'<tr><td colspan="9">尚未录入成本明细。</td></tr>';
 $$('[data-income-field]').forEach(el=>el.onchange=()=>saveLedgerField('incomeEntries',el,'income'));
 $$('[data-cost-field]').forEach(el=>el.onchange=()=>saveLedgerField('costItems',el,'cost'));
 renderFinanceImpact();
}

async function saveLedgerField(collection,el,prefix){
 const field=el.dataset[`${prefix}Field`],id=el.dataset[`${prefix}Id`];
 const numeric=['amount','unitAmount','quantity'].includes(field);
 const r=await api('/api/update',{method:'POST',body:JSON.stringify({collection,id,changes:{[field]:numeric?Number(el.value||0):el.value}})});
 state=r.state;renderAll();broadcast(`${collection==='incomeEntries'?'收入':'成本'}明细已调整`,'现金 / 权责损益 / 成本监控 / 代账 / 融资');toast('源数据已保存，全部指标已重算');
}

function formDividendRules(){
 const form=$('#dividendRulesForm'),keys=['founderPool','cofounderPool','employeeEsop','vestingYearsMin','vestingYearsMax','cliffMonths','pmfDividendRate','retentionReserveRate','afterTaxProfit','qualifiedFinancing','founderDeferredCompCap','financingBonusRate'];
 const r={...state.dividendRules};
 keys.forEach(k=>{if(form.elements[k])r[k]=Number(form.elements[k].value||0)});
 if(form.elements.leaverRepurchase)r.leaverRepurchase=form.elements.leaverRepurchase.value;
 return r;
}
function renderDividendRules(useForm=false){
 const f=derive(),form=$('#dividendRulesForm');
 const r=useForm?formDividendRules():f.dividendRules;
 if(!useForm)['founderPool','cofounderPool','employeeEsop','vestingYearsMin','vestingYearsMax','cliffMonths','pmfDividendRate','retentionReserveRate','afterTaxProfit','qualifiedFinancing','founderDeferredCompCap','financingBonusRate','leaverRepurchase'].forEach(k=>{if(form.elements[k])form.elements[k].value=r[k]});
 const poolTotal=Number(r.founderPool||0)+Number(r.cofounderPool||0)+Number(r.employeeEsop||0);
 const distributableProfit=Number(r.afterTaxProfit||0)*(1-Number(r.retentionReserveRate||0)/100);
 const dividendPool=Math.max(0,distributableProfit*Number(r.pmfDividendRate||0)/100);
 const financingCompPool=Math.min(Number(r.qualifiedFinancing||0)*Number(r.financingBonusRate||0)/100,Number(r.founderDeferredCompCap||0));
 const poolOk=Math.abs(poolTotal-100)<0.01;
 $('#dividendRuleMetrics').innerHTML=[
  metric('Founder Pool（创始人池）',pct(Number(r.founderPool||0)),'无基本工资'),
  metric('Co-founder Option Pool（联合创始人期权池）',pct(Number(r.cofounderPool||0)),'有基本工资'),
  metric('Employee ESOP（员工期权池）',pct(Number(r.employeeEsop||0)),'未来员工激励'),
  metric('池子合计',pct(poolTotal),'必须等于 100%',poolOk?'good':'risk'),
  metric('PMF 分红池',money(dividendPool),'PMF 阶段默认可为 0'),
  metric('融资补偿池',money(financingCompPool),'MIN（融资额 × 比例，上限）')
 ].join('');
 $('#dividendPoolRows').innerHTML=[
  ['Founder Pool（创始人池）',r.founderPool,'无基本工资','控制权、融资、方向和核心责任'],
  ['Co-founder Option Pool（联合创始人期权池）',r.cofounderPool,'有基本工资','PMF（产品市场匹配）验证、签约、交付、回款'],
  ['Employee ESOP（员工期权池）',r.employeeEsop,'按岗位薪资','未来核心员工和关键岗位']
 ].map(x=>`<tr><td>${x[0]}</td><td><b>${pct(x[1])}</b></td><td>${x[2]}</td><td>${x[3]}</td></tr>`).join('');
 $('#dividendRuleBrief').textContent=[
  `当前规则：Founder Pool（创始人池）${pct(r.founderPool)}，Co-founder Option Pool（联合创始人期权池）${pct(r.cofounderPool)}，Employee ESOP（员工期权池）${pct(r.employeeEsop)}。`,
  `Vesting（归属期）：${r.vestingYearsMin} 至 ${r.vestingYearsMax} 年；Cliff（悬崖期）：${r.cliffMonths} 个月。`,
  `分红：PMF（Product-Market Fit，产品市场匹配）阶段分红比例为 ${pct(r.pmfDividendRate)}，现金优先用于增长、交付和回款验证。`,
  `融资补偿：Founder（创始人）无基本工资，可设置递延补偿；当前融资补偿池测算为 ${money(financingCompPool)}。`,
  `离职安排：${r.leaverRepurchase}；已归属部分保留，未归属部分停止继续归属或按协议失效。`,
  poolOk?'池子合计为 100%，可作为当前中台基础规则。':'注意：三大池子合计不是 100%，请先修正，否则后续融资表述会不严谨。'
 ].join('\n');
 $('#dividendRuleImpact').innerHTML=`<b>规则联动预览</b><span>池子合计 ${pct(poolTotal)}｜PMF 分红池 ${money(dividendPool)}｜融资补偿池 ${money(financingCompPool)}｜治理状态 ${poolOk?'合格':'需修正'}</span><small>保存后会进入投行资本适配雷达的 Governance（公司治理）与 Transaction Readiness（交易准备）评分。</small>`;
}

function capitalRadarModel(f){
 const rules=f.dividendRules||{},poolOk=Math.abs(f.poolTotal-100)<0.01,arr=f.mrr*12;
 const items=[
  ['Revenue Scale（收入规模）',Math.min(100,arr/3000000*100),`ARR（年度经常性收入）${money(arr)}`,arr>=3000000?'可进入机构讨论':'先把 ARR 做到 100万至300万元区间'],
  ['Growth Proof（增长验证）',Math.min(100,(f.customerCount/20*55)+((f.retention||0)/85*25)+(f.monthAccruedRevenue>0?20:0)),`客户 ${f.customerCount} 家，续约概率 ${pct(f.retention||0)}`,f.customerCount>=8?'可做融资预热':'先补足客户数量和续费证据'],
  ['Revenue Quality（收入质量）',Math.min(100,((f.retention||0)/85*35)+((100-(f.concentration||50))/80*30)+(f.openAR>0?15:25)+(f.monthIncome>0?10:0)),`集中度 ${pct(f.concentration||0)}，回款 ${money(f.monthIncome)}`,f.monthIncome>0?'回款口径可展示':'要补实际回款和应收账龄'],
  ['Unit Economics（单位经济）',Math.min(100,(f.grossMargin/65*45)+((f.ltvCac||0)/3*40)+(f.directCostRunRate>0?15:5)),`毛利率 ${pct(f.grossMargin)}，LTV/CAC（价值成本比）${f.ltvCac?f.ltvCac.toFixed(1):'待录入'} 倍`,f.grossMargin>=60?'毛利有资本故事':'需拆清交付成本和获客成本'],
  ['Cash & Runway（现金安全期）',Math.min(100,(f.runway>=18?100:f.runway/18*85)+(f.availableCash>0?15:0)),`Runway（现金可支撑时间）${f.runway>=99?'净流入':`${f.runway.toFixed(1)}个月`}`,f.runway>=6?'可从容接触资本':'融资紧迫，需先控成本'],
  ['Governance（公司治理）',Math.min(100,(f.ticketRate/95*35)+(poolOk?25:0)+(Number(rules.employeeEsop||0)>=8&&Number(rules.employeeEsop||0)<=15?15:0)+(Number(rules.cofounderPool||0)>=20?15:0)+(rules.leaverRepurchase==='无离职回购'?10:5)),`期权池 ${pct(rules.employeeEsop)}，联合创始人池 ${pct(rules.cofounderPool)}`,poolOk?'股权池口径清楚':'股权池合计需修正'],
  ['Market Fit（市场与战略协同）',Math.min(100,55+(f.customerCount>=8?15:0)+(arr>=1000000?15:0)+(f.grossMargin>=55?15:0)),'入境游海外获客、数据、旅游和出海营销',f.customerCount>=8||arr>=1000000?'适合优先测试产业资本和旅游生态方':'赛道相关，但需要更多真实客户案例'],
  ['Transaction Readiness（交易准备）',Math.min(100,(poolOk?20:0)+(arr/3000000*25)+(f.ticketRate/95*20)+(f.runway>=6?15:0)+(f.customerCount>=8?10:0)+(Number(rules.pmfDividendRate||0)<=20?10:0)),`票据覆盖率 ${pct(f.ticketRate)}，分红比例 ${pct(rules.pmfDividendRate||0)}`,Number(rules.pmfDividendRate||0)<=20?'分红纪律对机构友好':'分红比例偏高，会削弱增长叙事']
 ];
 const score=items.reduce((s,x)=>s+x[1],0)/items.length;
 return{items,score};
}

function renderCapitalRadar(f){
 const radar=capitalRadarModel(f),grade=radar.score>=80?'A / 可系统对接资本':radar.score>=65?'B / 可融资预热':radar.score>=50?'C / 先补关键指标':'D / 暂不建议正式路演';
 $('#capitalRadarGrade').textContent=`${Math.round(radar.score)} 分｜${grade}`;
 const sorted=[...radar.items].sort((a,b)=>a[1]-b[1]);
 $('#capitalRadar').innerHTML=`<div class="radar-bars">${radar.items.map(x=>`<div class="radar-score-row"><span>${x[0]}<small>${x[2]}</small></span><div><i style="width:${Math.round(x[1])}%"></i></div><b>${Math.round(x[1])}</b><em class="${x[1]>=70?'good':x[1]>=50?'warn':'risk'}">${x[3]}</em></div>`).join('')}</div><div class="radar-summary"><b>比较适合对接</b><p>${radar.items.filter(x=>x[1]>=70).map(x=>x[0].split('（')[0]).join('、')||'暂无强项，需要先补经营证据'}</p><b>暂不适合原因</b><p>${sorted.slice(0,3).map(x=>`${x[0].split('（')[0]}：${x[3]}`).join('；')}</p></div>`;
}

function renderReimbursementImpact(){
 const form=$('#reimbursementForm'),amount=Number(form.elements.amount.value||0);
 const hasTicket=Boolean(form.elements.invoiceNo.value||form.elements.file.files?.length);
 $('#reimbursementImpact').innerHTML=`<b>提交后的即时联动</b><span>可用现金 ${amount?`减少 ${money(amount)}`:'等待金额'}｜待审核报销 ${amount?`增加 ${money(amount)}`:'等待金额'}｜票据状态 ${hasTicket?'完整':'待补'}</span><small>实际现金不会在提交时减少；状态改为“已支付”后才扣减。</small>`;
}

function accountingItems(month){
 return [
  ...state.transactions.filter(x=>x.date.startsWith(month)).map(x=>({date:x.date,type:x.type==='income'?'收入':x.type==='expense'?'支出':'其他资金',party:x.counterparty,category:x.category,amount:x.amount,invoice:x.invoiceNo||'',attachment:evidenceFor(x.id),status:'已入账',recognized:true})),
  ...state.incomeEntries.filter(x=>x.date.startsWith(month)).map(x=>({date:x.date,type:'客户收入',party:x.customer,category:x.category,amount:x.amount,invoice:x.invoiceNo||'',attachment:false,status:x.status,recognized:['已确认','已回款'].includes(x.status)})),
  ...state.costItems.filter(x=>x.date.startsWith(month)||x.frequency==='monthly'&&monthContains(x,month)).map(x=>({date:x.date,type:'经营成本',party:x.counterparty||x.name,category:x.category,amount:costTotal(x),invoice:x.invoiceNo||'',attachment:false,status:x.status,recognized:['已发生','已支付'].includes(x.status)})),
  ...state.reimbursements.filter(x=>x.date.startsWith(month)).map(x=>({date:x.date,type:'员工报销',party:`${x.applicant} / ${x.payee}`,category:x.category,amount:x.amount,invoice:x.invoiceNo||'',attachment:Boolean(x.attachmentId),status:x.status,recognized:['已审核','已支付'].includes(x.status)}))
 ].sort((a,b)=>a.date.localeCompare(b.date));
}
function renderAccounting(){
 const month=$('#accountingMonth').value||MONTH,items=accountingItems(month);
 const income=sum(items.filter(x=>['收入','客户收入'].includes(x.type)&&x.recognized));
 const recognizedCost=sum(items.filter(x=>!['收入','客户收入'].includes(x.type)&&x.recognized));
 const pendingCost=sum(items.filter(x=>(x.type==='员工报销'&&x.status==='待审核')||(x.type==='经营成本'&&x.status==='预算')));
 const missing=items.filter(x=>!['收入','客户收入'].includes(x.type)&&x.recognized&&!x.invoice&&!x.attachment&&x.status!=='已驳回');
 $('#accountingMetrics').innerHTML=[
  metric('收入',money(income),'当月资金流水'),
  metric('已入账费用',money(recognizedCost),'含已审核报销'),
  metric('待审核费用',money(pendingCost),'暂不入账'),
  metric('交接记录',items.length,'笔'),
  metric('缺票据',missing.length,'笔',missing.length?'risk':'good'),
  metric('票据完整度',pct(items.length?(items.length-missing.length)/items.length*100:100),'代账口径')
 ].join('');
 $('#missingAccounting').innerHTML=missing.map((x,i)=>`<div class="issue-item"><span class="action-index">0${i+1}</span><div><b>${esc(x.party)}｜${money(x.amount)}</b><p>${x.date} ${esc(x.category)}：缺发票号码或附件。</p></div><span class="badge risk">待补</span></div>`).join('')||'<div class="brief">本月应入账费用均已留存发票号码或附件。</div>';
 $('#accountingNote').textContent=`交接月份：${month}\n收入：${money(income)}\n已入账费用：${money(recognizedCost)}\n待审核费用：${money(pendingCost)}\n缺少票据：${missing.length} 笔\n\n报销口径：待审核不入账；已审核计入费用及应付；已支付计入费用并减少现金；已驳回仅保留审计记录。`;
 $('#accountingRowCount').textContent=`${items.length} 笔`;
 $('#accountingRows').innerHTML=items.map(x=>`<tr><td>${x.date}</td><td>${x.type}</td><td>${esc(x.party)}</td><td>${esc(x.category)}</td><td>${money(x.amount)}</td><td>${esc(x.invoice)||'-'}</td><td><span class="badge ${x.attachment?'good':'warn'}">${x.status}</span></td></tr>`).join('')||'<tr><td colspan="7">该月份暂无数据。</td></tr>';
}

function renderFundraising(){
 const f=derive(),targets=state.investorTargets||[],signals=state.fundingSignals||[];
 const contacted=state.investors.filter(x=>x.stage&&x.stage!=='待接触'&&x.stage!=='已关闭').length;
 const compass=compassModel(f),keyword=$('#investorKeyword').value,channel=$('#investorChannel').value;
 const scored=targets.map(x=>{
  let score=Number(x.baseScore||70);
  score+=(compass.readiness-50)*.18;
  if(x.channel==='产业资本'&&f.customerCount>=10)score+=5;
  if(x.channel==='财务投资'&&f.mrr*12<1000000)score-=8;
  if(x.channel==='政府产业基金'&&f.ticketRate>=90)score+=4;
  return{...x,score:Math.max(35,Math.min(96,Math.round(score)))};
 }).filter(x=>(!keyword||x.focus.includes(keyword))&&(!channel||x.channel===channel));
 $('#fundraisingMetrics').innerHTML=[
  metric('高匹配候选',scored.filter(x=>x.score>=80).length,'家'),
  metric('已开始接触',contacted,'家'),
  metric('最新融资信号',signals.length,'条'),
  metric('客户验证',state.operating.customers,'签约客户',state.operating.customers<8?'risk':'good'),
  metric('ARR（年度经常性收入）',money(f.mrr*12),'MRR × 12'),
 metric('Runway（现金可支撑时间）',f.runway>=99?'现金净流入':`${f.runway.toFixed(1)} 个月`,'融资紧迫度',f.runway<6?'risk':'good')
 ].join('');
 const standards=[
  ['客户验证',f.customerCount,20,'家',f.customerCount>=20],
  ['ARR（年度经常性收入）',f.mrr*12,3000000,'元',f.mrr*12>=3000000],
  ['毛利率',f.grossMargin,60,'%',f.grossMargin>=60],
  ['续约概率',f.retention||0,80,'%',(f.retention||0)>=80],
  ['LTV / CAC（价值成本比）',f.ltvCac||0,3,'倍',(f.ltvCac||0)>=3],
  ['票据覆盖率',f.ticketRate,90,'%',f.ticketRate>=90]
 ];
 const passed=standards.filter(x=>x[4]).length;
 const status=passed>=5?'适合启动天使轮或产业资本融资':passed>=3?'适合融资预热，先补关键指标':'暂不适合正式机构融资，优先验证经营模型';
 $('#fundingReadiness').innerHTML=`<div class="readiness-summary"><strong>${status}</strong><span>达标 ${passed} / ${standards.length} 项｜规则罗盘 ${Math.round(compass.score)} 分</span></div><div class="standard-grid">${standards.map(x=>`<div class="standard-item ${x[4]?'pass':'gap'}"><span>${x[0]}</span><b>${typeof x[1]==='number'&&x[3]==='元'?money(x[1]):`${Number(x[1]).toFixed(x[3]==='倍'?1:0)} ${x[3]}`}</b><small>标准：${x[3]==='元'?money(x[2]):`${x[2]} ${x[3]}`}</small></div>`).join('')}</div>`;
 renderCapitalRadar(f);
 const dimensions=[
  ['Growth Profile（增长画像）',`客户 ${f.customerCount} 家，ARR（年度经常性收入）${money(f.mrr*12)}`,'关注月度增长、有效客户增长及收入可持续性'],
  ['Revenue Quality（收入质量）',`续约概率 ${pct(f.retention||0)}，集中度 ${pct(f.concentration||0)}`,'关注经常性收入、客户集中、合同期限和回款质量'],
  ['Unit Economics（单位经济）',`毛利率 ${pct(f.grossMargin)}，LTV/CAC（价值成本比）${f.ltvCac?f.ltvCac.toFixed(1):'待录入'} 倍`,'关注获客成本、回收期、客户终身价值和交付边际成本'],
  ['Cash & Runway（现金与安全期）',`可用现金 ${money(f.availableCash)}，Runway（现金可支撑时间）${f.runway>=99?'净流入':`${f.runway.toFixed(1)}个月`}`,'决定融资时间窗口、金额和成本控制强度'],
  ['Defensibility（竞争壁垒）','需补充数据资产、技术产权及渠道排他性','判断业务是可复制产品还是人力密集型服务'],
  ['Governance（公司治理）',`票据覆盖率 ${pct(f.ticketRate)}`,'关注股权、合同、税务、数据合规和管理层报告质量'],
  ['Exit Path（退出路径）','产业并购优先于独立上市预期','潜在买方包括旅游平台、营销科技及企业服务公司'],
  ['Transaction Terms（交易条款）','根据融资阶段另行测算','包括估值、稀释、清算优先权、董事席位及反稀释条款']
 ];
 $('#investmentDimensions').innerHTML=`<div class="dimension-grid">${dimensions.map(x=>`<div class="dimension-card"><span>${x[0]}</span><b>${x[1]}</b><p>${x[2]}</p></div>`).join('')}</div>`;
 $('#targetUpdatedAt').textContent=`核验 ${state.investorScoutUpdatedAt?.slice(0,10)||'本地候选库'}`;
 $('#signalUpdatedAt').textContent=state.investorScoutUpdatedAt?`更新 ${state.investorScoutUpdatedAt.slice(0,16).replace('T',' ')}`:'尚未联网更新';
 $('#investorTargets').innerHTML=scored.sort((a,b)=>b.score-a.score).map(x=>`<div class="target-card"><header><h3>${esc(x.name)}</h3><span class="badge ${x.score>=80?'good':'warn'}">${x.score}%</span></header><p>${esc(x.reason)}</p><footer><span>${esc(x.focus.join(' / '))}｜${esc(x.channel)}｜${esc(x.stage)}</span><a href="${esc(x.url)}" target="_blank" rel="noreferrer">官方资料</a></footer></div>`).join('')||'<div class="brief">当前筛选条件下暂无机构。</div>';
 $('#fundingSignals').innerHTML=signals.map(x=>`<div class="signal-card"><header><h3>${esc(x.title)}</h3></header><p>${esc(x.source||'公开新闻')}｜${esc(x.date||'')}</p><footer><span>公开市场信号，不等同投资邀约</span><a href="${esc(x.link)}" target="_blank" rel="noreferrer">来源</a></footer></div>`).join('')||'<div class="brief">点击“联网更新融资信号”扫描近期公开融资新闻。</div>';
 const actions=[
  ['可融资证据',`当前 ARR（年度经常性收入）${money(f.mrr*12)}、客户 ${f.customerCount} 家；优先补齐续费、毛利和获客成本底稿。`,'融资前置条件'],
  ['产业协同','优先接触能提供旅游渠道、海外流量或旅行社资源的产业方。','优先级一'],
  ['触达节奏','每周新增 5 家目标机构、获得 2 次有效引荐、完成 1 次正式沟通。','持续执行']
 ];
 $('#fundraisingActions').innerHTML=actions.map((x,i)=>`<div class="action-item"><span class="action-index">0${i+1}</span><div><b>${x[0]}</b><p>${x[1]}</p></div><span>${x[2]}</span></div>`).join('');
}

function renderAll(){
 renderDashboard();renderCustomers();renderFinanceInputs();renderDividendRules();renderReimbursements();renderAccounting();renderFundraising();
 $('#lastSaved').textContent=`SAVE（保存） ${String(state.updatedAt||'').slice(0,16).replace('T',' ')}`;
}
async function load(){state=await api('/api/state');normalize();$('#statusDot').parentElement.classList.add('connected');$('#serverStatus').textContent='LOCAL DATA（本地数据）';renderAll()}
const titles={dashboard:'经营总览',customers:'客户模型',financeInputs:'收支成本',dividendRules:'分红规则',reimbursements:'报销票据',accounting:'代账交接',fundraising:'融资雷达'};
function showView(id){$$('.view').forEach(x=>x.classList.toggle('active',x.id===id));$$('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===id));$('#viewTitle').textContent=titles[id];$('#actionSignal').textContent=`已切换至 ${titles[id]}｜数据口径保持同步`;scrollTo(0,0)}
$$('#nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));
$('#todayLabel').textContent=`${TODAY} / FUTUREFLOW FINANCE OS（财务操作系统）`;
$('#accountingMonth').value=MONTH;$('#reimbursementForm [name=date]').value=TODAY;$('#contractForm [name=startDate]').value=TODAY;$('#incomeForm [name=date]').value=TODAY;$('#costForm [name=date]').value=TODAY;
$('#snapshotForm').onsubmit=async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target));Object.keys(v).forEach(k=>v[k]=Number(v[k]));
 state.operating={...state.operating,customers:v.customers,mrr:v.mrr};
 state.assumptions={...state.assumptions,employees:v.employees,grossMargin:v.grossMargin,fixedCost:v.fixedCost,fundingTarget:v.fundingTarget};
 await api('/api/object',{method:'POST',body:JSON.stringify({key:'operating',value:state.operating})});
 const r=await api('/api/object',{method:'POST',body:JSON.stringify({key:'assumptions',value:state.assumptions})});
 state=r.state;renderAll();broadcast('经营参数已保存','罗盘 / 指标 / 融资 / 周报');toast('经营参数已保存，全部指标已重算');
};
$('#reimbursementForm').oninput=renderReimbursementImpact;
$('#reimbursementForm').onchange=renderReimbursementImpact;
$('#reimbursementForm').onsubmit=async e=>{
 e.preventDefault();const r=await api('/api/reimbursement',{method:'POST',body:new FormData(e.target)});
 state=r.state;renderAll();broadcast('报销已录入','现金 / 费用 / 应付 / 代账 / 周报');e.target.reset();e.target.elements.date.value=TODAY;renderReimbursementImpact();toast('报销已录入，全部指标已联动');
};
$('#contractForm').oninput=renderContractImpact;
$('#contractForm').onchange=renderContractImpact;
$('#contractForm').onsubmit=async e=>{
 e.preventDefault();
 const v=Object.fromEntries(new FormData(e.target));
 ['mrr','setupRevenue','grossMargin','acquisitionCost','contractMonths','paymentDays','renewalProbability'].forEach(k=>v[k]=Number(v[k]||0));
 const start=new Date(`${v.startDate}T00:00:00`);start.setMonth(start.getMonth()+v.contractMonths);
 v.id=`customer-${Date.now().toString(36)}`;v.name=v.displayName;v.source='经营录入';v.paymentStatus='正常';v.outstanding=0;v.status='交付中';v.active=true;v.isDemo=true;v.endDate=start.toISOString().slice(0,10);
 const r=await api('/api/item',{method:'POST',body:JSON.stringify({collection:'demoCustomers',item:v})});
 state=r.state;renderAll();broadcast('新合同已保存','客户 / MRR / ARR / 毛利 / 现金预测 / 罗盘 / 融资');e.target.reset();e.target.elements.startDate.value=TODAY;e.target.elements.contractMonths.value=12;e.target.elements.grossMargin.value=60;e.target.elements.renewalProbability.value=80;renderContractImpact();toast('合同已保存并联动全部指标');
};
$('#incomeForm').oninput=renderFinanceImpact;
$('#incomeForm').onchange=renderFinanceImpact;
$('#costForm').oninput=renderFinanceImpact;
$('#costForm').onchange=renderFinanceImpact;
$('#incomeForm').onsubmit=async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target));v.amount=Number(v.amount||0);v.id=`income-${Date.now().toString(36)}`;v.createdAt=new Date().toISOString();
 const r=await api('/api/item',{method:'POST',body:JSON.stringify({collection:'incomeEntries',item:v})});
 state=r.state;renderAll();broadcast('收入已录入','收入确认 / 实际现金 / 利润 / 代账 / 融资');e.target.reset();e.target.elements.date.value=TODAY;e.target.elements.status.value='合同预算';renderFinanceImpact();toast('收入已保存，全部指标已联动');
};
$('#costForm').onsubmit=async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target));v.unitAmount=Number(v.unitAmount||0);v.quantity=Number(v.quantity||1);v.id=`cost-${Date.now().toString(36)}`;v.createdAt=new Date().toISOString();
 const r=await api('/api/item',{method:'POST',body:JSON.stringify({collection:'costItems',item:v})});
 state=r.state;renderAll();broadcast('成本已录入','成本运行率 / 毛利 / 实际现金 / Runway（现金可支撑时间）/ 代账');e.target.reset();e.target.elements.date.value=TODAY;e.target.elements.quantity.value=1;e.target.elements.status.value='预算';e.target.elements.frequency.value='monthly';renderFinanceImpact();toast('成本已保存，全部指标已联动');
};
$('#dividendRulesForm').oninput=()=>renderDividendRules(true);
$('#dividendRulesForm').onchange=()=>renderDividendRules(true);
$('#dividendRulesForm').onsubmit=async e=>{
 e.preventDefault();
 const v=Object.fromEntries(new FormData(e.target));
 ['founderPool','cofounderPool','employeeEsop','vestingYearsMin','vestingYearsMax','cliffMonths','pmfDividendRate','retentionReserveRate','afterTaxProfit','qualifiedFinancing','founderDeferredCompCap','financingBonusRate'].forEach(k=>v[k]=Number(v[k]||0));
 const r=await api('/api/object',{method:'POST',body:JSON.stringify({key:'dividendRules',value:v})});
 state=r.state;renderAll();broadcast('分红规则已保存','分红规则 / 公司治理 / 投行雷达 / 融资准备度');toast('分红规则已保存，资本适配雷达已重算');
};
$('[data-jump-view="customers"]').onclick=()=>showView('customers');
$$('[data-jump-view]').forEach(b=>b.onclick=()=>{showView(b.dataset.jumpView);const formId=b.dataset.focusForm;if(formId)setTimeout(()=>document.getElementById(formId)?.scrollIntoView({behavior:'smooth',block:'center'}),60)});
$('#accountingMonth').onchange=renderAccounting;
$('#glossarySearch').oninput=renderGlossary;
$('#customerSearch').oninput=renderCustomers;
$('#investorKeyword').onchange=()=>{renderFundraising();broadcast('融资关键词已筛选','国内机构匹配分')};
$('#investorChannel').onchange=()=>{renderFundraising();broadcast('融资渠道已筛选','机构候选池')};
$('#toggleDemoMode').onclick=async()=>{
 const r=await api('/api/object',{method:'POST',body:JSON.stringify({key:'demoMode',value:!state.demoMode})});
 state=r.state;renderAll();broadcast(state.demoMode?'已启用经营规划口径':'已切换已入账口径','客户 / 收入 / 罗盘 / 融资');toast(state.demoMode?'客户合同与预算已参与预测':'已恢复已入账经营口径');
};
$('#exportAccounting').onclick=()=>{broadcast('已生成代账交接包','资金流水 / 报销 / 票据索引');location.href=`/api/export/accounting?month=${encodeURIComponent($('#accountingMonth').value||MONTH)}`};
$('#refreshInvestorScout').onclick=async()=>{
 const b=$('#refreshInvestorScout');b.disabled=true;b.textContent='扫描中';
 try{const r=await api('/api/investor-scout',{method:'POST',body:'{}'});state=r.state;renderAll();broadcast('融资信号已更新','机构名单 / 市场信号 / 匹配分');toast(r.message||'融资信号已更新')}
 catch(e){toast('联网更新失败，已保留现有候选库')}
 finally{b.disabled=false;b.textContent='联网更新融资信号'}
};
$('#refreshAll').onclick=async()=>{await load();broadcast('数据已刷新','全部模块');toast('全部数据已刷新')};
load().catch(err=>{$('#serverStatus').textContent='连接失败';console.error(err)});
