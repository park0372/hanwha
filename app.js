window.onload = () => {
    // 앱 로드 시 기존 데이터를 기반으로 렌더링을 시도합니다.
    render();
    
    // 자동 새로고침(setInterval)은 더 이상 의미가 없으므로 제거했습니다.
    // 사용자가 '시세 새로고침' 버튼을 눌렀을 때만 작동하도록 합니다.
};

function getAssets() {
    return JSON.parse(localStorage.getItem('invest_assets_hts_v3') || '[]');
}

// [수정 핵심] 실시간 시세 시뮬레이션을 제거하고 고정된 가격을 제공하는 함수
function fetchLivePrice(exchange, name) {
    // 1. 이미지(image_0.png)에 표시된 정확한 고정 가격을 설정합니다.
    const fixedPrices = {
        '우리금융지주': 50460, // 이미지의 녹색 '현재단가'
        '하나금융지주': 49691  // 이미지의 녹색 '현재단가'
    };
    
    // 2. 입력된 종목명이 고정 가격 목록에 있으면 그 가격을 반환합니다.
    if (fixedPrices[name]) {
        return fixedPrices[name];
    }
    
    // 3. 만약 '우리금융지주'나 '하나금융지주'가 아닌 다른 종목이라면, 
    //    기존 예시 종목들의 기본 가격을 사용합니다. 랜덤 변동은 없습니다.
    const mockPrices = {
        '삼성전자': 75000,
        'AAPL': 250000,
        'BTC': 95000000,
        'SK하이닉스': 180000,
        'TSLA': 320000
    };
    
    return mockPrices[name] || 50000; // 등록되지 않은 종목은 고정 5만원
}

function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명을 입력하세요.'); return; }
    if (buyPrice <= 0 || qty <= 0) { alert('매수단가와 수량을 정확히 입력하세요.'); return; }

    // [수정] 수정된 fetchLivePrice 함수를 사용하여 고정 가격을 가져옵니다.
    const currentPrice = fetchLivePrice(exchange, name);

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name,
        buyPrice,
        currentPrice,
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));

    // 입력창 초기화
    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';

    render();
}

// [수정] 이 함수는 더 이상 랜덤 변동을 일으키지 않습니다.
// 대신, 사용자가 명시적으로 버튼을 눌렀을 때 fetchLivePrice를 다시 호출하여
// 고정된 최신 가격으로 데이터를 갱신합니다.
function refreshLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    assets.forEach(asset => {
        // [수정] 고정 가격 함수를 다시 호출하여 가격을 맞춥니다.
        asset.currentPrice = fetchLivePrice(asset.exchange, asset.name);
    });

    localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));
    render();
}

// --- 아래 부분은 변경 없음 (랜더링 및 유틸리티 함수) ---

function deleteAsset(id) {
    if(!confirm("해당 종목을 포트폴리오에서 제외하시겠습니까?")) return;
    let assets = getAssets();
    assets = assets.filter(asset => asset.id !== id);
    localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));
    render();
}

function exportData() {
    const assets = getAssets();
    if(assets.length === 0) { alert("백업할 데이터가 없습니다."); return; }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(assets));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `HTS_v3_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if(Array.isArray(imported)) {
                localStorage.setItem('invest_assets_hts_v3', JSON.stringify(imported));
                alert("데이터가 복구되었습니다.");
                render();
            } else { alert("올바르지 않은 파일입니다."); }
        } catch(err) { alert("파일 읽기 실패"); }
    };
    reader.readAsText(file);
}

function render() {
    const assets = getAssets();
    const listBody = document.getElementById('asset-list');
    listBody.innerHTML = '';

    let totalBuy = 0;
    let totalNow = 0;

    // 수익률 기준 정렬 (내림차순)
    assets.sort((a,b) => ((b.currentPrice - b.buyPrice)/b.buyPrice) - ((a.currentPrice - a.buyPrice)/a.buyPrice));

    assets.forEach(asset => {
        const itemBuyTotal = asset.buyPrice * asset.qty;
        const itemNowTotal = asset.currentPrice * asset.qty;
        const profit = itemNowTotal - itemBuyTotal;
        const ratio = (profit / itemBuyTotal) * 100;
        
        totalBuy += itemBuyTotal;
        totalNow += itemNowTotal;

        const pClass = profit > 0 ? 'text-up' : (profit < 0 ? 'text-down' : 'text-neutral');

        const tr = document.createElement('tr');
        // 수익/손실에 따른 행 배경색 설정
        tr.className = profit > 0 ? 'row-up' : (profit < 0 ? 'row-down' : '');
        tr.innerHTML = `
            <td><span class="badge-${asset.exchange}">${asset.exchange}</span></td>
            <td class="cell-name"><strong>${asset.name}</strong></td>
            <td class="text-right">${Math.round(asset.buyPrice).toLocaleString()}원</td>
            <td class="text-right live-price">${Math.round(asset.currentPrice).toLocaleString()}원</td>
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
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 없음', canvas.width/2, canvas.height/2);
        return;
    }

    const colors = ['#ff4d4d', '#4da6ff', '#ffb347', '#10ac84', '#a55eea', '#ff7675', '#00cec9'];
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

    // 도넛 차트 효과를 위한 중앙 원 그리기
    ctx.fillStyle = '#1e222d'; // 배경색과 동일하게
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 55, 0, 2 * Math.PI);
    ctx.fill();
}
