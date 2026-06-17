const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const TODAY=new Date().toISOString().slice(0,10), MONTH=TODAY.slice(0,7);
const money=n=>'¥'+Number(n||0).toLocaleString('zh-CN',{maximumFractionDigits:0});
const pct=n=>`${Number(n||0).toFixed(1)}%`;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sum=(rows,get=x=>Number(x.amount||0))=>rows.reduce((s,x)=>s+get(x),0);
const api=async(path,options={})=>{const res=await fetch(path,{headers:options.body instanceof FormData?{}:{'Content-Type':'application/json'},...options});if(!res.ok)throw new Error(await res.text());return res.json()};
const metric=(label,value,sub='',cls='')=>`<div class="metric ${cls}"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
const input=(collection,id,field,value,type='text',cls='')=>`<input class="cell-input ${cls}" data-edit="${collection}" data-id="${id}" data-field="${field}" type="${type}" value="${esc(value)}">`;
const select=(collection,id,field,value,options)=>`<select class="cell-select" data-edit="${collection}" data-id="${id}" data-field="${field}">${options.map(x=>`<option ${x===value?'selected':''}>${x}</option>`).join('')}</select>`;
let state;
const toast=text=>{const el=$('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)};
const announce=(text)=>{$('#actionSignal').textContent=text;toast(text)};
const active=rows=>rows.filter(x=>!x.archived&&x.status!=='已归档');
const costTotal=x=>Number(x.unitAmount||0)*Number(x.quantity||0);
const employeeCost=x=>Number(x.baseSalary||0)+Number(x.employerSocial||0)+Number(x.housingFund||0)+Number(x.monthlyBonus||0);
const monthActive=(x,month=MONTH)=>String(x.date||x.startDate||'').slice(0,7)<=month&&(!x.endDate||String(x.endDate).slice(0,7)>=month);
const glossary=[
 ['MRR','月度经常性收入','有效合同月度服务费合计','衡量可预测收入基础','连续下降需复盘'],
 ['ARR','年度经常性收入','MRR × 12','融资估值常用收入规模','不能包含一次性收入'],
 ['Gross Margin','毛利率','（合同收入－直接交付成本）÷合同收入','判断商业模式质量','低于 50%需拆解成本'],
 ['Runway','现金可支撑时间','可用现金÷预计月度净消耗','决定融资时间窗口','低于 6 个月为红色预警'],
 ['AR','应收账款','应收＋已开票＋已确认未回款','判断回款压力','逾期应立即催收'],
 ['DSO','应收账款周转天数','应收÷MRR×30','衡量回款效率','超过 60 天需关注'],
 ['CAC','客户获取成本','销售市场投入÷新增客户','判断获客效率','需与 LTV 联合判断'],
 ['LTV / CAC','客户价值成本比','客户终身价值÷获客成本','衡量单位经济','低于 3 倍需关注'],
 ['Burn Rate','现金消耗率','月度现金流出－现金流入','衡量每月净消耗','需与增长联动'],
 ['Pipeline Coverage','融资管线覆盖','概率加权融资额÷目标融资额','衡量融资目标支撑度','低于 1 倍需补充机构'],
 ['Dilution','融资稀释率','融资额÷投后估值','测算原股东持股下降','条款需与估值一起判断'],
 ['Data Room Readiness','资料室完成度','已完成资料÷全部资料','判断尽调准备程度','低于 80%不宜正式尽调'],
];

function normalize(){
 ['contracts','incomeEntries','costItems','employees','payrollRuns','shareholders','dividendDistributions','fundraisingRounds','investorPipeline','investorInteractions','reimbursements','transactions','evidence','investorTargets','fundingSignals','dataRoomChecklist','accounts'].forEach(k=>state[k]??=[]);
 state.dividendRules??={};state.assumptions??={};state.operating??={};
 Object.assign(state.dividendRules,{founderPool:60,cofounderPool:30,employeeEsop:10,retentionReserveRate:20,pmfDividendRate:0,afterTaxProfit:0,...state.dividendRules});
}

function derive(month=MONTH){
 const contracts=active(state.contracts).filter(x=>['待履约','履约中','待续约'].includes(x.status)&&String(x.startDate||'9999').slice(0,7)<=month&&(!x.endDate||String(x.endDate).slice(0,7)>=month));
 const mrr=sum(contracts,x=>Number(x.monthlyFee||0));
 const setup=sum(contracts.filter(x=>String(x.startDate).startsWith(month)),x=>Number(x.setupFee||0));
 const directContractCost=sum(contracts,x=>Number(x.directCost||0));
 const employees=active(state.employees).filter(x=>x.status==='在职'&&monthActive(x,month));
 const payroll=sum(employees,employeeCost);
 const costs=active(state.costItems).filter(x=>x.status!=='暂停'&&monthActive(x,month));
 const payrollRuns=active(state.payrollRuns);
 const paidPayroll=payrollRuns.filter(x=>x.status==='已支付');
 const accruedPayroll=payrollRuns.filter(x=>['已计提','已支付'].includes(x.status));
 const costBudget=sum(costs,x=>x.frequency==='monthly'?costTotal(x):String(x.date).startsWith(month)?costTotal(x):0);
 const directOther=sum(costs.filter(x=>x.costNature==='direct'),x=>x.frequency==='monthly'?costTotal(x):String(x.date).startsWith(month)?costTotal(x):0);
 const income=active(state.incomeEntries);
 const received=income.filter(x=>x.status==='已回款');
 const recognized=income.filter(x=>['已确认','已回款'].includes(x.status));
 const openIncome=income.filter(x=>['应收','已开票','已确认'].includes(x.status));
 const overdue=openIncome.filter(x=>x.dueDate&&x.dueDate<TODAY);
 const paidCosts=costs.filter(x=>x.status==='已支付');
 const occurredCosts=costs.filter(x=>['已发生','已支付'].includes(x.status));
 const claims=active(state.reimbursements).filter(x=>x.status!=='已驳回');
 const approvedClaims=claims.filter(x=>x.status==='已审核'), paidClaims=claims.filter(x=>x.status==='已支付'), pendingClaims=claims.filter(x=>x.status==='待审核');
 const opening=sum(state.accounts,x=>Number(x.openingBalance||0));
 const financingReceived=sum(active(state.fundraisingRounds).filter(x=>x.status==='已交割'),x=>Number(x.actualAmount||0));
 const actualCash=opening+financingReceived+sum(received)-sum(paidCosts,costTotal)-sum(paidClaims)-sum(paidPayroll);
 const committed=sum(approvedClaims)+sum(pendingClaims)+sum(occurredCosts.filter(x=>x.status==='已发生'),costTotal)+sum(accruedPayroll.filter(x=>x.status==='已计提'));
 const availableCash=actualCash-committed;
 const monthlyRevenue=mrr+setup;
 const monthlyCost=payroll+costBudget+directContractCost;
 const grossMargin=monthlyRevenue?Math.max(0,(monthlyRevenue-directContractCost-directOther)/monthlyRevenue*100):0;
 const netBurn=Math.max(0,monthlyCost-monthlyRevenue);
 const runway=netBurn?availableCash/netBurn:99;
 const ar=sum(openIncome), dso=mrr?ar/mrr*30:null;
 const totalShares=sum(active(state.shareholders),x=>Number(x.shares||0));
 const rules=state.dividendRules;
 const dividendPool=Math.max(0,Number(rules.afterTaxProfit||0)*(1-Number(rules.retentionReserveRate||0)/100)*Number(rules.pmfDividendRate||0)/100);
 const rounds=active(state.fundraisingRounds);
 const currentRound=rounds.find(x=>!['已交割','已关闭'].includes(x.status))||rounds[0];
 const target=Number(currentRound?.targetAmount||0);
 const preMoney=Number(currentRound?.preMoneyValuation||0);
 const dilution=target&&preMoney?target/(target+preMoney)*100:0;
 const pipeline=active(state.investorPipeline).filter(x=>x.stage!=='已关闭');
 const weightedFunding=sum(pipeline,x=>Number(x.ticket||0)*Number(x.probability||0)/100);
 const dataRoom=state.dataRoomChecklist||[], dataRoomRate=dataRoom.length?dataRoom.filter(x=>x.completed).length/dataRoom.length*100:0;
 const evidenceItems=[...occurredCosts,...claims], evidenceRate=evidenceItems.length?evidenceItems.filter(x=>x.invoiceNo||x.attachmentId).length/evidenceItems.length*100:100;
 return{contracts,mrr,setup,employees,payroll,payrollRuns,paidPayroll,accruedPayroll,costs,costBudget,directContractCost,directOther,income,received,recognized,openIncome,overdue,claims,approvedClaims,pendingClaims,paidClaims,financingReceived,actualCash,availableCash,committed,monthlyRevenue,monthlyCost,grossMargin,netBurn,runway,ar,dso,totalShares,dividendPool,currentRound,target,preMoney,dilution,pipeline,weightedFunding,dataRoomRate,evidenceRate};
}

function scoreModel(f){
 const cash=f.runway>=12?100:f.runway>=6?70:f.runway>=3?40:15;
 const revenue=Math.min(100,f.contracts.length*8+f.mrr/30000*10);
 const cost=f.grossMargin>=60?90:f.grossMargin>=45?65:f.grossMargin?35:10;
 const compliance=(f.evidenceRate+f.dataRoomRate)/2;
 const funding=Math.min(100,(f.weightedFunding/(f.target||1))*60+f.dataRoomRate*.4);
 return{cash,revenue,cost,compliance,funding,score:(cash+revenue+cost+compliance+funding)/5};
}
const band=v=>v>=75?'good':v>=50?'warn':'risk';
const bandText=v=>v>=75?'安全':v>=50?'预警':'危险';
const gauge=(label,value,sub)=>`<div class="gauge ${band(value)}" style="--score:${Math.round(value)}"><div class="gauge-ring"><strong>${Math.round(value)}</strong><span>分</span></div><b>${label}</b><small>${sub}</small></div>`;
const light=(label,status,detail)=>`<div class="traffic-item ${status}"><i></i><b>${label}</b><span>${detail}</span></div>`;

function renderDashboard(){
 const f=derive(),s=scoreModel(f);
 $('#dashboardMetrics').innerHTML=[
  metric('实际现金',money(f.actualCash),'已回款－已支付'),
  metric('可用现金',money(f.availableCash),'扣除已知承诺',f.availableCash<0?'risk':'good'),
  metric('MRR（月度经常性收入）',money(f.mrr),`${f.contracts.length} 份有效合同`),
  metric('月度成本预算',money(f.monthlyCost),`工资 ${money(f.payroll)}`),
  metric('应收账款',money(f.ar),`${f.overdue.length} 笔逾期`,f.overdue.length?'risk':''),
  metric('Runway（现金可支撑时间）',f.runway>=99?'净流入':`${f.runway.toFixed(1)} 个月`,'现金安全期',f.runway<6?'risk':'good')
 ].join('');
 const empty=!state.contracts.length&&!state.costItems.length&&!state.employees.length&&!state.shareholders.length;
 $('#healthLabel').textContent=empty?'空库已就绪':s.score>=75?'经营基础较完整':s.score>=50?'存在待补项目':'关键经营数据不足';
 $('#healthReason').textContent=empty?'请录入第一份合同、员工或成本，系统将自动形成财务结果。':`综合评分 ${Math.round(s.score)} 分；优先处理现金、逾期应收和资料完整度。`;
 $('#dataFreshness').textContent=`更新 ${String(state.updatedAt||'').slice(0,16).replace('T',' ')}`;
 $('#overallGauge').innerHTML=`<div class="overall ${band(s.score)}" style="--score:${Math.round(s.score)}"><div class="overall-ring"><strong>${Math.round(s.score)}</strong><span>${bandText(s.score)}</span></div><div><b>综合经营健康度</b><p>${empty?'空库已就绪，录入第一份业务后自动生成判断。':`现金、收入、成本、合规、融资综合评分 ${Math.round(s.score)} 分。`}</p></div></div>`;
 $('#miniGauges').innerHTML=[
  gauge('Cash Safety（现金安全）',s.cash,f.runway>=99?'现金净流入':`${f.runway.toFixed(1)} 个月`),
  gauge('Revenue Quality（收入质量）',s.revenue,`${f.contracts.length} 份合同`),
  gauge('Cost Control（成本控制）',s.cost,`毛利率 ${pct(f.grossMargin)}`),
  gauge('Fundraising Readiness（融资准备）',s.funding,`资料室 ${pct(f.dataRoomRate)}`)
 ].join('');
 $('#trafficLights').innerHTML=[
  light('现金',f.runway>=6?'good':f.runway>=3?'warn':'risk',f.runway>=99?'净流入':`${f.runway.toFixed(1)} 个月`),
  light('回款',f.overdue.length?f.overdue.length>2?'risk':'warn':'good',`${f.overdue.length} 笔逾期`),
  light('成本',f.monthlyCost&&f.mrr&&f.monthlyCost>f.monthlyRevenue?'warn':'good',`月成本 ${money(f.monthlyCost)}`),
  light('票据',f.evidenceRate>=90?'good':f.evidenceRate>=70?'warn':'risk',pct(f.evidenceRate)),
  light('融资',s.funding>=60?'good':s.funding>=35?'warn':'risk',`覆盖 ${f.target?(f.weightedFunding/f.target).toFixed(1):'0.0'} 倍`),
  light('股权',state.shareholders.length?'good':'warn',state.shareholders.length?'已建立':'待录入')
 ].join('');
 const cashForm=$('#cashBalanceForm');
 cashForm.elements.bankBalance.value=state.accounts.find(x=>x.id==='acc-bank')?.openingBalance||0;
 cashForm.elements.cashBalance.value=state.accounts.find(x=>x.id==='acc-cash')?.openingBalance||0;
 const actions=[];
 if(!state.contracts.length)actions.push(['录入第一份合同','系统将自动生成月度收入和应收计划。','立即']);
 if(f.overdue.length)actions.push(['催收逾期款',`${f.overdue.length} 笔逾期，合计 ${money(sum(f.overdue))}。`,'今日']);
 if(!state.employees.length)actions.push(['建立员工工资表','工资、社保和公积金尚未进入成本预测。','本周']);
 if(f.runway<6)actions.push(['现金安全',`现金可支撑 ${f.runway.toFixed(1)} 个月，应同步推进回款和融资。`,'高优先级']);
 if(f.dataRoomRate<80)actions.push(['补齐融资资料室',`当前完成度 ${pct(f.dataRoomRate)}。`,'融资前']);
 $('#managementActions').innerHTML=(actions.slice(0,5).map((x,i)=>`<div class="action-item"><span>0${i+1}</span><div><b>${x[0]}</b><p>${x[1]}</p></div><em>${x[2]}</em></div>`).join('')||'<div class="empty">暂无重大待办。</div>');
 $('#sourceTrace').innerHTML=[
  ['MRR',`${f.contracts.length} 份有效合同`,f.mrr],
  ['人工成本',`${f.employees.length} 名在职员工`,f.payroll],
  ['经营成本',`${f.costs.length} 个有效成本项目`,f.costBudget],
  ['应收账款',`${f.openIncome.length} 笔未回款`,f.ar],
  ['融资管线',`${f.pipeline.length} 家推进中机构`,f.weightedFunding],
 ].map(x=>`<div class="trace-row"><span><b>${x[0]}</b><small>${x[1]}</small></span><strong>${money(x[2])}</strong></div>`).join('');
 $('#compassGrade').textContent=`${Math.round(s.score)} 分`;
 $('#compassDimensions').innerHTML=[['现金安全',s.cash],['收入验证',s.revenue],['成本与毛利',s.cost],['合规证据',s.compliance],['融资准备',s.funding]].map(x=>`<div class="dimension-row"><span>${x[0]}</span><div><i style="width:${Math.round(x[1])}%"></i></div><b>${Math.round(x[1])}</b></div>`).join('');
 renderCashWaterfall(f);
 renderFundingFunnel();
 renderRevenuePlan();
 $('#professionalMetrics').innerHTML=[
  metric('ARR（年度经常性收入）',money(f.mrr*12),'MRR × 12'),
  metric('毛利率',pct(f.grossMargin),'合同及直接成本口径'),
  metric('DSO（应收周转天数）',f.dso===null?'待形成':`${f.dso.toFixed(0)} 天`,'应收 ÷ MRR × 30'),
  metric('票据覆盖率',pct(f.evidenceRate),'成本及报销凭证'),
  metric('融资管线覆盖',f.target?`${(f.weightedFunding/f.target).toFixed(1)} 倍`:'待设置目标','概率加权金额 ÷ 目标'),
  metric('资料室完成度',pct(f.dataRoomRate),'尽职调查准备度')
 ].join('');
 $('#glossaryRows').innerHTML=glossary.map(x=>`<tr>${x.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
}

function renderCashWaterfall(f){
 const rows=[
  ['期初现金',sum(state.accounts,x=>Number(x.openingBalance||0)),'base'],
  ['本月回款',sum(f.received.filter(x=>String(x.date).startsWith(MONTH))),'in'],
  ['融资到账',f.financingReceived,'in'],
  ['工资',-sum(f.paidPayroll),'out'],
  ['成本',-sum(f.costs.filter(x=>x.status==='已支付'),costTotal),'out'],
  ['报销',-sum(f.paidClaims),'out'],
  ['当前现金',f.actualCash,'end']
 ];
 const max=Math.max(1,...rows.map(x=>Math.abs(x[1])));
 $('#cashWaterfall').innerHTML=rows.map(x=>`<div class="water-row ${x[2]}"><span>${x[0]}</span><div><i style="width:${Math.max(4,Math.abs(x[1])/max*100)}%"></i></div><b>${money(x[1])}</b></div>`).join('');
}

function renderFundingFunnel(){
 const stages=['待研究','待引荐','已接触','材料已发送','管理层会议','尽职调查','条款谈判'];
 const counts=stages.map(s=>active(state.investorPipeline).filter(x=>x.stage===s).length);
 const max=Math.max(1,...counts);
 $('#fundingFunnel').innerHTML=stages.map((s,i)=>`<div class="funnel-row"><span>${s}</span><div style="--w:${Math.max(14,counts[i]/max*100)}%"><i></i></div><b>${counts[i]}</b></div>`).join('');
}

function renderRevenuePlan(){
 const months=Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()+i);return d.toISOString().slice(0,7)});
 const values=months.map(m=>sum(active(state.incomeEntries).filter(x=>String(x.date).startsWith(m))));
 const max=Math.max(1,...values);
 $('#revenuePlan').innerHTML=months.map((m,i)=>`<div class="bar-row"><span>${m}</span><div><i style="width:${values[i]/max*100}%"></i></div><b>${money(values[i])}</b></div>`).join('');
}

function renderContracts(){
 const f=derive(),contracts=active(state.contracts),q=$('#contractSearch').value.trim().toLowerCase();
 const rows=contracts.filter(x=>`${x.customerName}${x.contractNo}${x.product}`.toLowerCase().includes(q));
 $('#contractMetrics').innerHTML=[
  metric('有效合同',f.contracts.length,'份'),
  metric('MRR（月度经常性收入）',money(f.mrr),'合同月费合计'),
  metric('应收账款',money(f.ar),`${f.openIncome.length} 笔`),
  metric('逾期应收',money(sum(f.overdue)),`${f.overdue.length} 笔`,f.overdue.length?'risk':'good'),
  metric('本月已回款',money(sum(f.received.filter(x=>String(x.date).startsWith(MONTH)))),'现金口径'),
  metric('合同毛利率',pct(f.grossMargin),'预测口径')
 ].join('');
 $('#contractRows').innerHTML=rows.map(x=>`<tr>
  <td><b>${esc(x.customerName)}</b><small>${esc(x.contractNo)}｜${esc(x.product)}</small></td>
  <td>${x.startDate}<small>至 ${x.endDate||'-'}</small></td>
  <td>${input('contracts',x.id,'monthlyFee',x.monthlyFee,'number')}</td>
  <td>${input('contracts',x.id,'setupFee',x.setupFee,'number')}</td>
  <td>${input('contracts',x.id,'directCost',x.directCost,'number')}</td>
  <td>${input('contracts',x.id,'grossMargin',x.grossMargin,'number','compact')}%</td>
  <td>${input('contracts',x.id,'paymentDays',x.paymentDays,'number','compact')}天</td>
  <td>${select('contracts',x.id,'status',x.status,['待履约','履约中','待续约','暂停','已终止'])}</td>
  <td><button class="danger-link" data-archive="contracts" data-id="${x.id}">归档</button></td>
 </tr>`).join('')||'<tr><td colspan="9">尚未录入合同。请使用上方表单录入第一份正式合同。</td></tr>';
 $('#customerOptions').innerHTML=[...new Set(contracts.map(x=>x.customerName))].map(x=>`<option value="${esc(x)}"></option>`).join('');
 $('#contractOptions').innerHTML=contracts.map(x=>`<option value="${esc(x.contractNo)}"></option>`).join('');
 $('#incomeCount').textContent=`${active(state.incomeEntries).length} 笔`;
 $('#incomeRows').innerHTML=active(state.incomeEntries).sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(x=>`<tr>
  <td>${input('incomeEntries',x.id,'date',x.date,'date','date')}<small>到期 ${x.dueDate||'-'}</small></td>
  <td><b>${esc(x.customer)}</b><small>${esc(x.contractNo||'无合同编号')}</small></td>
  <td>${input('incomeEntries',x.id,'amount',x.amount,'number')}</td>
  <td>${select('incomeEntries',x.id,'status',x.status,['应收','已开票','已确认','已回款','已取消'])}</td>
  <td>${input('incomeEntries',x.id,'invoiceNo',x.invoiceNo||'','text','text')}</td>
  <td><button class="danger-link" data-archive="incomeEntries" data-id="${x.id}">归档</button></td>
 </tr>`).join('')||'<tr><td colspan="6">暂无收入或回款计划。</td></tr>';
 bindEditors();
}

function renderPeopleCosts(){
 const f=derive(),employees=active(state.employees),costs=active(state.costItems),payrollRuns=active(state.payrollRuns);
 $('#costMetrics').innerHTML=[
  metric('在职员工',f.employees.length,'人'),
  metric('月度人工成本',money(f.payroll),'工资＋公司承担项'),
  metric('月度经营成本',money(f.costBudget),'不含人工'),
  metric('直接交付成本',money(f.directOther+f.directContractCost),'影响毛利'),
  metric('月度总成本',money(f.monthlyCost),'预测口径'),
  metric('本月已支付成本',money(sum(costs.filter(x=>x.status==='已支付'),costTotal)),'现金口径')
 ].join('');
 $('#employeeCount').textContent=`${employees.length} 人`;
 $('#employeeRows').innerHTML=employees.map(x=>`<tr>
  <td>${input('employees',x.id,'name',x.name,'text','text')}</td>
  <td>${input('employees',x.id,'role',x.role,'text','text')}<small>${esc(x.department||'-')}</small></td>
  <td>${input('employees',x.id,'startDate',x.startDate,'date','date')}</td>
  <td>${input('employees',x.id,'baseSalary',x.baseSalary,'number')}</td>
  <td>${input('employees',x.id,'employerSocial',x.employerSocial,'number')}</td>
  <td>${input('employees',x.id,'housingFund',x.housingFund,'number')}</td>
  <td>${input('employees',x.id,'monthlyBonus',x.monthlyBonus,'number')}</td>
  <td><b>${money(employeeCost(x))}</b></td>
  <td>${select('employees',x.id,'status',x.status,['在职','待入职','离职'])}</td>
  <td><button class="danger-link" data-archive="employees" data-id="${x.id}">归档</button></td>
 </tr>`).join('')||'<tr><td colspan="10">尚未录入员工。</td></tr>';
 $('#payrollCount').textContent=`${payrollRuns.length} 笔`;
 $('#payrollRows').innerHTML=payrollRuns.map(x=>`<tr>
  <td>${input('payrollRuns',x.id,'month',x.month,'month','date')}</td>
  <td>${input('payrollRuns',x.id,'payDate',x.payDate||'','date','date')}</td>
  <td>${input('payrollRuns',x.id,'amount',x.amount,'number')}</td>
  <td>${select('payrollRuns',x.id,'status',x.status,['预算','已计提','已支付'])}</td>
  <td>${input('payrollRuns',x.id,'notes',x.notes||'','text','text')}</td>
  <td><button class="danger-link" data-archive="payrollRuns" data-id="${x.id}">归档</button></td>
 </tr>`).join('')||'<tr><td colspan="6">暂无工资计提或发放记录。</td></tr>';
 $('#costCount').textContent=`${costs.length} 项`;
 $('#costRows').innerHTML=costs.map(x=>`<tr>
  <td>${input('costItems',x.id,'name',x.name,'text','text')}</td><td>${esc(x.category)}</td>
  <td>${input('costItems',x.id,'unitAmount',x.unitAmount,'number')}</td>
  <td>${input('costItems',x.id,'quantity',x.quantity,'number','compact')}</td>
  <td><b>${money(costTotal(x))}</b></td>
  <td>${select('costItems',x.id,'frequency',x.frequency,['monthly','oneoff'])}</td>
  <td>${select('costItems',x.id,'status',x.status,['预算','已发生','已支付','暂停'])}</td>
  <td>${input('costItems',x.id,'invoiceNo',x.invoiceNo||'','text','text')}</td>
  <td><button class="danger-link" data-archive="costItems" data-id="${x.id}">归档</button></td>
 </tr>`).join('')||'<tr><td colspan="9">尚未录入经营成本。</td></tr>';
 bindEditors();
}

function renderEquity(){
 const f=derive(),holders=active(state.shareholders),rules=state.dividendRules;
 $('#equityMetrics').innerHTML=[
  metric('有效股东 / 持有人',holders.length,'人或机构'),
  metric('总股份数',Number(f.totalShares).toLocaleString('zh-CN'),'股'),
  metric('税后利润',money(rules.afterTaxProfit),'测算输入'),
  metric('可分红池',money(f.dividendPool),'留存后 × 分红比例'),
  metric('员工期权池',pct(rules.employeeEsop),'规则口径'),
  metric('股权记录完整度',holders.length?'已建立':'待建立','Cap Table（股权结构表）',holders.length?'good':'risk')
 ].join('');
 const form=$('#dividendRulesForm');['afterTaxProfit','retentionReserveRate','pmfDividendRate','employeeEsop','founderPool','cofounderPool'].forEach(k=>form.elements[k].value=rules[k]??0);
 $('#dividendPreview').innerHTML=`<b>当前测算</b><span>税后利润 ${money(rules.afterTaxProfit)}－留存 ${pct(rules.retentionReserveRate)}，按 ${pct(rules.pmfDividendRate)} 分红，可分红池为 ${money(f.dividendPool)}。</span>`;
 $('#shareholderRows').innerHTML=holders.map(x=>{const ownership=f.totalShares?Number(x.shares||0)/f.totalShares*100:0;return `<tr>
  <td>${input('shareholders',x.id,'name',x.name,'text','text')}</td>
  <td>${select('shareholders',x.id,'role',x.role,['创始人','联合创始人','员工','机构股东','员工期权池'])}</td>
  <td>${input('shareholders',x.id,'shares',x.shares,'number')}</td><td><b>${pct(ownership)}</b></td>
  <td>${input('shareholders',x.id,'paidIn',x.paidIn,'number')}</td>
  <td>${input('shareholders',x.id,'vestingYears',x.vestingYears||0,'number','compact')}年</td>
  <td>${input('shareholders',x.id,'cliffMonths',x.cliffMonths||0,'number','compact')}月</td>
  <td>${select('shareholders',x.id,'status',x.status,['有效','待生效','已退出'])}</td>
  <td><button class="danger-link" data-archive="shareholders" data-id="${x.id}">归档</button></td>
 </tr>`}).join('')||'<tr><td colspan="9">尚未录入股东或期权持有人。</td></tr>';
 $('#dividendRows').innerHTML=holders.filter(x=>x.status==='有效').map(x=>{const ownership=f.totalShares?Number(x.shares||0)/f.totalShares*100:0;return `<tr><td>${esc(x.name)}</td><td>${pct(ownership)}</td><td><b>${money(f.dividendPool*ownership/100)}</b></td><td>公司决议后依法代扣代缴相关税费</td></tr>`}).join('')||'<tr><td colspan="4">录入有效股东并设置利润参数后生成建议。</td></tr>';
 bindEditors();
}

function renderFundraising(){
 const f=derive(),s=scoreModel(f),rounds=active(state.fundraisingRounds),pipeline=active(state.investorPipeline);
 const coverage=f.target?f.weightedFunding/f.target:0;
 $('#fundraisingMetrics').innerHTML=[
  metric('目标融资额',money(f.target),f.currentRound?.name||'尚未建立轮次'),
  metric('投前估值',money(f.preMoney),'融资情景输入'),
  metric('预计稀释',pct(f.dilution),'融资额 ÷ 投后估值'),
  metric('推进中机构',f.pipeline.length,'家'),
  metric('概率加权金额',money(f.weightedFunding),`覆盖 ${coverage.toFixed(1)} 倍`),
  metric('资料室完成度',pct(f.dataRoomRate),'尽调准备')
 ].join('');
 $('#fundingGrade').textContent=s.score>=75?'适合系统推进':s.score>=55?'适合融资预热':'先补经营证据';
 const standards=[
  ['有效合同',f.contracts.length,10,'份'],['ARR（年度经常性收入）',f.mrr*12,1000000,'元'],['毛利率',f.grossMargin,55,'%'],
  ['现金安全期',Math.min(f.runway,24),6,'个月'],['资料室',f.dataRoomRate,80,'%'],['管线覆盖',coverage,1,'倍']
 ];
 $('#fundingReadiness').innerHTML=`<div class="standard-grid">${standards.map(x=>`<div class="standard-item ${x[1]>=x[2]?'pass':'gap'}"><span>${x[0]}</span><b>${x[3]==='元'?money(x[1]):`${Number(x[1]).toFixed(x[3]==='倍'?1:0)} ${x[3]}`}</b><small>建议标准：${x[3]==='元'?money(x[2]):`${x[2]} ${x[3]}`}</small></div>`).join('')}</div>`;
 const rf=$('#fundingRoundForm');const target=Number(rf.elements.targetAmount.value||0),pre=Number(rf.elements.preMoneyValuation.value||0);
 $('#dilutionPreview').innerHTML=`<b>融资稀释预览</b><span>${target&&pre?`投后估值 ${money(target+pre)}，新增投资人预计持股 ${pct(target/(target+pre)*100)}。`:'输入融资额和投前估值后自动计算。'}</span>`;
 $('#investorRows').innerHTML=pipeline.map(x=>`<tr>
  <td><b>${esc(x.institution)}</b><small>${esc(x.contact||'未填联系人')}</small></td>
  <td>${esc(x.channel)}</td>
  <td>${select('investorPipeline',x.id,'stage',x.stage,['待研究','待引荐','已接触','材料已发送','管理层会议','尽职调查','条款谈判','已关闭'])}</td>
  <td>${input('investorPipeline',x.id,'probability',x.probability,'number','compact')}%</td>
  <td>${input('investorPipeline',x.id,'ticket',x.ticket,'number')}</td>
  <td>${input('investorPipeline',x.id,'nextDate',x.nextDate||'','date','date')}</td>
  <td>${input('investorPipeline',x.id,'nextAction',x.nextAction||'','text','text')}</td>
  <td><button class="danger-link" data-archive="investorPipeline" data-id="${x.id}">归档</button></td>
 </tr>`).join('')||'<tr><td colspan="8">尚未建立融资机构管线。</td></tr>';
 const interactions=active(state.investorInteractions).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 $('#investorOptions').innerHTML=pipeline.map(x=>`<option value="${esc(x.institution)}"></option>`).join('');
 $('#interactionCount').textContent=`${interactions.length} 条`;
 $('#interactionRows').innerHTML=interactions.map(x=>`<tr><td>${x.date}</td><td><b>${esc(x.institution)}</b></td><td>${esc(x.type)}</td><td>${esc(x.summary)}</td><td>${esc(x.nextAction||'-')}<small>${x.nextDate||''}</small></td><td><button class="danger-link" data-archive="investorInteractions" data-id="${x.id}">归档</button></td></tr>`).join('')||'<tr><td colspan="6">暂无机构沟通记录。</td></tr>';
 $('#dataRoomRows').innerHTML=(state.dataRoomChecklist||[]).map(x=>`<label class="check-row"><input type="checkbox" data-check-id="${x.id}" ${x.completed?'checked':''}><span><b>${esc(x.name)}</b><small>${esc(x.category)}</small></span></label>`).join('');
 renderInvestorLibrary(f);
 bindEditors();
 $$('[data-check-id]').forEach(el=>el.onchange=async()=>{const r=await api('/api/update',{method:'POST',body:JSON.stringify({collection:'dataRoomChecklist',id:el.dataset.checkId,changes:{completed:el.checked,completedAt:el.checked?new Date().toISOString():''}})});state=r.state;renderAll();announce('资料室完成度已更新')});
}

function renderInvestorLibrary(f){
 const keyword=$('#investorKeyword').value,channel=$('#investorChannel').value;
 const targets=(state.investorTargets||[]).filter(x=>(!keyword||x.focus.includes(keyword))&&(!channel||x.channel===channel)).map(x=>({...x,score:Math.max(35,Math.min(96,Math.round(Number(x.baseScore||70)+(f.dataRoomRate-50)*.1+(f.contracts.length>=8?4:0)-(f.mrr*12<500000&&x.channel==='财务投资'?8:0))))}));
 $('#investorTargets').innerHTML=targets.sort((a,b)=>b.score-a.score).map(x=>`<div class="target-card"><header><b>${esc(x.name)}</b><span>${x.score}%</span></header><p>${esc(x.reason)}</p><footer>${esc(x.channel)}｜${esc(x.stage)} <a href="${esc(x.url)}" target="_blank" rel="noreferrer">官方资料</a></footer></div>`).join('')||'<div class="empty">当前筛选条件下暂无机构。</div>';
 $('#fundingSignals').innerHTML=(state.fundingSignals||[]).map(x=>`<div class="target-card"><header><b>${esc(x.title)}</b></header><p>${esc(x.source||'公开来源')}｜${esc(x.date||'')}</p><footer>研究线索 <a href="${esc(x.link)}" target="_blank" rel="noreferrer">查看来源</a></footer></div>`).join('')||'<div class="empty">点击“更新公开融资信号”获取近期研究线索。</div>';
}

function accountingItems(month){
 return [
  ...active(state.incomeEntries).filter(x=>String(x.date).startsWith(month)).map(x=>({date:x.date,type:'收入',party:x.customer,category:x.category,amount:x.amount,evidence:x.invoiceNo,status:x.status})),
  ...active(state.costItems).filter(x=>String(x.date).startsWith(month)||x.frequency==='monthly'&&monthActive(x,month)).map(x=>({date:x.date,type:'成本',party:x.counterparty||x.name,category:x.category,amount:costTotal(x),evidence:x.invoiceNo,status:x.status})),
  ...active(state.payrollRuns).filter(x=>x.month===month).map(x=>({date:x.payDate||`${x.month}-01`,type:'工资',party:'员工工资表',category:'工资及公司承担项',amount:x.amount,evidence:'工资表',status:x.status})),
  ...active(state.reimbursements).filter(x=>String(x.date).startsWith(month)).map(x=>({date:x.date,type:'报销',party:x.applicant,category:x.category,amount:x.amount,evidence:x.invoiceNo||x.fileName,status:x.status}))
 ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function renderAccounting(){
 const f=derive(),month=$('#accountingMonth').value||MONTH,items=accountingItems(month);
 $('#accountingMetrics').innerHTML=[
  metric('当月收入记录',money(sum(items.filter(x=>x.type==='收入'))),'计划及实际'),
  metric('当月成本记录',money(sum(items.filter(x=>x.type==='成本'))),'经营成本'),
  metric('报销金额',money(sum(items.filter(x=>x.type==='报销'))),'全部状态'),
  metric('待审核报销',money(sum(f.pendingClaims)),'降低可用现金'),
  metric('缺少票据',items.filter(x=>['成本','报销'].includes(x.type)&&!x.evidence).length,'笔'),
  metric('票据覆盖率',pct(f.evidenceRate),'代账与尽调口径')
 ].join('');
 $('#reimbursementCount').textContent=`${active(state.reimbursements).length} 笔`;
 $('#reimbursementRows').innerHTML=active(state.reimbursements).map(x=>`<tr><td>${x.date}</td><td><b>${esc(x.applicant)}</b><small>${esc(x.description)}｜${esc(x.payee)}</small></td><td>${money(x.amount)}</td><td>${x.attachmentId?`<a href="/api/reimbursement-file/${x.attachmentId}">查看附件</a>`:esc(x.invoiceNo||'待补')}</td><td>${select('reimbursements',x.id,'status',x.status,['待审核','已审核','已支付','已驳回'])}</td><td><button class="danger-link" data-archive="reimbursements" data-id="${x.id}">归档</button></td></tr>`).join('')||'<tr><td colspan="6">暂无报销记录。</td></tr>';
 $('#accountingRowCount').textContent=`${items.length} 笔`;
 $('#accountingRows').innerHTML=items.map(x=>`<tr><td>${x.date}</td><td>${x.type}</td><td>${esc(x.party)}</td><td>${esc(x.category)}</td><td>${money(x.amount)}</td><td>${esc(x.evidence||'待补')}</td><td>${x.status}</td></tr>`).join('')||'<tr><td colspan="7">该月份暂无交接数据。</td></tr>';
 bindEditors();
}

function bindEditors(){
 $$('[data-edit]').forEach(el=>el.onchange=async()=>{
  const numeric=el.type==='number',value=numeric?Number(el.value||0):el.value;
  const collection=el.dataset.edit,id=el.dataset.id,field=el.dataset.field;
  const path=collection==='contracts'?'/api/contract-update':'/api/update';
  const body=collection==='contracts'?{id,changes:{[field]:value}}:{collection,id,changes:{[field]:value}};
  try{const r=await api(path,{method:'POST',body:JSON.stringify(body)});state=r.state;renderAll();announce('数据已保存，相关指标已重算')}catch(e){toast('保存失败：'+e.message)}
 });
 $$('[data-archive]').forEach(el=>el.onclick=async()=>{
  if(el.dataset.ready!=='yes'){el.dataset.ready='yes';el.textContent='再次点击确认';setTimeout(()=>{el.dataset.ready='';el.textContent='归档'},2500);return}
  const collection=el.dataset.archive,id=el.dataset.id;
  const changes=collection==='contracts'?{status:'已归档',archived:true}:{archived:true,status:'已归档'};
  const path=collection==='contracts'?'/api/contract-update':'/api/update';
  const body=collection==='contracts'?{id,changes}:{collection,id,changes};
  const r=await api(path,{method:'POST',body:JSON.stringify(body)});state=r.state;renderAll();announce('记录已归档并保留审计痕迹');
 });
}

function renderAll(){renderDashboard();renderContracts();renderPeopleCosts();renderEquity();renderFundraising();renderAccounting();$('#lastSaved').textContent=`保存 ${String(state.updatedAt||'').slice(0,16).replace('T',' ')}`}
async function load(){state=await api('/api/state');normalize();$('.server-status').classList.add('connected');$('#serverStatus').textContent='本地数据已连接';renderAll()}
const titles={dashboard:'经营驾驶舱',contracts:'合同与回款',peopleCosts:'成本与工资',equity:'股权与分红',fundraising:'融资执行',accounting:'报销与代账'};
function showView(id){$$('.view').forEach(x=>x.classList.toggle('active',x.id===id));$$('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===id));$('#viewTitle').textContent=titles[id];scrollTo(0,0)}
$$('#nav button').forEach(x=>x.onclick=()=>showView(x.dataset.view));
$$('[data-go]').forEach(x=>x.onclick=()=>{showView(x.dataset.go);setTimeout(()=>document.getElementById(x.dataset.focus)?.scrollIntoView({behavior:'smooth',block:'start'}),50)});
$('#todayLabel').textContent=`${TODAY} / FUTUREFLOW FINANCE OS（财务操作系统）`;
$('#accountingMonth').value=MONTH;
['contractForm','incomeForm','employeeForm','costForm','shareholderForm','fundingRoundForm','reimbursementForm','payrollForm','interactionForm'].forEach(id=>{const form=$('#'+id);['date','signDate','startDate','grantDate'].forEach(k=>{if(form?.elements[k]&&!form.elements[k].value)form.elements[k].value=TODAY})});
$('#payrollForm').elements.month.value=MONTH;

$('#contractForm').oninput=()=>{const v=Object.fromEntries(new FormData($('#contractForm'))),months=Number(v.contractMonths||0),total=Number(v.monthlyFee||0)*months+Number(v.setupFee||0);$('#contractImpact').innerHTML=`<b>保存后联动</b><span>合同总额约 ${money(total)}，自动生成 ${months+(Number(v.setupFee||0)>0?1:0)} 笔收入及应收计划。</span>`};
$('#contractForm').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));['contractMonths','monthlyFee','setupFee','directCost','grossMargin','paymentDays','taxRate'].forEach(k=>v[k]=Number(v[k]||0));const r=await api('/api/contract',{method:'POST',body:JSON.stringify({item:v})});state=r.state;e.target.reset();e.target.elements.signDate.value=TODAY;e.target.elements.startDate.value=TODAY;e.target.elements.contractMonths.value=12;renderAll();announce('合同已保存，应收计划已自动生成')};
$('#incomeForm').onsubmit=e=>submitItem(e,'incomeEntries',['amount'],'收入记录已保存');
$('#employeeForm').onsubmit=e=>submitItem(e,'employees',['baseSalary','employerSocial','housingFund','monthlyBonus','vestingYears','cliffMonths'],'员工已保存，人工成本已联动');
$('#payrollForm').onsubmit=e=>submitItem(e,'payrollRuns',['amount'],'工资记录已保存，现金与应付已联动');
$('#costForm').onsubmit=e=>submitItem(e,'costItems',['unitAmount','quantity'],'成本已保存，现金预测已联动');
$('#shareholderForm').onsubmit=e=>submitItem(e,'shareholders',['shares','paidIn','vestingYears','cliffMonths'],'股东名册已更新');
$('#fundingRoundForm').oninput=renderFundraising;
$('#fundingRoundForm').onsubmit=e=>submitItem(e,'fundraisingRounds',['targetAmount','preMoneyValuation','actualAmount'],'融资轮次已建立');
$('#investorForm').onsubmit=e=>submitItem(e,'investorPipeline',['probability','ticket'],'机构已加入融资管线');
$('#interactionForm').onsubmit=e=>submitItem(e,'investorInteractions',[],'机构沟通记录已保存');
async function submitItem(e,collection,numeric,message){e.preventDefault();const form=e.target,v=Object.fromEntries(new FormData(form));numeric.forEach(k=>{if(k in v)v[k]=Number(v[k]||0)});const r=await api('/api/item',{method:'POST',body:JSON.stringify({collection,item:v})});state=r.state;form.reset();if(form.elements.date)form.elements.date.value=TODAY;if(form.elements.startDate)form.elements.startDate.value=TODAY;if(form.elements.month)form.elements.month.value=MONTH;if(form.elements.quantity)form.elements.quantity.value=1;renderAll();announce(message)}
$('#dividendRulesForm').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));Object.keys(v).forEach(k=>v[k]=Number(v[k]||0));const r=await api('/api/object',{method:'POST',body:JSON.stringify({key:'dividendRules',value:v})});state=r.state;renderAll();announce('分红规则已保存')};
$('#cashBalanceForm').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));for(const [id,value] of [['acc-bank',v.bankBalance],['acc-cash',v.cashBalance]]){const r=await api('/api/update',{method:'POST',body:JSON.stringify({collection:'accounts',id,changes:{openingBalance:Number(value||0)}})});state=r.state}renderAll();announce('账户期初余额已保存')};
$('#reimbursementForm').onsubmit=async e=>{e.preventDefault();const r=await api('/api/reimbursement',{method:'POST',body:new FormData(e.target)});state=r.state;e.target.reset();e.target.elements.date.value=TODAY;renderAll();announce('报销已提交并进入审批台账')};
$('#contractSearch').oninput=renderContracts;
$('#accountingMonth').onchange=renderAccounting;
$('#investorKeyword').onchange=renderFundraising;$('#investorChannel').onchange=renderFundraising;
$('#exportAccounting').onclick=()=>location.href=`/api/export/accounting?month=${encodeURIComponent($('#accountingMonth').value||MONTH)}`;
$('#refreshInvestorScout').onclick=async()=>{const b=$('#refreshInvestorScout');b.disabled=true;b.textContent='更新中';try{const r=await api('/api/investor-scout',{method:'POST',body:'{}'});state=r.state;renderAll();announce(r.message)}catch(e){toast('更新失败，已保留现有研究库')}finally{b.disabled=false;b.textContent='更新公开融资信号'}};
$('#refreshAll').onclick=()=>load().then(()=>announce('全部数据已刷新'));
load().catch(e=>{$('#serverStatus').textContent='连接失败';console.error(e)});
