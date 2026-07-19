window.onload = () => {
    createTriggerButton(); // 화면에 연동 제어 버튼 생성
    render();
};

let updateInterval = null;
let isRealTimeActive = false; // 현재 실시간 연동이 켜져 있는지 여부

function getAssets() {
    return JSON.parse(localStorage.getItem('invest_assets_hts_v3_offline') || '[]');
}

// 화면 상단 타이틀이나 적절한 위치에 [시세 연동] 버튼을 자동으로 꽂아주는 함수
function createTriggerButton() {
    // 이미 버튼이 있다면 중복 생성 방지
    if (document.getElementById('global-sync-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'global-sync-btn';
    btn.innerText = '🔄 실시간 시세 연동 시작';
    // 대시보드 다크모드와 어울리는 세련된 블루톤 스타일링
    btn.style = 'position: fixed; top: 20px; right: 20px; padding: 10px 18px; background: #3b92f7; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.2s;';
    
    btn.onclick = () => {
        if (!isRealTimeActive) {
            // 실시간 연동 켜기
            isRealTimeActive = true;
            btn.innerText = '🛑 시세 연동 중단 (수동 모드)';
            btn.style.background = '#f24b4b'; // 중단 버튼은 레드톤
            
            // 즉시 한 번 땡겨오고, 이후 5초마다 실시간 동기화 루프 가동
            fetchLivePrices();
            updateInterval = setInterval(() => {
                fetchLivePrices();
            }, 5000);
        } else {
            // 실시간 연동 끄기 (다시 안전한 수동 모드로)
            isRealTimeActive = false;
            if (updateInterval) clearInterval(updateInterval);
            btn.innerText = '🔄 실시간 시세 연동 시작';
            btn.style.background = '#3b92f7';
        }
    };

    document.body.appendChild(btn);
}

// 주요 한국 주식 이름 -> 야후 파이낸스 전용 심볼 자동 변환기
function getYahooSymbol(nameOrCode) {
    const market = {
        '삼성전자': '005930.KS',
        '하나금융지주': '086790.KS',
        '우리금융지주': '316140.KS',
        '신한지주': '055550.KS',
        'KB금융': '105560.KS',
        '현대차': '005380.KS',
        'SK하이닉스': '000660.KS',
        '네이버': '035420.KS',
        'NAVER': '035420.KS',
        '카카오': '035720.KS'
    };
    
    const trimmed = nameOrCode.replace(/\s+/g, '');
    if (market[trimmed]) return market[trimmed];
    if (/^[0-9]{6}$/.test(trimmed)) return trimmed + ".KS"; 
    return null;
}

// 야후 파이낸스 단발성 호출 엔진
async function fetchYahooPrice(symbol) {
    if (!symbol) return null;
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data && data.chart && data.chart.result && data.chart.result[0]) {
            const meta = data.chart.result[0].meta;
            return parseInt(meta.regularMarketPrice);
        }
    } catch (e) {
        console.error(`[${symbol}] 시세 조회 실패:`, e);
    }
    return null;
}

// 버튼이 활성화되었을 때만 도는 주가 동기화 함수
async function fetchLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    let hasChange = false;

    for (let asset of assets) {
        if (asset.exchange === 'KRX') {
            const symbol = getYahooSymbol(asset.stockCode || asset.name);
            if (symbol) {
                const livePrice = await fetchYahooPrice(symbol);
                if (livePrice && livePrice > 0 && asset.currentPrice !== livePrice) {
                    asset.currentPrice = livePrice;
                    hasChange = true;
                }
            }
        }
    }

    if (hasChange) {
        localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
        render(true); 
    }
}

// 신규 종목 등록
function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명을 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) { 
        alert('매수단가와 수량을 정확히 입력하세요.'); return; 
    }

    const symbol = getYahooSymbol(name);
    let stockCode = name;
    if (symbol) stockCode = symbol.split('.')[0];

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name,
        stockCode: /^[0-9]{6}$/.test(stockCode) ? stockCode : "", 
        buyPrice,
        currentPrice: buyPrice, // 최초 등록 시 매수단가로 안전하게 시작
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));

    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';

    render();

    // 만약 실시간 연동 버튼이 켜져 있는 상태라면 등록 즉시 가격 동기화 유도
    if (isRealTimeActive) {
        setTimeout(() => { fetchLivePrices(); }, 300);
    }
}

// 현재단가 수동 수정도 언제든 가능하도록 유지
function updateCurrentPrice(id, newPrice) {
    const assets = getAssets();
    const assetIndex = assets.findIndex(asset => asset.id === id);
    
    if (assetIndex !== -1) {
        const cleanedPrice = newPrice.replace(/[^\d.]/g, ''); 
        const priceNum = Number(cleanedPrice);
        
        if (!isNaN(priceNum) && priceNum >= 0) {
            assets[assetIndex].currentPrice = priceNum;
            localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
            render(); 
        } else {
            alert('올바른 가격(숫자)을 입력하세요.');
            render(); 
        }
    }
}

function searchOnPortal(exchange, name, stockCode) {
    let queryTerm = stockCode || name;
    let url = `https://search.naver.com/search.naver?query=${encodeURIComponent(queryTerm + " 주가")}`;
    window.open(url, '_blank', 'width=1000,height=800,scrollbars=yes');
}

function deleteAsset(id) {
    if(!confirm("해당 종목을 포트폴리오에서 제외하시겠습니까?")) return;
    let assets = getAssets();
    assets = assets.filter(asset => asset.id !== id);
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
    render();
}

function render(isLoop = false) {
    const assets = getAssets();
    const listBody = document.getElementById('asset-list');
    if (!listBody) return;
    
    if (isLoop && document.activeElement && document.activeElement.classList.contains('editable-price')) {
        return; 
    }

    listBody.innerHTML = '';

    let totalBuy = 0;
    let totalNow = 0;

    assets.sort((a,b) => ((b.currentPrice - b.buyPrice)/b.buyPrice) - ((a.currentPrice - a.buyPrice)/a.buyPrice));

    assets.forEach(asset => {
        const itemBuyTotal = asset.buyPrice * asset.qty;
        const itemNowTotal = asset.currentPrice * asset.qty;
        const profit = itemNowTotal - itemBuyTotal;
        const ratio = itemBuyTotal > 0 ? (profit / itemBuyTotal) * 100 : 0;
        
        totalBuy += itemBuyTotal;
        totalNow += itemNowTotal;

        const pClass = profit > 0 ? 'text-up' : (profit < 0 ? 'text-down' : 'text-neutral');

        const tr = document.createElement('tr');
        tr.className = profit > 0 ? 'row-up' : (profit < 0 ? 'row-down' : '');
        tr.innerHTML = `
            <td><span class="badge-${asset.exchange}">${asset.exchange}</span></td>
            <td class="cell-name"><strong>${asset.name}</strong> ${asset.stockCode ? `<span style="font-size:11px; color:#697280;">${asset.stockCode}</span>` : ''}</td>
            <td class="text-right">${Math.round(asset.buyPrice).toLocaleString()}원</td>
            
            <td class="text-center">
                <div class="price-edit-container">
                    <span class="editable-price live-price" contenteditable="true" 
                        onblur="updateCurrentPrice(${asset.id}, this.innerText)" 
                        onkeypress="if(event.keyCode==13) {this.blur(); return false;}">
                        ${Math.round(asset.currentPrice).toLocaleString()}원
                    </span>
                    <button class="btn-search-help" onclick="searchOnPortal('${asset.exchange}', '${asset.name}', '${asset.stockCode || ''}')" title="시세 검색">🔍</button>
                </div>
            </td>
            
            <td class="text-right">${asset.qty.toLocaleString()}</td>
            <td class="text-right">${Math.round(itemNowTotal).toLocaleString()}원</td>
            <td class="text-right ${pClass} weight-bold">${profit > 0 ? '+' : ''}${Math.round(profit).toLocaleString()}원</td>
            <td class="text-right ${pClass} weight-bold">${ratio.toFixed(2)}%</td>
            <td class="text-center"><button class="btn-delete" onclick="deleteAsset(${asset.id})">제외</button></td>
        `;
        listBody.appendChild(tr);
    });

    const totalProfit = totalNow - totalBuy;
    const totalRatio = totalBuy > 0 ? (totalProfit / totalBuy) * 100 : 0;

    const totalBuyEl = document.getElementById('total-buy');
    const totalNowEl = document.getElementById('total-now');
    const profitEl = document.getElementById('total-profit');
    const ratioEl = document.getElementById('total-ratio');

    if (totalBuyEl) totalBuyEl.innerText = `${Math.round(totalBuy).toLocaleString()}원`;
    if (totalNowEl) totalNowEl.innerText = `${Math.round(totalNow).toLocaleString()}원`;
    
    if (profitEl && ratioEl) {
        profitEl.innerText = `${totalProfit > 0 ? '+' : ''}${Math.round(totalProfit).toLocaleString()}원`;
        ratioEl.innerText = `${totalRatio > 0 ? '+' : ''}${totalRatio.toFixed(2)}%`;

        profitEl.className = `value ${totalProfit > 0 ? 'text-up' : (totalProfit < 0 ? 'text-down' : 'text-neutral')}`;
        ratioEl.className = `value ${totalProfit > 0 ? 'text-up' : (totalProfit < 0 ? 'text-down' : 'text-neutral')}`;
    }

    drawChart(assets);
}

function drawChart(assets) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const legendContainer = document.getElementById('chart-legend');
    if (!legendContainer) return;
    legendContainer.innerHTML = '';
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if(assets.length === 0) {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 없음', canvas.width/2, canvas.height/2);
        return;
    }

    const colors = ['#3b92f7', '#f24b4b', '#eab308', '#10b981', '#a855f7', '#f43f5e', '#06b6d4'];
    const total = assets.reduce((sum, asset) => sum + (asset.currentPrice * asset.qty), 0);
    
    let startAngle = 0;
    
    assets.forEach((asset, index) => {
        const itemTotal = asset.currentPrice * asset.qty;
        const sliceAngle = (itemTotal / total) * 2 * Math.PI;
        const color = colors[index % colors.length];
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(canvas.width/2, canvas.height/2);
        ctx.arc(canvas.width/2, canvas.height/2, Math.min(canvas.width/2, canvas.height/2) - 10, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        
        startAngle += sliceAngle;

        const pct = ((itemTotal / total) * 100).toFixed(1);
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<span class="color-box" style="background:${color}"></span> ${asset.name} (${pct}%)`;
        legendContainer.appendChild(item);
    });

    ctx.fillStyle = '#0f111a'; 
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 55, 0, 2 * Math.PI);
    ctx.fill();
}
