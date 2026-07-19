window.onload = () => {
    // 앱 로드 시 기존 데이터를 기반으로 렌더링을 시도합니다.
    render();
    
    // 자동 새로고침(setInterval)은 완전히 제거되었습니다.
    // 가격은 사용자가 직접 테이블에서 수정해야 합니다.
};

function getAssets() {
    return JSON.parse(localStorage.getItem('invest_assets_hts_v3') || '[]');
}

// 기존에 사용되던 검색, 가격 자동 입력, 네이버 주식 연동 로직은
// 사용자님이 원하시는 수동 등록 방식에 맞춰 모두 제거되었습니다.

function addAsset() {
    // 1. 화면의 입력창에서 사용자가 입력한 값을 가져옵니다.
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    // [중요] 매수단가와 수량은 사용자가 직접 입력한 값을 사용합니다.
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    // 2. 입력값 유효성 검사 (종목명, 매수단가, 수량이 올바르게 입력되었는지 확인)
    if (!name) { alert('종목명을 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0) { alert('매수단가(숫자)를 정확히 입력하세요.'); return; }
    if (isNaN(qty) || qty <= 0) { alert('보유 수량(숫자)을 정확히 입력하세요.'); return; }

    // 3. 등록 시 현재단가는 매수단가와 동일하게 설정합니다. (나중에 수정 가능)
    const currentPrice = buyPrice; 

    const assets = getAssets();
    // 4. 새로운 종목 데이터를 포트폴리오 배열에 추가합니다.
    assets.push({
        id: Date.now(), // 고유 ID (삭제 시 사용)
        exchange,
        name,
        symbol: '', // 네이버 연동 코드는 제거됨
        buyPrice,
        currentPrice, // [핵심] 이 가격은 나중에 테이블에서 직접 수정 가능합니다.
        qty
    });
    
    // 5. 업데이트된 포트폴리오 데이터를 로컬 스토리지에 저장합니다.
    localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));

    // 6. 입력창을 초기화하여 다음 종목 등록을 준비합니다.
    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';

    // 7. 화면을 다시 그려 업데이트된 내용을 반영합니다.
    render();
}

// [핵심 기능] 테이블에서 현재단가를 사용자가 직접 클릭하여 수정하는 함수
// 이 함수는 사용자가 입력한 새로운 가격을 로컬 스토리지에 저장하고 화면을 갱신합니다.
function updateCurrentPrice(id, newPrice) {
    const assets = getAssets();
    const assetIndex = assets.findIndex(asset => asset.id === id);
    
    if (assetIndex !== -1) {
        // 숫자와 소수점 이외의 문자 제거 (쉼표 등 처리)
        const cleanedPrice = newPrice.replace(/[^\d.]/g, ''); 
        const priceNum = Number(cleanedPrice);
        
        // 입력된 가격이 숫자인지 확인하고 저장합니다.
        if (!isNaN(priceNum) && priceNum >= 0) {
            assets[assetIndex].currentPrice = priceNum;
            localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));
            // 가격 수정 후 전체 화면을 다시 그립니다. (합계 계산 등 반영)
            render(); 
        } else {
            alert('올바른 가격(숫자)을 입력하세요.');
            // 잘못된 입력 시 원래 가격으로 복구하기 위해 다시 그립니다.
            render(); 
        }
    }
}

// 시세 새로고침 함수는 이제 사용되지 않습니다.
// (실시간 연동이 없으므로, 사용자 알림으로 변경)
function refreshLivePrices() {
    alert('실시간 자동 연동 기능은 제거되었습니다. 가격은 테이블의 현재단가를 직접 클릭해서 수정해 주세요.');
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
    if (!listBody) return;
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
            
            <!-- [핵심 변경] 현재단가 칸: 사용자가 직접 클릭하여 수동 수정 가능 (contenteditable="true") -->
            <td class="text-right live-price editable-price" contenteditable="true" 
                onblur="updateCurrentPrice(${asset.id}, this.innerText)" 
                onkeypress="if(event.keyCode==13) {this.blur(); return false;}">
                ${Math.round(asset.currentPrice).toLocaleString()}원
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
    ctx.fillStyle = '#1e222d'; 
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 55, 0, 2 * Math.PI);
    ctx.fill();
}
