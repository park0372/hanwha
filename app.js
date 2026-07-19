window.onload = () => {
    // 앱 로드 시 기존 데이터를 기반으로 렌더링을 시도합니다.
    render();
    
    // 자동 새로고침(setInterval)은 제거되었습니다.
};

function getAssets() {
    return JSON.parse(localStorage.getItem('invest_assets_hts_v3') || '[]');
}

// [가상 종목 데이터베이스] 
// 실시간 연동이 불가능하므로, 코드 내부에 주요 종목의 가상 가격 데이터를 미리 정의합니다.
// 이 데이터는 검색 및 초기 가격 입력 용도로만 사용됩니다.
const virtualSymbolDB = {
    'KRX': [
        { name: '삼성전자', symbol: '005930', price: 75200 },
        { name: 'SK하이닉스', symbol: '000660', price: 185500 },
        { name: '카카오', symbol: '035720', price: 53100 },
        { name: 'NAVER', symbol: '035420', price: 208000 },
        { name: '우리금융지주', symbol: '316140', price: 50335 }, // 사용자 지정 과거 가격
        { name: '하나금융지주', symbol: '086790', price: 136800 } // 사용자 지정 최신 가격
    ],
    'NASDAQ': [
        { name: 'Apple', symbol: 'AAPL', price: 255000 }, // 가상 달러 가격
        { name: 'Tesla', symbol: 'TSLA', price: 318000 },
        { name: 'Microsoft', symbol: 'MSFT', price: 420000 },
        { name: 'Google', symbol: 'GOOGL', price: 215000 }
    ],
    'CRYPTO': [
        { name: 'Bitcoin', symbol: 'BTC', price: 98000000 },
        { name: 'Ethereum', symbol: 'ETH', price: 4600000 },
        { name: 'Ripple', symbol: 'XRP', price: 850 }
    ]
};

// [새 기능] 종목명 입력 시 가상 DB에서 검색하여 자동 완성 목록을 보여주는 함수
function searchSymbol(keyword) {
    const exchange = document.getElementById('asset-exchange').value;
    const searchResults = document.getElementById('search-results');
    searchResults.innerHTML = ''; // 기존 검색 결과 초기화

    if (!keyword) {
        searchResults.style.display = 'none';
        return;
    }

    const db = virtualSymbolDB[exchange] || [];
    const filtered = db.filter(item => 
        item.name.toLowerCase().includes(keyword.toLowerCase()) || 
        item.symbol.toLowerCase().includes(keyword.toLowerCase())
    );

    if (filtered.length > 0) {
        filtered.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${item.name}</strong> (${item.symbol}) - ${Math.round(item.price).toLocaleString()}원`;
            // 검색된 종목 클릭 시 클릭 이벤트 핸들러 등록
            li.onclick = () => selectSymbol(item);
            searchResults.appendChild(li);
        });
        searchResults.style.display = 'block';
    } else {
        searchResults.style.display = 'none';
    }
}

// [새 기능] 검색된 종목을 선택했을 때 실행되는 함수
function selectSymbol(item) {
    document.getElementById('asset-name').value = item.name; // 종목명 입력
    document.getElementById('buy-price').value = item.price; // [핵심] 가상 가격 자동 입력
    document.getElementById('search-results').style.display = 'none'; // 검색 결과 숨김
}

// 기존 fetchLivePrice 함수는 이제 사용되지 않습니다. (가격은 addAsset에서 직접 입력)

function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    // [수정] 매수단가는 이제 검색 시 자동 입력되거나 사용자가 직접 입력한 값을 사용합니다.
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명을 입력하세요.'); return; }
    // [수정] 매수단가 확인 로직 추가
    if (isNaN(buyPrice) || buyPrice <= 0) { alert('매수단가를 정확히 입력하세요.'); return; }
    if (qty <= 0) { alert('수량을 정확히 입력하세요.'); return; }

    // 현재단가는 초기 등록 시 매수단가와 동일하게 설정합니다.
    const currentPrice = buyPrice; 

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name,
        buyPrice,
        currentPrice, // 이 가격은 나중에 테이블에서 직접 수정 가능합니다.
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));

    // 입력창 초기화
    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';

    render();
}

// [수정] 가격 수정 함수는 이전과 동일합니다. 테이블에서 직접 수정합니다.
function updateCurrentPrice(id, newPrice) {
    const assets = getAssets();
    const assetIndex = assets.findIndex(asset => asset.id === id);
    
    if (assetIndex !== -1) {
        const priceNum = Number(newPrice.replace(/,/g, ''));
        if (!isNaN(priceNum) && priceNum >= 0) {
            assets[assetIndex].currentPrice = priceNum;
            localStorage.setItem('invest_assets_hts_v3', JSON.stringify(assets));
            render();
        } else {
            alert('올바른 가격(숫자)을 입력하세요.');
            render();
        }
    }
}

// [수정] 시세 새로고침 함수는 이제 기능을 상실했습니다. (실시간 연동이 없으므로)
// 사용자 알림을 띄우는 것으로 변경합니다.
function refreshLivePrices() {
    alert('현재 구조에서는 실시간 시세 연동이 불가능합니다. 테이블의 현재단가를 직접 수정해 주세요.');
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
        tr.className = profit > 0 ? 'row-up' : (profit < 0 ? 'row-down' : '');
        tr.innerHTML = `
            <td><span class="badge-${asset.exchange}">${asset.exchange}</span></td>
            <td class="cell-name"><strong>${asset.name}</strong></td>
            <td class="text-right">${Math.round(asset.buyPrice).toLocaleString()}원</td>
            
            <!-- 현재단가 칸은 클릭하여 직접 수정 가능 -->
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

    ctx.fillStyle = '#1e222d';
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 55, 0, 2 * Math.PI);
    ctx.fill();
}
