window.onload = () => {
    render();
    // 대시보드가 켜지면 5초(5000ms)마다 실시간 가격을 자동으로 가져옵니다.
    startRealTimeUpdate();
};

let updateInterval = null;

function getAssets() {
    return JSON.parse(localStorage.getItem('invest_assets_hts_v3_offline') || '[]');
}

// 실시간 타이머 시작 함수
function startRealTimeUpdate() {
    if (updateInterval) clearInterval(updateInterval);
    
    // 최초 실행 후 5초 주기로 반복
    fetchLivePrices();
    updateInterval = setInterval(() => {
        fetchLivePrices();
    }, 5000);
}

// 네이버 증권에서 실시간 가격을 긁어오는 핵심 함수
async function fetchLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    // 각 종목별로 가격을 비동기 조회
    const promises = assets.map(async (asset) => {
        // 국내 주식(KRX)이고 종목코드(6자리 숫자)가 파싱되는 경우만 처리
        if (asset.exchange === 'KRX' && asset.stockCode) {
            try {
                // 브라우저 CORS 차단 문제를 우회하기 위해 네이버 폴링 API 직접 호출 (CORS 상황에 따라 Proxy 필요할 수 있음)
                const res = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${asset.stockCode}`);
                const data = await res.json();
                if (data && data.datas && data.datas[0]) {
                    const livePrice = parseInt(data.datas[0].closePrice.replace(/,/g, ''));
                    asset.currentPrice = livePrice;
                }
            } catch (e) {
                console.error(`${asset.name} 가격 갱신 실패:`, e);
            }
        }
        return asset;
    });

    const updatedAssets = await Promise.all(promises);
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(updatedAssets));
    
    // 데이터를 다 가져왔으면 화면을 실시간 가격 기준으로 다시 그립니다.
    render(true); 
}

// 종목 등록 시 이름에서 6자리 종목코드를 자동으로 추출하는 헬퍼 함수
function extractStockCode(inputString) {
    const match = inputString.match(/\d{6}/);
    return match ? match[0] : null;
}

// 종목 추가 (종목코드 추출 기능 추가)
function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const inputName = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!inputName) { alert('종목명 또는 코드를 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) { 
        alert('매수단가와 수량을 정확히 입력하세요.'); return; 
    }

    // 이름에 '우리금융지주 316140' 형태로 넣거나 '316140'만 넣어도 코드를 뽑아냅니다.
    const stockCode = extractStockCode(inputName);
    const displayName = stockCode ? inputName.replace(stockCode, '').trim() || stockCode : inputName;

    if (exchange === 'KRX' && !stockCode) {
        alert('국내 주식은 실시간 조회를 위해 6자리 종목코드를 함께 입력해주세요.\n(예: 우리금융지주 316140 또는 316140)');
        return;
    }

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name: displayName,
        stockCode: stockCode, // 추출한 종목코드 저장
        buyPrice,
        currentPrice: buyPrice, 
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));

    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';

    render();
    fetchLivePrices(); // 등록 후 바로 가격 갱신
}

// 현재단가 수동 변경 적용 (더블 체크용 보존)
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
    let url = "";
    if (exchange === "KRX") {
        url = `https://search.naver.com/search.naver?query=${encodeURIComponent(queryTerm + " 주가")}`;
    } else if (exchange === "NASDAQ") {
        url = `https://search.naver.com/search.naver?query=${encodeURIComponent(name + " 주식")}`;
    } else if (exchange === "CRYPTO") {
        url = `https://search.naver.com/search.naver?query=${encodeURIComponent(name + " 시세")}`;
    }
    window.open(url, '_blank', 'width=1000,height=800,scrollbars=yes');
}

function deleteAsset(id) {
    if(!confirm("해당 종목을 포트폴리오에서 제외하시겠습니까?")) return;
    let assets = getAssets();
    assets = assets.filter(asset => asset.id !== id);
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
    render();
}

// 화면 렌더링 함수 (isLoop 매개변수로 실시간 갱신 중 포커스 끊김 방지)
function render(isLoop = false) {
    const assets = getAssets();
    const listBody = document.getElementById('asset-list');
    if (!listBody) return;
    
    // 사용자가 현재 단가를 손으로 직접 수정 중(Focus)이라면 실시간 루프가 화면을 초기화하지 않도록 방어
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
                    <button class="btn-search-help" onclick="searchOnPortal('${asset.exchange}', '${asset.name}', '${asset.stockCode || ''}')" title="네이버에서 시세 검색">🔍</button>
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

// 차트 그리기 코드는 그대로 유지
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

    const colors = ['#f24b4b', '#3b92f7', '#eab308', '#10b981', '#a855f7', '#f43f5e', '#06b6d4'];
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
2. index.html 수정
상태바 디자인을 실시간 작동 상태에 알맞게 수정합니다. 탑 네비바 부분과 입력창 안내 텍스트 부근을 [ONLINE] 및 자동 업데이트 구조로 감지할 수 있도록 직관적으로 고쳤습니다.

HTML
<!-- index.html 내의 <header> 부분과 카드 <h3> 타이틀 부분을 아래처럼 교체해 주세요 -->

<header class="hts-header">
    <div class="logo">⚡ HTS <span class="pro-tag">PRO v3.0</span></div>
    <!-- OFFLINE에서 실시간 연동인 🟢 ONLINE 상태로 문구 변경 -->
    <div class="system-status" style="color: #10b981;">💻 실시간 가격 연동 시스템 [ONLINE] 🟢</div>
</header>

<!-- 중략 -->

<div class="form-group">
    <label>종목명 또는 심볼 (국내주식은 종목코드 포함 필수)</label>
    <!-- 플레이스홀더 가이드 보강 -->
    <input id="asset-name" type="text" placeholder="예: 우리금융지주 316140 또는 005930" autocomplete="off">
</div>

<!-- 중략 -->

<div class="right-panel">
    <div class="hts-card list-card">
        <h3><span class="bullet">■</span> 보유 잔고 현황 (5초 주기 자동 업데이트)</h3>
        <p class="table-notice">※ 네이버 증권 데이터와 동기화되어 실시간 반영됩니다. 단가를 수동 강제 수정하려면 숫자를 클릭하세요.</p>
<!-- 이하 동일 -->
